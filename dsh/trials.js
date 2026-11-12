/**
 * 临床试验读模型：本地快照检索 + 35 号四段链路中的「匹配」段。
 *
 * 红线（docs/35-TRIAL-MATCHING.md）：
 *   - 输出的是**登记字段符合度**，不是入组资格，也不代表疗效；
 *   - 未知项永远「待确认」，按 0 计入分子/分母之外，pct 只偏低不偏高；
 *   - 可对照项不足 2 条不给百分数；
 *   - 药物靶点不进退分母（只作详情里的单列说明）；
 *   - 硬性条件不满足单列一组，不参与「首位」排序；
 *   - 来源/快照日期/登记状态未核实声明逐条固定输出。
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SNAPSHOT_REL = join('research', 'behcet', 'trials.sqlite')
/* 产品快照清单与 evidence-grade 的 manifest.json 分开命名：
 * 后者由严格核验器消费（要求 COMPLETE/窗口覆盖/原始页哈希），本文件是面向展示的
 * 单来源产品快照，明写 INCOMPLETE/PARTIAL，不能冒充前者。 */
const MANIFEST_REL = join('research', 'behcet', 'product-manifest.json')

/* 器官规则只认"疾病受累"语境，避免把「ocular corticosteroids」「infectious uveitis」
 * 这类限定语当成"本人有该表型"（35 号 §七.4 反向条件教训）。 */
const ORGAN_RULES = [
  { key: '眼', label: '眼/葡萄膜炎', re: /uveitis|retinal\s+vasculitis|ocular\s+involvement|intraocular\s+inflammation|eye\s+involvement|葡萄膜炎|眼部受累|眼炎/i, organs: ['眼'] },
  { key: '口腔', label: '口腔溃疡', re: /oral\s+(ulcer|aphth)|mouth\s+ulcer|口腔溃疡/i, organs: ['口腔'] },
  { key: '生殖器', label: '生殖器溃疡', re: /genital\s+(ulcer|aphth)|生殖器溃疡/i, organs: ['生殖器'] },
  { key: '皮肤', label: '皮肤表现', re: /erythema\s+nodosum|papulopustular|skin\s+(lesion|involvement)|cutaneous\s+(lesion|involvement)|皮肤(病变|受累)|结节性红斑|毛囊炎/i, organs: ['皮肤'] },
  { key: '关节', label: '关节受累', re: /arthritis|arthralgia|joint\s+involvement|关节(炎|痛|受累)/i, organs: ['关节'] },
  { key: '血管', label: '血管受累', re: /vascular\s+(involvement|lesion|disease)|aneurysm|thrombosis|phlebitis|血管(受累|病变)|动脉瘤|血栓性静脉炎/i, organs: ['血管'] },
  { key: '神经', label: '神经受累', re: /neurolog|neuro-?beh[cç]et|meningoencephal|CNS\s+involvement|神经(受累|系统)|脑膜脑炎/i, organs: ['神经'] },
  { key: '消化道', label: '消化道受累', re: /gastrointestinal\s+(involvement|ulcer|lesion)|intestinal\s+(ulcer|involvement)|bowel\s+(ulcer|involvement)|消化道(受累|溃疡)|肠道(溃疡|受累)/i, organs: ['消化道'] },
]

/* 药物靶点/机制词：只用于详情单列，不进匹配分母（35 号 §七.2）。 */
const TARGET_RE = /DLL3|B7-H3|PD-?1|PD-?L1|VEGF|TNF|IL-?(6|12|17|23)|JAK|BTK|CD20|HER2|EGFR|靶点|机制/i

/* 药物类别词：入排条件里提到"既往使用过/正在使用"时作三态判据。 */
const MED_RULES = [
  { label: 'TNF 抑制剂（阿达木/英夫利西等）', re: /adalimumab|infliximab|etanercept|certolizumab|golimumab|TNF[-\s]?(alpha|α)?\s*inhibitor|阿达木|英夫利西|依那西普|戈利木单抗|肿瘤坏死因子/i },
  { label: 'IL-6 / IL-1 / IL-17 通路', re: /tocilizumab|ustekinumab|secukinumab|anakinra|canakinumab|托珠单抗|乌司奴单抗|司库奇尤|阿那白滞素/i },
  { label: '传统免疫抑制剂', re: /cyclophosphamide|azathioprine|mycophenolate|methotrexate|tacrolimus|cyclosporin|环磷酰胺|硫唑嘌呤|吗替麦考酚|甲氨蝶呤|他克莫司|环孢素/i },
  { label: '秋水仙碱 / 沙利度胺', re: /colchicine|thalidomide|秋水仙碱|沙利度胺/i },
  { label: '糖皮质激素', re: /corticosteroid|prednisone|prednisolone|methylprednisolone|激素|泼尼松|甲泼尼龙/i },
  { label: '干扰素', re: /interferon|干扰素/i },
]

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function parseAge(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

function splitEligibility(text) {
  const raw = String(text || '')
  const inc = raw.search(/inclusion\s+criteria|入选标准|入组标准/i)
  const exc = raw.search(/exclusion\s+criteria|排除标准/i)
  if (inc < 0 && exc < 0) return { inclusion: raw, exclusion: '', unknown: true }
  if (inc >= 0 && exc > inc) return { inclusion: raw.slice(inc, exc), exclusion: raw.slice(exc), unknown: false }
  if (exc >= 0 && inc > exc) return { inclusion: raw.slice(inc), exclusion: raw.slice(exc, inc), unknown: false }
  if (inc >= 0) return { inclusion: raw.slice(inc), exclusion: '', unknown: false }
  return { inclusion: '', exclusion: raw.slice(Math.max(0, exc)), unknown: false }
}

function quoteAround(text, re, max = 160) {
  const m = re.exec(text)
  if (!m) return ''
  let start = Math.max(0, m.index - 60)
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space >= 0 && space < m.index) start = space + 1
  }
  let end = Math.min(text.length, start + max)
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    if (space > start + 40) end = space
  }
  /* CTG 的入排原文会把方括号/圆括号转义成 \[ \] \( \)；展示前还原，避免读成乱码。 */
  const q = norm(text.slice(start, end)).replace(/\\([\[\]()])/g, '$1')
  return (start > 0 ? '…' : '') + q + (end < text.length ? '…' : '')
}

function has(text, re) { return re.test(String(text || '')) }

function criterion({ id, label, category, state, hard = false, record, requirement, evidence = '', needsReview = false }) {
  return { id, label, category, state, hard, record, requirement, evidence, needsReview }
}

/**
 * 生成匹配结果。profile 为 dsh/workbench.js 的 getTrialProfile 形状；null/空档案时
 * 所有项都是「待确认」，不产出分数。
 */
export function matchTrial(trial, profile) {
  const p = profile || {}
  const organs = Array.isArray(p.organs) ? p.organs : []
  const meds = Array.isArray(p.meds) ? p.meds : []
  const medText = meds.join(' / ')
  const eligibility = splitEligibility(trial.eligibility_text)
  const text = trial.eligibility_text || ''
  const incText = eligibility.inclusion || ''
  const excText = eligibility.exclusion || ''
  const criteria = []

  /* ① 诊断（硬性）：所有快照记录都是白塞病相关登记。 */
  if (has(trial.conditions, /Beh[cç]et|白塞/i) || has(trial.title, /Beh[cç]et|白塞/i) || has(text, /Beh[cç]et|白塞/i)) {
    const state = p.diagnosisConfirmed === true ? 'match' : p.diagnosisConfirmed === false ? 'mismatch' : 'unknown'
    criteria.push(criterion({
      id: 'diagnosis', label: '诊断（白塞病）', category: '诊断', state, hard: true,
      record: p.diagnosisConfirmed === true ? '已确诊' : p.diagnosisConfirmed === false ? '未确诊' : '未登记',
      requirement: '登记条件包含 Behçet 病（白塞病）相关诊断',
      evidence: quoteAround(text, /Beh[cç]et|白塞/i),
    }))
  }

  /* ② 年龄（硬性，来自结构化字段） */
  const minAge = parseAge(trial.minimum_age)
  const maxAge = parseAge(trial.maximum_age)
  if (minAge !== null || maxAge !== null) {
    const age = Number.isFinite(p.age) && p.age !== null ? Number(p.age) : null
    const ok = age !== null && (minAge === null || age >= minAge) && (maxAge === null || age <= maxAge)
    criteria.push(criterion({
      id: 'age', label: '年龄', category: '年龄', hard: true,
      state: age === null ? 'unknown' : ok ? 'match' : 'mismatch',
      record: age === null ? '未登记' : `${age} 岁`,
      requirement: `${minAge === null ? '不限下限' : `${minAge} 岁及以上`}${maxAge === null ? '' : ` · ${maxAge} 岁及以下`}`,
      evidence: '',
    }))
  }

  /* ③ 性别（硬性，来自结构化字段） */
  const sex = String(trial.sex || 'ALL').toUpperCase()
  if (sex === 'MALE' || sex === 'FEMALE') {
    const wanted = sex === 'MALE' ? 'male' : 'female'
    criteria.push(criterion({
      id: 'sex', label: '性别', category: '性别', hard: true,
      state: p.sex == null ? 'unknown' : p.sex === wanted ? 'match' : 'mismatch',
      record: p.sex == null ? '未登记' : p.sex === 'female' ? '女' : '男',
      requirement: sex === 'MALE' ? '仅男性' : '仅女性',
      evidence: '',
    }))
  }

  /* ④ 妊娠/哺乳（只在排除段提到时判；本人妊娠/哺乳 → 硬性不满足） */
  if (has(excText, /pregnan|nursing|breast[-\s]?feeding|妊娠|怀孕|哺乳/i)) {
    const pregnantKnown = p.pregnant === 'yes' || p.pregnant === 'no'
    criteria.push(criterion({
      id: 'pregnancy', label: '妊娠/哺乳（排除条件）', category: '妊娠', hard: true,
      state: !pregnantKnown ? 'unknown' : p.pregnant === 'yes' ? 'mismatch' : 'match',
      record: p.pregnant === 'yes' ? '妊娠/哺乳中' : p.pregnant === 'no' ? '否' : '未登记',
      requirement: '排除妊娠或哺乳期',
      evidence: quoteAround(excText, /pregnan|nursing|breast|妊娠|怀孕|哺乳/i),
    }))
  }

  /* ⑤ 器官/表型（文本提到才判）。
   * 文本命中只作"线索"：档案已记录 → 符合；未记录 → 待确认。
   * 排除段**不自动判不符合**——排除句常带限定语（"感染性葡萄膜炎""眼部激素使用"），
   * 自动反转就是 35 号 §七.4 的反例；这里只标待确认并附原文。 */
  let organCriteria = 0
  for (const rule of ORGAN_RULES) {
    if (organCriteria >= 3) break
    const incHit = has(incText, rule.re)
    const excHit = has(excText, rule.re)
    if (!incHit && !excHit) continue
    const recorded = organs.some((o) => rule.organs.some((want) => String(o).includes(want) || want.includes(String(o))))
    criteria.push(criterion({
      id: 'organ-' + rule.key, label: rule.label, category: '器官/表型',
      state: recorded ? 'match' : 'unknown', hard: false,
      record: recorded ? '档案已记录' : '档案未记录',
      requirement: excHit ? '排除条件提到该表型（含限定语，需核对原文）' : '入选条件提到该表型',
      evidence: quoteAround(excHit ? excText : incText, rule.re),
      needsReview: excHit,
    }))
    organCriteria++
  }

  /* ⑥ 用药史（文本提到药物类别才判）。
   * 同样不把排除段自动反转：TNF 抑制剂常出现在"洗脱期"里（停药 4/8 周即可），
   * 直接判不符合会把可入组的人排掉。 */
  let medCriteria = 0
  for (const rule of MED_RULES) {
    if (medCriteria >= 2) break
    const incHit = has(incText, rule.re)
    const excHit = has(excText, rule.re)
    if (!incHit && !excHit) continue
    const recorded = has(medText, rule.re)
    criteria.push(criterion({
      id: 'med-' + medCriteria, label: rule.label, category: '用药史',
      state: recorded && incHit ? 'match' : 'unknown', hard: false,
      record: recorded ? `档案记录：${medText.slice(0, 60)}` : '档案未记录',
      requirement: excHit ? '排除条件提到该类药物/洗脱期，需核对原文' : '入选条件提到该类药物',
      evidence: quoteAround(excHit ? excText : incText, rule.re),
      needsReview: excHit,
    }))
    medCriteria++
  }

  /* ⑦ 入排原文可用性：没有原文就不假装判过。 */
  if (!text.trim()) {
    criteria.push(criterion({
      id: 'eligibility-text', label: '入排标准原文', category: '来源', state: 'unknown', hard: false,
      record: '本机快照没有入排原文',
      requirement: '请到官方登记页核对入排标准',
      evidence: '本机快照只存登记的结构化字段，入排标准请到官方登记页核对。',
    }))
  }

  const matched = criteria.filter((c) => c.state === 'match').length
  const mismatched = criteria.filter((c) => c.state === 'mismatch').length
  const unknown = criteria.filter((c) => c.state === 'unknown').length
  const denominator = matched + mismatched
  const hardExcluded = criteria.some((c) => c.state === 'mismatch' && c.hard)
  /* 可对照项不足 2 条不给百分数：1/1=100% 读起来就是结论（35 号 §七.3）。 */
  const pct = denominator >= 2 ? Math.round((matched / denominator) * 100) : null
  const band = hardExcluded ? '硬性条件不满足'
    : pct === null ? '需补充信息'
      : mismatched === 0 && unknown === 0 ? '字段都对得上'
        : '部分对得上'

  return {
    recordId: trial.record_id,
    title: trial.title,
    officialTitle: trial.official_title,
    studyType: trial.study_type,
    phase: trial.phase,
    status: trial.status,
    statusVerified: trial.status_verified,
    lastUpdate: trial.last_update,
    leadSponsor: trial.lead_sponsor,
    enrollment: trial.enrollment,
    conditions: parseJson(trial.conditions_json),
    interventions: parseJson(trial.interventions_json),
    countries: parseJson(trial.countries_json),
    chinaSites: trial.china_sites,
    sourceUrl: trial.source_url,
    snapshotDate: trial.snapshot_date,
    eligibilityText: trial.eligibility_text,
    summary: trial.summary,
    isRegistry: String(trial.study_type || '').toUpperCase() === 'OBSERVATIONAL',
    pct, matched, mismatched, unknown, denominator, band, hardExcluded,
    criteria,
    targetNote: TARGET_RE.test(trial.interventions_json || '') ? '登记里出现的靶点/机制词只说明药物作用位置，不等于你的检测条件。' : '',
    declaration: '这是登记字段符合度，不是入组资格，也不代表效果。',
  }
}

function parseJson(raw) {
  try { return raw ? JSON.parse(raw) : [] } catch { return [] }
}

export function createTrialService({ packageDir, root }) {
  let cache = null
  let cacheMtime = 0

  function snapshotPath() {
    const candidates = [join(packageDir, SNAPSHOT_REL), join(root, '..', SNAPSHOT_REL)]
    for (const p of candidates) if (existsSync(p)) return p
    return null
  }

  function manifest() {
    const p = snapshotPath()
    if (!p) return null
    const mf = join(dirname(p), 'product-manifest.json')
    try { return JSON.parse(readFileSync(mf, 'utf8')) } catch { return null }
  }

  function loadRows() {
    const path = snapshotPath()
    if (!path) return null
    let st
    try { st = statSync(path) } catch { return null }
    if (cache && cacheMtime === st.mtimeMs) return cache
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      cache = db.prepare('SELECT * FROM trials ORDER BY rowid').all()
      cacheMtime = st.mtimeMs
    } finally {
      try { db.close() } catch { /* 只读库 */ }
    }
    return cache
  }

  function summary() {
    const rows = loadRows()
    const mf = manifest()
    if (!rows) return { available: false, reason: 'research/behcet 试验快照不可用（未采集或未随包发出）', loaded: 0 }
    return {
      available: true,
      loaded: rows.length,
      snapshotDate: rows.find((r) => r.snapshot_date)?.snapshot_date || null,
      fetchedAt: mf?.fetchedAt || null,
      source: 'ClinicalTrials.gov',
      sources: mf?.sources || { CTG: 'SUCCESS', ChiCTR: 'NOT_QUERIED', ChinaDrugTrials: 'NOT_QUERIED', ICTRP: 'NOT_QUERIED' },
      note: mf?.note || '单来源快照，未核实，不代表完整检索；登记状态不等于招募或入组资格。',
      totalCount: mf?.totalCount ?? null,
      included: mf?.included ?? rows.length,
    }
  }

  function search({ keyword = '', status = '', studyType = '', limit = 50 } = {}) {
    const rows = loadRows()
    if (!rows) return { available: false, reason: summary().reason, records: [] }
    const kw = norm(keyword).toLowerCase()
    const st = norm(status).toUpperCase()
    const type = norm(studyType).toUpperCase()
    const matched = rows.filter((r) => {
      if (st && String(r.status || '').toUpperCase() !== st) return false
      if (type && String(r.study_type || '').toUpperCase() !== type) return false
      if (!kw) return true
      const hay = [r.record_id, r.title, r.official_title, r.summary, r.conditions_json, r.interventions_json, r.eligibility_text]
        .join(' ').toLowerCase()
      return hay.includes(kw)
    })
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const records = matched.slice(0, cap).map((r) => ({
      recordId: r.record_id,
      title: r.title,
      studyType: r.study_type,
      phase: r.phase,
      status: r.status,
      statusVerified: r.status_verified,
      leadSponsor: r.lead_sponsor,
      conditions: parseJson(r.conditions_json),
      countries: parseJson(r.countries_json),
      chinaSites: r.china_sites,
      sourceUrl: r.source_url,
      snapshotDate: r.snapshot_date,
      isRegistry: String(r.study_type || '').toUpperCase() === 'OBSERVATIONAL',
    }))
    const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))].sort()
    const studyTypes = [...new Set(rows.map((r) => r.study_type).filter(Boolean))].sort()
    return {
      available: true,
      snapshotDate: summary().snapshotDate,
      total: records.length,
      candidatePool: { loaded: rows.length, matched: matched.length, returned: records.length, limit: cap, notFullScan: true, statuses, studyTypes },
      records,
      declaration: '候选池是本地快照，不是全库扫描；登记状态未核实，不代表招募或入组资格。',
    }
  }

  function match(profile, query = {}) {
    const rows = loadRows()
    if (!rows) return { available: false, reason: summary().reason, results: [] }
    const kw = norm(query.keyword).toLowerCase()
    const filtered = rows.filter((r) => {
      if (!kw) return true
      return [r.record_id, r.title, r.official_title, r.summary, r.conditions_json, r.interventions_json, r.eligibility_text]
        .join(' ').toLowerCase().includes(kw)
    })
    const results = filtered.map((r) => matchTrial(r, profile))
    results.sort((a, b) => {
      if (a.hardExcluded !== b.hardExcluded) return a.hardExcluded ? 1 : -1
      if (a.pct === null && b.pct === null) return a.unknown - b.unknown
      if (a.pct === null) return 1
      if (b.pct === null) return -1
      return b.pct - a.pct || a.unknown - b.unknown
    })
    const distribution = results.reduce((acc, r) => { acc[r.band] = (acc[r.band] || 0) + 1; return acc }, {})
    const profileFilled = Boolean(profile && (
      profile.age != null || profile.sex != null || profile.diagnosisConfirmed != null ||
      (profile.organs && profile.organs.length) || (profile.meds && profile.meds.length) || profile.pregnant != null
    ))
    return {
      available: true,
      snapshotDate: summary().snapshotDate,
      profileFilled,
      candidatePool: { loaded: rows.length, matched: filtered.length, returned: results.length, notFullScan: true },
      distribution,
      results,
      declaration: '结果只是候选线索：百分数是登记字段符合度，不是入组资格，也不代表效果。判定归医生与研究中心。',
    }
  }

  return { summary, search, match, snapshotPath }
}