#!/usr/bin/env node
/**
 * 临床快照误提交检查器。
 *
 * 场景：本工作台的 CTG 原始响应、SQLite 快照和用户数据目录都不应该进入 Git。
 * 采集脚本的输出路径保护仍在完善；本检查用于发现
 * `git add -f _private/...`、把页面复制到 `exports/`、或把数据库改名后提交。
 * 本脚本只读 Git 索引（staged）和 HEAD 树（tracked），不读未跟踪工作区，
 * 输出只有“路径 + 规则”，不打印 blob 内容、邮箱、电话或匹配片段。
 *
 * 规则（输出即为规则 ID）：
 *   PRIVATE_DIR        `_private` 任意层级；仓库根的 `input/`、`output/`
 *   RAW_RESPONSE_DIR   `research/<run>/pages/` 原始响应目录
 *   SQLITE_DB          `.sqlite`/`.sqlite3`/`.db`/`.db3`，或文件头 `SQLite format 3\0`
 *   SQLITE_SIDECAR     `.sqlite-wal`、`.sqlite-shm`、`.sqlite-journal` 等旁路文件
 *   CTG_RAW_PAGE       ClinicalTrials.gov API 分页响应结构（`totalCount`+`studies`，
 *                      每条 `studies[i].protocolSection.identificationModule.nctId`）
 *   CONTACT_FIELDS     CTG 结构中的 `centralContacts` / `contactsLocationsModule`
 *                      联系人条目，且至少有一个非空姓名、邮箱或电话
 *
 * 为什么不裸扫 `email=`/`@` 或 `contacts`：
 *   普通文献、BibTeX、package.json 作者邮箱、通用通讯录 JSON 都会因此误报。
 *   本脚本只解析 JSON/JSONL 结构，且只认 CTG 的专属键名和嵌套形状；不解析
 *   PDF、HTML、Markdown、源码文本。因此它是**结构检查器**，不是内容分类器。
 *
 * 明确不检查（不能把 PASS 当安全证明）：
 *   - 未跟踪/未 staged 的工作区文件；
 *   - HEAD 之前的历史提交、tag、reflog；
 *   - 超过 8 MiB 的 blob；解码失败/二进制 blob 的正文；
 *   - PDF/HTML/Markdown/源码中夹带的联系方式；
 *   - 改名后的 SQLite sidecar、加密容器、压缩包内文件；
 *   - commit message、Git notes、LFS 指针指向的远端对象。
 *   已提交过的敏感 blob 不能靠“下一次删除”消除：脚本仍会从 HEAD 报出。
 *
 * 用法：
 *   node scripts/check-clinical-snapshot-commit.mjs [--root <目录>]
 * 退出码：0 无命中 / 1 有命中 / 2 用法或 Git 读取失败
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const MAX_CONTENT_BYTES = 8 * 1024 * 1024
const MAX_JSON_NODES = 2_000_000
const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'latin1')
const NOT_JSON = Symbol('not-json')

const RULE = Object.freeze({
  PRIVATE_DIR: 'PRIVATE_DIR',
  RAW_RESPONSE_DIR: 'RAW_RESPONSE_DIR',
  SQLITE_DB: 'SQLITE_DB',
  SQLITE_SIDECAR: 'SQLITE_SIDECAR',
  CTG_RAW_PAGE: 'CTG_RAW_PAGE',
  CONTACT_FIELDS: 'CONTACT_FIELDS',
})

const HELP = `用法：node scripts/check-clinical-snapshot-commit.mjs [--root <目录>]

检查 Git staged blobs 与 HEAD 已跟踪 blobs，输出格式为 <路径>\\t<规则>。
规则：
  PRIVATE_DIR        _private 任意层级，或仓库根的 input/、output/
  RAW_RESPONSE_DIR   research/**/pages/ 原始响应目录
  SQLITE_DB          SQLite 数据库（扩展名或文件头）
  SQLITE_SIDECAR     SQLite -wal / -shm / -journal 旁路文件
  CTG_RAW_PAGE       ClinicalTrials.gov 分页响应结构
  CONTACT_FIELDS     CTG 联系人字段（姓名/电话/邮箱）

退出码：0 无命中 / 1 有命中 / 2 参数或 Git 读取失败。
局限：静态结构检查，不读未跟踪文件；只解析 JSON/JSONL，不解析 PDF/HTML/源码；
      不查历史提交；超过 8 MiB 的 blob 只做路径规则；已提交的敏感 blob 仍会从 HEAD 报出。`

function usageError(message) {
  console.error(`clinical-snapshot-commit: ${message}`)
  process.exit(2)
}

function showHelp() {
  console.log(HELP)
  process.exit(0)
}

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) showHelp()

let rootArg = '.'
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--root') {
    if (!argv[i + 1]) usageError('--root 需要一个目录参数')
    rootArg = argv[++i]
  } else if (arg.startsWith('--root=')) {
    rootArg = arg.slice('--root='.length)
  } else if (arg.startsWith('-')) {
    usageError(`未知参数：${arg}`)
  } else if (rootArg === '.') {
    rootArg = arg
  } else {
    usageError('只接受一个目录参数')
  }
}

const requestedRoot = resolve(rootArg)

function runGit(root, args, { encoding = 'utf8', input, maxBuffer = 64 * 1024 * 1024 } = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding,
    input,
    maxBuffer,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C',
    },
  })
}

const topLevel = runGit(requestedRoot, ['rev-parse', '--show-toplevel'])
if (topLevel.error) usageError('需要可用的 git 命令')
if (topLevel.status !== 0) usageError('当前目录不在 Git 工作树内')
const repoRoot = String(topLevel.stdout || '').trim()
if (!repoRoot) usageError('无法确定 Git 工作树根目录')

/** 解析 `git ls-files --stage -z`。冲突阶段 1/2/3 也要查，不能只看 stage 0。 */
function parseIndex(buffer) {
  const entries = []
  for (const record of buffer.toString('utf8').split('\u0000')) {
    if (!record) continue
    const tab = record.indexOf('\t')
    if (tab < 0) continue
    const [mode, sha] = record.slice(0, tab).split(' ')
    if (!/^(?:100644|100755|120000)$/.test(mode)) continue
    if (!sha) continue
    entries.push({ path: record.slice(tab + 1), sha })
  }
  return entries
}

/** 解析 `git ls-tree -r -z --full-tree HEAD`，只收 blob。 */
function parseTree(buffer) {
  const entries = []
  for (const record of buffer.toString('utf8').split('\u0000')) {
    if (!record) continue
    const tab = record.indexOf('\t')
    if (tab < 0) continue
    const [mode, type, sha] = record.slice(0, tab).split(' ')
    if (mode === '160000' || type !== 'blob' || !sha) continue
    entries.push({ path: record.slice(tab + 1), sha })
  }
  return entries
}

const indexResult = runGit(repoRoot, ['ls-files', '--stage', '-z'], { encoding: null })
if (indexResult.status !== 0) usageError('无法读取 Git 索引')
const indexEntries = parseIndex(indexResult.stdout)

const headCheck = runGit(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'])
if (headCheck.error) usageError('需要可用的 git 命令')
let headEntries = []
if (headCheck.status === 0) {
  const treeResult = runGit(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { encoding: null })
  if (treeResult.status !== 0) usageError('无法读取 HEAD 树')
  headEntries = parseTree(treeResult.stdout)
}

/** 路径按 Git 的 POSIX 分隔符判断；根级数据目录只认 input/output，避免误伤 docs/input。 */
function pathRules(path) {
  const rules = new Set()
  const segments = path.split('/')
  const lower = segments.map((segment) => segment.toLowerCase())

  if (segments.includes('_private')) rules.add(RULE.PRIVATE_DIR)
  if (segments.length > 1 && (lower[0] === 'input' || lower[0] === 'output')) {
    rules.add(RULE.PRIVATE_DIR)
  }

  const researchAt = lower.indexOf('research')
  const pagesAt = lower.lastIndexOf('pages')
  if (researchAt >= 0 && pagesAt > researchAt) rules.add(RULE.RAW_RESPONSE_DIR)

  const base = lower[lower.length - 1] || ''
  if (/(?:\.sqlite3?|\.db3?)-(?:wal|shm|journal)$/.test(base)) {
    rules.add(RULE.SQLITE_SIDECAR)
  } else if (/(?:\.sqlite3?|\.db3?)$/.test(base)) {
    rules.add(RULE.SQLITE_DB)
  }
  return rules
}

const byPath = new Map()
const indexPaths = new Set()
const headPaths = new Set()
for (const entry of indexEntries) {
  indexPaths.add(entry.path)
  if (!byPath.has(entry.path)) byPath.set(entry.path, new Set())
  byPath.get(entry.path).add(entry.sha)
}
for (const entry of headEntries) {
  headPaths.add(entry.path)
  if (!byPath.has(entry.path)) byPath.set(entry.path, new Set())
  byPath.get(entry.path).add(entry.sha)
}

const allShas = [...new Set([...indexEntries, ...headEntries].map((entry) => entry.sha))]

/** 一次性取 blob 大小，避免对超大文件读正文；失败时逐 blob 读并靠 maxBuffer 兜底。 */
function readBlobSizes(shas) {
  const sizes = new Map()
  if (!shas.length) return sizes
  const result = runGit(repoRoot, ['cat-file', '--batch-check'], {
    input: `${shas.join('\n')}\n`,
  })
  if (result.status !== 0) return sizes
  for (const line of String(result.stdout || '').split('\n')) {
    if (!line) continue
    const [sha, type, sizeText] = line.split(' ')
    const size = Number(sizeText)
    if (type === 'blob' && Number.isSafeInteger(size) && size >= 0) sizes.set(sha, size)
  }
  return sizes
}

const blobSizes = readBlobSizes(allShas)
const blobCache = new Map()
const inspectedShas = new Set()
const skippedShas = new Set()
const contentCache = new Map()

function readBlob(sha) {
  if (blobCache.has(sha)) return blobCache.get(sha)
  const result = runGit(repoRoot, ['cat-file', 'blob', sha], {
    encoding: null,
    maxBuffer: MAX_CONTENT_BYTES + 32 * 1024,
  })
  const buffer = result.status === 0 && Buffer.isBuffer(result.stdout) ? result.stdout : null
  blobCache.set(sha, buffer)
  return buffer
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasSqliteMagic(buffer) {
  return buffer.length >= SQLITE_MAGIC.length && buffer.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)
}

function tryJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return NOT_JSON
  }
}

function isJsonLinesPath(path) {
  return /\.(?:jsonl|ndjson)$/i.test(path)
}

function parseJsonLines(text) {
  const values = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const value = tryJson(line)
    if (value !== NOT_JSON) values.push(value)
  }
  return values
}

/** CTG 分页响应：非空页要求每条 study 都带 protocolSection/NCT ID；空页靠 totalCount 认。 */
function isCtgStudy(study) {
  if (!isPlainObject(study)) return false
  const protocol = study.protocolSection
  if (!isPlainObject(protocol)) return false
  const identification = protocol.identificationModule
  return isPlainObject(identification)
    && typeof identification.nctId === 'string'
    && /^NCT\d{8}$/.test(identification.nctId)
}

function isCtgPage(value) {
  if (!isPlainObject(value) || !Array.isArray(value.studies)) return false
  if (value.studies.length === 0) {
    return Number.isInteger(value.totalCount) && value.totalCount >= 0
  }
  return value.studies.every(isCtgStudy)
}

/** 联系人条目至少有一个非空姓名/电话/邮箱，空对象或只有 role 的条目不报。 */
function isContactEntry(entry) {
  if (!isPlainObject(entry)) return false
  return ['name', 'email', 'phone'].some((key) => (
    typeof entry[key] === 'string' && entry[key].trim() !== ''
  ))
}

/**
 * 只认 CTG 的专属键名：
 *   - 任意对象上的 centralContacts（CTG 的中央联系人）
 *   - contactsLocationsModule.centralContacts
 *   - contactsLocationsModule.locations[].contacts
 * 普通 `contacts` 数组不认，避免通讯录/作者列表误报。
 */
function hasContactFields(root) {
  const stack = [root]
  let visited = 0
  while (stack.length) {
    const value = stack.pop()
    if (value === null || typeof value !== 'object') continue
    visited += 1
    if (visited > MAX_JSON_NODES) return false

    if (Array.isArray(value)) {
      for (const item of value) stack.push(item)
      continue
    }
    if (!isPlainObject(value)) continue

    if (Array.isArray(value.centralContacts) && value.centralContacts.some(isContactEntry)) return true

    const module = value.contactsLocationsModule
    if (isPlainObject(module)) {
      if (Array.isArray(module.centralContacts) && module.centralContacts.some(isContactEntry)) {
        return true
      }
      if (Array.isArray(module.locations)) {
        for (const location of module.locations) {
          if (isPlainObject(location)
            && Array.isArray(location.contacts)
            && location.contacts.some(isContactEntry)) {
            return true
          }
        }
      }
    }

    for (const child of Object.values(value)) {
      if (child !== null && typeof child === 'object') stack.push(child)
    }
  }
  return false
}

function evaluateBlob(buffer, path) {
  const rules = new Set()
  if (hasSqliteMagic(buffer)) {
    rules.add(RULE.SQLITE_DB)
    return rules
  }
  if (buffer.indexOf(0) !== -1) return rules

  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
  if (!text.trim()) return rules

  const whole = tryJson(text)
  const values = whole !== NOT_JSON
    ? [whole]
    : (isJsonLinesPath(path) ? parseJsonLines(text) : [])
  for (const value of values) {
    if (isCtgPage(value)) rules.add(RULE.CTG_RAW_PAGE)
    if (hasContactFields(value)) rules.add(RULE.CONTACT_FIELDS)
  }
  return rules
}

const EMPTY_RULES = new Set()

function contentRulesFor(sha, path) {
  const key = `${sha}\u0000${isJsonLinesPath(path) ? 'jsonl' : 'json'}`
  if (contentCache.has(key)) return contentCache.get(key)

  const size = blobSizes.get(sha)
  if (Number.isSafeInteger(size) && size > MAX_CONTENT_BYTES) {
    skippedShas.add(sha)
    contentCache.set(key, EMPTY_RULES)
    return EMPTY_RULES
  }

  const buffer = readBlob(sha)
  if (buffer === null) {
    skippedShas.add(sha)
    contentCache.set(key, EMPTY_RULES)
    return EMPTY_RULES
  }

  inspectedShas.add(sha)
  const rules = evaluateBlob(buffer, path)
  contentCache.set(key, rules)
  return rules
}

const findings = []
for (const [path, shas] of byPath) {
  for (const rule of pathRules(path)) findings.push({ path, rule })
  for (const sha of shas) {
    for (const rule of contentRulesFor(sha, path)) findings.push({ path, rule })
  }
}

const seen = new Set()
const unique = findings.filter((finding) => {
  const key = `${finding.path}\u0000${finding.rule}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
unique.sort((left, right) => (
  left.path < right.path ? -1 : left.path > right.path ? 1 : left.rule < right.rule ? -1 : left.rule > right.rule ? 1 : 0
))

/** 路径里的控制字符转义，保证一行一个 finding；不改变普通路径。 */
function printablePath(path) {
  return path.replace(/[\u0000-\u001f\u007f]/g, (char) => (
    `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  ))
}

for (const finding of unique) {
  console.log(`${printablePath(finding.path)}\t${finding.rule}`)
}

const status = unique.length ? 'FAIL' : 'PASS'
console.log(
  `clinical-snapshot-commit: ${status} ${unique.length} finding(s); `
  + `${byPath.size} path(s) (${indexPaths.size} index / ${headPaths.size} HEAD); `
  + `content inspected for ${inspectedShas.size} blob(s)`,
)
if (skippedShas.size) {
  console.log(
    `clinical-snapshot-commit: content not inspected for ${skippedShas.size} oversized/unreadable blob(s); `
    + 'path rules still applied',
  )
}
if (unique.length) {
  console.log('clinical-snapshot-commit: output is path+rule only; blob content is not printed.')
  console.log('clinical-snapshot-commit: static structure check is not a safety proof; see --help for limits.')
}

process.exitCode = unique.length ? 1 : 0