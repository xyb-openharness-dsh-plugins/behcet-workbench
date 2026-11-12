#!/usr/bin/env node
/**
 * 白塞病临床试验**产品快照**采集（单来源：ClinicalTrials.gov API v2）。
 *
 * 与 scripts/fetch-behcet-trials-2026.mjs 的区别：
 *   那份是 evidence-grade 研究快照（要求窗口覆盖、原始分页哈希、COMPLETE/PARTIAL 证据链）；
 *   这份是**工作台展示用**产品快照：只要字段真实、来源可追溯、日期可核，就够检索与匹配，
 *   并明写「单来源、未核实、非完整」，不冒充完整检索。
 *
 * 输出：research/behcet/
 *   trials.sqlite            服务端只读查询
 *   trials-<日期>.jsonl      逐条原文（带来源 URL / 取回时间 / 状态）
 *   product-manifest.json    查询参数、来源状态、计数、限制与文件哈希
 *
 * 用法：node scripts/build-trial-snapshot.mjs [--limit 200]
 */
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'research', 'behcet')
const TODAY = new Date().toISOString().slice(0, 10)
const API = 'https://clinicaltrials.gov/api/v2'
const CONDITION = 'Behçet'
const PAGE_SIZE = 100
const MAX_PAGES = 5
const limitArg = Number(process.argv[process.argv.indexOf('--limit') + 1])
const MAX_RECORDS = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 200

mkdirSync(OUT, { recursive: true })

async function jget(url) {
  const rsp = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'behcet-workbench/0.2 snapshot-builder' } })
  if (!rsp.ok) throw new Error(`HTTP ${rsp.status} ${url}`)
  return rsp.json()
}

function s(v) { return v == null ? '' : String(v).trim() }
function norm(v) { return s(v).replace(/\s+/g, ' ') }
function parseAge(v) { const m = s(v).match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null }

function mentionsBehcet(text) { return /beh[cç]et|白塞/i.test(String(text || '')) }

function mapStudy(study) {
  const p = study.protocolSection || {}
  const id = p.identificationModule || {}
  const st = p.statusModule || {}
  const design = p.designModule || {}
  const sponsor = p.sponsorCollaboratorsModule || {}
  const elig = p.eligibilityModule || {}
  const cond = p.conditionsModule || {}
  const arms = p.armsInterventionsModule || {}
  const loc = p.contactsLocationsModule || {}
  const desc = p.descriptionModule || {}
  const locations = Array.isArray(loc.locations) ? loc.locations : []
  const countries = [...new Set(locations.map((l) => s(l.country)).filter(Boolean))]
  const phases = Array.isArray(design.phases) ? design.phases.filter(Boolean) : []
  const nct = s(id.nctId)
  if (!/^NCT\d{8}$/.test(nct)) return null
  const record = {
    recordId: nct,
    title: norm(id.briefTitle),
    officialTitle: norm(id.officialTitle),
    studyType: s(design.studyType),
    phase: phases.length ? phases.join(' / ') : '',
    status: s(st.overallStatus),
    statusVerified: s(st.statusVerifiedDate),
    lastKnownStatus: s(st.lastKnownStatus),
    lastUpdate: s(st.lastUpdatePostDateStruct?.date),
    firstPost: s(st.studyFirstPostDateStruct?.date),
    startDate: s(st.startDateStruct?.date),
    primaryCompletion: s(st.primaryCompletionDateStruct?.date),
    leadSponsor: s(sponsor.leadSponsor?.name),
    collaborators: (sponsor.collaborators || []).map((c) => s(c.name)).filter(Boolean),
    enrollment: Number.isFinite(design.enrollmentInfo?.count) ? design.enrollmentInfo.count : null,
    conditions: (cond.conditions || []).map(s).filter(Boolean),
    interventions: (arms.interventions || []).map((i) => ({ type: s(i.type), name: s(i.name) })).filter((i) => i.name),
    summary: norm(desc.briefSummary),
    eligibilityText: s(elig.eligibilityCriteria),
    sex: s(elig.sex) || 'ALL',
    minimumAge: parseAge(elig.minimumAge),
    maximumAge: parseAge(elig.maximumAge),
    healthyVolunteers: elig.healthyVolunteers === true,
    countries,
    chinaSites: locations.filter((l) => /China/i.test(s(l.country))).length,
    sourceId: 'CTG',
    sourceUrl: `https://clinicaltrials.gov/study/${nct}`,
    snapshotDate: TODAY,
    retrievedAt: new Date().toISOString(),
    sourceState: 'SUCCESS',
  }
  return record
}

const version = await jget(`${API}/version`)
const firstUrl = `${API}/studies?` + new URLSearchParams({
  'query.cond': CONDITION,
  pageSize: String(PAGE_SIZE),
  countTotal: 'true',
}).toString()

const pages = []
const studies = []
let token = ''
let totalCount = null
for (let page = 0; page < MAX_PAGES; page++) {
  const url = token ? `${firstUrl}&pageToken=${encodeURIComponent(token)}` : firstUrl
  const data = await jget(url)
  if (totalCount == null && Number.isFinite(data.totalCount)) totalCount = data.totalCount
  pages.push({ url, returned: data.studies?.length || 0, nextPageToken: data.nextPageToken || null })
  for (const study of data.studies || []) studies.push(study)
  token = data.nextPageToken || ''
  if (!token) break
}

const seen = new Set()
const mapped = []
let excluded = 0
for (const study of studies) {
  const rec = mapStudy(study)
  if (!rec) { excluded++; continue }
  const hay = [rec.title, rec.officialTitle, rec.summary, rec.eligibilityText, rec.conditions.join(' ')].join(' ')
  if (!mentionsBehcet(hay)) { excluded++; continue }
  if (seen.has(rec.recordId)) { excluded++; continue }
  seen.add(rec.recordId)
  mapped.push(rec)
}

/* 最近更新的排前面：用户列表先看有变化的登记。 */
mapped.sort((a, b) => String(b.lastUpdate).localeCompare(String(a.lastUpdate)) || a.recordId.localeCompare(b.recordId))
const records = mapped.slice(0, MAX_RECORDS)

const jsonlName = `trials-${TODAY}.jsonl`
const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '')
writeFileSync(join(OUT, jsonlName), jsonl)

const dbFile = join(OUT, 'trials.sqlite')
try { if (existsSync(dbFile)) { /* 覆盖重建 */ } } catch { /* ignore */ }
const db = new DatabaseSync(dbFile)
db.exec(`
  DROP TABLE IF EXISTS trials;
  CREATE TABLE trials (
    record_id TEXT PRIMARY KEY,
    title TEXT, official_title TEXT, study_type TEXT, phase TEXT, status TEXT,
    status_verified TEXT, last_known_status TEXT, last_update TEXT, first_post TEXT,
    start_date TEXT, primary_completion TEXT, lead_sponsor TEXT, collaborators_json TEXT,
    enrollment INTEGER, conditions_json TEXT, interventions_json TEXT, summary TEXT,
    eligibility_text TEXT, sex TEXT, minimum_age REAL, maximum_age REAL, healthy_volunteers INTEGER,
    countries_json TEXT, china_sites INTEGER, source_id TEXT, source_url TEXT,
    snapshot_date TEXT, retrieved_at TEXT, source_state TEXT
  );
  CREATE INDEX idx_trials_status ON trials(status);
  CREATE INDEX idx_trials_type ON trials(study_type);
`)
const insert = db.prepare(`INSERT INTO trials(record_id,title,official_title,study_type,phase,status,status_verified,
  last_known_status,last_update,first_post,start_date,primary_completion,lead_sponsor,collaborators_json,
  enrollment,conditions_json,interventions_json,summary,eligibility_text,sex,minimum_age,maximum_age,
  healthy_volunteers,countries_json,china_sites,source_id,source_url,snapshot_date,retrieved_at,source_state)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
db.exec('BEGIN')
try {
  for (const r of records) {
    insert.run(r.recordId, r.title, r.officialTitle, r.studyType, r.phase, r.status, r.statusVerified,
      r.lastKnownStatus, r.lastUpdate, r.firstPost, r.startDate, r.primaryCompletion, r.leadSponsor,
      JSON.stringify(r.collaborators), r.enrollment, JSON.stringify(r.conditions), JSON.stringify(r.interventions),
      r.summary, r.eligibilityText, r.sex, r.minimumAge, r.maximumAge, r.healthyVolunteers ? 1 : 0,
      JSON.stringify(r.countries), r.chinaSites, r.sourceId, r.sourceUrl, r.snapshotDate, r.retrievedAt, r.sourceState)
  }
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  throw error
}
const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => Object.values(row)[0])
db.close()
if (integrity.length !== 1 || integrity[0] !== 'ok') throw new Error('SQLite integrity_check 失败：' + integrity.join('; '))

const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const manifest = {
  schemaVersion: 1,
  kind: 'product-trial-snapshot',
  snapshotDate: TODAY,
  fetchedAt: new Date().toISOString(),
  status: 'PARTIAL',
  query: { condition: CONDITION, pageSize: PAGE_SIZE, pages: pages.length, totalCount, urls: pages.map((p) => p.url) },
  api: { base: API, version: version.apiVersion || null, dataTimestamp: version.dataTimestamp || null },
  sources: [
    { sourceId: 'CTG', label: 'ClinicalTrials.gov', state: 'SUCCESS', queried: true, url: 'https://clinicaltrials.gov' },
    { sourceId: 'ChiCTR', label: '中国临床试验注册中心', state: 'NOT_QUERIED', queried: false },
    { sourceId: 'ChinaDrugTrials', label: '药物临床试验登记与信息公示平台', state: 'NOT_QUERIED', queried: false },
    { sourceId: 'ICTRP', label: 'WHO ICTRP', state: 'NOT_QUERIED', queried: false },
  ],
  counts: { fetched: studies.length, included: records.length, excluded, uniqueIds: seen.size },
  filter: 'conditions/title/summary/eligibility 文本含 Behçet / Behcet / 白塞',
  files: {
    [jsonlName]: { sha256: sha(Buffer.from(jsonl)), bytes: Buffer.byteLength(jsonl) },
    'trials.sqlite': { sha256: sha(readFileSync(dbFile)), bytes: readFileSync(dbFile).length },
  },
  limitations: [
    '单来源（ClinicalTrials.gov），ChiCTR / 药物临床试验登记平台 / ICTRP 本轮未查询；不能据此说"全库无匹配"。',
    '未逐条核对登记详情与入排原文；登记状态不等于当前招募，也不等于入组资格。',
    '本快照用于工作台检索与登记字段符合度粗筛，不是生产临床库，也不产出入组结论。',
  ],
  note: '产品快照：单来源、未核实、非完整；只用于候选线索与证据链展示。',
}
writeFileSync(join(OUT, 'product-manifest.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({
  snapshotDate: TODAY,
  fetched: studies.length,
  included: records.length,
  excluded,
  totalCount,
  pages: pages.length,
  sqlite: dbFile,
  jsonl: join(OUT, jsonlName),
  withEligibility: records.filter((r) => r.eligibilityText).length,
  interventional: records.filter((r) => r.studyType === 'INTERVENTIONAL').length,
  observational: records.filter((r) => r.studyType === 'OBSERVATIONAL').length,
}, null, 2))