import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { createStaticHandler } from './static.js'

export const name = 'behcet-main'
export const inject = ['webServer', 'connection']
export const Config = Schema.object({})
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const PUBLIC_DIR = new URL('../public/', import.meta.url).pathname
/* 注册路径不带尾斜杠：宿主按前缀匹配，带斜杠会让 /ui 本身 404 */
export const UI_PREFIX = '/api/behcet/ui'
const UI_ENTRY = `${UI_PREFIX}/`

export function apply(ctx) {
  if (!ctx.webServer?.register) throw new Error('Desktop webServer.register is unavailable')
  /* 业务界面：public/ 由 scripts/build-public.mjs 从 prototypes/v0.2 产出，外壳用 iframe 装进来 */
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: UI_PREFIX, handler: createStaticHandler(PUBLIC_DIR, UI_ENTRY) }), 'behcet ui')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/behcet/health',
    handler(req, res) {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(body))
      }
      if (typeof ctx.connection?.requestRejection !== 'function') return send(503, { error: 'connection authentication capability unavailable' })
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) return send(rejection, { error: 'Authentication required' })
      if (req.method !== 'GET') return send(405, { error: 'Method not allowed' })
      send(200, { ok: true, version: manifest.version, apiVersion: 'v1', capabilities: ['health'] })
    },
  }), 'behcet health')
}
