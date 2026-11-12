/**
 * HTTP 层：API + 静态资源 + 路径穿越拦截。
 *
 * 边界：
 *   - API 前缀由调用方给（宿主里 `/api/behcet`）；
 *   - 静态资源只从 `public/` 出，任何路径穿越（`..`、绝对路径、符号链接逃逸）都拒绝；
 *   - 错误一律走 JSON（API）或纯文本（静态），**不留裸 throw 白屏**；
 *   - 本文件不碰 AI、不存会话：会话由宿主管理。
 */
import { readFileSync, existsSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, normalize, relative, resolve, sep } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

/** 静态根必须落在包内：解析后仍以 root 为前缀，否则拒绝。 */
export function resolveStatic(root, urlPath) {
  const clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0])
  if (clean.includes('\0')) return null
  let rel = normalize(clean).replace(/^([/\\])+/, '')
  if (rel === '.') rel = ''
  if (rel.split(/[/\\]/).includes('..')) return null
  const target = (rel === '' || rel.endsWith('/')) ? rel + 'index.html' : rel
  const abs = resolve(root, target)
  let rootReal
  try { rootReal = realpathSync(root) } catch { return null }
  let absReal
  try { absReal = realpathSync(abs) } catch { return null }
  const r = relative(rootReal, absReal)
  if (r === '' || r.startsWith('..' + sep) || r === '..' || r.startsWith(sep)) return null
  try { if (!statSync(absReal).isFile()) return null } catch { return null }
  return absReal
}

export function contentType(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

/**
 * 资料目录口径（面板与服务端同一条规则，服务端再判一遍）：
 * 主目录本身、桌面、下载根目录、tmp 一律拒绝；源码目录也不是资料目录。
 * 拒绝要给出人话理由——静默接受比报错更危险（用户以为数据在那儿，其实不在）。
 */
export function checkDataDir(raw) {
  let dir = String(raw || '').trim()
  if (!dir) return { ok: false, reason: '目录为空' }
  if (!isAbsolute(dir)) return { ok: false, reason: '请选择绝对路径' }
  dir = dir.replace(/\/+$/, '') || '/'
  if (dir === '/') return { ok: false, reason: '文件系统根目录不作为资料目录' }
  const homeExact = /^(\/Users\/[^/]+|\/home\/[^/]+|\/root|[A-Za-z]:\\Users\\[^\\]+)$/i
  if (homeExact.test(dir)) return { ok: false, reason: '主目录本身不作为资料目录，请在下面建一个专用文件夹' }
  if (/(Desktop|桌面)$/i.test(dir)) return { ok: false, reason: '桌面不作为资料目录' }
  if (/(Downloads?|下载(夹)?)$/i.test(dir)) return { ok: false, reason: '下载根目录不作为资料目录' }
  if (/^(\/tmp|\/private\/tmp|\/var\/folders\/|\/private\/var\/folders\/)/i.test(dir)) return { ok: false, reason: 'tmp 不作为资料目录（会被系统清理）' }
  return { ok: true, dir }
}

function readJson(req) {
  return new Promise((resolvePromise) => {
    let raw = ''
    req.on('data', (chunk) => { if (raw.length < 10 * 1024 * 1024) raw += chunk })
    req.on('end', () => { try { resolvePromise(JSON.parse(raw || '{}')) } catch { resolvePromise({}) } })
    req.on('error', () => resolvePromise({}))
  })
}

/**
 * @param {object} options
 * @param {string} options.apiBase   宿主里 `/api/behcet`
 * @param {string} options.publicDir 包内 public/
 * @param {object} options.services  Workbench 方法集合
 */
export function createHandler({ apiBase = '', publicDir, services }) {
  const apiPrefix = apiBase + '/api'
  const uiEntry = apiBase + '/ui/'

  const sendJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  return async function handle(req, res) {
    let url
    try { url = new URL(req.url, 'http://localhost') } catch { return sendJson(res, 400, { error: 'Bad request' }) }
    const pathname = url.pathname

    try {
      /* ---------- 静态业务界面 ---------- */
      if (pathname === apiBase + '/ui' || pathname === uiEntry.slice(0, -1)) {
        res.writeHead(302, { location: uiEntry, 'cache-control': 'no-store' })
        return res.end()
      }
      if (pathname.startsWith(uiEntry)) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' })
        if (!publicDir || !existsSync(publicDir)) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end('public dir missing') }
        const file = resolveStatic(publicDir, pathname.slice(uiEntry.length))
        if (!file) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found') }
        const body = readFileSync(file)
        res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' })
        return res.end(req.method === 'HEAD' ? undefined : body)
      }

      /* ---------- health（含旧路径兼容） ---------- */
      if (pathname === apiBase + '/health' || pathname === apiPrefix + '/health') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, { ok: true, version: services.version, apiVersion: 'v1', capabilities: services.capabilities })
      }

      /* ---------- bootstrap ---------- */
      if (pathname === apiPrefix + '/bootstrap') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, services.bootstrap())
      }

      /* ---------- 患者档案：新建 / 删除 ---------- */
      if (pathname === apiPrefix + '/subjects') {
        if (req.method === 'POST') return sendJson(res, 200, services.createSubject(await readJson(req)))
        if (req.method === 'DELETE') {
          const key = url.searchParams.get('profileKey') || ''
          return sendJson(res, 200, services.deleteSubject(key))
        }
        if (req.method === 'GET') return sendJson(res, 200, { profiles: services.listProfiles() })
        return sendJson(res, 405, { error: 'Method not allowed' })
      }

      /* ---------- 记录：读 / 整包保存 ---------- */
      const recMatch = pathname.match(new RegExp('^' + escapeRe(apiPrefix) + '/subjects/([^/]+)/records$'))
      if (recMatch) {
        const key = decodeURIComponent(recMatch[1])
        if (req.method === 'GET') return sendJson(res, 200, services.getRecords(key))
        if (req.method === 'PUT' || req.method === 'POST') {
          const body = await readJson(req)
          return sendJson(res, 200, services.saveRecords(key, body.records))
        }
        return sendJson(res, 405, { error: 'Method not allowed' })
      }

      /* ---------- 试验匹配基础档案 ---------- */
      if (pathname === apiPrefix + '/trial-profile') {
        const key = url.searchParams.get('profileKey') || ''
        if (req.method === 'GET') return sendJson(res, 200, { profile: services.getTrialProfile(key) })
        if (req.method === 'PUT' || req.method === 'POST') return sendJson(res, 200, { profile: services.saveTrialProfile(key, await readJson(req)) })
        return sendJson(res, 405, { error: 'Method not allowed' })
      }

      /* ---------- 试验检索 / 匹配 ---------- */
      if (pathname === apiPrefix + '/trials') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, services.trialSearch({
          keyword: url.searchParams.get('keyword') || '',
          status: url.searchParams.get('status') || '',
          studyType: url.searchParams.get('studyType') || '',
          limit: url.searchParams.get('limit') || undefined,
        }))
      }
      if (pathname === apiPrefix + '/trials/match') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, services.trialMatch(url.searchParams.get('profileKey') || '', {
          keyword: url.searchParams.get('keyword') || '',
        }))
      }

      /* ---------- 试验收藏 ---------- */
      if (pathname === apiPrefix + '/saved-trials') {
        const key = url.searchParams.get('profileKey') || ''
        if (req.method === 'GET') return sendJson(res, 200, { records: services.savedTrials(key) })
        if (req.method === 'POST') return sendJson(res, 200, { records: services.saveTrial(key, await readJson(req)) })
        if (req.method === 'DELETE') return sendJson(res, 200, { records: services.removeTrial(key, url.searchParams.get('recordId') || '') })
        return sendJson(res, 405, { error: 'Method not allowed' })
      }

      /* ---------- 资料目录 ---------- */
      if (pathname === apiPrefix + '/root') {
        if (req.method === 'GET') return sendJson(res, 200, { dir: services.dataRoot() })
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
        const body = await readJson(req)
        const verdict = checkDataDir(body?.dir)
        if (!verdict.ok) return sendJson(res, 400, { error: verdict.reason, dir: services.dataRoot() })
        return sendJson(res, 200, { dir: services.setDataRoot(verdict.dir) })
      }

      if (pathname.startsWith(apiPrefix + '/')) return sendJson(res, 404, { error: 'Unknown API route' })

      return sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      /* 不裸 throw：把原因交给前端渲染错误横幅（禁白屏） */
      return sendJson(res, 400, { error: '操作失败', detail: String(error?.message || error) })
    }
  }
}

function escapeRe(text) { return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }