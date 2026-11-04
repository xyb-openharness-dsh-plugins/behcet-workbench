#!/usr/bin/env node
/**
 * 研究快照采集脚本的夹具测试。
 *
 * 所有 HTTP 都由本文件的假 fetch 提供，**不访问网络**，也不写生产库；每个用例在
 * `os.tmpdir()` 下建独立目录，结束后删除。分页、零结果、失败、计数不符、令牌环、
 * 跨别名去重和四通道状态都单独断言；完整快照还要再跑一次仓库现有的
 * `check-trial-snapshot.mjs`，避免“脚本自己说成功”代替结构复核。
 *
 * 注意：`check-trial-snapshot.mjs` 只读 `manifest.files` 里的 JSONL/SQLite，**不读
 * `pages/` 原始响应**，也不核验分页完整性；原始 version/分页文件必须由本文件的
 * `verifySnapshotHashes` 用例（篡改、缺页、多余文件）单独覆盖。该函数还会从原始
 * 正文重放归一化记录，逐字段对照 JSONL 与 SQLite，因此“同时改两处并同步哈希”的
 * 用例也在这里；锁释放的所有权另有独立用例。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import {
  BEHCET_ALIASES,
  CHANNELS,
  MAX_QUERY_ERRORS,
  OUTPUT_LOCK_FILE,
  buildStudiesUrl,
  buildWindow,
  evaluateWindowCoverage,
  parseArgs,
  prepareOutDir,
  runSnapshot,
  verifySnapshotHashes,
} from '../scripts/fetch-behcet-trials-2026.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const checker = join(root, 'scripts', 'check-trial-snapshot.mjs')
const VERSION = { apiVersion: '2.0.5', dataTimestamp: '2026-11-03T10:00:05' }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sampleStudy(nctId, {
  omitStatus = false,
  omitStatusFields = false,
  overallStatus = 'RECRUITING',
  firstPostDate = '2026-06-01',
} = {}) {
  const statusModule = omitStatus
    ? {}
    : {
        ...(omitStatusFields ? {} : { overallStatus, statusVerifiedDate: '2026-10-31' }),
        studyFirstPostDateStruct: { date: firstPostDate, type: 'ACTUAL' },
        ...(omitStatusFields
          ? {}
          : {
              startDateStruct: { date: '2026-06-15', type: 'ACTUAL' },
              primaryCompletionDateStruct: { date: '2027-06-15', type: 'ESTIMATED' },
              completionDateStruct: { date: '2027-12-01', type: 'ESTIMATED' },
              lastUpdatePostDateStruct: { date: '2026-10-20', type: 'ACTUAL' },
            }),
      }
  return {
    protocolSection: {
      identificationModule: {
        nctId,
        nctIdAliases: [],
        briefTitle: `A study of ${nctId}`,
        officialTitle: `Official title ${nctId}`,
        acronym: `ACR-${nctId}`,
        orgStudyIdInfo: { id: `ORG-${nctId}` },
        secondaryIdInfos: [{ id: `SEC-${nctId}`, type: 'OTHER', domain: 'example.org' }],
      },
      statusModule,
      designModule: {
        studyType: 'INTERVENTIONAL',
        phases: ['PHASE2'],
        enrollmentInfo: { count: 30, type: 'ACTUAL' },
      },
      sponsorCollaboratorsModule: {
        leadSponsor: { name: 'Example Sponsor', class: 'OTHER' },
        collaborators: [{ name: 'Partner Site', class: 'OTHER' }],
      },
      conditionsModule: { conditions: ['Behçet Disease'], keywords: ['Behçet'] },
      eligibilityModule: { sex: 'ALL', minimumAge: '18 Years' },
    },
    derivedSection: { conditionBrowseModule: { meshes: [] } },
    hasResults: false,
  }
}

/** 贴近 CTG v2 实际响应的嵌套形状；多出的模块不应被归一化逻辑误解。 */
function realisticStudy(nctId) {
  const study = sampleStudy(nctId, { overallStatus: 'ACTIVE_NOT_RECRUITING' })
  const protocol = study.protocolSection
  protocol.identificationModule.organization = {
    fullName: 'Example University Hospital',
    class: 'OTHER',
  }
  protocol.statusModule.whyStopped = null
  protocol.statusModule.primaryCompletionDateStruct = { date: '2027-06-15', type: 'ESTIMATED' }
  protocol.designModule.designInfo = {
    allocation: 'RANDOMIZED',
    interventionModel: 'PARALLEL',
    primaryPurpose: 'TREATMENT',
    maskingInfo: { masking: 'NONE' },
  }
  protocol.armsInterventionsModule = {
    armGroups: [{ label: 'Arm A', type: 'EXPERIMENTAL' }],
    interventions: [{ name: 'Drug A', type: 'DRUG' }],
  }
  protocol.outcomesModule = {
    primaryOutcomes: [{ measure: 'Relapse rate', timeFrame: '12 months' }],
  }
  protocol.contactsLocationsModule = {
    locations: [{ facility: 'Example Site', country: 'Türkiye' }],
  }
  protocol.referencesModule = { references: [] }
  study.derivedSection = {
    conditionBrowseModule: { meshes: [{ id: 'D001528', term: 'Behçet Syndrome' }] },
    interventionBrowseModule: { browseLeaves: [] },
  }
  study.hasResults = false
  return study
}

function page(studies, { totalCount = studies.length, nextPageToken, omitTotalCount = false } = {}) {
  // 尾页真实响应可以省略 totalCount；用 undefined 无法表达，因为默认参数会回落。
  const body = omitTotalCount ? { studies } : { studies, totalCount }
  if (nextPageToken) body.nextPageToken = nextPageToken
  return { body }
}

/** 同一别名下按 pageToken（第一页为空串）路由到不同夹具。 */
function aliasRoutes(aliases, pages) {
  const byToken = {}
  pages.forEach((entry, index) => {
    byToken[index === 0 ? '' : pages[index - 1].body.nextPageToken] = entry
  })
  return Object.fromEntries(aliases.map((alias) => [alias, byToken]))
}

/**
 * 只有查满 BEHCET_ALIASES 全部 12 个别名才可能认证 COMPLETE。测试若只关心其中
 * 一两个别名的证据，用本函数为其余别名补上真实零结果路由，避免把“少查别名”与
 * 被测行为混在一起。
 */
function fullAliasRoutes(routesByAlias = {}) {
  return Object.fromEntries(
    BEHCET_ALIASES.map((alias) => [
      alias,
      routesByAlias[alias] ?? { '': page([], { totalCount: 0 }) },
    ]),
  )
}

function makeFetch({
  routes,
  versionBody = VERSION,
  versionBodyAfter = versionBody,
  versionStatus = 200,
  versionStatusAfter = versionStatus,
}) {
  const calls = []
  let versionCalls = 0
  const fetchImpl = async (input) => {
    const url = new URL(String(input))
    calls.push(url.toString())
    if (url.pathname.endsWith('/version')) {
      const after = versionCalls > 0
      versionCalls += 1
      return after ? json(versionBodyAfter, versionStatusAfter) : json(versionBody, versionStatus)
    }
    if (!url.pathname.endsWith('/studies')) return json({ error: 'unexpected path' }, 404)
    const alias = url.searchParams.get('query.cond')
    const token = url.searchParams.get('pageToken') ?? ''
    const route = routes[alias]
    if (!route) return json({ error: `unexpected alias ${alias}` }, 404)
    const spec = route[token]
    if (!spec) return json({ error: `unexpected pageToken ${token}` }, 404)
    if (spec instanceof Response) return spec
    return json(spec.body, spec.status ?? 200)
  }
  fetchImpl.calls = calls
  return fetchImpl
}

async function runCase(t, {
  aliases,
  routes,
  versionBody = VERSION,
  versionBodyAfter = versionBody,
  versionStatus = 200,
  versionStatusAfter = versionStatus,
  options = {},
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const out = join(dir, 'snapshot')
  const fetchImpl = makeFetch({
    routes,
    versionBody,
    versionBodyAfter,
    versionStatus,
    versionStatusAfter,
  })
  const result = await runSnapshot({
    outDir: out,
    // 上游 dataTimestamp=2026-11-03T10:00:05 只覆盖到 11-03 日间；窗口末日取
    // 11-02，末 UTC 日边界 11-03T00:00:00Z 才被完整覆盖。
    endDate: '2026-11-02',
    months: 9,
    aliases,
    fetchImpl,
    now: () => new Date('2026-11-03T21:05:00Z'),
    ...options,
  })
  return { dir, out, result, fetchImpl }
}

async function manifestOf(out) {
  return JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
}

async function writeManifest(out, manifest) {
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function jsonlOf(out) {
  const text = await readFile(join(out, 'trials.jsonl'), 'utf8')
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

function openDb(out) {
  return new DatabaseSync(join(out, 'trials.sqlite'), { readOnly: true })
}

async function modeOf(path) {
  return (await stat(path)).mode & 0o777
}

/** 在指定 umask 下执行，结束后恢复；用于验证模式不依赖调用者环境。 */
async function withUmask(mask, action) {
  const previous = process.umask(mask)
  try {
    return await action()
  } finally {
    process.umask(previous)
  }
}

/** 递归断言快照里没有比 0700/0600 更宽松的目录或文件。 */
async function assertPrivateTree(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      assert.equal(await modeOf(full), 0o700, `${full} should be 0700`)
      await assertPrivateTree(full)
    } else if (entry.isFile()) {
      assert.equal(await modeOf(full), 0o600, `${full} should be 0600`)
    } else {
      assert.fail(`${full} should be a regular file or directory`)
    }
  }
}

test('九个月窗口按 UTC 日历计算，含首尾日期', () => {
  const window = buildWindow({ endDate: '2026-11-03' })
  assert.equal(window.start, '2026-02-03')
  assert.equal(window.end, '2026-11-03')
  assert.equal(window.months, 9)
  assert.equal(window.inclusive, true)
  assert.equal(window.rule, 'AREA[StudyFirstPostDate]RANGE[2026-02-03,2026-11-03]')
  assert.equal(window.expansion, null)

  // 目标月没有 31 日时取月末，而不是把日期滚进下个月。
  const clamped = buildWindow({ endDate: '2026-05-31', months: 3 })
  assert.equal(clamped.start, '2026-02-28')

  assert.throws(() => buildWindow({ endDate: '2026-02-30' }), /not a real date/)
  assert.throws(() => buildWindow({ endDate: '2026-11-03', months: 0 }), />= 1/)
  assert.throws(() => buildWindow({ endDate: '2026-11-03', months: 10 }), /expansion reason/)
  assert.throws(
    () => buildWindow({ endDate: '2026-11-03', months: 10, expansionReason: '   ' }),
    /expansion reason/,
  )
  assert.throws(() => buildWindow({ endDate: '2026-11-03', months: 13 }), /maximum of 12/)

  const expanded = buildWindow({
    endDate: '2026-11-03',
    months: 10,
    expansionReason: '九个月窗口漏掉仍招募中的早登记研究',
  })
  assert.equal(expanded.start, '2026-01-03')
  assert.equal(expanded.expansion.reason, '九个月窗口漏掉仍招募中的早登记研究')
  assert.equal(expanded.expansion.approvalRecorded, false)
})

test('别名覆盖变音符号、disease/syndrome 与 Adamantiades，且去重后仍分别查询', () => {
  assert.ok(BEHCET_ALIASES.includes('Behçet'))
  assert.ok(BEHCET_ALIASES.includes('Behcet'))
  assert.ok(BEHCET_ALIASES.includes("Behçet's disease"))
  assert.ok(BEHCET_ALIASES.includes("Behcet's syndrome"))
  assert.ok(BEHCET_ALIASES.includes('Adamantiades-Behçet'))
  assert.equal(new Set(BEHCET_ALIASES).size, BEHCET_ALIASES.length)
  for (const alias of BEHCET_ALIASES) assert.equal(alias, alias.trim())
})

test('查询 URL 固定 cond、九个月窗口、分页参数与 pageToken 链', () => {
  const window = buildWindow({ endDate: '2026-11-03' })
  const first = new URL(buildStudiesUrl({ alias: "Behçet's disease", window, pageSize: 50 }))
  assert.equal(first.origin, 'https://clinicaltrials.gov')
  assert.equal(first.pathname, '/api/v2/studies')
  assert.equal(first.searchParams.get('query.cond'), "Behçet's disease")
  assert.equal(
    first.searchParams.get('filter.advanced'),
    'AREA[StudyFirstPostDate]RANGE[2026-02-03,2026-11-03]',
  )
  assert.equal(first.searchParams.get('pageSize'), '50')
  assert.equal(first.searchParams.get('countTotal'), 'true')
  assert.equal(first.searchParams.get('pageToken'), null)

  const second = new URL(buildStudiesUrl({ alias: 'Behcet', window, pageToken: 'abc123' }))
  assert.equal(second.searchParams.get('pageToken'), 'abc123')
  assert.equal(second.searchParams.get('query.cond'), 'Behcet')

  assert.throws(() => buildStudiesUrl({ alias: 'Behcet', window, pageSize: 1001 }), /pageSize/)
  assert.throws(() => buildStudiesUrl({ alias: '', window }), /alias is required/)
})

test('完整分页：逐页哈希与令牌链、计数核对、NCT 去重、结构检查器通过', async (t) => {
  // COMPLETE 要求查满 BEHCET_ALIASES；Behçet/Behcet 承载分页夹具，其余别名返回真实零结果。
  const aliases = BEHCET_ALIASES
  const pages = [
    page([sampleStudy('NCT00000001'), sampleStudy('NCT00000002')], {
      totalCount: 3,
      nextPageToken: 'page-2-token',
    }),
    page([sampleStudy('NCT00000003')], { totalCount: 3 }),
  ]
  const { dir, out, result, fetchImpl } = await runCase(t, {
    aliases,
    routes: fullAliasRoutes(aliasRoutes(['Behçet', 'Behcet'], pages)),
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.manifest.status, 'COMPLETE')
  assert.equal(result.manifest.sources[0].state, 'SUCCESS')
  assert.equal(result.manifest.counts.queryPages, 14) // 2 个别名各 2 页 + 其余 10 个各 1 页
  assert.equal(result.manifest.counts.jsonlRecords, 3)
  assert.equal(fetchImpl.calls.length, 16) // before/after version + 14 study pages

  for (const query of result.manifest.queries.filter(
    (entry) => entry.alias === 'Behçet' || entry.alias === 'Behcet',
  )) {
    assert.equal(query.state, 'SUCCESS')
    assert.equal(query.pageCount, 2)
    assert.equal(query.firstPageTotal, 3)
    assert.equal(query.totalCount, 3)
    assert.equal(query.preDedupCount, 3)
    assert.equal(query.uniqueRecordCount, 3)
    assert.deepEqual(query.recordIds, ['NCT00000001', 'NCT00000002', 'NCT00000003'])
    assert.equal(query.pages[0].pageToken, null)
    assert.equal(query.pages[0].nextPageToken, 'page-2-token')
    assert.equal(query.pages[1].pageToken, 'page-2-token')
    assert.equal(query.pages[1].nextPageToken, null)
    for (const pageRecord of query.pages) {
      assert.match(pageRecord.sha256, /^[a-f0-9]{64}$/)
      const stored = await readFile(join(out, pageRecord.storedAs))
      assert.equal(pageRecord.sha256, createHash('sha256').update(stored).digest('hex'))
      assert.equal(pageRecord.bytes, stored.length)
    }
  }

  const rows = await jsonlOf(out)
  assert.deepEqual(rows.map((row) => row.recordId), [
    'NCT00000001',
    'NCT00000002',
    'NCT00000003',
  ])
  for (const row of rows) {
    // 两个别名都命中了同一条登记；按码位排序，Behcet 在 Behçet 前。
    assert.deepEqual(row.mergedSources, ['Behcet', 'Behçet'])
    assert.equal(row.sourceId, 'clinicaltrials.gov')
    assert.equal(row.sourceUrl, `https://clinicaltrials.gov/study/${row.recordId}`)
    assert.deepEqual(row.registryNumbers.map((entry) => entry.value).slice(0, 2), [
      row.recordId,
      `ORG-${row.recordId}`,
    ])
  }

  const manifest = await manifestOf(out)
  for (const name of ['trials.jsonl', 'trials.sqlite']) {
    const bytes = await readFile(join(out, name))
    assert.equal(manifest.files[name].sha256, createHash('sha256').update(bytes).digest('hex'))
    assert.equal(manifest.files[name].bytes, bytes.length)
  }
  assert.equal(manifest.recordCount, 3) // check-trial-snapshot 的固定字段
  assert.equal(manifest.dbCount, 3)
  assert.equal(manifest.counts.dbRecords, 3)
  assert.equal(manifest.counts.sourceStatusRows, 16) // 4 通道 + 12 别名
  assert.equal(manifest.aliasCoverage.complete, true)
  assert.deepEqual(manifest.aliasCoverage.missing, [])
  assert.equal(manifest.aliasCoverage.queried.length, BEHCET_ALIASES.length)
  assert.equal(manifest.sources[0].preDedupCount, 6) // 两个非零别名各返回 3 条，去重后 3 条
  assert.equal(manifest.sources[0].uniqueRecords, 3)
  assert.equal(manifest.integrity.sqlite, 'ok')
  assert.equal(manifest.integrity.jsonlMatchesDb, true)
  assert.deepEqual(manifest.integrity.dbCounts, { trials: 3, sourceStatuses: 16, queries: 12 })
  assert.equal(manifest.api.after.state, 'OK')
  assert.equal(manifest.api.dataTimestampChanged, false)
  assert.equal(manifest.api.collectionStable, true)
  assert.equal(manifest.integrity.rawFiles.ok, true)
  assert.equal(manifest.integrity.rawFiles.complete, true)
  assert.equal(manifest.integrity.rawFiles.checked.pages, 14)
  assert.equal(manifest.integrity.rawFiles.checked.versions, 2)
  assert.equal(manifest.coverage.queriedSources.length, 1)
  assert.equal(manifest.coverage.notQueriedSources.length, 3)

  const db = openDb(out)
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM trials').get().n, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM source_statuses').get().n, 16)
    const channels = db
      .prepare("SELECT source_id, state, total_count, query_date, page_count, http_status FROM source_statuses WHERE scope = 'channel' ORDER BY source_id")
      .all()
    assert.equal(channels.length, 4)
    const ctg = channels.find((row) => row.source_id === 'clinicaltrials.gov')
    assert.equal(ctg.state, 'SUCCESS')
    assert.equal(ctg.total_count, 3)
    for (const row of channels.filter((entry) => entry.source_id !== 'clinicaltrials.gov')) {
      assert.equal(row.state, 'NOT_QUERIED')
      assert.equal(row.total_count, null) // 未查不能填 0
      assert.equal(row.query_date, null)
      assert.equal(row.page_count, null)
      assert.equal(row.http_status, null)
    }
  } finally {
    db.close()
  }

  const output = execFileSync(process.execPath, [checker, dir], { encoding: 'utf8' })
  assert.match(output, /PASS snapshot consistency: 1 snapshot/)
})

test('服务端真实零条：一页、totalCount=0、无令牌时才记 SUCCESS_ZERO', async (t) => {
  const aliases = BEHCET_ALIASES
  const { dir, out, result } = await runCase(t, {
    aliases,
    routes: fullAliasRoutes(),
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.manifest.status, 'COMPLETE')
  assert.equal(result.manifest.queries.length, BEHCET_ALIASES.length)
  assert.equal(result.manifest.aliasCoverage.complete, true)
  assert.equal(result.manifest.sources[0].state, 'SUCCESS_ZERO')
  assert.equal(result.manifest.queries[0].state, 'SUCCESS_ZERO')
  assert.equal(result.manifest.queries[0].firstPageTotal, 0)
  assert.equal(result.manifest.counts.jsonlRecords, 0)
  assert.equal(await readFile(join(out, 'trials.jsonl'), 'utf8'), '')

  const db = openDb(out)
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM trials').get().n, 0)
  } finally {
    db.close()
  }

  const output = execFileSync(process.execPath, [checker, dir], { encoding: 'utf8' })
  assert.match(output, /PASS snapshot consistency/)
})

test('HTTP 500 记 FAILED，不得称成功，也不得并入半页记录', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': { body: { studies: [sampleStudy('NCT00000010')], totalCount: 1 }, status: 500 },
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'FAILED')
  assert.equal(result.manifest.sources[0].state, 'FAILED')
  assert.equal(result.manifest.queries[0].state, 'FAILED')
  assert.ok(result.manifest.queries[0].errors.some((entry) => entry.code === 'http_error'))
  assert.equal(result.manifest.counts.jsonlRecords, 0)
  assert.equal((await jsonlOf(out)).length, 0)
  assert.ok(result.manifest.errors.some((entry) => entry.code === 'http_error'))
  assert.equal(result.manifest.queries[0].pages[0].sha256.length, 64)
})

test('200 但没有 studies 数组：FAILED，不把空壳当零结果', async (t) => {
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': { body: {} } } },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.queries[0].state, 'FAILED')
  assert.notEqual(result.manifest.queries[0].state, 'SUCCESS_ZERO')
  assert.ok(result.manifest.queries[0].errors.some((entry) => entry.code === 'response_shape'))
  assert.equal(result.manifest.sources[0].state, 'FAILED')
})

test('分页条数与 totalCount 不符：INCOMPLETE，记录不并入快照', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000011'), sampleStudy('NCT00000012')], { totalCount: 5 }),
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.sources[0].state, 'INCOMPLETE')
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.ok(result.manifest.queries[0].errors.some((entry) => entry.code === 'count_mismatch'))
  assert.ok(
    result.manifest.queries[0].errors.some((entry) => entry.code === 'unique_count_mismatch'),
  )
  assert.equal(result.manifest.queries[0].preDedupCount, 2)
  assert.deepEqual(result.manifest.queries[0].recordIds, ['NCT00000011', 'NCT00000012'])
  assert.equal(result.manifest.counts.jsonlRecords, 0)
  assert.equal((await jsonlOf(out)).length, 0)
})

test('nextPageToken 自环：停页并记 INCOMPLETE，不无限抓取', async (t) => {
  const { result, fetchImpl } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000020'), sampleStudy('NCT00000021')], {
          totalCount: 2,
          nextPageToken: 'loop',
        }),
        loop: page([], { totalCount: 2, nextPageToken: 'loop' }),
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.ok(result.manifest.queries[0].errors.some((entry) => entry.code === 'token_loop'))
  assert.equal(result.manifest.queries[0].pageCount, 2)
  assert.equal(fetchImpl.calls.length, 4) // before version + 两页 + after version，没有第三页
})

test('一个别名成功、另一个失败：通道 PARTIAL，只保留成功查询的记录', async (t) => {
  const aliases = ['Behçet', 'Behcet']
  const { out, result } = await runCase(t, {
    aliases,
    routes: {
      Behçet: { '': page([sampleStudy('NCT00000030')]) },
      Behcet: { '': { body: { error: 'upstream error' }, status: 500 } },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'PARTIAL')
  assert.equal(result.manifest.sources[0].state, 'PARTIAL')
  assert.deepEqual(result.manifest.queries.map((query) => query.state), ['SUCCESS', 'FAILED'])
  const rows = await jsonlOf(out)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].mergedSources, ['Behçet'])
})

test('跨别名同 NCT 去重并保留命中关系；状态日期原样保存', async (t) => {
  const aliases = ['Behçet', 'Adamantiades-Behcet']
  const { out, result } = await runCase(t, {
    aliases,
    routes: aliasRoutes(aliases, [page([sampleStudy('NCT00000040')])]),
  })

  const rows = await jsonlOf(out)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].mergedSources, ['Adamantiades-Behcet', 'Behçet'])
  for (const query of result.manifest.queries) {
    assert.deepEqual(query.recordIds, ['NCT00000040'])
  }
  assert.equal(rows[0].dates.statusVerifiedDate, '2026-10-31')
  assert.equal(rows[0].dates.studyFirstPostDate, '2026-06-01')
  assert.match(rows[0].statusNote, /overallStatus=RECRUITING/)
  assert.match(rows[0].statusNote, /not a recruitment or eligibility determination/)
})

test('缺失状态/日期保持 null 并标明缺失，不生成入组结论', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000050', { omitStatusFields: true })]),
      },
    },
  })

  const rows = await jsonlOf(out)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].dates.statusVerifiedDate, null)
  assert.equal(rows[0].dates.startDate, null)
  assert.match(rows[0].statusNote, /overallStatus=MISSING_IN_RESPONSE/)
  assert.match(rows[0].statusNote, /statusVerifiedDate=MISSING_IN_RESPONSE/)
  assert.doesNotMatch(rows[0].statusNote, /eligible:\s*(yes|no)/i)
})

test('/version 失败：查询仍记录但来源只能是 PARTIAL，退出码非零', async (t) => {
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000060')]) } },
    versionStatus: 503,
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.api.state, 'FAILED')
  assert.equal(result.manifest.api.version.state, 'FAILED')
  assert.equal(result.manifest.sources[0].state, 'PARTIAL')
  assert.equal(result.manifest.queries[0].state, 'SUCCESS')
  assert.ok(result.manifest.errors.some((entry) => entry.code === 'version_failed'))
})

test('/version 缺 dataTimestamp：API 状态 INCOMPLETE，快照不能标 COMPLETE', async (t) => {
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000061')]) } },
    versionBody: { apiVersion: '2.0.5' },
  })

  assert.equal(result.exitCode, 1)
  // 前后两次版本响应都缺 dataTimestamp：无法证明采集期间版本稳定，整份快照
  // 只能是 INCOMPLETE；查询本身仍成功，所以通道是 PARTIAL。
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.api.state, 'INCOMPLETE')
  assert.equal(result.manifest.api.after.state, 'INCOMPLETE')
  assert.equal(result.manifest.sources[0].state, 'PARTIAL')
  assert.ok(
    result.manifest.errors.some((entry) => entry.code === 'version_metadata_missing'),
  )
  assert.ok(result.manifest.errors.some((entry) => entry.code === 'version_after_incomplete'))
})

test('非空输出目录拒绝覆盖；--out 必填；扩窗必须带理由', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-guard-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'keep.txt'), 'existing snapshot', 'utf8')

  await assert.rejects(
    runSnapshot({
      outDir: dir,
      endDate: '2026-11-03',
      aliases: ['Behçet'],
      fetchImpl: () => {
        throw new Error('must not fetch before refusing an existing directory')
      },
    }),
    /not empty/,
  )

  assert.throws(() => parseArgs([]), /--out is required/)
  assert.throws(() => parseArgs(['--out', 'x', '--bogus']), /unknown argument/)
  assert.throws(() => parseArgs(['--out', 'x', '--months', '9.5']), /integer/)
  assert.equal(parseArgs(['--help']).help, true)
  const parsed = parseArgs(['--out', 'x', '--months', '10', '--expansion-reason', 'coverage gap'])
  assert.equal(parsed.months, 10)
  assert.equal(parsed.expansionReason, 'coverage gap')
  await assert.rejects(
    runSnapshot({
      outDir: join(dir, 'never-created'),
      endDate: '2026-11-03',
      months: 10,
      aliases: ['Behçet'],
      fetchImpl: () => {
        throw new Error('must not fetch when the expansion reason is missing')
      },
    }),
    /expansion reason/,
  )
})

test('200 且空 studies 但缺 totalCount：INCOMPLETE，不冒充真实零结果', async (t) => {
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': { body: { studies: [] } } } },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.notEqual(result.manifest.queries[0].state, 'SUCCESS_ZERO')
  assert.ok(
    result.manifest.queries[0].errors.some((entry) => entry.code === 'total_count_missing'),
  )
})

test('后续页 totalCount 非整数：记 INCOMPLETE，诚实快照仍可通过核验', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000071')], { totalCount: 2, nextPageToken: 'p2' }),
        p2: { body: { studies: [sampleStudy('NCT00000072')], totalCount: '2' } },
      },
    },
  })

  const query = result.manifest.queries[0]
  assert.equal(result.exitCode, 1)
  assert.equal(query.state, 'INCOMPLETE')
  assert.equal(query.totalCount, 2)
  assert.equal(query.pages[1].totalCount, null)
  assert.ok(query.errors.some((entry) => entry.code === 'total_count_invalid'))

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, true)
  assert.deepEqual(verified.errors, [])
})

test('第二页 HTTP 500：整条查询 FAILED，第一页记录不并入快照', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000070')], { totalCount: 2, nextPageToken: 'p2' }),
        p2: { body: { error: 'page two failed' }, status: 500 },
      },
    },
  })

  assert.equal(result.exitCode, 1)
  const query = result.manifest.queries[0]
  assert.equal(query.state, 'FAILED')
  assert.equal(query.pageCount, 2)
  // 首页 200 只代表首页；导致失败的页二 500 必须单独保留，不能报成整条 200。
  assert.equal(query.httpStatus, 200)
  assert.equal(query.lastHttpStatus, 500)
  assert.equal(query.failedHttpStatus, 500)
  assert.equal(query.failedPage, 2)
  assert.ok(query.errors.some((entry) => entry.code === 'http_error'))
  assert.equal(query.preDedupCount, 1)
  assert.equal(result.manifest.counts.jsonlRecords, 0)
  assert.equal((await jsonlOf(out)).length, 0)

  const db = openDb(out)
  try {
    const row = db.prepare(
      "SELECT http_status, last_http_status, failed_http_status, failed_page, error_count FROM source_statuses WHERE scope = 'query'",
    ).get()
    assert.equal(row.http_status, 500)
    assert.equal(row.last_http_status, 500)
    assert.equal(row.failed_http_status, 500)
    assert.equal(row.failed_page, 2)
    assert.ok(row.error_count >= 1)
  } finally {
    db.close()
  }

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, true)
})

test('SQLite queries 与 source_statuses 逐行对照清单：成功、零结果、真实失败与未查', async (t) => {
  const success = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes({
      Behçet: { '': page([sampleStudy('NCT00000001')]) },
      Behcet: { '': page([sampleStudy('NCT00000002')]) },
    }),
  })
  assert.equal(success.result.manifest.status, 'COMPLETE')
  assert.equal((await verifySnapshotHashes(success.out)).ok, true)

  const successManifest = success.result.manifest
  const successDb = openDb(success.out)
  try {
    const queryRows = successDb.prepare('SELECT * FROM queries ORDER BY query_id').all()
    assert.equal(queryRows.length, successManifest.queries.length)
    for (const row of queryRows) {
      const expected = successManifest.queries.find((query) => query.queryId === row.query_id)
      assert.ok(expected)
      assert.equal(row.source_id, expected.sourceId)
      assert.equal(row.alias, expected.alias)
      assert.equal(row.state, expected.state)
      assert.equal(row.http_status, expected.httpStatus)
      assert.equal(row.total_count, expected.totalCount)
      assert.equal(row.record_ids, JSON.stringify(expected.recordIds))
      assert.equal(row.error, null)
      assert.equal(row.error_count, expected.errors.length)
    }

    const statusRows = successDb.prepare('SELECT * FROM source_statuses').all()
    assert.equal(statusRows.length, successManifest.sourceStatusRows)
    for (const expected of successManifest.queries) {
      const row = statusRows.find(
        (entry) =>
          entry.scope === 'query' &&
          entry.source_id === expected.sourceId &&
          entry.query === expected.alias,
      )
      assert.ok(row)
      assert.equal(row.state, expected.state)
      assert.equal(row.http_status, expected.failedHttpStatus ?? expected.httpStatus)
      assert.equal(row.total_count, expected.totalCount)
      assert.equal(row.error, null)
      assert.equal(row.error_count, 0)
    }

    const channel = statusRows.find(
      (entry) => entry.scope === 'channel' && entry.source_id === 'clinicaltrials.gov',
    )
    assert.equal(channel.state, 'SUCCESS')
    assert.equal(channel.query, '')
    assert.equal(channel.total_count, 2)
    assert.equal(channel.pre_dedup_count, 2)
    assert.equal(channel.unique_records, 2)
    assert.equal(channel.query_url, `${successManifest.api.baseUrl}/studies`)
    assert.equal(channel.error, null)
    assert.equal(channel.error_count, null)
    assert.equal(channel.truncated_errors, null)

    const nullableColumns = [
      'query_date',
      'window_start',
      'window_end',
      'http_status',
      'last_http_status',
      'failed_http_status',
      'failed_page',
      'page_count',
      'total_count',
      'pre_dedup_count',
      'unique_records',
      'query_url',
      'error_count',
      'truncated_errors',
      'retrieved_at',
    ]
    for (const expected of CHANNELS.filter((entry) => !entry.queryable)) {
      const row = statusRows.find(
        (entry) => entry.scope === 'channel' && entry.source_id === expected.sourceId,
      )
      assert.ok(row)
      assert.equal(row.query, '')
      assert.equal(row.state, 'NOT_QUERIED')
      assert.equal(row.error, expected.note)
      for (const column of nullableColumns) assert.equal(row[column], null, column)
    }
  } finally {
    successDb.close()
  }

  const zero = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes(),
  })
  assert.equal(zero.result.manifest.status, 'COMPLETE')
  assert.equal((await verifySnapshotHashes(zero.out)).ok, true)
  const zeroDb = openDb(zero.out)
  try {
    const queryRows = zeroDb.prepare('SELECT * FROM queries').all()
    assert.equal(queryRows.length, BEHCET_ALIASES.length)
    const queryRow = queryRows[0]
    assert.equal(queryRow.state, 'SUCCESS_ZERO')
    assert.equal(queryRow.total_count, 0)
    assert.equal(queryRow.pre_dedup_count, 0)
    assert.equal(queryRow.unique_records, 0)
    assert.equal(queryRow.record_ids, '[]')
    assert.equal(queryRow.error, null)
    assert.equal(queryRow.error_count, 0)
    const queryStatus = zeroDb.prepare("SELECT * FROM source_statuses WHERE scope = 'query'").get()
    assert.equal(queryStatus.state, 'SUCCESS_ZERO')
    assert.equal(queryStatus.total_count, 0)
    assert.equal(queryStatus.error, null)
    assert.equal(queryStatus.error_count, 0)
    const channel = zeroDb.prepare(
      "SELECT * FROM source_statuses WHERE scope = 'channel' AND source_id = 'clinicaltrials.gov'",
    ).get()
    assert.equal(channel.state, 'SUCCESS_ZERO')
    assert.equal(channel.total_count, 0)
    assert.equal(channel.error, null)
  } finally {
    zeroDb.close()
  }

  const failure = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': { body: { studies: [sampleStudy('NCT00000010')], totalCount: 1 }, status: 500 },
      },
    },
  })
  assert.equal(failure.result.manifest.status, 'FAILED')
  assert.equal((await verifySnapshotHashes(failure.out)).ok, true)
  const failureManifest = failure.result.manifest
  const expectedQuery = failureManifest.queries[0]
  const failureDb = openDb(failure.out)
  try {
    const queryRow = failureDb.prepare('SELECT * FROM queries').get()
    assert.equal(queryRow.state, 'FAILED')
    assert.equal(queryRow.http_status, expectedQuery.httpStatus)
    assert.equal(queryRow.error_count, expectedQuery.errors.length)
    assert.ok(queryRow.error.includes('http_error'))
    assert.equal(
      queryRow.error,
      expectedQuery.errors.map((entry) => `${entry.code}: ${entry.message}`).join(' | '),
    )

    const queryStatus = failureDb.prepare("SELECT * FROM source_statuses WHERE scope = 'query'").get()
    assert.equal(queryStatus.state, 'FAILED')
    assert.equal(queryStatus.http_status, expectedQuery.failedHttpStatus ?? expectedQuery.httpStatus)
    assert.equal(queryStatus.last_http_status, expectedQuery.lastHttpStatus)
    assert.equal(queryStatus.error, queryRow.error)
    assert.equal(queryStatus.error_count, queryRow.error_count)

    const channel = failureDb.prepare(
      "SELECT * FROM source_statuses WHERE scope = 'channel' AND source_id = 'clinicaltrials.gov'",
    ).get()
    assert.equal(channel.state, 'FAILED')
    assert.equal(channel.total_count, 0)
    assert.equal(
      channel.error,
      expectedQuery.errors
        .map((entry) => `${expectedQuery.queryId} ${entry.code}: ${entry.message}`)
        .join(' | '),
    )
  } finally {
    failureDb.close()
  }
})

test('篡改 SQLite queries 与 source_statuses 并同步哈希：逐行对照清单仍拒绝', async (t) => {
  const { dir, out } = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes({ Behçet: { '': page([sampleStudy('NCT00000130')]) } }),
  })
  const manifest = await manifestOf(out)
  const target = manifest.queries[0]

  const db = new DatabaseSync(join(out, 'trials.sqlite'))
  try {
    assert.equal(
      db.prepare(
        'UPDATE queries SET alias = ?, state = ?, error = ?, error_count = ? WHERE query_id = ?',
      ).run('Ghost alias', 'FAILED', 'forged query error', 1, target.queryId).changes,
      1,
    )
    assert.equal(
      db.prepare(
        "UPDATE source_statuses SET state = ?, error = ?, error_count = ?, total_count = NULL WHERE source_id = ? AND scope = 'query' AND query = ?",
      ).run('FAILED', 'forged status error', 1, target.sourceId, target.alias).changes,
      1,
    )
    assert.equal(
      db.prepare(
        "UPDATE source_statuses SET state = ?, total_count = 0, page_count = 0, http_status = 200 WHERE source_id = ? AND scope = 'channel'",
      ).run('SUCCESS_ZERO', 'chictr.org.cn').changes,
      1,
    )
  } finally {
    db.close()
  }

  // 攻击者同步更新 SQLite 的清单哈希：文件哈希检查因此通过，行级对照仍须发现。
  const bytes = await readFile(join(out, 'trials.sqlite'))
  manifest.files['trials.sqlite'].sha256 = createHash('sha256').update(bytes).digest('hex')
  manifest.files['trials.sqlite'].bytes = bytes.length
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)

  const expectedErrors = [
    `trials.sqlite queries row ${target.queryId}: alias "Ghost alias" != manifest "Behçet"`,
    `trials.sqlite queries row ${target.queryId}: state "FAILED" != manifest "SUCCESS"`,
    `trials.sqlite queries row ${target.queryId}: error "forged query error" != manifest null`,
    `trials.sqlite queries row ${target.queryId}: error_count 1 != manifest 0`,
    `trials.sqlite source_statuses row ${target.sourceId}/query/${target.alias}: state "FAILED" != manifest "SUCCESS"`,
    `trials.sqlite source_statuses row ${target.sourceId}/query/${target.alias}: total_count null != manifest 1`,
    `trials.sqlite source_statuses row ${target.sourceId}/query/${target.alias}: error "forged status error" != manifest null`,
    `trials.sqlite source_statuses row ${target.sourceId}/query/${target.alias}: error_count 1 != manifest 0`,
    'trials.sqlite source_statuses row chictr.org.cn/channel/: state "SUCCESS_ZERO" != manifest "NOT_QUERIED"',
    'trials.sqlite source_statuses row chictr.org.cn/channel/: total_count 0 != manifest null',
    'trials.sqlite source_statuses row chictr.org.cn/channel/: page_count 0 != manifest null',
    'trials.sqlite source_statuses row chictr.org.cn/channel/: http_status 200 != manifest null',
  ]
  for (const expected of expectedErrors) {
    assert.ok(verified.errors.includes(expected), `missing error: ${expected}`)
  }

  // 只看文件哈希与计数的结构检查器仍会 PASS；这正是需要逐行对照的原因。
  const output = execFileSync(process.execPath, [checker, dir], { encoding: 'utf8' })
  assert.match(output, /PASS snapshot consistency/)
})

test('同一查询内重复 NCT：INCOMPLETE，不把重复条数当成多条登记', async (t) => {
  const duplicate = sampleStudy('NCT00000080')
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([duplicate, duplicate], { totalCount: 2 }) } },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.ok(
    result.manifest.queries[0].errors.some((entry) => entry.code === 'duplicate_nct_id'),
  )
  assert.equal(result.manifest.queries[0].preDedupCount, 2)
  assert.equal(result.manifest.queries[0].uniqueRecordCount, 1)
})

test('重复 NCT 的日期不参与窗口复算，诚实 INCOMPLETE 快照仍可通过核验', async (t) => {
  // 采集端遇到重复 NCT 会先记错并跳过日期归类；复算必须同语义，否则重复行的
  // 越界日期会被额外计入，把诚实快照误判为原始证据不一致。
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page(
          [
            sampleStudy('NCT00000081', { firstPostDate: '2026-06-01' }),
            sampleStudy('NCT00000081', { firstPostDate: '2026-01-01' }),
          ],
          { totalCount: 2 },
        ),
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.equal(result.manifest.queries[0].outOfWindowCount, 0)
  assert.ok(
    result.manifest.queries[0].errors.some((entry) => entry.code === 'duplicate_nct_id'),
  )

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, true)
  assert.deepEqual(verified.errors, [])
})

test('超过 maxPages 仍有下一页：停页记 INCOMPLETE，不无限翻页', async (t) => {
  const { result, fetchImpl } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000090')], { totalCount: 2, nextPageToken: 'p2' }),
        p2: page([sampleStudy('NCT00000091')], { totalCount: 2 }),
      },
    },
    options: { maxPages: 1 },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.equal(result.manifest.queries[0].pageCount, 1)
  assert.ok(
    result.manifest.queries[0].errors.some((entry) => entry.code === 'page_limit_exceeded'),
  )
  assert.equal(fetchImpl.calls.length, 3) // before version + 只抓第一页 + after version
})

test('后续页缺 totalCount、尾页为空都属正常分页，不误报计数变化', async (t) => {
  const aliases = BEHCET_ALIASES
  const { result } = await runCase(t, {
    aliases,
    routes: fullAliasRoutes({
      Behçet: {
        '': page([sampleStudy('NCT00000100')], { totalCount: 1, nextPageToken: 'p2' }),
        // CTG 后续页可以不带 totalCount；缺失不是“计数变成 0”。
        p2: { body: { studies: [] } },
      },
      Behcet: {
        '': page([sampleStudy('NCT00000101'), sampleStudy('NCT00000102')], {
          totalCount: 2,
          nextPageToken: 'p2',
        }),
        // 服务端也可能追加一个不再带令牌的尾空页。
        p2: { body: { studies: [] } },
      },
    }),
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.manifest.status, 'COMPLETE')
  for (const query of result.manifest.queries.filter(
    (entry) => entry.alias === 'Behçet' || entry.alias === 'Behcet',
  )) {
    assert.equal(query.state, 'SUCCESS')
    assert.equal(query.pageCount, 2)
    assert.equal(query.pages[1].totalCount, null)
    assert.ok(!query.errors.some((entry) => entry.code === 'count_changed'))
  }
  const first = result.manifest.queries.find((query) => query.alias === 'Behçet')
  assert.equal(first.preDedupCount, 1)
  assert.equal(first.uniqueRecordCount, 1)
  const second = result.manifest.queries.find((query) => query.alias === 'Behcet')
  assert.equal(second.preDedupCount, 2)
  assert.equal(second.uniqueRecordCount, 2)
})

test('逐条复核 studyFirstPostDate：窗口外/缺失/非法日期都不并入快照', async (t) => {
  const aliases = ['Behçet', 'Behcet', 'Adamantiades-Behçet']
  const { out, result } = await runCase(t, {
    aliases,
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000110', { firstPostDate: '2026-01-01' })]),
      },
      Behcet: {
        '': page([sampleStudy('NCT00000111', { omitStatus: true })]),
      },
      'Adamantiades-Behçet': {
        '': page([sampleStudy('NCT00000112', { firstPostDate: '2026-02-30' })]),
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'INCOMPLETE') // 无成功查询、无致命错误
  assert.equal(result.manifest.sources[0].state, 'INCOMPLETE')
  assert.equal(result.manifest.counts.jsonlRecords, 0)
  assert.equal((await jsonlOf(out)).length, 0)

  const byAlias = Object.fromEntries(result.manifest.queries.map((query) => [query.alias, query]))
  assert.equal(byAlias.Behçet.outOfWindowCount, 1)
  assert.equal(byAlias.Behcet.missingPostDateCount, 1)
  assert.equal(byAlias['Adamantiades-Behçet'].invalidPostDateCount, 1)
  for (const query of result.manifest.queries) {
    assert.equal(query.state, 'INCOMPLETE')
    assert.equal(query.pageCount, 1)
  }
  assert.ok(byAlias.Behçet.errors.some((entry) => entry.code === 'study_out_of_window'))
  assert.ok(byAlias.Behcet.errors.some((entry) => entry.code === 'missing_study_first_post_date'))
  assert.ok(byAlias['Adamantiades-Behçet'].errors.some((entry) => entry.code === 'invalid_study_first_post_date'))
})

test('未来 endDate 当场拒绝，不建目录也不发请求', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-future-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const out = join(dir, 'snapshot')
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return json(VERSION)
  }

  assert.throws(
    () => buildWindow({ endDate: '2026-11-04', today: '2026-11-03' }),
    /future/,
  )
  await assert.rejects(
    runSnapshot({
      outDir: out,
      endDate: '2026-11-04',
      aliases: ['Behçet'],
      fetchImpl,
      now: () => new Date('2026-11-03T21:05:00Z'),
    }),
    /future/,
  )
  assert.equal(calls, 0)
  await assert.rejects(readFile(join(out, 'manifest.json')), /ENOENT/)
})

test('错误上限不能吞掉 fatal：25 条重复错误后仍保留 HTTP 500 并判 FAILED', async (t) => {
  const studies = []
  for (let index = 0; index < 30; index += 1) {
    const study = sampleStudy(`NCT${String(10000000 + index).padStart(8, '0')}`)
    studies.push(study, study) // 每条都重复一次，制造 30 条互不相同的非致命错误
  }
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page(studies, { totalCount: studies.length, nextPageToken: 'p2' }),
        p2: { body: { error: 'page two failed' }, status: 500 },
      },
    },
  })

  const query = result.manifest.queries[0]
  assert.equal(result.manifest.status, 'FAILED')
  assert.equal(result.manifest.sources[0].state, 'FAILED')
  assert.equal(query.state, 'FAILED')
  assert.equal(query.fatalError, true)
  assert.ok(query.truncatedErrors > 0)
  assert.ok(query.errors.length <= MAX_QUERY_ERRORS)
  // 第 26 条之后才出现的致命错误必须仍然在列表里。
  assert.ok(query.errors.some((entry) => entry.code === 'http_error'))
  assert.equal(query.failedHttpStatus, 500)
})

test('一个查询 FAILED、一个 INCOMPLETE 且无成功：通道聚合为 FAILED，不软化', async (t) => {
  const aliases = ['Behçet', 'Behcet']
  const { result } = await runCase(t, {
    aliases,
    routes: {
      Behçet: { '': { body: { error: 'upstream error' }, status: 500 } },
      Behcet: {
        '': page([sampleStudy('NCT00000120'), sampleStudy('NCT00000121')], { totalCount: 5 }),
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'FAILED')
  assert.equal(result.manifest.sources[0].state, 'FAILED')
  assert.deepEqual(result.manifest.queries.map((query) => query.state), ['FAILED', 'INCOMPLETE'])
})

test('显式 totalCount 变化仍记 INCOMPLETE，不被“后续页缺失正常”掩盖', async (t) => {
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([sampleStudy('NCT00000130')], { totalCount: 1, nextPageToken: 'p2' }),
        p2: page([], { totalCount: 2 }),
      },
    },
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.ok(
    result.manifest.queries[0].errors.some((entry) => entry.code === 'count_changed'),
  )
})

test('采集前后 dataTimestamp 变化：快照标 INCOMPLETE，保留两次版本原文', async (t) => {
  const after = { ...VERSION, dataTimestamp: '2026-11-03T11:00:00' }
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000140')]) } },
    versionBodyAfter: after,
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.api.dataTimestampChanged, true)
  assert.equal(result.manifest.api.collectionStable, false)
  assert.equal(result.manifest.api.version.dataTimestamp, VERSION.dataTimestamp)
  assert.equal(result.manifest.api.after.dataTimestamp, after.dataTimestamp)
  assert.equal(result.manifest.sources[0].dataTimestampChanged, true)
  assert.ok(result.manifest.errors.some((entry) => entry.code === 'version_changed'))
  // 查询本身成功，通道状态保持 PARTIAL；快照级 status 才是不完整。
  assert.equal(result.manifest.sources[0].state, 'PARTIAL')
  assert.equal(result.manifest.queries[0].state, 'SUCCESS')
})

test('采集后 /version 失败：快照 INCOMPLETE，不能沿用采集前的版本结论', async (t) => {
  const { result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000141')]) } },
    versionStatusAfter: 503,
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.api.after.state, 'FAILED')
  assert.equal(result.manifest.api.collectionStable, false)
  assert.ok(result.manifest.errors.some((entry) => entry.code === 'version_after_failed'))
  assert.equal(result.manifest.sources[0].state, 'PARTIAL')
})

test('可复用原始文件核验：篡改分页/版本文件后失败，但 checker 仍 PASS', async (t) => {
  const { dir, out, result } = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes(aliasRoutes(['Behçet', 'Behcet'], [
      page([sampleStudy('NCT00000150')], { totalCount: 1, nextPageToken: 'p2' }),
      page([], { omitTotalCount: true }),
    ])),
  })

  const clean = await verifySnapshotHashes(out)
  assert.deepEqual(clean.ok, true)
  assert.equal(clean.errors.length, 0)
  assert.equal(clean.checked.pages, 14)
  assert.equal(clean.checked.versions, 2)

  const target = result.manifest.queries[0].pages[0].storedAs
  const original = await readFile(join(out, target))
  await writeFile(join(out, target), Buffer.concat([original, Buffer.from('tampered')]))
  const tampered = await verifySnapshotHashes(out)
  assert.equal(tampered.ok, false)
  assert.ok(tampered.errors.some((message) => /SHA-256 mismatch/.test(message)))

  // 现有 checker 只读 manifest.files，不能发现 pages/ 被改；这正是需要独立核验的原因。
  const output = execFileSync(process.execPath, [checker, dir], { encoding: 'utf8' })
  assert.match(output, /PASS snapshot consistency/)

  // 复原分页文件后，再篡改采集后的版本原文；版本文件同样必须被独立核验覆盖。
  await writeFile(join(out, target), original)
  const versionPath = result.manifest.api.after.storedAs
  const versionBytes = await readFile(join(out, versionPath))
  await writeFile(join(out, versionPath), Buffer.concat([versionBytes, Buffer.from('x')]))
  const tamperedVersion = await verifySnapshotHashes(out)
  assert.equal(tamperedVersion.ok, false)
  assert.ok(tamperedVersion.errors.some((message) => /api\.after: SHA-256 mismatch/.test(message)))
})

test('原始文件核验同时发现缺页与多余文件', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000160')]) } },
  })

  const pagePath = join(out, result.manifest.queries[0].pages[0].storedAs)
  await rm(pagePath)
  await writeFile(join(out, 'pages', 'unexpected.json'), '{"studies":[]}', 'utf8')
  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.ok(verified.errors.some((message) => /cannot read .*page-0001\.json/.test(message)))
  assert.ok(verified.errors.some((message) => /unexpected raw file under pages\//.test(message)))
})

test('真实 CTG v2 嵌套形状可归一化；缺字段保持 null，不推断入组资格', async (t) => {
  const nctId = 'NCT00000170'
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([realisticStudy(nctId)]) } },
  })

  const rows = await jsonlOf(out)
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.recordId, nctId)
  assert.equal(row.title, `A study of ${nctId}`)
  assert.equal(row.studyType, 'INTERVENTIONAL')
  assert.deepEqual(row.sponsor, ['Example Sponsor', 'Partner Site'])
  assert.deepEqual(row.registryNumbers, [
    { type: 'NCT', value: nctId },
    { type: 'ORG_STUDY_ID', value: `ORG-${nctId}` },
    { type: 'OTHER', value: `SEC-${nctId}`, domain: 'example.org' },
  ])
  assert.equal(row.dates.studyFirstPostDate, '2026-06-01')
  assert.equal(row.dates.primaryCompletionDate, '2027-06-15')
  assert.match(row.statusNote, /overallStatus=ACTIVE_NOT_RECRUITING/)
  assert.doesNotMatch(row.statusNote, /eligible/i)
  assert.equal('eligibility' in row, false)
  assert.equal('hasResults' in row, false)
})

test('输出目录已有采集锁：拒绝并发写，不删除他人锁也不发请求', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-lock-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, OUTPUT_LOCK_FILE), 'other-run\n', 'utf8')
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return json(VERSION)
  }

  await assert.rejects(
    runSnapshot({
      outDir: dir,
      endDate: '2026-11-03',
      aliases: ['Behçet'],
      fetchImpl,
      now: () => new Date('2026-11-03T21:05:00Z'),
    }),
    /locked by another run/,
  )
  assert.equal(calls, 0)
  assert.equal(await readFile(join(dir, OUTPUT_LOCK_FILE), 'utf8'), 'other-run\n')
})


test('发布中断时清单始终待核验，临时文件不能冒充最终清单', async (t) => {
  for (const stage of ['pending', 'before-rename']) {
    const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-crash-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    const script = `
      import { runSnapshot, BEHCET_ALIASES } from ${JSON.stringify(new URL('../scripts/fetch-behcet-trials-2026.mjs', import.meta.url).href)};
      await runSnapshot({ outDir: ${JSON.stringify(dir)}, endDate: '2026-11-02',
        aliases: BEHCET_ALIASES, now: () => new Date('2026-11-03T21:05:00Z'),
        fetchImpl: async (url) => new Response(JSON.stringify(String(url).endsWith('/version')
          ? { apiVersion: '2', dataTimestamp: '2026-11-03T00:00:00Z' }
          : { studies: [], totalCount: 0 })),
        onPublicationStage: (stage) => { if (stage === ${JSON.stringify(stage)}) process.exit(77) }
      });`
    assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' }),
      (error) => error.status === 77)
    const manifest = await manifestOf(dir)
    assert.equal(manifest.status, 'PENDING')
    assert.equal(manifest.exitCode, 1)
    assert.equal(manifest.integrity.rawFiles, undefined)
    assert.deepEqual(manifest.files, {})
    assert.throws(() => execFileSync(process.execPath, [checker, dir], { stdio: 'pipe' }))
    const verified = await verifySnapshotHashes(dir)
    assert.equal(verified.ok, false)
    assert.ok(verified.errors.some((error) => /pending/.test(error)))
    if (stage === 'before-rename') {
      const staged = JSON.parse(await readFile(join(dir, 'manifest.json.tmp'), 'utf8'))
      assert.equal(staged.status, 'COMPLETE')
      assert.equal(staged.integrity.rawFiles.ok, true)
    }
  }
})

test('非字符串 nextPageToken 显式失败，即使计数相符也不能视为终页', async (t) => {
  for (const token of [null, 0, false, {}, []]) {
    const { out, result } = await runCase(t, {
      aliases: ['Behcet'],
      routes: { Behcet: { '': { body: { studies: [], totalCount: 0, nextPageToken: token } } } },
    })
    assert.equal(result.exitCode, 1)
    assert.equal(result.manifest.queries[0].state, 'FAILED')
    assert.ok(result.manifest.queries[0].errors.some((error) => error.code === 'response_shape' && /nextPageToken/.test(error.message)))
    assert.equal((await jsonlOf(out)).length, 0)
  }
})

test('原始证据复算：只改清单的计数、ID、令牌、totalCount 或窗口不能冒充原文', async (t) => {
  const aliases = BEHCET_ALIASES
  const pages = [
    page([sampleStudy('NCT00000201'), sampleStudy('NCT00000202')], {
      totalCount: 3,
      nextPageToken: 'page-2-token',
    }),
    page([sampleStudy('NCT00000203')], { totalCount: 3 }),
  ]
  const { out } = await runCase(t, {
    aliases,
    routes: fullAliasRoutes(aliasRoutes(['Behçet'], pages)),
  })

  const clean = await verifySnapshotHashes(out)
  assert.equal(clean.ok, true)
  assert.equal(clean.filesConsistent, true)
  assert.equal(clean.evidenceConsistent, true)
  assert.equal(clean.status.claimed, 'COMPLETE')
  assert.equal(clean.status.verified, true)
  assert.equal(clean.checked.rawStudyRecords, 3)
  assert.equal(clean.checked.jsonlRecords, 3)

  const manifest = await manifestOf(out)
  manifest.queries[0].preDedupCount = 2
  manifest.queries[0].recordIds = ['NCT00000201', 'NCT00000202', 'NCT00000299']
  manifest.queries[0].outOfWindowCount = 1
  manifest.queries[0].pages[0].nextPageToken = 'forged-token'
  manifest.queries[0].pages[0].totalCount = 99
  manifest.queries[0].windowStart = '2026-01-01'
  await writeManifest(out, manifest)

  const tampered = await verifySnapshotHashes(out)
  assert.equal(tampered.ok, false)
  assert.equal(tampered.filesConsistent, true) // 原文文件与清单哈希都未改
  assert.equal(tampered.evidenceConsistent, false)
  assert.equal(tampered.status.claimed, 'COMPLETE')
  assert.equal(tampered.status.verified, false)
  assert.ok(tampered.errors.some((message) => /raw study count 3 != preDedupCount 2/.test(message)))
  assert.ok(tampered.errors.some((message) => /raw unique NCT IDs do not match recordIds/.test(message)))
  assert.ok(tampered.errors.some((message) => /raw nextPageToken "page-2-token" != manifest "forged-token"/.test(message)))
  assert.ok(tampered.errors.some((message) => /raw totalCount 3 != manifest 99/.test(message)))
  assert.ok(tampered.errors.some((message) => /raw out-of-window studies 0 != manifest 1/.test(message)))
  assert.ok(tampered.errors.some((message) => /query window does not match manifest\.window/.test(message)))
})

test('原始页正文与版本被改写并同步哈希后，复算仍按正文发现，而非信任清单', async (t) => {
  const aliases = BEHCET_ALIASES
  const pages = [
    page([sampleStudy('NCT00000201'), sampleStudy('NCT00000202')], {
      totalCount: 3,
      nextPageToken: 'page-2-token',
    }),
    page([sampleStudy('NCT00000203')], { totalCount: 3 }),
  ]
  const { out } = await runCase(t, {
    aliases,
    routes: fullAliasRoutes(aliasRoutes(['Behçet'], pages)),
  })

  const clean = await verifySnapshotHashes(out)
  assert.equal(clean.ok, true)

  const manifest = await manifestOf(out)
  const pageRecord = manifest.queries[0].pages[0]
  const pagePath = join(out, pageRecord.storedAs)
  const body = JSON.parse(await readFile(pagePath, 'utf8'))
  // 同时改正文条数、总数、令牌、NCT 和日期；清单仅同步哈希，不同步任何字段。
  body.studies.pop()
  body.totalCount = 99
  body.nextPageToken = 'forged-raw-token'
  body.studies[0].protocolSection.identificationModule.nctId = 'NCT00000998'
  body.studies[0].protocolSection.statusModule.studyFirstPostDateStruct.date = '2025-01-01'
  const pageBytes = Buffer.from(JSON.stringify(body), 'utf8')
  await writeFile(pagePath, pageBytes)
  pageRecord.sha256 = createHash('sha256').update(pageBytes).digest('hex')
  pageRecord.bytes = pageBytes.length

  const versionRecord = manifest.api.after
  const versionPath = join(out, versionRecord.storedAs)
  const versionBody = JSON.parse(await readFile(versionPath, 'utf8'))
  versionBody.apiVersion = '2.0.6'
  const versionBytes = Buffer.from(JSON.stringify(versionBody), 'utf8')
  await writeFile(versionPath, versionBytes)
  versionRecord.sha256 = createHash('sha256').update(versionBytes).digest('hex')
  versionRecord.bytes = versionBytes.length
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  // 文件与清单哈希一致，失败只能来自正文复算。
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.equal(verified.status.claimed, 'COMPLETE')
  assert.equal(verified.status.verified, false)
  assert.ok(verified.errors.some((message) => /raw studies 1 != manifest studyCount 2/.test(message)))
  assert.ok(verified.errors.some((message) => /raw totalCount 99 != manifest 3/.test(message)))
  assert.ok(
    verified.errors.some(
      (message) => /raw nextPageToken "forged-raw-token" != manifest "page-2-token"/.test(message),
    ),
  )
  assert.ok(verified.errors.some((message) => /raw unique NCT IDs do not match recordIds/.test(message)))
  assert.ok(verified.errors.some((message) => /raw out-of-window studies 1 != manifest 0/.test(message)))
  assert.ok(
    verified.errors.some((message) => /api\.after: manifest apiVersion "2\.0\.5" != raw "2\.0\.6"/.test(message)),
  )
  assert.ok(verified.errors.some((message) => /api\.apiVersionChanged false != raw comparison true/.test(message)))
  assert.equal(verified.status.justified, false)
})

test('日期窗口由原始页复算：如实 INCOMPLETE 可通过，篡改计数或伪造 COMPLETE 失败', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': page([
          sampleStudy('NCT00000211'),
          sampleStudy('NCT00000212', { firstPostDate: '2026-01-01' }),
        ], { totalCount: 2 }),
      },
    },
  })
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.queries[0].state, 'INCOMPLETE')
  assert.equal(result.manifest.queries[0].outOfWindowCount, 1)

  const honest = await verifySnapshotHashes(out)
  assert.equal(honest.ok, true)
  assert.equal(honest.filesConsistent, true)
  assert.equal(honest.evidenceConsistent, true)
  assert.equal(honest.status.claimed, 'INCOMPLETE')
  assert.equal(honest.status.verified, false)
  assert.deepEqual(honest.errors, [])

  const manifestText = await readFile(join(out, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestText)
  manifest.queries[0].outOfWindowCount = 0
  await writeManifest(out, manifest)
  const masked = await verifySnapshotHashes(out)
  assert.equal(masked.ok, false)
  assert.equal(masked.filesConsistent, true)
  assert.equal(masked.evidenceConsistent, false)
  assert.ok(masked.errors.some((message) => /raw out-of-window studies 1 != manifest 0/.test(message)))

  // 复原诚实清单，只把状态改成 COMPLETE；文件与原始证据仍一致，但状态声明不被支持。
  await writeFile(join(out, 'manifest.json'), manifestText, 'utf8')
  const forged = JSON.parse(manifestText)
  forged.status = 'COMPLETE'
  await writeManifest(out, forged)
  const forgedResult = await verifySnapshotHashes(out)
  // ok 只表示内部一致；伪造的 COMPLETE 在文件/证据自洽时 ok=true，但 complete=false。
  assert.equal(forgedResult.ok, true)
  assert.equal(forgedResult.complete, false)
  assert.equal(forgedResult.filesConsistent, true)
  assert.equal(forgedResult.evidenceConsistent, true)
  assert.equal(forgedResult.status.claimed, 'COMPLETE')
  assert.equal(forgedResult.status.verified, false)
  assert.equal(forgedResult.status.justified, false)
  assert.ok(forgedResult.errors.some((message) => /does not support COMPLETE/.test(message)))
})

test('HTTP 500 失败快照保留原始响应时仍可核验，不要求伪装成功', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: {
        '': { body: { studies: [sampleStudy('NCT00000221')], totalCount: 1 }, status: 500 },
      },
    },
  })

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, true)
  assert.equal(verified.status.claimed, 'FAILED')
  assert.equal(verified.status.verified, false)
  assert.deepEqual(verified.errors, [])
  assert.equal(verified.checked.pages, 1)
  assert.equal(verified.checked.rawStudyRecords, 0)
  assert.equal(verified.checked.jsonlRecords, 0)
})

test('版本原文变化后篡改清单的变更标志会被独立复算拒绝', async (t) => {
  const after = { ...VERSION, dataTimestamp: '2026-11-03T11:00:00' }
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000231')]) } },
    versionBodyAfter: after,
  })

  const clean = await verifySnapshotHashes(out)
  assert.equal(clean.ok, true)
  assert.equal(clean.status.claimed, 'INCOMPLETE')
  assert.equal(clean.status.verified, false)

  const manifest = await manifestOf(out)
  assert.equal(manifest.api.dataTimestampChanged, true)
  assert.equal(manifest.api.collectionStable, false)
  manifest.api.dataTimestampChanged = false
  manifest.api.collectionStable = true
  manifest.sources[0].dataTimestampChanged = false
  await writeManifest(out, manifest)

  const tampered = await verifySnapshotHashes(out)
  assert.equal(tampered.ok, false)
  assert.equal(tampered.filesConsistent, true)
  assert.equal(tampered.evidenceConsistent, false)
  assert.ok(tampered.errors.some((message) => /api\.dataTimestampChanged false != raw comparison true/.test(message)))
  assert.ok(tampered.errors.some((message) => /clinicaltrials\.gov source dataTimestampChanged/.test(message)))
})

test('不同查询不得把原始页复用为同一文件', async (t) => {
  const aliases = ['Behçet', 'Behcet']
  const { out } = await runCase(t, {
    aliases,
    routes: aliasRoutes(aliases, [page([sampleStudy('NCT00000241')])]),
  })

  const manifest = await manifestOf(out)
  const firstStoredAs = manifest.queries[0].pages[0].storedAs
  manifest.queries[1].pages[0].storedAs = firstStoredAs
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, false)
  assert.ok(verified.errors.some((message) => /raw page .* is reused by .* page 1/.test(message)))
  assert.ok(verified.errors.some((message) => /does not match this query\/page/.test(message)))
  assert.ok(verified.errors.some((message) => /unexpected raw file under pages\//.test(message)))
})

test('同步修改 JSONL 和清单哈希后，原始查询并集仍能发现缺记录', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: {
      Behçet: { '': page([sampleStudy('NCT00000251'), sampleStudy('NCT00000252')]) },
    },
  })

  const jsonlPath = join(out, 'trials.jsonl')
  const original = await readFile(jsonlPath, 'utf8')
  const lines = original.split(/\r?\n/).filter((line) => line.trim())
  assert.equal(lines.length, 2)
  const shortened = `${lines.slice(1).join('\n')}\n`
  await writeFile(jsonlPath, shortened, 'utf8')

  const bytes = await readFile(jsonlPath)
  const manifest = await manifestOf(out)
  manifest.recordCount = 1
  manifest.counts.jsonlRecords = 1
  manifest.files['trials.jsonl'].sha256 = createHash('sha256').update(bytes).digest('hex')
  manifest.files['trials.jsonl'].bytes = bytes.length
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true) // JSONL 的清单哈希已经同步，不是哈希失败
  assert.equal(verified.evidenceConsistent, false)
  assert.equal(verified.checked.jsonlRecords, 1)
  assert.ok(verified.errors.some((message) => /successful query raw NCT union .* != JSONL recordIds/.test(message)))
})

test('manifest.files 只接受固定文件名：额外 JSONL 不能冒充快照证据', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes({
      Behcet: { '': page([sampleStudy('NCT00000110')]) },
    }),
  })
  assert.equal(result.manifest.status, 'COMPLETE')

  const decoy = join(out, 'decoy.jsonl')
  const decoyBytes = await readFile(join(out, 'trials.jsonl'))
  await writeFile(decoy, decoyBytes)
  const manifest = await manifestOf(out)
  manifest.files['decoy.jsonl'] = {
    sha256: createHash('sha256').update(decoyBytes).digest('hex'),
    bytes: decoyBytes.length,
  }
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, false)
  assert.ok(
    verified.errors.some((message) => /unexpected file "decoy\.jsonl"/.test(message)),
  )
})

test('同步篡改 JSONL 与 SQLite 并更新哈希：原始正文重放仍能发现内容不符', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behcet'],
    routes: {
      Behcet: { '': page([sampleStudy('NCT00000120'), sampleStudy('NCT00000121')]) },
    },
  })
  const rows = await jsonlOf(out)
  const target = rows[0].recordId
  rows[0].title = `Tampered title for ${target}`
  await writeFile(
    join(out, 'trials.jsonl'),
    `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  )

  const db = new DatabaseSync(join(out, 'trials.sqlite'))
  try {
    db.prepare('UPDATE trials SET title = ? WHERE record_id = ?').run(
      `Tampered title for ${target}`,
      target,
    )
  } finally {
    db.close()
  }

  // 攻击者同时更新两个文件的清单哈希与字节数，哈希检查因此全部通过。
  const manifest = await manifestOf(out)
  for (const name of ['trials.jsonl', 'trials.sqlite']) {
    const bytes = await readFile(join(out, name))
    manifest.files[name].sha256 = createHash('sha256').update(bytes).digest('hex')
    manifest.files[name].bytes = bytes.length
  }
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.ok(
    verified.errors.some((message) =>
      new RegExp(`trials\\.jsonl record ${target} field title does not match the raw-derived value`).test(message),
    ),
  )
  assert.ok(
    verified.errors.some((message) =>
      new RegExp(`trials\\.sqlite record ${target} field title does not match the raw-derived value`).test(message),
    ),
  )
})

test('非法 NCT 形状：查询 INCOMPLETE、记录不并入，诚实快照仍可通过核验', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behcet'],
    routes: {
      Behcet: { '': page([sampleStudy('NCT123')]) },
    },
  })

  const query = result.manifest.queries[0]
  assert.equal(result.exitCode, 1)
  assert.equal(query.state, 'INCOMPLETE')
  assert.equal(query.totalCount, 1)
  assert.equal(query.preDedupCount, 1)
  assert.equal(query.uniqueRecordCount, 0)
  assert.equal(query.invalidNctIdCount, 1)
  assert.deepEqual(query.recordIds, [])
  assert.ok(query.errors.some((entry) => entry.code === 'invalid_nct_id'))
  assert.equal((await jsonlOf(out)).length, 0)
  assert.equal(result.manifest.recordCount, 0)
  assert.equal(result.manifest.dbCount, 0)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.evidenceConsistent, true)
  assert.deepEqual(verified.errors, [])
})

test('窗口末 UTC 日边界：dataTimestamp 必须 >= 次日零点才算覆盖', () => {
  const window = buildWindow({ endDate: '2026-11-02' })
  const covered = evaluateWindowCoverage({
    window,
    dataTimestamp: '2026-11-03T00:00:00',
    dataTimestampAfter: '2026-11-03T00:00:00',
  })
  assert.equal(covered.covered, true)
  assert.equal(covered.requiredThroughExclusive, '2026-11-03T00:00:00.000Z')

  const beforeEarly = evaluateWindowCoverage({
    window,
    dataTimestamp: '2026-11-02T23:59:59',
    dataTimestampAfter: '2026-11-03T00:00:00',
  })
  assert.equal(beforeEarly.covered, false)

  const afterEarly = evaluateWindowCoverage({
    window,
    dataTimestamp: '2026-11-03T00:00:00',
    dataTimestampAfter: '2026-11-02T23:59:59',
  })
  assert.equal(afterEarly.covered, false)

  const invalid = evaluateWindowCoverage({
    window,
    dataTimestamp: 'not-a-timestamp',
    dataTimestampAfter: '2026-11-03T00:00:00',
  })
  assert.equal(invalid.covered, false)
  assert.equal(invalid.dataTimestampValid, false)
})

test('dataTimestamp 未覆盖窗口末 UTC 日：快照不得 COMPLETE，伪造状态仍不通过', async (t) => {
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000701')]) } },
    options: { endDate: '2026-11-03' },
  })
  const manifest = result.manifest
  assert.equal(manifest.status, 'INCOMPLETE')
  assert.equal(manifest.exitCode, 1)
  assert.equal(manifest.windowCoverage.covered, false)
  assert.equal(manifest.windowCoverage.requiredThroughExclusive, '2026-11-04T00:00:00.000Z')
  assert.ok(manifest.errors.some((entry) => entry.code === 'data_window_uncovered'))
  // 查询本身是闭合的；不完整只来自上游数据时间没有走到窗口末日结束。
  assert.equal(manifest.queries[0].state, 'SUCCESS')

  const honest = await verifySnapshotHashes(out)
  assert.equal(honest.ok, true)
  assert.equal(honest.complete, false)
  assert.equal(honest.filesConsistent, true)
  assert.equal(honest.evidenceConsistent, true)
  assert.equal(honest.status.verified, false)

  const forged = await manifestOf(out)
  forged.status = 'COMPLETE'
  forged.exitCode = 0
  forged.errors = []
  forged.counts.errors = 0
  await writeManifest(out, forged)
  const forgedResult = await verifySnapshotHashes(out)
  assert.equal(forgedResult.ok, true)
  assert.equal(forgedResult.complete, false)
  assert.equal(forgedResult.status.verified, false)
  assert.ok(forgedResult.errors.some((message) => /does not cover the end of window 2026-11-03 in UTC/.test(message)))
})

test('before/after 版本证据路径不可复用：同一文件自证不算稳定', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000702')]) } },
  })
  const manifest = await manifestOf(out)
  manifest.api.after.storedAs = manifest.api.version.storedAs
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, false)
  assert.ok(verified.errors.some((message) => /raw version file .* is reused by api\.version/.test(message)))
  assert.ok(verified.errors.some((message) => /storedAs .* does not match expected .*version-after\.json/.test(message)))
})

test('别名清单必须覆盖 queries：少一个别名不能靠删除查询冒充完整', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet', 'Behcet'],
    routes: aliasRoutes(['Behçet', 'Behcet'], [page([sampleStudy('NCT00000703')])]),
  })
  const manifest = await manifestOf(out)
  manifest.aliases = ['Behçet']
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.ok(verified.errors.some((message) => /manifest\.aliases lists 1 aliases but queries has 2/.test(message)))
})

test('官方来源台账绑定：改 source url 或把未查通道写成已查都不能通过', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000704')]) } },
  })
  const manifest = await manifestOf(out)
  const ctg = manifest.sources.find((source) => source.sourceId === 'clinicaltrials.gov')
  ctg.url = 'https://example.invalid/clinicaltrials.gov'
  const who = manifest.sources.find((source) => source.sourceId === 'trialsearch.who.int')
  who.queried = true
  who.state = 'SUCCESS_ZERO'
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.ok(verified.errors.some((message) => /clinicaltrials\.gov: source url .* is not the official source URL/.test(message)))
  assert.ok(verified.errors.some((message) => /trialsearch\.who\.int: queried true != channel capability false/.test(message)))
})

test('请求 URL 与窗口/别名/pageSize 绑定：清单窗口正确但 URL 嵌别的窗口会被发现', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000705')]) } },
  })
  const manifest = await manifestOf(out)
  const query = manifest.queries[0]
  const wrongWindow = {
    start: manifest.window.start,
    end: '2026-10-31',
    rule: `AREA[StudyFirstPostDate]RANGE[${manifest.window.start},2026-10-31]`,
  }
  query.queryUrl = buildStudiesUrl({
    apiBase: manifest.api.baseUrl,
    alias: query.alias,
    window: wrongWindow,
    pageSize: query.pageSize,
    pageToken: null,
  })
  query.pages[0].url = buildStudiesUrl({
    apiBase: manifest.api.baseUrl,
    alias: query.alias,
    window: wrongWindow,
    pageSize: query.pageSize,
    pageToken: query.pages[0].pageToken,
  })
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.ok(verified.errors.some((message) => /queryUrl .* is not bound to alias\/window\/pageSize/.test(message)))
  assert.ok(verified.errors.some((message) => /request URL .* is not bound to alias\/window\/pageSize\/pageToken/.test(message)))
})

test('汇总计数必须由原始页重算：dbCount、分页数、来源 totalCount、覆盖列表都不能改', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000706')]) } },
  })
  const manifest = await manifestOf(out)
  manifest.counts.queryPages += 1
  manifest.dbCount += 1
  manifest.sources.find((source) => source.sourceId === 'clinicaltrials.gov').totalCount += 1
  manifest.coverage.queriedSources = ['clinicaltrials.gov', 'who.int']
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.ok(verified.errors.some((message) => /manifest\.counts\.queryPages .* != raw-derived/.test(message)))
  assert.ok(verified.errors.some((message) => /manifest\.dbCount .* != raw-derived/.test(message)))
  assert.ok(verified.errors.some((message) => /clinicaltrials\.gov source totalCount .* != raw-derived/.test(message)))
  assert.ok(verified.errors.some((message) => /manifest\.coverage\.queriedSources is not exactly/.test(message)))
})

test('windowCoverage 清单字段不能照抄：改 covered 会被原始 dataTimestamp 复算发现', async (t) => {
  const { out } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000707')]) } },
  })
  const manifest = await manifestOf(out)
  manifest.windowCoverage.covered = false
  await writeManifest(out, manifest)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, false)
  assert.equal(verified.filesConsistent, true)
  assert.equal(verified.evidenceConsistent, false)
  assert.ok(verified.errors.some((message) => /manifest\.windowCoverage\.covered false != raw true/.test(message)))
})

test('非官方 API base 可采集但不能标 COMPLETE', async (t) => {
  const custom = 'https://mirror.example.test/api/v2.0'
  const { out, result } = await runCase(t, {
    aliases: ['Behçet'],
    routes: { Behçet: { '': page([sampleStudy('NCT00000708')]) } },
    options: { apiBase: custom },
  })
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.api.customApiBase, true)
  assert.equal(result.manifest.api.baseUrl, custom)
  assert.ok(result.manifest.errors.some((entry) => entry.code === 'non_official_api_base'))

  const honest = await verifySnapshotHashes(out)
  assert.equal(honest.ok, true)
  assert.equal(honest.complete, false)
  assert.equal(honest.status.verified, false)
  assert.deepEqual(honest.errors, [])

  const forged = await manifestOf(out)
  forged.status = 'COMPLETE'
  forged.exitCode = 0
  forged.errors = []
  forged.counts.errors = 0
  await writeManifest(out, forged)
  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.complete, false)
  assert.ok(verified.errors.some((message) => /API base is not the official ClinicalTrials\.gov base/.test(message)))
})

test('锁释放只删除本次运行的锁，被覆盖或被重建的锁保留给后来者', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-lock-own-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const lockPath = join(dir, OUTPUT_LOCK_FILE)

  const release = await prepareOutDir(dir)
  assert.match(await readFile(lockPath, 'utf8'), /^\d+:[a-f0-9]{24}:\d{4}-\d{2}-\d{2}T/)
  assert.equal(await release(), true)
  await assert.rejects(readFile(lockPath, 'utf8'), { code: 'ENOENT' })

  const overwritten = await mkdtemp(join(tmpdir(), 'trial-fetch-lock-own-'))
  t.after(() => rm(overwritten, { recursive: true, force: true }))
  const overwrittenLock = join(overwritten, OUTPUT_LOCK_FILE)
  const releaseOverwritten = await prepareOutDir(overwritten)
  await writeFile(overwrittenLock, 'other-run\n', 'utf8')
  assert.equal(await releaseOverwritten(), false)
  assert.equal(await readFile(overwrittenLock, 'utf8'), 'other-run\n')

  const recreated = await mkdtemp(join(tmpdir(), 'trial-fetch-lock-own-'))
  t.after(() => rm(recreated, { recursive: true, force: true }))
  const recreatedLock = join(recreated, OUTPUT_LOCK_FILE)
  const releaseRecreated = await prepareOutDir(recreated)
  await rm(recreatedLock)
  await writeFile(recreatedLock, 'later-run\n', 'utf8')
  assert.equal(await releaseRecreated(), false)
  assert.equal(await readFile(recreatedLock, 'utf8'), 'later-run\n')
})

test('别名子集即使查询全成功也不能认证 COMPLETE；伪造 COMPLETE 仍缺覆盖', async (t) => {
  const aliases = ['Behçet']
  const { out, result } = await runCase(t, {
    aliases,
    routes: fullAliasRoutes(),
  })

  assert.equal(result.exitCode, 1)
  assert.equal(result.manifest.status, 'INCOMPLETE')
  assert.equal(result.manifest.aliasCoverage.complete, false)
  assert.deepEqual(result.manifest.aliasCoverage.missing, BEHCET_ALIASES.slice(1))
  assert.ok(
    result.manifest.errors.some((entry) => entry.code === 'alias_coverage_incomplete'),
  )

  const honest = await verifySnapshotHashes(out)
  assert.equal(honest.ok, true)
  assert.equal(honest.complete, false)
  assert.equal(honest.status.claimed, 'INCOMPLETE')
  assert.equal(honest.status.verified, false)

  // 子集快照能通过文件/证据核验，但没有资格声称 COMPLETE；把状态改成
  // COMPLETE 不能让核验器补出缺失别名，也不能让 complete 变真。
  const forged = await manifestOf(out)
  forged.status = 'COMPLETE'
  forged.exitCode = 0
  forged.errors = []
  forged.counts.errors = 0
  await writeManifest(out, forged)

  const verified = await verifySnapshotHashes(out)
  assert.equal(verified.ok, true)
  assert.equal(verified.complete, false)
  assert.equal(verified.status.claimed, 'COMPLETE')
  assert.equal(verified.status.verified, false)
  assert.ok(verified.errors.some((message) => /aliases cover 1\/12/.test(message)))
})

test('清单缺失时 early return 与正常返回同形：complete=false、checked 全零', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-empty-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const verified = await verifySnapshotHashes(dir)
  assert.deepEqual(Object.keys(verified).sort(), [
    'checked',
    'complete',
    'errors',
    'evidenceConsistent',
    'filesConsistent',
    'ok',
    'status',
  ])
  assert.equal(verified.ok, false)
  assert.equal(verified.complete, false)
  assert.equal(verified.filesConsistent, false)
  assert.equal(verified.evidenceConsistent, false)
  assert.deepEqual(verified.checked, {
    files: 0,
    versions: 0,
    pages: 0,
    queries: 0,
    rawStudyRecords: 0,
    jsonlRecords: 0,
  })
  assert.ok(verified.errors.some((message) => /cannot read manifest\.json/.test(message)))
})

test('startedAt/generatedAt 必须是规范 ISO：无效或倒序不能放行 retrieved_at 边界', async (t) => {
  const { out } = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes(),
  })
  const original = await readFile(join(out, 'manifest.json'), 'utf8')

  const cases = [
    {
      name: 'startedAt 非日期',
      mutate: (manifest) => {
        manifest.startedAt = 'not-a-time'
      },
      pattern: /manifest\.startedAt .* is not a canonical ISO timestamp/,
    },
    {
      name: 'generatedAt 只带时区偏移',
      mutate: (manifest) => {
        manifest.generatedAt = '2026-11-03T21:05:00+00:00'
      },
      pattern: /manifest\.generatedAt .* is not a canonical ISO timestamp/,
    },
    {
      name: 'startedAt 晚于 generatedAt',
      mutate: (manifest) => {
        manifest.startedAt = '2026-11-03T22:00:00.000Z'
      },
      pattern: /manifest\.startedAt is after manifest\.generatedAt/,
    },
  ]

  for (const entry of cases) {
    const manifest = JSON.parse(original)
    entry.mutate(manifest)
    await writeManifest(out, manifest)

    const verified = await verifySnapshotHashes(out)
    assert.equal(verified.ok, false, entry.name)
    assert.equal(verified.evidenceConsistent, false, entry.name)
    assert.ok(
      verified.errors.some((message) => entry.pattern.test(message)),
      `${entry.name}: ${verified.errors.join('\n')}`,
    )
  }
})

test('window.months 必须与 start/end 关联：数字合法但窗口对不上不能放行', async (t) => {
  const { out } = await runCase(t, {
    aliases: BEHCET_ALIASES,
    routes: fullAliasRoutes(),
  })
  const original = await readFile(join(out, 'manifest.json'), 'utf8')

  const mismatched = JSON.parse(original)
  mismatched.window.months = 8 // start 仍是按 9 个月算出的，不能被当成 8 个月窗口
  await writeManifest(out, mismatched)
  const association = await verifySnapshotHashes(out)
  assert.equal(association.ok, false)
  assert.equal(association.evidenceConsistent, false)
  assert.ok(
    association.errors.some((message) => /does not match end - months/.test(message)),
  )

  for (const months of [0, 13, '9', 9.5]) {
    const manifest = JSON.parse(original)
    manifest.window.months = months
    await writeManifest(out, manifest)
    const verified = await verifySnapshotHashes(out)
    assert.equal(verified.ok, false)
    assert.equal(verified.evidenceConsistent, false)
    assert.ok(
      verified.errors.some((message) => /is not an integer 1\.\.12/.test(message)),
      `${JSON.stringify(months)}: ${verified.errors.join('\n')}`,
    )
  }
})

test('新建快照逐级目录 0700、所有文件 0600，不受 umask 022/077/777 影响', async (t) => {
  for (const mask of [0o022, 0o077, 0o777]) {
    const base = await mkdtemp(join(tmpdir(), 'trial-fetch-mode-'))
    t.after(() => rm(base, { recursive: true, force: true }))
    const callerDir = join(base, 'caller-dir')
    await mkdir(callerDir)
    await chmod(callerDir, 0o750)
    const out = join(callerDir, 'new-parent', 'snapshot')
    const routes = fullAliasRoutes({
      ['Behçet']: aliasRoutes(['Behçet'], [page([sampleStudy('NCT00000001')], { totalCount: 1 })]),
    })

    const result = await withUmask(mask, () => runSnapshot({
      outDir: out,
      endDate: '2026-11-02',
      aliases: ['Behçet'],
      fetchImpl: makeFetch({ routes }),
      now: () => new Date('2026-11-03T21:05:00Z'),
    }))

    // 别名子集不满足 COMPLETE，但落盘权限与检索结论无关。
    assert.equal(result.exitCode, 1)
    assert.equal(await modeOf(out), 0o700, `umask ${mask.toString(8)}: snapshot root`)
    assert.equal(await modeOf(join(callerDir, 'new-parent')), 0o700, 'new intermediate directory')
    assert.equal(await modeOf(callerDir), 0o750, 'existing caller directory must keep its mode')
    await assertPrivateTree(out)
  }
})

test('加锁创建的新目录与锁文件 0700/0600；已有锁保持原 mode 和内容', async (t) => {
  for (const mask of [0o022, 0o777]) {
    const base = await mkdtemp(join(tmpdir(), 'trial-fetch-mode-lock-'))
    t.after(() => rm(base, { recursive: true, force: true }))
    await chmod(base, 0o750)
    const out = join(base, 'snapshot')
    const release = await withUmask(mask, () => prepareOutDir(out))
    assert.equal(await modeOf(out), 0o700)
    assert.equal(await modeOf(join(out, OUTPUT_LOCK_FILE)), 0o600)
    assert.equal(await modeOf(base), 0o750, 'existing parent must keep its mode')
    assert.equal(await release(), true)
  }

  const base = await mkdtemp(join(tmpdir(), 'trial-fetch-mode-lock-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const out = join(base, 'snapshot')
  await mkdir(out)
  await chmod(out, 0o755)
  const lockPath = join(out, OUTPUT_LOCK_FILE)
  await writeFile(lockPath, 'other-run\n', 'utf8')
  await chmod(lockPath, 0o644)

  await assert.rejects(withUmask(0o777, () => prepareOutDir(out)), /locked by another run/)
  assert.equal(await modeOf(out), 0o755, 'existing directory must not be chmod-ed')
  assert.equal(await modeOf(lockPath), 0o644, 'existing lock must not be chmod-ed')
  assert.equal(await readFile(lockPath, 'utf8'), 'other-run\n')
})

test('非空目录拒绝写入：已有文件不改权限、不被覆盖，也不发请求', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'trial-fetch-mode-nonempty-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const out = join(base, 'snapshot')
  await mkdir(out)
  await chmod(out, 0o755)
  const keep = join(out, 'caller-notes.txt')
  await writeFile(keep, 'do not touch\n', 'utf8')
  await chmod(keep, 0o644)
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return json(VERSION)
  }

  await assert.rejects(
    withUmask(0o777, () => runSnapshot({
      outDir: out,
      endDate: '2026-11-02',
      aliases: ['Behçet'],
      fetchImpl,
      now: () => new Date('2026-11-03T21:05:00Z'),
    })),
    /not empty/,
  )

  assert.equal(calls, 0)
  assert.equal(await modeOf(out), 0o755)
  assert.equal(await modeOf(keep), 0o644)
  assert.equal(await readFile(keep, 'utf8'), 'do not touch\n')
  await assert.rejects(readFile(join(out, OUTPUT_LOCK_FILE), 'utf8'), { code: 'ENOENT' })
})

test('采集失败仍只留下 0700/0600，不会因异常放宽权限', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'trial-fetch-mode-failed-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const out = join(base, 'snapshot')

  const result = await withUmask(0o777, () => runSnapshot({
    outDir: out,
    endDate: '2026-11-02',
    aliases: ['Behçet'],
    fetchImpl: async () => {
      throw new Error('network offline')
    },
    now: () => new Date('2026-11-03T21:05:00Z'),
  }))

  assert.equal(result.exitCode, 1)
  assert.notEqual(result.manifest.status, 'COMPLETE')
  assert.equal(await modeOf(out), 0o700)
  await assertPrivateTree(out)
})

test('发布中断留下的锁与临时清单仍是 0600', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'trial-fetch-mode-crash-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const script = `
    import { runSnapshot, BEHCET_ALIASES } from ${JSON.stringify(new URL('../scripts/fetch-behcet-trials-2026.mjs', import.meta.url).href)};
    await runSnapshot({ outDir: ${JSON.stringify(dir)}, endDate: '2026-11-02',
      aliases: BEHCET_ALIASES, now: () => new Date('2026-11-03T21:05:00Z'),
      fetchImpl: async (url) => new Response(JSON.stringify(String(url).endsWith('/version')
        ? { apiVersion: '2', dataTimestamp: '2026-11-03T00:00:00Z' }
        : { studies: [], totalCount: 0 })),
      onPublicationStage: (stage) => { if (stage === 'before-rename') process.exit(77) }
    });`
  await assert.rejects(
    withUmask(0o777, () => execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' })),
    (error) => error.status === 77,
  )

  assert.equal(await modeOf(dir), 0o700)
  assert.equal(await modeOf(join(dir, OUTPUT_LOCK_FILE)), 0o600)
  assert.equal(await modeOf(join(dir, 'manifest.json')), 0o600)
  assert.equal(await modeOf(join(dir, 'manifest.json.tmp')), 0o600)
  assert.equal(await modeOf(join(dir, 'pages', 'version.json')), 0o600)
  await assertPrivateTree(join(dir, 'pages'))
})
