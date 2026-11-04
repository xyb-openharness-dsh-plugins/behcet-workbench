#!/usr/bin/env node
/**
 * 白塞病研究登记快照采集（M4 研究准备）
 *
 * 只查 ClinicalTrials.gov，并**只记录自己真正查过的来源**。ChiCTR、药物临床试验登记与
 * 信息公示平台、WHO ICTRP 在本脚本里永远记为 `NOT_QUERIED`：没发请求不等于零条，
 * 也不得拿 CTG 的结果冒充四通道覆盖。
 *
 * ## 为什么不是「把搜索结果存下来」就完事
 * `docs/TRIAL-SNAPSHOT-PLAN.md` 要求失败、拒绝、未查、部分结果和成功零条可区分，并要求
 * 保留完整分页、每页哈希与令牌链。因此每次查询都必须：
 *   1. 固定别名、固定 `AREA[StudyFirstPostDate]` 窗口（默认近 9 个月，含首尾两天）；
 *      结束日不得晚于运行当天（UTC），窗口内每条返回登记的 `studyFirstPostDate`
 *      都必须存在且落在窗口内，否则该查询记 `INCOMPLETE`、记录不并入快照；
 *   2. 沿 `nextPageToken` 读完所有页，逐页保存原始响应并记 SHA-256、token、条数；
 *      CTG 只在首页返回 `totalCount`（`countTotal=true`），后续页缺失是正常形状，
 *      允许出现无令牌的尾空页；只有后续页**明确带回**不同的 `totalCount` 才算计数异常；
 *   3. 用首页 `totalCount` 核对「页内条数之和」与「唯一 NCT 号数」；
 *   4. 只有 HTTP 200 + 合法 JSON + 计数一致 + 窗口内日期 + 无错误才可记 `SUCCESS`；
 *      `totalCount=0` 且无下一页令牌、有同样证据时才可记 `SUCCESS_ZERO`；
 *   5. HTTP/网络/解析错误记 `FAILED`；分页、计数、日期或哈希对不上记 `INCOMPLETE`。
 * 任何错误都不会写成成功，也不会把失败/不完整查询里的半页记录并入快照。错误列表
 * 有上限，但致命错误（HTTP/网络/解析/形状/落盘）永远保留并决定 `FAILED`。
 *
 * 采集开始与结束后各取一次 `/version`：前后 `dataTimestamp`（或 `apiVersion`）变化、
 * 或结束后的版本请求失败/不完整时，整份快照记 `INCOMPLETE`。这只降低混合快照风险，
 * 不能证明分页期间上游没有变化。
 *
 * ## 输出与核验
 * `<out>/manifest.json`、`<out>/trials.jsonl`、`<out>/trials.sqlite`、
 * `<out>/pages/...`（原始响应，含 `version.json` / `version-after.json`）。
 * `trials.sqlite` 的 `trials`、`source_statuses` 表与
 * `scripts/check-trial-snapshot.mjs` 的字段约定一致，因此测试可以用该检查器做结构复核。
 * **该检查器只核对 manifest.files 里列出的 JSONL/SQLite，不读取 `pages/` 原始响应。**
 * 原始分页、版本文件、令牌链和逐页哈希由本文件导出的 `verifySnapshotHashes()` 重算，
 * 测试直接调用它；不能把现有 checker 的 PASS 当成原始响应已核验。
 *
 * ## 安全边界与并发
 * `--out` 必填，且目标目录必须不存在或为空：脚本不会覆盖已有快照，也没有默认生产库
 * 路径。写入前在目标目录原子创建 `.trial-fetch.lock`；并发运行会因锁失败而拒绝，
 * 非空目录会在加锁后再次检查并拒绝，不会改动其中已有文件。进程被强杀可能留下锁文件，
 * 需确认没有其他采集在跑后手工删除。正式入库、四通道检索、临床审核与患者访谈都不属于
 * 本脚本。
 *
 * ## 残留限制（不因本脚本通过而消失）
 * - 只查 CTG；ChiCTR、药物临床试验登记与信息公示平台、WHO ICTRP 仍是 `NOT_QUERIED`。
 * - 服务端后续页不返回 `totalCount` 时无法再向服务端复算总数，只能核对首页总数、
 *   页内条数与唯一 NCT；上游若在下游页删改记录，计数一致也不代表内容未变。
 * - 版本时间前后对比是两点采样，不是分页期间的连续校验；仍可能有混合时间点记录。
 * - `studyFirstPostDate` 只有日期没有时间，窗口按 UTC 日历日比较。
 * - 哈希只证明本地文件与 manifest 记录一致，不证明来源真实性（无签名/TLS 固定）。
 * - 锁只约束本脚本的协作进程，不防外部程序改写目录；崩溃残留锁需人工判断。
 *
 * 用法：
 *   node scripts/fetch-behcet-trials-2026.mjs --out /tmp/ctg-2026-11-03
 *   node scripts/fetch-behcet-trials-2026.mjs --out ... --end-date 2026-11-03 --months 9
 * 测试只传 `fetchImpl` 夹具，不访问网络（见 test/trial-fetch.test.mjs）。
 */
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

export const SNAPSHOT_SCHEMA_VERSION = 1
export const DEFAULT_API_BASE = 'https://clinicaltrials.gov/api/v2'
export const DEFAULT_PAGE_SIZE = 1000
export const MAX_PAGE_SIZE = 1000
export const PREFERRED_MONTHS = 9
export const MAX_MONTHS = 12
export const SOURCE_ID = 'clinicaltrials.gov'
export const SNAPSHOT_KIND = 'clinicaltrials-gov-behcet-snapshot'
/** 一次查询最多保留的非致命错误条数；致命错误不受该上限约束。 */
export const MAX_QUERY_ERRORS = 25
export const OUTPUT_LOCK_FILE = '.trial-fetch.lock'

/**
 * 白塞病的英文别名。带变音符号和不带变音符号、disease/syndrome、Adamantiades 都单列，
 * 因为 CTG 的 `query.cond` 不是全文检索，同义词命中数会不同；合并成一个查询会掩盖
 * 哪个词命中了哪条登记。查询结果再按 NCT 号去重，命中关系保留在 `mergedSources`。
 */
export const BEHCET_ALIASES = Object.freeze([
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
])

export const CHANNELS = Object.freeze([
  {
    sourceId: 'clinicaltrials.gov',
    label: 'ClinicalTrials.gov',
    url: 'https://clinicaltrials.gov/',
    queryable: true,
    note: 'Queried by this script through the documented API v2 studies endpoint.',
  },
  {
    sourceId: 'chictr.org.cn',
    label: '中国临床试验注册中心 (ChiCTR)',
    url: 'https://www.chictr.org.cn/',
    queryable: false,
    note: 'NOT_QUERIED by this script: no request was made. Not queried is not a zero result.',
  },
  {
    sourceId: 'chinadrugtrials.org.cn',
    label: '药物临床试验登记与信息公示平台',
    url: 'https://www.chinadrugtrials.org.cn/',
    queryable: false,
    note: 'NOT_QUERIED by this script: no request was made. Not queried is not a zero result.',
  },
  {
    sourceId: 'trialsearch.who.int',
    label: 'WHO ICTRP',
    url: 'https://trialsearch.who.int/',
    queryable: false,
    note: 'NOT_QUERIED by this script: no request was made. Not queried is not a zero result.',
  },
])

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FATAL_PAGE_CODES = new Set([
  'fetch_failed',
  'timeout',
  'http_error',
  'json_parse',
  'response_shape',
  'page_store_failed',
])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const uniqueSorted = (values) =>
  [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

function utcDate(value, label = 'date') {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD, got ${JSON.stringify(value)}`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a real date: ${value}`)
  // 2026-02-30 会被 Date 滚到 3 月；格式化后不相等即说明原字符串不是真实日历日。
  if (formatDate(date) !== value) throw new Error(`${label} is not a real date: ${value}`)
  return date
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

/** 按 UTC 日历加/减月份；目标月没有该日时取月末（1-31 减 3 个月 → 2-28/29）。 */
export function addMonthsUTC(value, months) {
  if (!Number.isInteger(months)) throw new Error(`months must be an integer, got ${months}`)
  const date = utcDate(value)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return formatDate(date)
}

/**
 * 默认九个月窗口。`months > 9` 必须给出业务理由，且不得超过 12；理由只记录为本脚本
 * 的扩窗依据，不代表已经获得 G3 或项目负责人批准。
 */
export function buildWindow({ endDate, months = PREFERRED_MONTHS, expansionReason, today } = {}) {
  if (!endDate) throw new Error('endDate is required')
  const end = formatDate(utcDate(endDate, 'endDate'))
  if (today !== undefined) {
    const todayDate = formatDate(utcDate(today, 'today'))
    if (end > todayDate) {
      // 未来窗口会把「尚未发生」的登记当成已检索覆盖，必须当场拒绝。
      throw new Error(`endDate ${end} is in the future (today is ${todayDate}); refusing a future window`)
    }
  }
  if (!Number.isInteger(months) || months < 1) {
    throw new Error(`months must be an integer >= 1, got ${months}`)
  }
  if (months > MAX_MONTHS) {
    throw new Error(`months ${months} exceeds the workflow maximum of ${MAX_MONTHS}`)
  }
  const reason = typeof expansionReason === 'string' ? expansionReason.trim() : ''
  if (months > PREFERRED_MONTHS && !reason) {
    throw new Error(
      `months ${months} is wider than the preferred ${PREFERRED_MONTHS}; provide an expansion reason`,
    )
  }
  const start = addMonthsUTC(end, -months)
  return {
    start,
    end,
    months,
    inclusive: true,
    rule: `AREA[StudyFirstPostDate]RANGE[${start},${end}]`,
    expansion: months > PREFERRED_MONTHS
      ? {
          months,
          reason,
          withinWorkflowLimit: true,
          // 脚本只记录理由；是否批准属于 G3/业务确认，不能由代码断言。
          approvalRecorded: false,
        }
      : null,
  }
}

export function buildStudiesUrl({
  apiBase = DEFAULT_API_BASE,
  alias,
  window,
  pageSize = DEFAULT_PAGE_SIZE,
  pageToken = null,
} = {}) {
  if (typeof alias !== 'string' || !alias.trim()) throw new Error('alias is required')
  if (!window?.start || !window?.end) throw new Error('window.start and window.end are required')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be an integer 1..${MAX_PAGE_SIZE}, got ${pageSize}`)
  }
  const base = normaliseApiBase(apiBase)
  const url = new URL(`${base}/studies`)
  url.searchParams.set('query.cond', alias)
  url.searchParams.set('filter.advanced', window.rule)
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('countTotal', 'true')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  return url.toString()
}

function normaliseApiBase(apiBase) {
  let url
  try {
    url = new URL(String(apiBase).replace(/\/+$/, ''))
  } catch (error) {
    throw new Error(`apiBase is not a valid URL: ${apiBase}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`apiBase must be http(s), got ${url.protocol}`)
  }
  return url.toString().replace(/\/+$/, '')
}

function slug(value) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'alias'
  )
}

function queryIdFor(alias, index) {
  return `${String(index + 1).padStart(2, '0')}-${slug(alias)}`
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null
}

function structDate(module, key) {
  const value = module?.[key]
  return textOrNull(value?.date)
}

function errorInfo(code, error) {
  const message = String(error?.message ?? error ?? '').slice(0, 1000)
  const codeOut = /timeout|abort/i.test(`${error?.name ?? ''} ${message}`) ? 'timeout' : code
  return { code: codeOut, message }
}

/**
 * 记录查询错误。非致命错误最多保留 `MAX_QUERY_ERRORS` 条；致命错误永远保留（必要时
 * 挤掉一条非致命错误），避免「前 25 条都是非致命、第 26 条才是 HTTP/解析失败」被静默
 * 吞掉后把 FAILED 误判成 INCOMPLETE。
 */
function pushError(query, code, message) {
  const fatal = FATAL_PAGE_CODES.has(code)
  if (fatal) query.fatalError = true
  const text = String(message ?? '').slice(0, 1000)
  if (query.errors.some((entry) => entry.code === code && entry.message === text)) return
  if (query.errors.length >= MAX_QUERY_ERRORS && !fatal) {
    query.truncatedErrors += 1
    return
  }
  if (query.errors.length >= MAX_QUERY_ERRORS && fatal) {
    const replaceIndex = query.errors.findIndex((entry) => !FATAL_PAGE_CODES.has(entry.code))
    if (replaceIndex >= 0) query.errors.splice(replaceIndex, 1)
  }
  query.errors.push({ code, message: text })
}

function bodySnippet(bytes) {
  return bytes.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 240)
}

async function requestRaw({ url, fetchImpl, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs)
  timer.unref?.()
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      redirect: 'follow',
    })
    if (!response || typeof response.arrayBuffer !== 'function') {
      throw new Error('fetch implementation returned no response body')
    }
    const raw = Buffer.from(await response.arrayBuffer())
    return { response, raw }
  } finally {
    clearTimeout(timer)
  }
}

function contentTypeOf(response) {
  try {
    return response.headers?.get?.('content-type') ?? null
  } catch {
    return null
  }
}

async function fetchVersion({ apiBase, outDir, fetchImpl, timeoutMs, now, fileName = 'version.json' }) {
  const storedAs = `pages/${fileName}`
  const version = {
    sourceId: SOURCE_ID,
    url: `${apiBase}/version`,
    requestedAt: now().toISOString(),
    httpStatus: null,
    state: 'FAILED',
    apiVersion: null,
    dataTimestamp: null,
    sha256: null,
    bytes: null,
    storedAs: null,
    error: null,
  }
  let response
  let raw
  try {
    ;({ response, raw } = await requestRaw({ url: version.url, fetchImpl, timeoutMs }))
    version.httpStatus = response.status
    version.bytes = raw.length
    version.sha256 = sha256(raw)
    await mkdir(join(outDir, 'pages'), { recursive: true })
    await writeFile(join(outDir, storedAs), raw)
    version.storedAs = storedAs
    if (!response.ok) {
      version.error = `HTTP ${response.status}: ${bodySnippet(raw)}`
      return version
    }
    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch (error) {
      version.error = `version response is not valid JSON: ${error.message}`
      return version
    }
    version.apiVersion = textOrNull(body?.apiVersion)
    version.dataTimestamp = textOrNull(body?.dataTimestamp)
    if (!version.apiVersion || !version.dataTimestamp) {
      version.state = 'INCOMPLETE'
      version.error = 'version response did not include apiVersion and dataTimestamp'
      return version
    }
    version.state = 'OK'
    return version
  } catch (error) {
    // 版本端点的失败同样只记 FAILED；不把上一次成功或部分响应当成当前版本。
    version.error = errorInfo('version_fetch_failed', error).message
    return version
  }
}

/**
 * 返回该登记的 studyFirstPostDate 问题；null 表示存在、是真实日期且落在窗口内。
 * CTG 的 `AREA[StudyFirstPostDate]RANGE[...]` 命中结果仍逐条复核，防止过滤器语义或
 * 数据变更把窗口外登记带进快照。
 */
function studyPostDateIssue(study, window) {
  const date = structDate(study?.protocolSection?.statusModule, 'studyFirstPostDateStruct')
  if (!date) {
    return { code: 'missing_study_first_post_date', detail: 'study has no studyFirstPostDate' }
  }
  try {
    utcDate(date, 'studyFirstPostDate')
  } catch (error) {
    return { code: 'invalid_study_first_post_date', detail: error.message }
  }
  if (date < window.start || date > window.end) {
    return {
      code: 'study_out_of_window',
      detail: `${date} is outside [${window.start}, ${window.end}]`,
    }
  }
  return null
}

async function collectAliasQuery({
  alias,
  index,
  apiBase,
  window,
  pageSize,
  outDir,
  fetchImpl,
  timeoutMs,
  maxPages,
  now,
  queryDate,
  dataTimestamp,
}) {
  const queryId = queryIdFor(alias, index)
  const query = {
    queryId,
    sourceId: SOURCE_ID,
    alias,
    state: 'FAILED',
    queryDate,
    windowStart: window.start,
    windowEnd: window.end,
    windowRule: window.rule,
    apiBase,
    pageSize,
    dataTimestamp,
    startedAt: now().toISOString(),
    completedAt: null,
    httpStatus: null, // 首页状态；不是整条查询的唯一状态
    lastHttpStatus: null,
    failedHttpStatus: null, // 导致查询失败的那一页的 HTTP 状态，避免把页二 500 报成 200
    failedPage: null,
    firstPageTotal: null,
    totalCount: null,
    pageCount: 0,
    preDedupCount: 0,
    uniqueRecordCount: 0,
    recordIds: [],
    queryUrl: null,
    pages: [],
    errors: [],
    fatalError: false,
    truncatedErrors: 0,
    outOfWindowCount: 0,
    missingPostDateCount: 0,
    invalidPostDateCount: 0,
  }

  const ids = new Map()
  const usedNextTokens = new Set()
  let token = null
  let page = 1
  let totalCount = null
  let sumStudies = 0

  for (;;) {
    if (page > maxPages) {
      pushError(query, 'page_limit_exceeded', `stopped after ${maxPages} pages with a nextPageToken still present`)
      break
    }
    const url = buildStudiesUrl({ apiBase, alias, window, pageSize, pageToken: token })
    if (page === 1) query.queryUrl = url
    const requestedAt = now().toISOString()
    let response
    let raw
    try {
      ;({ response, raw } = await requestRaw({ url, fetchImpl, timeoutMs }))
    } catch (error) {
      const info = errorInfo('fetch_failed', error)
      pushError(query, info.code, `${info.message} (page ${page})`)
      break
    }

    const httpStatus = response.status
    if (page === 1) query.httpStatus = httpStatus
    query.lastHttpStatus = httpStatus
    const pageRecord = {
      page,
      requestedAt,
      url,
      responseUrl: textOrNull(response.url) ?? url,
      httpStatus,
      contentType: contentTypeOf(response),
      bytes: raw.length,
      sha256: sha256(raw),
      storedAs: null,
      studyCount: null,
      totalCount: null,
      pageToken: token,
      nextPageToken: null,
    }

    const storedAs = `pages/${queryId}/page-${String(page).padStart(4, '0')}.json`
    try {
      await mkdir(dirname(join(outDir, storedAs)), { recursive: true })
      await writeFile(join(outDir, storedAs), raw)
      pageRecord.storedAs = storedAs
    } catch (error) {
      pushError(query, 'page_store_failed', `page ${page}: ${error.message}`)
      query.pages.push(pageRecord)
      break
    }
    query.pages.push(pageRecord)

    if (!response.ok) {
      query.failedHttpStatus = httpStatus
      query.failedPage = page
      pushError(query, 'http_error', `HTTP ${httpStatus} on page ${page}: ${bodySnippet(raw)}`)
      break
    }

    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch (error) {
      pushError(query, 'json_parse', `page ${page}: ${error.message}`)
      break
    }
    if (!body || typeof body !== 'object' || !Array.isArray(body.studies)) {
      pushError(query, 'response_shape', `page ${page}: response has no studies array`)
      break
    }

    if (Object.hasOwn(body, 'nextPageToken') && typeof body.nextPageToken !== 'string') {
      pushError(query, 'response_shape', `page ${page}: nextPageToken must be a string when present`)
      break
    }

    pageRecord.studyCount = body.studies.length
    pageRecord.totalCount = Number.isInteger(body.totalCount) ? body.totalCount : null
    pageRecord.nextPageToken = typeof body.nextPageToken === 'string' && body.nextPageToken
      ? body.nextPageToken
      : null

    if (page === 1) {
      totalCount = pageRecord.totalCount
      query.firstPageTotal = totalCount
    } else if (pageRecord.totalCount !== null && pageRecord.totalCount !== totalCount) {
      // CTG 只在首页返回 totalCount；后续页缺失不是异常。只有明确带来不同值才记。
      pushError(query, 'count_changed', `totalCount changed from ${totalCount} to ${pageRecord.totalCount} on page ${page}`)
    }

    sumStudies += body.studies.length
    for (const study of body.studies) {
      const nctId = textOrNull(study?.protocolSection?.identificationModule?.nctId)
      if (!nctId) {
        pushError(query, 'missing_nct_id', `page ${page}: study without NCTId`)
        continue
      }
      if (ids.has(nctId)) {
        pushError(query, 'duplicate_nct_id', `page ${page}: duplicate NCTId ${nctId}`)
        continue
      }
      // 每条都核对窗口；有问题时仍计入服务端返回条数/唯一登记号，便于解释计数差异，
      // 但该查询不会是 SUCCESS，因此这些记录不会并入快照。
      const postDateIssue = studyPostDateIssue(study, window)
      if (postDateIssue) {
        if (postDateIssue.code === 'study_out_of_window') query.outOfWindowCount += 1
        else if (postDateIssue.code === 'missing_study_first_post_date') query.missingPostDateCount += 1
        else query.invalidPostDateCount += 1
        pushError(query, postDateIssue.code, `page ${page} ${nctId}: ${postDateIssue.detail}`)
      }
      ids.set(nctId, study)
    }

    const next = pageRecord.nextPageToken
    if (!next) break
    if (next === token || usedNextTokens.has(next)) {
      pushError(query, 'token_loop', `page ${page}: nextPageToken repeated (${next})`)
      break
    }
    usedNextTokens.add(next)
    token = next
    page += 1
  }

  if (totalCount === null) {
    pushError(query, 'total_count_missing', 'response did not include an integer totalCount; completeness cannot be verified')
  } else if (totalCount < 0) {
    pushError(query, 'total_count_invalid', `totalCount is negative (${totalCount})`)
  } else {
    if (sumStudies !== totalCount) {
      pushError(query, 'count_mismatch', `paged studies ${sumStudies} != totalCount ${totalCount}`)
    }
    if (ids.size !== totalCount) {
      pushError(query, 'unique_count_mismatch', `unique NCTIds ${ids.size} != totalCount ${totalCount}`)
    }
    if (totalCount === 0 && (sumStudies !== 0 || query.pages.length !== 1)) {
      pushError(query, 'zero_evidence_mismatch', 'zero totalCount did not come from one empty page without a next token')
    }
  }

  query.completedAt = now().toISOString()
  query.pageCount = query.pages.length
  query.totalCount = totalCount
  query.preDedupCount = sumStudies
  query.uniqueRecordCount = ids.size
  query.recordIds = [...ids.keys()].sort()

  if (query.fatalError) {
    // 用独立标记而不是扫描被截断的错误列表，保证致命错误决定 FAILED。
    query.state = 'FAILED'
  } else if (query.errors.length) {
    query.state = 'INCOMPLETE'
  } else if (totalCount === 0) {
    query.state = 'SUCCESS_ZERO'
  } else {
    query.state = 'SUCCESS'
  }

  return { query, studies: [...ids.values()] }
}

function normaliseStudy(study, { snapshotDate, retrievedAt }) {
  const protocol = study?.protocolSection && typeof study.protocolSection === 'object'
    ? study.protocolSection
    : {}
  const identification = protocol.identificationModule ?? {}
  const status = protocol.statusModule ?? {}
  const design = protocol.designModule ?? {}
  const sponsors = protocol.sponsorCollaboratorsModule ?? {}
  const nctId = identification.nctId

  const sponsor = []
  if (textOrNull(sponsors.leadSponsor?.name)) sponsor.push(sponsors.leadSponsor.name)
  if (Array.isArray(sponsors.collaborators)) {
    for (const collaborator of sponsors.collaborators) {
      if (textOrNull(collaborator?.name)) sponsor.push(collaborator.name)
    }
  }

  const registryNumbers = [{ type: 'NCT', value: nctId }]
  if (textOrNull(identification.orgStudyIdInfo?.id)) {
    registryNumbers.push({ type: 'ORG_STUDY_ID', value: identification.orgStudyIdInfo.id })
  }
  if (Array.isArray(identification.secondaryIdInfos)) {
    for (const secondary of identification.secondaryIdInfos) {
      if (!textOrNull(secondary?.id)) continue
      registryNumbers.push({
        type: textOrNull(secondary.type) ?? 'SECONDARY',
        value: secondary.id,
        domain: textOrNull(secondary.domain),
      })
    }
  }

  const overallStatus = textOrNull(status.overallStatus)
  const statusVerifiedDate = textOrNull(status.statusVerifiedDate)
  return {
    recordId: nctId,
    // 先空着；合并所有成功别名后填入命中的别名，按码位排序保证输出稳定。
    mergedSources: [],
    sourceId: SOURCE_ID,
    title: textOrNull(identification.briefTitle) ?? textOrNull(identification.officialTitle),
    studyType: textOrNull(design.studyType),
    sponsor,
    registryNumbers,
    dates: {
      studyFirstPostDate: structDate(status, 'studyFirstPostDateStruct'),
      startDate: structDate(status, 'startDateStruct'),
      primaryCompletionDate: structDate(status, 'primaryCompletionDateStruct'),
      completionDate: structDate(status, 'completionDateStruct'),
      lastUpdatePostDate: structDate(status, 'lastUpdatePostDateStruct'),
      statusVerifiedDate,
    },
    sourceUrl: `https://clinicaltrials.gov/study/${nctId}`,
    retrievedAt,
    statusNote: [
      `overallStatus=${overallStatus ?? 'MISSING_IN_RESPONSE'}`,
      `statusVerifiedDate=${statusVerifiedDate ?? 'MISSING_IN_RESPONSE'}`,
      'registry status as returned; not a recruitment or eligibility determination',
    ].join('; '),
    snapshotDate,
  }
}

function deriveChannelState(queries, apiState) {
  if (!queries.length) return 'NOT_QUERIED'
  const states = queries.map((query) => query.state)
  const successes = states.filter((state) => state === 'SUCCESS' || state === 'SUCCESS_ZERO').length
  if (successes === queries.length) {
    if (apiState !== 'OK') return 'PARTIAL'
    return states.every((state) => state === 'SUCCESS_ZERO') ? 'SUCCESS_ZERO' : 'SUCCESS'
  }
  if (successes > 0) return 'PARTIAL'
  // 没有任何成功查询时，致命失败优先于「不完整」：不能把一条 HTTP 500 的查询
  // 与一条计数不符的查询聚合成较温和的 INCOMPLETE。
  if (states.some((state) => state === 'FAILED')) return 'FAILED'
  if (states.some((state) => state === 'INCOMPLETE')) return 'INCOMPLETE'
  return 'FAILED'
}

function overallStatusFor(channelState) {
  if (channelState === 'SUCCESS' || channelState === 'SUCCESS_ZERO') return 'COMPLETE'
  if (channelState === 'PARTIAL') return 'PARTIAL'
  if (channelState === 'INCOMPLETE') return 'INCOMPLETE'
  return 'FAILED'
}

function sourceStatusRow({
  scope,
  sourceId,
  query = '',
  state,
  queryDate = null,
  windowStart = null,
  windowEnd = null,
  httpStatus = null,
  lastHttpStatus = null,
  failedHttpStatus = null,
  failedPage = null,
  pageCount = null,
  totalCount = null,
  preDedupCount = null,
  uniqueRecords = null,
  queryUrl = null,
  error = null,
  errorCount = null,
  truncatedErrors = null,
  retrievedAt = null,
}) {
  return {
    scope,
    sourceId,
    query,
    state,
    queryDate,
    windowStart,
    windowEnd,
    httpStatus,
    lastHttpStatus,
    failedHttpStatus,
    failedPage,
    pageCount,
    totalCount,
    preDedupCount,
    uniqueRecords,
    queryUrl,
    error,
    errorCount,
    truncatedErrors,
    retrievedAt,
  }
}

function createDatabase(path, records, statusRows, queries) {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE trials (
      record_id TEXT PRIMARY KEY,
      merged_sources TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT,
      study_type TEXT,
      sponsors TEXT NOT NULL,
      registry_numbers TEXT NOT NULL,
      dates TEXT NOT NULL,
      source_url TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      status_note TEXT NOT NULL,
      snapshot_date TEXT NOT NULL
    );
    CREATE TABLE source_statuses (
      source_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      query TEXT NOT NULL,
      state TEXT NOT NULL,
      query_date TEXT,
      window_start TEXT,
      window_end TEXT,
      http_status INTEGER,
      last_http_status INTEGER,
      failed_http_status INTEGER,
      failed_page INTEGER,
      page_count INTEGER,
      total_count INTEGER,
      pre_dedup_count INTEGER,
      unique_records INTEGER,
      query_url TEXT,
      error TEXT,
      error_count INTEGER,
      truncated_errors INTEGER,
      retrieved_at TEXT,
      PRIMARY KEY (source_id, scope, query)
    );
    CREATE TABLE queries (
      query_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      state TEXT NOT NULL,
      query_date TEXT,
      window_start TEXT,
      window_end TEXT,
      http_status INTEGER,
      last_http_status INTEGER,
      failed_http_status INTEGER,
      page_count INTEGER,
      first_page_total INTEGER,
      total_count INTEGER,
      pre_dedup_count INTEGER,
      unique_records INTEGER,
      record_ids TEXT NOT NULL,
      query_url TEXT,
      error TEXT,
      error_count INTEGER,
      truncated_errors INTEGER,
      retrieved_at TEXT
    );
  `)

  db.exec('BEGIN')
  try {
    const insertTrial = db.prepare(`
      INSERT INTO trials (
        record_id, merged_sources, source_id, title, study_type, sponsors,
        registry_numbers, dates, source_url, retrieved_at, status_note, snapshot_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const row of records) {
      insertTrial.run(
        row.recordId,
        JSON.stringify(row.mergedSources),
        row.sourceId,
        row.title,
        row.studyType,
        JSON.stringify(row.sponsor),
        JSON.stringify(row.registryNumbers),
        JSON.stringify(row.dates),
        row.sourceUrl,
        row.retrievedAt,
        row.statusNote,
        row.snapshotDate,
      )
    }

    const insertStatus = db.prepare(`
      INSERT INTO source_statuses (
        source_id, scope, query, state, query_date, window_start, window_end,
        http_status, last_http_status, failed_http_status, failed_page, page_count,
        total_count, pre_dedup_count, unique_records, query_url, error, error_count,
        truncated_errors, retrieved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const row of statusRows) {
      insertStatus.run(
        row.sourceId,
        row.scope,
        row.query,
        row.state,
        row.queryDate,
        row.windowStart,
        row.windowEnd,
        row.httpStatus,
        row.lastHttpStatus,
        row.failedHttpStatus,
        row.failedPage,
        row.pageCount,
        row.totalCount,
        row.preDedupCount,
        row.uniqueRecords,
        row.queryUrl,
        row.error,
        row.errorCount,
        row.truncatedErrors,
        row.retrievedAt,
      )
    }

    const insertQuery = db.prepare(`
      INSERT INTO queries (
        query_id, source_id, alias, state, query_date, window_start, window_end,
        http_status, last_http_status, failed_http_status, page_count, first_page_total,
        total_count, pre_dedup_count, unique_records, record_ids, query_url, error,
        error_count, truncated_errors, retrieved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const query of queries) {
      insertQuery.run(
        query.queryId,
        query.sourceId,
        query.alias,
        query.state,
        query.queryDate,
        query.windowStart,
        query.windowEnd,
        query.httpStatus,
        query.lastHttpStatus,
        query.failedHttpStatus,
        query.pageCount,
        query.firstPageTotal,
        query.totalCount,
        query.preDedupCount,
        query.uniqueRecordCount,
        JSON.stringify(query.recordIds),
        query.queryUrl,
        query.errors.length ? query.errors.map((entry) => `${entry.code}: ${entry.message}`).join(' | ') : null,
        query.errors.length,
        query.truncatedErrors,
        query.completedAt,
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  let integrity = 'not-checked'
  try {
    const rows = db.prepare('PRAGMA integrity_check').all()
    integrity = rows.map((row) => Object.values(row)[0]).join('; ')
  } finally {
    db.close()
  }
  return integrity
}

/** 读回表行数，供 manifest 说明 JSONL/来源状态/查询表是否真的落盘。 */
function databaseCounts(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return {
      trials: db.prepare('SELECT COUNT(*) AS n FROM trials').get().n,
      sourceStatuses: db.prepare('SELECT COUNT(*) AS n FROM source_statuses').get().n,
      queries: db.prepare('SELECT COUNT(*) AS n FROM queries').get().n,
    }
  } finally {
    db.close()
  }
}

function safeSnapshotPath(root, relative, label, errors) {
  if (typeof relative !== 'string' || !relative) {
    errors.push(`${label}: missing stored path`)
    return null
  }
  if (relative.startsWith('/') || relative.includes('\\')) {
    errors.push(`${label}: unsafe stored path ${JSON.stringify(relative)}`)
    return null
  }
  const segments = relative.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    errors.push(`${label}: unsafe stored path ${JSON.stringify(relative)}`)
    return null
  }
  const absolute = resolve(root, relative)
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    errors.push(`${label}: stored path escapes snapshot ${JSON.stringify(relative)}`)
    return null
  }
  return absolute
}

async function listFilesUnder(root, relative) {
  const found = []
  const walk = async (absolute, prefix) => {
    let entries
    try {
      entries = await readdir(absolute, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const childRelative = `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(join(absolute, entry.name), childRelative)
      } else {
        found.push(childRelative)
      }
    }
  }
  await walk(join(root, relative), relative)
  return found
}

/**
 * 复算 manifest 声明的 JSONL/SQLite 哈希，以及 `pages/` 下原始版本响应与分页文件的
 * 哈希、字节数、令牌链和页序。现有 `check-trial-snapshot.mjs` 只检查 manifest.files，
 * **不读取 `pages/`**；需要核验原始响应时必须调用本函数。
 *
 * @returns {{ok: boolean, errors: string[], checked: {files: number, versions: number, pages: number}}}
 */
export async function verifySnapshotHashes(outDir) {
  return verifySnapshotEvidence(outDir, false)
}

async function verifySnapshotEvidence(outDir, allowPending, candidate = null) {
  const root = resolve(outDir)
  const errors = []
  const checked = { files: 0, versions: 0, pages: 0 }
  let manifest
  try {
    manifest = candidate ?? JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
  } catch (error) {
    return { ok: false, errors: [`cannot read manifest.json: ${error.message}`], checked }
  }

  if (!allowPending && (manifest.status === 'PENDING' || !manifest.integrity?.rawFiles)) {
    errors.push('manifest is pending raw evidence verification')
  }

  const manifestFiles = manifest.files && typeof manifest.files === 'object' ? manifest.files : {}
  if (!Object.keys(manifestFiles).length) errors.push('manifest.files is empty')
  for (const name of Object.keys(manifestFiles)) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      errors.push(`manifest filename is not a plain file name: ${JSON.stringify(name)}`)
      continue
    }
    const absolute = safeSnapshotPath(root, name, `manifest.files[${name}]`, errors)
    if (!absolute) continue
    let bytes
    try {
      bytes = await readFile(absolute)
    } catch (error) {
      errors.push(`cannot read ${name}: ${error.message}`)
      continue
    }
    const expected = manifestFiles[name] ?? {}
    if (expected.sha256 !== sha256(bytes)) errors.push(`SHA-256 mismatch for ${name}`)
    if (expected.bytes !== bytes.length) errors.push(`byte length mismatch for ${name}`)
    checked.files += 1
  }

  const expectedPageFiles = new Set()
  for (const [label, version] of [
    ['api.version', manifest.api?.version],
    ['api.after', manifest.api?.after],
  ]) {
    if (!version) continue
    if (!version.storedAs) {
      if (version.state === 'OK') errors.push(`${label}: state OK but no stored raw response`)
      continue
    }
    const absolute = safeSnapshotPath(root, version.storedAs, `${label}.storedAs`, errors)
    if (!absolute) continue
    expectedPageFiles.add(version.storedAs)
    let bytes
    try {
      bytes = await readFile(absolute)
    } catch (error) {
      errors.push(`${label}: cannot read ${version.storedAs}: ${error.message}`)
      continue
    }
    if (version.sha256 !== sha256(bytes)) errors.push(`${label}: SHA-256 mismatch`)
    if (version.bytes !== bytes.length) errors.push(`${label}: byte length mismatch`)
    checked.versions += 1
  }

  for (const query of Array.isArray(manifest.queries) ? manifest.queries : []) {
    const pages = Array.isArray(query.pages) ? query.pages : []
    if (Number.isInteger(query.pageCount) && query.pageCount !== pages.length) {
      errors.push(`${query.queryId}: pageCount ${query.pageCount} != pages ${pages.length}`)
    }
    const seenTokens = new Set()
    let previousNextToken = null
    let successPageCounts = true
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      if (page.page !== index + 1) {
        errors.push(`${query.queryId}: page out of order at index ${index} (got ${page.page})`)
      }
      if (index === 0) {
        if (page.pageToken !== null) errors.push(`${query.queryId}: first pageToken must be null`)
      } else {
        if (page.pageToken === null) {
          errors.push(`${query.queryId}: page ${page.page} has no pageToken`)
        } else {
          if (page.pageToken !== previousNextToken) {
            errors.push(`${query.queryId}: token chain broken at page ${page.page}`)
          }
          if (seenTokens.has(page.pageToken)) {
            errors.push(`${query.queryId}: repeated pageToken at page ${page.page}`)
          }
          seenTokens.add(page.pageToken)
        }
      }
      if (!Number.isInteger(page.studyCount)) successPageCounts = false
      // 令牌链来自 manifest 的页记录，不依赖原始文件能否读取。
      previousNextToken = page.nextPageToken
      if (!page.storedAs) {
        // 页记录存在但原始响应没落盘（例如 page_store_failed）同样是证据缺口。
        errors.push(`${query.queryId} page ${page.page}: no stored raw response`)
        continue
      }
      const absolute = safeSnapshotPath(root, page.storedAs, `${query.queryId} page ${page.page}`, errors)
      if (!absolute) continue
      expectedPageFiles.add(page.storedAs)
      let bytes
      try {
        bytes = await readFile(absolute)
      } catch (error) {
        errors.push(`${query.queryId} page ${page.page}: cannot read ${page.storedAs}: ${error.message}`)
        continue
      }
      if (page.sha256 !== sha256(bytes)) {
        errors.push(`${query.queryId} page ${page.page}: SHA-256 mismatch`)
      }
      if (page.bytes !== bytes.length) {
        errors.push(`${query.queryId} page ${page.page}: byte length mismatch`)
      }
      checked.pages += 1
    }
    if (query.state === 'SUCCESS' || query.state === 'SUCCESS_ZERO') {
      if (!pages.length) errors.push(`${query.queryId}: success query has no page evidence`)
      if (previousNextToken !== null) {
        errors.push(`${query.queryId}: success query's last page still has nextPageToken`)
      }
      if (!successPageCounts) errors.push(`${query.queryId}: success query has a page without studyCount`)
    }
    if (pages.length && Number.isInteger(query.totalCount)) {
      if (query.firstPageTotal !== query.totalCount) {
        errors.push(`${query.queryId}: firstPageTotal ${query.firstPageTotal} != totalCount ${query.totalCount}`)
      }
      if (pages[0].totalCount !== query.totalCount) {
        errors.push(`${query.queryId}: first page totalCount ${pages[0].totalCount} != query totalCount ${query.totalCount}`)
      }
    }
    if (successPageCounts && Number.isInteger(query.preDedupCount)) {
      const summed = pages.reduce((sum, page) => sum + page.studyCount, 0)
      if (summed !== query.preDedupCount) {
        errors.push(`${query.queryId}: page studyCount sum ${summed} != preDedupCount ${query.preDedupCount}`)
      }
    }
  }

  let actualPageFiles = []
  try {
    actualPageFiles = await listFilesUnder(root, 'pages')
  } catch (error) {
    errors.push(`cannot list pages/: ${error.message}`)
  }
  for (const relative of actualPageFiles) {
    if (!expectedPageFiles.has(relative)) errors.push(`unexpected raw file under pages/: ${relative}`)
  }
  for (const relative of expectedPageFiles) {
    if (!actualPageFiles.includes(relative)) errors.push(`missing raw file under pages/: ${relative}`)
  }

  return { ok: errors.length === 0, errors, checked }
}

/**
 * 原子加锁并确认目标目录为空。返回 release 函数；调用方必须在 finally 中释放。
 * 锁文件与并发检查避免两个采集同时写同一快照，也避免覆盖已有文件。
 */
async function prepareOutDir(outDir) {
  await mkdir(outDir, { recursive: true })
  const lockPath = join(outDir, OUTPUT_LOCK_FILE)
  let handle
  try {
    handle = await open(lockPath, 'wx')
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `output directory ${outDir} is locked by another run (${OUTPUT_LOCK_FILE}); refusing concurrent writes. Remove the lock only after confirming no run is active.`,
      )
    }
    throw new Error(`cannot create output lock in ${outDir}: ${error.message}`)
  }
  let released = false
  const release = async () => {
    if (released) return
    released = true
    try {
      await handle.close()
    } catch {
      // 锁句柄关闭失败不应掩盖原始错误；文件仍会被删除。
    }
    await rm(lockPath, { force: true })
  }
  try {
    await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, 'utf8')
    const entries = await readdir(outDir)
    const remaining = entries.filter((name) => name !== OUTPUT_LOCK_FILE)
    if (remaining.length) {
      throw new Error(
        `output directory ${outDir} is not empty; refusing to overwrite an existing snapshot`,
      )
    }
  } catch (error) {
    await release()
    throw error
  }
  return release
}

function validateAliases(aliases) {
  if (!Array.isArray(aliases) || !aliases.length) throw new Error('aliases must be a non-empty array')
  const seen = new Set()
  for (const alias of aliases) {
    if (typeof alias !== 'string' || !alias.trim()) throw new Error('every alias must be a non-empty string')
    if (seen.has(alias)) throw new Error(`duplicate alias: ${alias}`)
    seen.add(alias)
  }
}

/**
 * 执行一次快照。`fetchImpl` 可注入（测试必须注入，避免测试联网）；CLI 使用全局 fetch。
 * 返回 { outDir, manifest, exitCode }；exitCode 只在 CTG 全部查询成功时才是 0。
 */
export async function runSnapshot({
  outDir,
  endDate,
  months = PREFERRED_MONTHS,
  expansionReason,
  apiBase = DEFAULT_API_BASE,
  pageSize = DEFAULT_PAGE_SIZE,
  aliases = BEHCET_ALIASES,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  maxPages = 1000,
  now = () => new Date(),
  onPublicationStage = () => {}, // 测试用：在发布窗口模拟进程中断
} = {}) {
  if (!outDir) throw new Error('--out is required; no default production path is used')
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl must be a function')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive integer')
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be a positive integer')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be an integer 1..${MAX_PAGE_SIZE}, got ${pageSize}`)
  }
  validateAliases(aliases)

  const clock = () => {
    const value = now()
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error('now() returned an invalid date')
    return date
  }

  const resolvedOut = resolve(outDir)
  const startedAt = clock()
  const snapshotDate = formatDate(startedAt)
  const window = buildWindow({
    endDate: endDate ?? snapshotDate,
    months,
    expansionReason,
    today: snapshotDate,
  })
  const base = normaliseApiBase(apiBase)
  const releaseOutDir = await prepareOutDir(resolvedOut)

  try {
    const version = await fetchVersion({
      apiBase: base,
      outDir: resolvedOut,
      fetchImpl,
      timeoutMs,
      now: clock,
    })

    const queryResults = []
    for (const [index, alias] of aliases.entries()) {
      const result = await collectAliasQuery({
        alias,
        index,
        apiBase: base,
        window,
        pageSize,
        outDir: resolvedOut,
        fetchImpl,
        timeoutMs,
        maxPages,
        now: clock,
        queryDate: snapshotDate,
        dataTimestamp: version.dataTimestamp,
      })
      result.query.apiVersion = version.apiVersion
      queryResults.push(result)
    }

    // 采集结束后再取一次版本元数据。分页期间数据时间变化、或事后版本不可读，都意味着
    // 这份快照可能混合了两个上游时间点，不能标 COMPLETE。
    const versionAfter = await fetchVersion({
      apiBase: base,
      outDir: resolvedOut,
      fetchImpl,
      timeoutMs,
      now: clock,
      fileName: 'version-after.json',
    })
    const timestampsComparable = Boolean(version.dataTimestamp && versionAfter.dataTimestamp)
    const dataTimestampChanged = timestampsComparable && version.dataTimestamp !== versionAfter.dataTimestamp
    const apiVersionChanged = Boolean(version.apiVersion && versionAfter.apiVersion && version.apiVersion !== versionAfter.apiVersion)
    const versionStable = version.state === 'OK' && versionAfter.state === 'OK' && timestampsComparable && !dataTimestampChanged && !apiVersionChanged
    const channelApiState = version.state === 'FAILED'
      ? 'FAILED'
      : version.state === 'OK' && versionStable
        ? 'OK'
        : 'INCOMPLETE'

    const recordsById = new Map()
    for (const { query, studies } of queryResults) {
      if (query.state !== 'SUCCESS' && query.state !== 'SUCCESS_ZERO') continue
      for (const study of studies) {
        const nctId = study?.protocolSection?.identificationModule?.nctId
        if (!textOrNull(nctId)) continue
        const row = normaliseStudy(study, { snapshotDate, retrievedAt: query.completedAt })
        if (!recordsById.has(row.recordId)) {
          recordsById.set(row.recordId, { ...row, mergedSources: [query.alias] })
        } else {
          const existing = recordsById.get(row.recordId)
          existing.mergedSources = uniqueSorted([...existing.mergedSources, query.alias])
        }
      }
    }
    const records = [...recordsById.values()].sort((a, b) =>
      a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0,
    )

    const queries = queryResults.map((result) => result.query)
    const channelState = deriveChannelState(queries, channelApiState)
    let status = overallStatusFor(channelState)
    const totalPages = queries.reduce((sum, query) => sum + query.pageCount, 0)

    const statusRows = []
    for (const channel of CHANNELS) {
      if (channel.queryable) {
        const errors = queries.flatMap((query) => query.errors.map((entry) => `${query.queryId} ${entry.code}: ${entry.message}`))
        if (version.error) errors.unshift(`version: ${version.error}`)
        statusRows.push(sourceStatusRow({
          scope: 'channel',
          sourceId: channel.sourceId,
          state: channelState,
          queryDate: snapshotDate,
          windowStart: window.start,
          windowEnd: window.end,
          // 通道级没有单一 HTTP 状态：版本请求和各页请求的状态分别在 api/queries/pages。
          httpStatus: null,
          pageCount: totalPages,
          totalCount: records.length,
          preDedupCount: queries.reduce((sum, query) => sum + query.preDedupCount, 0),
          uniqueRecords: records.length,
          queryUrl: `${base}/studies`,
          error: errors.length ? errors.slice(0, 10).join(' | ') : null,
          retrievedAt: clock().toISOString(),
        }))
      } else {
        statusRows.push(sourceStatusRow({
          scope: 'channel',
          sourceId: channel.sourceId,
          state: 'NOT_QUERIED',
          // 未查询的来源不填窗口、HTTP、页数或条数：这些字段一旦有值就会被误读为已查。
          error: channel.note,
        }))
      }
    }
    for (const query of queries) {
      statusRows.push(sourceStatusRow({
        scope: 'query',
        sourceId: query.sourceId,
        query: query.alias,
        state: query.state,
        queryDate: query.queryDate,
        windowStart: query.windowStart,
        windowEnd: query.windowEnd,
        // 页二 500 时不能把首页 200 当作整条查询的 HTTP 结果。
        httpStatus: query.failedHttpStatus ?? query.httpStatus,
        lastHttpStatus: query.lastHttpStatus,
        failedHttpStatus: query.failedHttpStatus,
        failedPage: query.failedPage,
        pageCount: query.pageCount,
        totalCount: query.totalCount,
        preDedupCount: query.preDedupCount,
        uniqueRecords: query.uniqueRecordCount,
        queryUrl: query.queryUrl,
        error: query.errors.length
          ? query.errors.map((entry) => `${entry.code}: ${entry.message}`).join(' | ')
          : null,
        errorCount: query.errors.length,
        truncatedErrors: query.truncatedErrors,
        retrievedAt: query.completedAt,
      }))
    }

    const jsonl = records.map((row) => JSON.stringify(row)).join('\n') + (records.length ? '\n' : '')
    const jsonlPath = join(resolvedOut, 'trials.jsonl')
    await writeFile(jsonlPath, jsonl, 'utf8')

    const databasePath = join(resolvedOut, 'trials.sqlite')
    const sqliteIntegrity = createDatabase(databasePath, records, statusRows, queries)
    let dbCounts = null
    let dbCountsError = null
    try {
      dbCounts = databaseCounts(databasePath)
    } catch (error) {
      dbCountsError = error.message
    }
    const jsonlMatchesDb = Boolean(
      dbCounts &&
      dbCounts.trials === records.length &&
      dbCounts.sourceStatuses === statusRows.length &&
      dbCounts.queries === queries.length,
    )
    const databaseIntegrityOk = sqliteIntegrity === 'ok' && jsonlMatchesDb

    const files = {}
    for (const name of ['trials.jsonl', 'trials.sqlite']) {
      const bytes = await readFile(join(resolvedOut, name))
      files[name] = { sha256: sha256(bytes), bytes: bytes.length }
    }

    const errors = []
    if (version.state !== 'OK') {
      errors.push({ scope: 'api', code: version.state === 'INCOMPLETE' ? 'version_metadata_missing' : 'version_failed', message: version.error })
    }
    for (const query of queries) {
      for (const entry of query.errors) {
        errors.push({ scope: 'query', queryId: query.queryId, alias: query.alias, ...entry })
      }
    }
    if (versionAfter.state !== 'OK') {
      errors.push({
        scope: 'api',
        code: versionAfter.state === 'INCOMPLETE' ? 'version_after_incomplete' : 'version_after_failed',
        message: versionAfter.error ?? 'post-collection /version request did not return usable metadata',
      })
    } else if (dataTimestampChanged) {
      errors.push({
        scope: 'api',
        code: 'version_changed',
        message: `dataTimestamp changed during collection: ${version.dataTimestamp} -> ${versionAfter.dataTimestamp}; snapshot may mix upstream time points`,
      })
    } else if (apiVersionChanged) {
      errors.push({
        scope: 'api',
        code: 'version_changed',
        message: `apiVersion changed during collection: ${version.apiVersion} -> ${versionAfter.apiVersion}`,
      })
    }
    // 查询可能全部成功，但版本前后变化/事后不可读时整份快照仍是不完整；
    // 不把已经 FAILED 的快照反向改成较温和的状态。采集前版本就不完整时保持
    // PARTIAL（已有 version_metadata_missing 说明），不额外升级成 INCOMPLETE。
    const versionAfterProblem = versionAfter.state !== 'OK' || dataTimestampChanged || apiVersionChanged
    if (versionAfterProblem && status !== 'FAILED') status = 'INCOMPLETE'
    if (!databaseIntegrityOk) {
      errors.push({
        scope: 'integrity',
        code: 'db_integrity_failed',
        message: dbCountsError ?? `sqlite=${sqliteIntegrity}; dbCounts=${JSON.stringify(dbCounts)}`,
      })
      // 检索本身可能成功，但落盘复核失败时整份快照不能标 COMPLETE；来源状态保持
      // 查询终态，快照级 status 与 errors 负责说明完整性失败。已 FAILED 的快照
      // 不能被较温和的 INCOMPLETE 覆盖。
      if (status !== 'FAILED') status = 'INCOMPLETE'
    }

    const generatedAt = clock().toISOString()
    const manifest = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      kind: SNAPSHOT_KIND,
      timezone: 'UTC',
      startedAt: startedAt.toISOString(),
      generatedAt,
      snapshotDate,
      status,
      exitCode: status === 'COMPLETE' ? 0 : 1,
      scope: 'M4 research preparation snapshot; ClinicalTrials.gov only; not a production database, not a four-channel search, not an eligibility assessment.',
      window,
      aliases: [...aliases],
      dedupe: {
        key: 'NCTId',
        scope: 'across all queried aliases of this snapshot',
        note: 'Different aliases remain separate queries; one registration can list several hit aliases in mergedSources.',
      },
      api: {
        sourceId: SOURCE_ID,
        baseUrl: base,
        customApiBase: base !== normaliseApiBase(DEFAULT_API_BASE),
        state: version.state,
        httpStatus: version.httpStatus,
        version,
        after: versionAfter,
        afterState: versionAfter.state,
        dataTimestampChanged,
        apiVersionChanged,
        collectionStable: versionStable,
      },
      queries,
      sources: CHANNELS.map((channel) => {
        if (!channel.queryable) {
          return {
            sourceId: channel.sourceId,
            label: channel.label,
            url: channel.url,
            queried: false,
            state: 'NOT_QUERIED',
            queryDate: null,
            windowStart: null,
            windowEnd: null,
            queryCount: 0,
            pageCount: null,
            totalCount: null,
            uniqueRecords: null,
            note: channel.note,
          }
        }
        const channelErrors = queries.flatMap((query) => query.errors)
        return {
          sourceId: channel.sourceId,
          label: channel.label,
          url: channel.url,
          queried: true,
          state: channelState,
          queryDate: snapshotDate,
          windowStart: window.start,
          windowEnd: window.end,
          apiVersion: version.apiVersion,
          dataTimestamp: version.dataTimestamp,
          dataTimestampAfter: versionAfter.dataTimestamp,
          dataTimestampChanged,
          queryCount: queries.length,
          pageCount: totalPages,
          totalCount: records.length,
          preDedupCount: queries.reduce((sum, query) => sum + query.preDedupCount, 0),
          uniqueRecords: records.length,
          errorCount: channelErrors.length
            + (version.state === 'OK' ? 0 : 1)
            + (versionAfter.state === 'OK' ? 0 : 1)
            + (dataTimestampChanged || apiVersionChanged ? 1 : 0),
          note: channel.note,
        }
      }),
      stateDefinitions: {
        SUCCESS: 'All pages read; HTTP/JSON valid; paged and unique NCT counts match first-page totalCount; every studyFirstPostDate is inside the window; before/after version metadata agree.',
        SUCCESS_ZERO: 'Same evidence as SUCCESS, with totalCount=0 from one empty page and no nextPageToken.',
        PARTIAL: 'Some but not all alias queries succeeded, or the pre-collection API version/metadata request failed/incomplete.',
        INCOMPLETE: 'Response was readable but pagination, counts, token chain, window dates, before/after version metadata, or integrity evidence did not close.',
        FAILED: 'At least one query hit a fatal HTTP/network/parse/shape/store error; no records from that query are merged.',
        NOT_QUERIED: 'No request was made to this source; never a zero result.',
      },
      coverage: {
        queriedSources: [SOURCE_ID],
        notQueriedSources: CHANNELS.filter((channel) => !channel.queryable).map((channel) => channel.sourceId),
        note: 'NOT_QUERIED means no request was made to that source; it is never a zero result and does not show the source has no relevant studies.',
      },
      // check-trial-snapshot.mjs 的固定契约；counts 里保留同名值，生成时只写一次。
      recordCount: records.length,
      dbCount: records.length,
      sourceStatusRows: statusRows.length,
      counts: {
        jsonlRecords: records.length,
        dbRecords: records.length,
        sourceStatusRows: statusRows.length,
        queryRows: queries.length,
        queryPages: totalPages,
        uniqueRecordIds: recordsById.size,
        errors: errors.length,
        note: 'Channel totalCount/uniqueRecords are after NCT dedupe; per-query server totalCount and preDedupCount are in queries and source_statuses.',
      },
      integrity: {
        sqlite: sqliteIntegrity,
        jsonlMatchesDb,
        dbCounts,
        dbCountsError,
      },
      files,
      errors,
    }

    const pendingManifest = { ...manifest, status: 'PENDING', exitCode: 1, files: {} }
    await writeFile(join(resolvedOut, 'manifest.json'), `${JSON.stringify(pendingManifest, null, 2)}\n`, 'utf8')
    await onPublicationStage('pending')

    // 写盘后立即用可复用核验函数复算原始分页/版本文件与令牌链。现有 checker 不读
    // pages/，所以这一步不能由 checker 的 PASS 代替。
    let rawVerification
    try {
      rawVerification = await verifySnapshotEvidence(resolvedOut, true, manifest)
    } catch (error) {
      rawVerification = {
        ok: false,
        errors: [`raw hash verification crashed: ${error.message}`],
        checked: { files: 0, versions: 0, pages: 0 },
      }
    }
    manifest.integrity.rawFiles = rawVerification
    if (!rawVerification.ok) {
      // 原始文件核验失败不能把已经 FAILED 的快照“降级”成较温和的 INCOMPLETE。
      if (manifest.status !== 'FAILED') manifest.status = 'INCOMPLETE'
      manifest.exitCode = 1
      manifest.errors.push({
        scope: 'integrity',
        code: 'raw_hash_mismatch',
        message: rawVerification.errors.slice(0, 5).join(' | '),
      })
      manifest.counts.errors = manifest.errors.length
    }
    const temporaryManifest = join(resolvedOut, 'manifest.json.tmp')
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await onPublicationStage('before-rename')
    await rename(temporaryManifest, join(resolvedOut, 'manifest.json'))

    return { outDir: resolvedOut, manifest, exitCode: manifest.exitCode }
  } finally {
    await releaseOutDir()
  }
}

export function parseArgs(argv) {
  const options = {
    outDir: null,
    endDate: null,
    months: PREFERRED_MONTHS,
    expansionReason: null,
    apiBase: DEFAULT_API_BASE,
    pageSize: DEFAULT_PAGE_SIZE,
    timeoutMs: 30_000,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const takeValue = () => {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--out') options.outDir = takeValue()
    else if (arg === '--end-date') options.endDate = takeValue()
    else if (arg === '--months') options.months = Number(takeValue())
    else if (arg === '--expansion-reason') options.expansionReason = takeValue()
    else if (arg === '--api-base') options.apiBase = takeValue()
    else if (arg === '--page-size') options.pageSize = Number(takeValue())
    else if (arg === '--timeout-ms') options.timeoutMs = Number(takeValue())
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!options.help && !options.outDir) throw new Error('--out is required; no default output path is used')
  if (!Number.isInteger(options.months)) throw new Error('--months must be an integer')
  if (!Number.isInteger(options.pageSize)) throw new Error('--page-size must be an integer')
  if (!Number.isInteger(options.timeoutMs)) throw new Error('--timeout-ms must be an integer')
  return options
}

function printHelp() {
  console.log(`Usage: node scripts/fetch-behcet-trials-2026.mjs --out <new-directory> [options]

  --out <dir>              必填。必须不存在或为空；建议使用仓库外受控目录。
                           原始响应可能包含联系方式，请勿提交。
  --end-date <YYYY-MM-DD>  窗口结束日（含）。默认运行当天（UTC）。
  --months <n>             1..12，默认 9；>9 必须给 --expansion-reason。
  --expansion-reason <s>   仅记录扩窗理由，不代表已获批准。
  --api-base <url>         默认 ${DEFAULT_API_BASE}。
  --page-size <n>          1..${MAX_PAGE_SIZE}，默认 ${DEFAULT_PAGE_SIZE}。
  --timeout-ms <n>         单次请求超时，默认 30000。
`)
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      printHelp()
    } else {
      const result = await runSnapshot(options)
      const ctg = result.manifest.sources.find((source) => source.sourceId === SOURCE_ID)
      console.log(`SNAPSHOT ${result.outDir}`)
      console.log(`  ClinicalTrials.gov: ${ctg.state} (${ctg.queryCount} queries, ${ctg.pageCount} pages, ${ctg.uniqueRecords} unique records)`)
      for (const source of result.manifest.sources.filter((entry) => !entry.queried)) {
        console.log(`  ${source.sourceId}: NOT_QUERIED (not zero)`)
      }
      console.log(`  status: ${result.manifest.status}`)
      if (result.manifest.errors.length) {
        for (const error of result.manifest.errors.slice(0, 20)) {
          const where = error.queryId ? `${error.queryId}: ` : ''
          console.error(`  ERROR ${where}${error.code}: ${error.message}`)
        }
      }
      process.exitCode = result.exitCode
    }
  } catch (error) {
    console.error(`FAIL ${error.message}`)
    process.exitCode = 2
  }
}