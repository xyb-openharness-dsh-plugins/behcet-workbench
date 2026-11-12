/**
 * 包的入口：DSH 插件的服务端侧。
 *
 * 宿主加载的就是这个文件，需要 `name` / `inject` / `Config` / `apply` 四样：
 * - `name` / `inject` / `apply` 的实质逻辑在 `dsh/workbench.js` 与 `dsh/server.js`（零宿主依赖、可单测）；
 * - `Config` 必须在**本文件**末尾——官方要求它是 Schemastery schema，而 Schemastery 是宿主提供的
 *   peer 依赖，本仓库里装不上。为了不让 `apply()` 跟着不可测，只把这一行留在入口。
 */
import Schema from '@deepseek-ai/schemastery'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Workbench } from './workbench.js'
import { createHandler, checkDataDir, resolveStatic, contentType } from './server.js'
import { API_BASE, API_PREFIX, UI_ENTRY } from '../lib/identity.js'
import { version } from '../lib/version.js'

export { Workbench } from './workbench.js'
export { createHandler, checkDataDir, resolveStatic, contentType } from './server.js'
export { openStore, closeStore, migrate, tableNames } from './store.js'
export { seedDemoData } from './demo.js'
export { API_BASE, API_PREFIX, UI_ENTRY } from '../lib/identity.js'
export { PANEL, AGENT_PANE, CLIENT_LAYOUT } from '../lib/layout.js'

export const name = 'behcet-main'
export const inject = ['webServer', 'connection']

const HERE = dirname(fileURLToPath(import.meta.url))
export const PUBLIC_DIR = join(HERE, '..', 'public')

/** 兼容旧导出：主机名与入口常量。 */
export const UI_PREFIX = API_BASE + '/ui'

/** UI 入口文件是否存在（装机自检用） */
export function uiReady() {
  return existsSync(join(PUBLIC_DIR, 'index.html'))
}

/**
 * config 是**第二个参数**，不是 `ctx.config`。
 *
 * 家族实测（2026-10-25）：写成 `ctx.config?.root` 时宿主直接报
 *   `cannot get property "config" without inject`
 * —— Cordis 的服务访问守卫要求把 'config' 声明进 inject，而 config 本来就不走服务通道。
 */
export function apply(ctx, config = {}) {
  if (!ctx.webServer?.register) throw new Error('Desktop webServer.register is unavailable')

  const rawRoot = config?.root
  const verdict = checkDataDir(rawRoot)
  if (!verdict.ok) {
    /* 不裸 throw 白屏：登记一个返回可读错误的健康接口，让前端能显示原因 */
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: API_BASE + '/health',
      handler(req, res) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ error: 'root 未配置或不可用', detail: verdict.reason, hint: 'cordis.patch.yml 需要 config.root: !!js dshHomePath(...)' }))
      },
    }), 'behcet health (unconfigured)')
    return
  }

  const workbench = new Workbench({ root: verdict.dir })
  workbench.open()
  ctx.effect(() => workbench.close(), 'behcet store close')

  const services = {
    version,
    capabilities: ['bootstrap', 'subjects', 'records', 'trial-profile', 'trials', 'saved-trials', 'data-root'],
    bootstrap: () => workbench.bootstrap(),
    listProfiles: () => workbench.listProfiles(),
    createSubject: (input) => workbench.createSubject(input),
    deleteSubject: (key) => workbench.deleteSubject(key),
    getRecords: (key) => workbench.getRecords(key),
    saveRecords: (key, records) => workbench.saveRecords(key, records),
    getTrialProfile: (key) => workbench.getTrialProfile(key),
    saveTrialProfile: (key, input) => workbench.saveTrialProfile(key, input),
    trialSearch: (query) => workbench.trialSearch(query),
    trialMatch: (key, query) => workbench.trialMatch(key, query),
    savedTrials: (key) => workbench.savedTrials(key),
    saveTrial: (key, rec) => workbench.saveTrial(key, rec),
    removeTrial: (key, id) => workbench.removeTrial(key, id),
    dataRoot: () => workbench.dataRoot,
    setDataRoot: (dir) => workbench.setDataRoot(dir),
  }

  const inner = createHandler({ apiBase: API_BASE, publicDir: PUBLIC_DIR, services })

  /* 宿主形态：认证由 connection 能力提供。 */
  const handler = (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (typeof ctx.connection?.requestRejection !== 'function') return send(503, { error: 'connection authentication capability unavailable' })
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) return send(rejection, { error: 'Authentication required' })
    return inner(req, res)
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_BASE, handler }), 'behcet api + ui')
}

export const Config = Schema.object({
  root: Schema.string().required(),
})