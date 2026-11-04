#!/usr/bin/env node
/**
 * `scripts/check-trial-snapshot.mjs` 的专属正反例。
 *
 * 覆盖：显式快照目录（不再要求 `-cancer` 后缀）、父目录发现、关键字段缺失、
 * 非 COMPLETE 状态、status 与 exitCode 自相矛盾、JSONL/SQLite 结构不一致，
 * 以及 COMPLETE 清单在 windowCoverage / 官方 API base / aliases / rawFiles
 * 四个契约上的自身矛盾。所有夹具都建在 `os.tmpdir()` 下，结束删除。
 *
 * 夹具按真实生成器 manifest 的形状构造（12 个别名、12 个查询、4 个来源、
 * 16 行 source_statuses），但页面元数据只用于还原形状：结构检查器不读取
 * `pages/`，也不验证原始证据或来源真实性。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const checker = join(root, 'scripts', 'check-trial-snapshot.mjs')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const OFFICIAL_API_BASE = 'https://clinicaltrials.gov/api/v2'
const SNAPSHOT_DATE = '2026-11-04'
const DATA_TIMESTAMP = '2026-11-03T10:00:05'
const API_VERSION = '2.0.5'
// 与 scripts/fetch-behcet-trials-2026.mjs 的 BEHCET_ALIASES / slug / queryIdFor 一致。
const ALIASES = [
  'Behçet',
  'Behcet',
  "Behçet's disease",
  "Behcet's disease",
  'Behçet disease',
  'Behcet disease',
  "Behçet's syndrome",
  "Behcet's syndrome",
  'Behçet syndrome',
  'Behcet syndrome',
  'Adamantiades-Behçet',
  'Adamantiades-Behcet',
]
const WINDOW = {
  start: '2026-02-02',
  end: '2026-11-02',
  months: 9,
  inclusive: true,
  rule: 'AREA[StudyFirstPostDate]RANGE[2026-02-02,2026-11-02]',
  expansion: null,
}
const QUERY_DATE = SNAPSHOT_DATE

const slug = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'alias'
const queryIdFor = (alias, index) => `${String(index + 1).padStart(2, '0')}-${slug(alias)}`

const ROW = {
  recordId: 'NCT00000001',
  mergedSources: ['Behçet'],
  sourceId: 'clinicaltrials.gov',
  title: 'A study of NCT00000001',
  studyType: 'INTERVENTIONAL',
  sponsor: ['Example Sponsor'],
  registryNumbers: [{ type: 'NCT', value: 'NCT00000001' }],
  dates: { studyFirstPostDate: '2026-06-01' },
  sourceUrl: 'https://clinicaltrials.gov/study/NCT00000001',
  retrievedAt: '2026-11-04T04:49:18.591Z',
  statusNote: 'overallStatus=RECRUITING; not a recruitment or eligibility determination',
  snapshotDate: SNAPSHOT_DATE,
}

const SQL_COLUMNS = [
  ['record_id', 'recordId', false],
  ['merged_sources', 'mergedSources', true],
  ['source_id', 'sourceId', false],
  ['title', 'title', false],
  ['study_type', 'studyType', false],
  ['sponsors', 'sponsor', true],
  ['registry_numbers', 'registryNumbers', true],
  ['dates', 'dates', true],
  ['source_url', 'sourceUrl', false],
  ['retrieved_at', 'retrievedAt', false],
  ['status_note', 'statusNote', false],
  ['snapshot_date', 'snapshotDate', false],
]

function sqlValue(row, key, isJson) {
  const value = row[key] ?? null
  return isJson && value !== null ? JSON.stringify(value) : value
}

function queryUrlFor(alias) {
  const filter = encodeURIComponent(`AREA[StudyFirstPostDate]RANGE[${WINDOW.start},${WINDOW.end}]`)
  return `${OFFICIAL_API_BASE}/studies?query.cond=${encodeURIComponent(alias)}&filter.advanced=${filter}&pageSize=1000&countTotal=true`
}

function makeQueries(rows) {
  const recordIds = rows.map((row) => row.recordId)
  return ALIASES.map((alias, index) => {
    const queryId = queryIdFor(alias, index)
    const ownRecordIds = index === 0 ? recordIds : []
    const total = ownRecordIds.length
    const queryUrl = queryUrlFor(alias)
    return {
      queryId,
      sourceId: 'clinicaltrials.gov',
      alias,
      state: total ? 'SUCCESS' : 'SUCCESS_ZERO',
      queryDate: QUERY_DATE,
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      windowRule: WINDOW.rule,
      apiBase: OFFICIAL_API_BASE,
      pageSize: 1000,
      dataTimestamp: DATA_TIMESTAMP,
      startedAt: '2026-11-04T04:49:18.372Z',
      completedAt: '2026-11-04T04:49:18.472Z',
      httpStatus: 200,
      lastHttpStatus: 200,
      failedHttpStatus: null,
      failedPage: null,
      firstPageTotal: total,
      totalCount: total,
      pageCount: 1,
      preDedupCount: total,
      uniqueRecordCount: total,
      recordIds: ownRecordIds,
      queryUrl,
      pages: [
        {
          page: 1,
          requestedAt: '2026-11-04T04:49:18.372Z',
          url: queryUrl,
          responseUrl: queryUrl,
          httpStatus: 200,
          contentType: 'application/json',
          bytes: total ? 18250 : 512,
          sha256: sha256(Buffer.from(`${queryId}:page-1`)),
          storedAs: `pages/${queryId}/page-0001.json`,
          studyCount: total,
          totalCount: total,
          pageToken: null,
          nextPageToken: null,
        },
      ],
      errors: [],
      fatalError: false,
      truncatedErrors: 0,
      outOfWindowCount: 0,
      missingPostDateCount: 0,
      invalidPostDateCount: 0,
      invalidNctIdCount: 0,
      apiVersion: API_VERSION,
    }
  })
}

function makeStatusRows(rows) {
  return [
    ['', 'clinicaltrials.gov', 'SUCCESS'],
    ['', 'chictr.org.cn', 'NOT_QUERIED'],
    ['', 'chinadrugtrials.org.cn', 'NOT_QUERIED'],
    ['', 'trialsearch.who.int', 'NOT_QUERIED'],
    ...ALIASES.map((alias, index) => [
      alias,
      'clinicaltrials.gov',
      index === 0 && rows.length ? 'SUCCESS' : 'SUCCESS_ZERO',
    ]),
  ]
}

async function writeSnapshot(t, { rows = [ROW], statusRows, mutate } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'trial-checker-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const dir = join(base, 'ctg-2026-11-04')
  await mkdir(dir)

  const effectiveStatusRows = statusRows ?? makeStatusRows(rows)
  const jsonl = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')
  await writeFile(join(dir, 'trials.jsonl'), jsonl)

  const db = new DatabaseSync(join(dir, 'trials.sqlite'))
  try {
    db.exec(`CREATE TABLE trials (${SQL_COLUMNS.map(([column]) => `${column} TEXT`).join(', ')});
      CREATE TABLE source_statuses (query TEXT, source_id TEXT, state TEXT);`)
    const insert = db.prepare(`INSERT INTO trials (${SQL_COLUMNS.map(([column]) => column).join(', ')})
      VALUES (${SQL_COLUMNS.map(() => '?').join(', ')})`)
    for (const row of rows) {
      insert.run(...SQL_COLUMNS.map(([, key, isJson]) => sqlValue(row, key, isJson)))
    }
    const statusInsert = db.prepare('INSERT INTO source_statuses (query, source_id, state) VALUES (?, ?, ?)')
    for (const statusRow of effectiveStatusRows) statusInsert.run(...statusRow)
  } finally {
    db.close()
  }

  const jsonlBytes = await readFile(join(dir, 'trials.jsonl'))
  const dbBytes = await readFile(join(dir, 'trials.sqlite'))
  const manifest = {
    schemaVersion: 1,
    kind: 'clinicaltrials-gov-behcet-snapshot',
    timezone: 'UTC',
    startedAt: '2026-11-04T04:49:17.165Z',
    generatedAt: '2026-11-04T04:49:19.701Z',
    snapshotDate: SNAPSHOT_DATE,
    status: 'COMPLETE',
    exitCode: 0,
    scope: 'M4 research preparation snapshot; ClinicalTrials.gov only; not a production database.',
    window: { ...WINDOW },
    windowCoverage: {
      windowEnd: WINDOW.end,
      requiredThrough: `${WINDOW.end}T23:59:59.999Z`,
      requiredThroughExclusive: '2026-11-03T00:00:00.000Z',
      dataTimestamp: DATA_TIMESTAMP,
      dataTimestampAfter: DATA_TIMESTAMP,
      dataTimestampValid: true,
      dataTimestampAfterValid: true,
      covered: true,
    },
    aliases: [...ALIASES],
    dedupe: {
      key: 'NCTId',
      scope: 'across all queried aliases of this snapshot',
      note: 'Different aliases remain separate queries.',
    },
    api: {
      sourceId: 'clinicaltrials.gov',
      baseUrl: OFFICIAL_API_BASE,
      customApiBase: false,
      state: 'OK',
      httpStatus: 200,
      version: {
        sourceId: 'clinicaltrials.gov',
        url: `${OFFICIAL_API_BASE}/version`,
        requestedAt: '2026-11-04T04:49:17.166Z',
        httpStatus: 200,
        state: 'OK',
        apiVersion: API_VERSION,
        dataTimestamp: DATA_TIMESTAMP,
        sha256: sha256(Buffer.from('version')),
        bytes: 71,
        storedAs: 'pages/version.json',
        error: null,
      },
      after: {
        sourceId: 'clinicaltrials.gov',
        url: `${OFFICIAL_API_BASE}/version`,
        requestedAt: '2026-11-04T04:49:19.613Z',
        httpStatus: 200,
        state: 'OK',
        apiVersion: API_VERSION,
        dataTimestamp: DATA_TIMESTAMP,
        sha256: sha256(Buffer.from('version-after')),
        bytes: 71,
        storedAs: 'pages/version-after.json',
        error: null,
      },
      afterState: 'OK',
      dataTimestampChanged: false,
      apiVersionChanged: false,
      collectionStable: true,
    },
    queries: makeQueries(rows),
    sources: [
      {
        sourceId: 'clinicaltrials.gov',
        label: 'ClinicalTrials.gov',
        url: 'https://clinicaltrials.gov/',
        queried: true,
        state: rows.length ? 'SUCCESS' : 'SUCCESS_ZERO',
        queryDate: QUERY_DATE,
        windowStart: WINDOW.start,
        windowEnd: WINDOW.end,
        apiVersion: API_VERSION,
        dataTimestamp: DATA_TIMESTAMP,
        dataTimestampAfter: DATA_TIMESTAMP,
        dataTimestampChanged: false,
        queryCount: ALIASES.length,
        pageCount: ALIASES.length,
        totalCount: rows.length,
        preDedupCount: rows.length,
        uniqueRecords: new Set(rows.map((row) => row.recordId)).size,
        errorCount: 0,
        note: 'Queried by this script through the documented API v2 studies endpoint.',
      },
      {
        sourceId: 'chictr.org.cn',
        label: '中国临床试验注册中心 (ChiCTR)',
        url: 'https://www.chictr.org.cn/',
        queried: false,
        state: 'NOT_QUERIED',
        queryDate: null,
        windowStart: null,
        windowEnd: null,
        queryCount: 0,
        pageCount: null,
        totalCount: null,
        uniqueRecords: null,
        note: 'NOT_QUERIED by this script: no request was made. Not queried is not a zero result.',
      },
      {
        sourceId: 'chinadrugtrials.org.cn',
        label: '药物临床试验登记与信息公示平台',
        url: 'https://www.chinadrugtrials.org.cn/',
        queried: false,
        state: 'NOT_QUERIED',
        queryDate: null,
        windowStart: null,
        windowEnd: null,
        queryCount: 0,
        pageCount: null,
        totalCount: null,
        uniqueRecords: null,
        note: 'NOT_QUERIED by this script: no request was made. Not queried is not a zero result.',
      },
      {
        sourceId: 'trialsearch.who.int',
        label: 'WHO ICTRP',
        url: 'https://trialsearch.who.int/',
        queried: false,
        state: 'NOT_QUERIED',
        queryDate: null,
        windowStart: null,
        windowEnd: null,
        queryCount: 0,
        pageCount: null,
        totalCount: null,
        uniqueRecords: null,
        note: 'NOT_QUERIED by this script: no request was made. Not queried is not a zero result.',
      },
    ],
    stateDefinitions: {
      SUCCESS: 'All pages read; counts and window dates close.',
      SUCCESS_ZERO: 'Same evidence as SUCCESS, with totalCount=0.',
      PARTIAL: 'Some but not all alias queries succeeded.',
      INCOMPLETE: 'Evidence did not close.',
      FAILED: 'At least one query hit a fatal error.',
      NOT_QUERIED: 'No request was made to this source; never a zero result.',
    },
    coverage: {
      queriedSources: ['clinicaltrials.gov'],
      notQueriedSources: ['chictr.org.cn', 'chinadrugtrials.org.cn', 'trialsearch.who.int'],
      note: 'NOT_QUERIED means no request was made to that source; it is never a zero result.',
    },
    recordCount: rows.length,
    dbCount: rows.length,
    sourceStatusRows: effectiveStatusRows.length,
    counts: {
      jsonlRecords: rows.length,
      dbRecords: rows.length,
      sourceStatusRows: effectiveStatusRows.length,
      queryRows: ALIASES.length,
      queryPages: ALIASES.length,
      uniqueRecordIds: new Set(rows.map((row) => row.recordId)).size,
      errors: 0,
      note: 'Channel totalCount/uniqueRecords are after NCT dedupe.',
    },
    integrity: {
      sqlite: 'ok',
      jsonlMatchesDb: true,
      dbCounts: { trials: rows.length, sourceStatuses: effectiveStatusRows.length, queries: ALIASES.length },
      dbCountsError: null,
      rawFiles: {
        ok: true,
        filesConsistent: true,
        evidenceConsistent: true,
        status: { claimed: 'COMPLETE', verified: true, justified: true },
        errors: [],
        checked: {
          files: 2,
          versions: 2,
          pages: ALIASES.length,
          queries: ALIASES.length,
          rawStudyRecords: rows.length,
          jsonlRecords: rows.length,
        },
      },
    },
    files: {
      'trials.jsonl': { sha256: sha256(jsonlBytes), bytes: jsonlBytes.length },
      'trials.sqlite': { sha256: sha256(dbBytes), bytes: dbBytes.length },
    },
    errors: [],
  }
  if (mutate) mutate(manifest)
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { base, dir, manifest }
}

function runChecker(...paths) {
  const result = spawnSync(process.execPath, [checker, ...paths], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

test('显式快照目录与父目录都能检查；PASS 明示仅结构、不声明完整', async (t) => {
  const { base, dir } = await writeSnapshot(t)

  for (const target of [dir, base]) {
    const result = runChecker(target)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /CHECK .*status=COMPLETE exitCode=0 records=1\/1 sourceStatuses=16/)
    assert.match(result.stdout, /PASS snapshot consistency: 1 snapshot/)
    assert.match(result.stdout, /structural checks only/)
    assert.match(result.stdout, /does not verify completeness/)
    assert.match(result.stdout, /raw evidence/)
    assert.match(result.stdout, /source authenticity/)
    assert.doesNotMatch(result.stdout, /PASS snapshot completeness/)
  }
})

test('关键字段缺失时失败，并指出具体字段', async (t) => {
  const missingRow = { ...ROW }
  delete missingRow.title
  const { dir } = await writeSnapshot(t, {
    rows: [missingRow],
    mutate(manifest) {
      delete manifest.status
      delete manifest.exitCode
      delete manifest.counts
      delete manifest.integrity
    },
  })

  const result = runChecker(dir)
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
  for (const field of ['status', 'exitCode', 'counts', 'integrity']) {
    assert.match(result.stderr, new RegExp(`manifest missing required field ${field}`))
  }
  assert.match(result.stderr, /JSONL NCT00000001 missing field title/)
  assert.match(result.stdout, /FAIL snapshot consistency/)
})

test('非 COMPLETE 状态即使结构一致也返回非零并明确 NOT PASSED', async (t) => {
  for (const status of ['PARTIAL', 'INCOMPLETE', 'FAILED', 'PENDING']) {
    await t.test(status, async (t) => {
      const { dir } = await writeSnapshot(t, {
        mutate(manifest) {
          manifest.status = status
          manifest.exitCode = 1
        },
      })
      const result = runChecker(dir)
      assert.equal(result.status, 1)
      assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
      assert.match(result.stdout, /NOT PASSED snapshot completeness: 1 snapshot/)
      assert.match(result.stdout, new RegExp(`NOT PASSED .*manifest status=${status} exitCode=1`))
    })
  }
})

test('status 与 exitCode/来源/查询状态矛盾时失败', async (t) => {
  const cases = [
    {
      name: 'COMPLETE 却退出码 1',
      mutate: (manifest) => { manifest.exitCode = 1 },
      expected: /manifest claims COMPLETE but exitCode is 1/,
    },
    {
      name: 'COMPLETE 却带错误列表',
      mutate: (manifest) => { manifest.errors = [{ code: 'query_failed' }] },
      expected: /manifest claims COMPLETE but carries 1 error/,
    },
    {
      name: 'COMPLETE 却有失败查询',
      mutate: (manifest) => { manifest.queries[0].state = 'FAILED' },
      expected: /manifest claims COMPLETE but query 01-behcet state is FAILED/,
    },
    {
      name: 'COMPLETE 却有 PARTIAL 来源',
      mutate: (manifest) => { manifest.sources[0].state = 'PARTIAL' },
      expected: /manifest claims COMPLETE but queried source clinicaltrials.gov state is PARTIAL/,
    },
    {
      name: 'COMPLETE 却未查询任何来源',
      mutate: (manifest) => { manifest.sources[0].queried = false },
      expected: /manifest claims COMPLETE but no source was queried/,
    },
    {
      name: 'COMPLETE 但 API 不稳定',
      mutate: (manifest) => { manifest.api.collectionStable = false },
      expected: /manifest claims COMPLETE but api.collectionStable is not true/,
    },
    {
      name: 'INCOMPLETE 却退出码 0',
      mutate: (manifest) => { manifest.status = 'INCOMPLETE' },
      expected: /manifest status INCOMPLETE must not carry exitCode 0/,
    },
  ]
  for (const { name, mutate, expected } of cases) {
    await t.test(name, async (t) => {
      const { dir } = await writeSnapshot(t, { mutate })
      const result = runChecker(dir)
      assert.equal(result.status, 1)
      assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
      assert.match(result.stderr, expected)
    })
  }
})

test('COMPLETE 清单在 windowCoverage/API/别名/rawFiles 上自相矛盾时失败', async (t) => {
  const cases = [
    {
      name: 'windowCoverage.covered=false 时 COMPLETE 被拒绝',
      mutate: (manifest) => { manifest.windowCoverage.covered = false },
      expected: /manifest claims COMPLETE but windowCoverage\.covered is not true/,
      also: /windowCoverage\.covered is false but data timestamps imply true/,
    },
    {
      name: 'windowCoverage.covered=true 但时间戳不覆盖窗口末尾',
      mutate: (manifest) => {
        manifest.windowCoverage.dataTimestamp = '2026-11-02T10:00:00'
        manifest.windowCoverage.dataTimestampAfter = '2026-11-02T10:00:00'
      },
      expected: /windowCoverage\.covered is true but data timestamps imply false/,
    },
    {
      name: 'COMPLETE 使用非官方 API base 被拒绝',
      mutate: (manifest) => {
        manifest.api.baseUrl = 'https://mirror.example.test/api/v2'
        manifest.api.customApiBase = true
      },
      expected: /manifest claims COMPLETE but api\.baseUrl .* is not the official https:\/\/clinicaltrials\.gov\/api\/v2/,
      also: /manifest claims COMPLETE but api\.customApiBase is not false/,
    },
    {
      name: 'api.customApiBase=false 但 baseUrl 非官方',
      mutate: (manifest) => {
        manifest.api.baseUrl = 'https://mirror.example.test/api/v2'
      },
      expected: /api\.customApiBase is false but baseUrl .* is not the official/,
      also: /manifest claims COMPLETE but api\.baseUrl .* is not the official/,
    },
    {
      name: 'aliases 字段缺失被拒绝',
      mutate: (manifest) => { delete manifest.aliases },
      expected: /manifest\.aliases is missing/,
    },
    {
      name: 'aliases 为空被拒绝',
      mutate: (manifest) => { manifest.aliases = [] },
      expected: /manifest\.aliases is empty/,
    },
    {
      name: 'aliases 与 queries 数量不一致被拒绝',
      mutate: (manifest) => { manifest.aliases.pop() },
      expected: /manifest\.aliases lists 11 aliases but queries has 12/,
    },
    {
      name: 'query 缺少 alias 被拒绝',
      mutate: (manifest) => { delete manifest.queries[0].alias },
      expected: /manifest queries\[0\] has no alias/,
    },
    {
      name: 'query alias 与 aliases[i] 不一致',
      mutate: (manifest) => { manifest.queries[0].alias = 'Behcet' },
      expected: /manifest queries\[0\] alias "Behcet" != manifest\.aliases\[0\] "Behçet"/,
    },
    {
      name: 'rawFiles 缺失',
      mutate: (manifest) => { delete manifest.integrity.rawFiles },
      expected: /manifest claims COMPLETE but integrity\.rawFiles is missing/,
    },
    {
      name: 'rawFiles.ok=false',
      mutate: (manifest) => { manifest.integrity.rawFiles.ok = false },
      expected: /manifest claims COMPLETE but integrity\.rawFiles\.ok is not true/,
    },
    {
      name: 'rawFiles.errors 非空',
      mutate: (manifest) => { manifest.integrity.rawFiles.errors = [{ code: 'missing_page' }] },
      expected: /manifest claims COMPLETE but integrity\.rawFiles\.errors is non-empty/,
    },
    {
      name: 'rawFiles 未 verified/justified',
      mutate: (manifest) => {
        manifest.integrity.rawFiles.status.verified = false
        manifest.integrity.rawFiles.status.justified = false
      },
      expected: /rawFiles\.status\.verified is not true/,
      also: /rawFiles\.status\.justified is not true/,
    },
    {
      name: 'rawFiles 声称的 claimed 与 COMPLETE 不一致',
      mutate: (manifest) => { manifest.integrity.rawFiles.status.claimed = 'INCOMPLETE' },
      expected: /rawFiles\.status\.claimed is "INCOMPLETE"/,
    },
  ]

  for (const { name, mutate, expected, also } of cases) {
    await t.test(name, async (t) => {
      const { dir } = await writeSnapshot(t, { mutate })
      const result = runChecker(dir)
      assert.equal(result.status, 1)
      assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
      assert.match(result.stderr, expected)
      if (also) assert.match(result.stderr, also)
    })
  }
})

test('INCOMPLETE 清单允许 rawFiles 核验未通过，但仍不 PASS', async (t) => {
  const { dir } = await writeSnapshot(t, {
    mutate(manifest) {
      manifest.status = 'INCOMPLETE'
      manifest.exitCode = 1
      Object.assign(manifest.integrity.rawFiles, {
        ok: false,
        filesConsistent: false,
        evidenceConsistent: false,
        errors: [{ code: 'page_hash_mismatch' }],
      })
      manifest.integrity.rawFiles.status.verified = false
      manifest.integrity.rawFiles.status.justified = false
    },
  })

  const result = runChecker(dir)
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
  assert.match(result.stdout, /NOT PASSED snapshot completeness/)
  assert.doesNotMatch(result.stderr, /rawFiles is missing/)
})

test('非 COMPLETE 清单没有 rawFiles 时只报 NOT PASSED，不报结构缺失', async (t) => {
  const { dir } = await writeSnapshot(t, {
    mutate(manifest) {
      manifest.status = 'INCOMPLETE'
      manifest.exitCode = 1
      delete manifest.integrity.rawFiles
    },
  })

  const result = runChecker(dir)
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
  assert.match(result.stdout, /NOT PASSED snapshot completeness/)
  assert.doesNotMatch(result.stderr, /rawFiles is missing/)
})

test('PENDING 清单尚无 rawFiles 时不报“缺失”，但仍不 PASS', async (t) => {
  const { dir } = await writeSnapshot(t, {
    mutate(manifest) {
      manifest.status = 'PENDING'
      manifest.exitCode = 1
      delete manifest.integrity.rawFiles
    },
  })

  const result = runChecker(dir)
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
  assert.match(result.stdout, /NOT PASSED snapshot completeness/)
  assert.doesNotMatch(result.stderr, /rawFiles is missing/)
})

test('文件哈希、字节数、JSONL/SQLite 字段不一致仍然失败', async (t) => {
  await t.test('哈希与字段同时被改', async (t) => {
    const { dir } = await writeSnapshot(t)
    const changed = [{ ...ROW, title: 'forged title' }]
    await writeFile(join(dir, 'trials.jsonl'), `${JSON.stringify(changed[0])}\n`)
    const result = runChecker(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /SHA-256 mismatch for trials.jsonl/)
    assert.match(result.stderr, /field mismatch NCT00000001.title/)
    assert.doesNotMatch(result.stdout, /PASS snapshot consistency/)
  })

  await t.test('字节数不一致', async (t) => {
    const { dir } = await writeSnapshot(t, {
      mutate(manifest) { manifest.files['trials.jsonl'].bytes += 1 },
    })
    const result = runChecker(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /byte-count mismatch for trials.jsonl/)
  })
})

test('数据库 source_statuses 状态未知时失败', async (t) => {
  const { dir } = await writeSnapshot(t)
  const db = new DatabaseSync(join(dir, 'trials.sqlite'))
  try {
    db.prepare('UPDATE source_statuses SET state = ? WHERE query = ?').run('MAYBE', 'Behçet')
  } finally {
    db.close()
  }
  const bytes = await readFile(join(dir, 'trials.sqlite'))
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  manifest.files['trials.sqlite'] = { sha256: sha256(bytes), bytes: bytes.length }
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const result = runChecker(dir)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /source_statuses row missing query\/source_id\/state or has unknown state/)
})

test('显式目录里的坏清单报错而不是当作“没有快照”；--if-present 只跳过空目录', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'trial-checker-empty-'))
  t.after(() => rm(base, { recursive: true, force: true }))

  const skipped = runChecker(base, '--if-present')
  assert.equal(skipped.status, 0)
  assert.match(skipped.stdout, /SKIP no clinical snapshot found/)

  await writeFile(join(base, 'manifest.json'), '{not json')
  const broken = runChecker(base)
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /cannot read manifest\.json/)
  assert.doesNotMatch(broken.stdout, /SKIP/)
})