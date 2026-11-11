/* HTTP 层：把 public/ 以静态文件方式挂出去（装机界面）。
 *
 * 为什么需要它：本仓原先只注册了 /health，外壳（lib/client.js）里没有可加载的业务页，
 * 装进 Desktop 后面板只剩占位卡片 / 空白。现在业务界面 = public/（由
 * scripts/build-public.mjs 从 prototypes/v0.2 产出），外壳用 iframe 装进面板。
 *
 * 边界：只从 public/ 出文件；`..`、绝对路径、符号链接逃逸一律拒绝；错误走纯文本 404。
 */
import { readFileSync, existsSync, realpathSync, statSync } from 'node:fs'
import { extname, normalize, relative, resolve, sep } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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
  const rootReal = realpathSync(root)
  let absReal
  try { absReal = realpathSync(abs) } catch { return null }
  const r = relative(rootReal, absReal)
  if (r === '' || r.startsWith('..' + sep) || r === '..' || r.startsWith(sep)) return null
  try { if (!statSync(absReal).isFile()) return null } catch { return null }
  return absReal
}

/** 生成 {kind:'prefix'} 路由的 handler：宿主传完整 req.url，这里按 UI_ENTRY 剥前缀。 */
export function createStaticHandler(publicDir, uiEntry) {
  return function handler(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('Method not allowed')
    }
    const url = String(req.url || '/')
    const rel = url.startsWith(uiEntry) ? url.slice(uiEntry.length) : url
    const file = resolveStatic(publicDir, rel)
    if (!file) {
      if (typeof next === 'function') return next()
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('Not found')
    }
    const body = readFileSync(file)
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  }
}

export function publicIndexExists(publicDir) {
  return existsSync(resolve(publicDir, 'index.html'))
}