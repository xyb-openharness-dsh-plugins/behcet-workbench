#!/usr/bin/env node
/**
 * 「装进去了」之后，界面到底加载了没有？——用宿主自己留下的事实回答。
 *
 * ## 四类证据必须分开
 * 代码检查 / 安装完成 / 界面加载 / 业务可用。前两类本地可证，**界面加载只有宿主能证**，
 * 而宿主没有可问的 HTTP 接口（`/api/*` 有全局鉴权，未知路由同样 401）。
 *
 * ## 本脚本解决的两个具体误判（都真实发生过）
 * 1. **拿旧日志当新证据**：`harness.log` 里渲染进程的行（`[renderer] …`）**不带时间戳**，
 *    上一版插件留下的 `did not activate` 会永远留在文件里。必须按「本次运行段」切片，
 *    否则每次都会报「激活失败」，而那次失败可能是一小时前的旧账。
 * 2. **装到另一个 App 的 profile 里**：本机同时装着 `DSH Desktop.app`（工作台产品，
 *    profile 在 `Library/Application Support/dsh-desktop/harness/profiles/web`，34 个 bundle）
 *    与 `DeepSeek Harness.app`（Agent 宿主，profile 在 `~/.dsh/profiles/desktop`，0 个工作台）。
 *    装错那一个，重启一万次也不会加载。判据：**目标 profile 里必须还有兄弟工作台**。
 *
 * ## 证据来源
 *   - `harness/.xdpool/startup.log` 末条 = 本次 harness 启动时刻
 *   - `~/Library/Logs/DSH Desktop/harness.log` 最后一次 `Harness process exited` = 上次退出；
 *     其后的行 = 本次运行段
 *   - 装机目录 mtime / version
 *   - `harness/<包名>/`（`dshHomePath` 目录）出现 = 服务端 store 真跑过一次
 *   - `harness/desktop-workbenches/state.json` 的 `added`/`pinned` 含 `owner/repo`
 *   - profile `package.json` 的 `dsh.profile.bundles` 含本包，且含兄弟工作台
 *
 * 退出码：0 已加载｜1 激活失败｜2 未运行或未重启｜3 已重启但无加载迹象
 *
 * 用法：node scripts/verify-desktop-load.mjs
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const HOME = process.env.HOME || ''
// 允许覆盖路径：真实运行时用系统默认，测试里指向临时目录（否则这个脚本无法自证）
const HARNESS = process.env.HN_HARNESS || join(HOME, 'Library/Application Support/dsh-desktop/harness')
const PROFILE = join(HARNESS, 'profiles/web')
// 包名与仓库从本项目 package.json 推导（模板下发给任意工作台，不写死某一癌种）
const selfPkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const PKG = selfPkg.name
const OWNER_REPO = String(selfPkg.repository?.url || selfPkg.repository || '')
  .replace(/^git\+/, '')
  .replace(/^https:\/\/github\.com\//, '')
  .replace(/\.git$/, '')
// dshHomePath 的目录名以 cordis.patch.yml 为准（装有持久库的那个），读不到才退回包名
const DATA_DIR = (() => {
  try {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const m = patch.match(/dshHomePath\(\s*['"]([^'"]+)['"]\s*\)/)
    if (m) return join(HARNESS, m[1])
  } catch {}
  return join(HARNESS, PKG.split('/').pop())
})()
const LOG = process.env.HN_LOG || join(HOME, 'Library/Logs/DSH Desktop/harness.log')
const STARTUP = join(HARNESS, '.xdpool/startup.log')
const STATE = join(HARNESS, 'desktop-workbenches/state.json')
const INSTALLED = join(PROFILE, 'node_modules', ...PKG.split('/'))

const rows = []
const push = (k, v, ok) => rows.push({ k, v, ok })

if (!existsSync(HARNESS)) {
  console.error(`找不到 DSH Desktop 的 harness 目录：${HARNESS}`)
  process.exit(2)
}

/* ---------- 1. 把 harness.log 切成「上次退出之前 / 本次运行段」 ---------- */
let segment = []
let exitedAt = null
if (existsSync(LOG)) {
  const all = readFileSync(LOG, 'utf8').trim().split('\n')
  let cut = -1
  for (let i = all.length - 1; i >= 0; i--) {
    if (/Harness process exited/.test(all[i])) {
      cut = i
      const m = all[i].match(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/)
      if (m) exitedAt = new Date(m[1])
      break
    }
  }
  segment = cut === -1 ? all : all.slice(cut + 1)
}
const running = segment.length > 0
push('DSH Desktop harness', running ? `运行中（本次段 ${segment.length} 行日志）` : '未运行', running)
push('上次退出', exitedAt ? exitedAt.toISOString() : '日志里没有退出记录', true)

/* ---------- 2. 装机时刻与版本 ---------- */
let installedAt = null
let installedVersion = '未安装'
if (existsSync(INSTALLED)) {
  installedAt = statSync(INSTALLED).mtime
  try { installedVersion = JSON.parse(readFileSync(join(INSTALLED, 'package.json'), 'utf8')).version } catch {}
}
push('装机目录', existsSync(INSTALLED) ? `已安装 v${installedVersion}` : '未安装', existsSync(INSTALLED))
push('装机 mtime', installedAt ? installedAt.toISOString() : '—', Boolean(installedAt))

/* ---------- 3. 启动时刻（以日志段首条带时间的行为准，startup.log 兜底） ---------- */
let bootAt = null
for (const line of segment) {
  const m = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/)
  if (m) { bootAt = new Date(m[1]); break }
}
if (!bootAt && running && existsSync(STARTUP)) {
  const lines = readFileSync(STARTUP, 'utf8').trim().split('\n')
  for (let i = lines.length - 1; i >= 0 && !bootAt; i--) {
    const m = lines[i].match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)
    if (m) bootAt = new Date(m[1])
  }
}
push('本次启动', bootAt ? bootAt.toISOString() : '未运行，无启动时刻', Boolean(bootAt))

/* ---------- 4. 本次运行段里与本包相关的日志 ---------- */
// 注意：`web boot: 1 entry did not activate` 这行**不带包名**，只过滤包名会漏掉整条失败信号
// （这个脚本的第一版就漏了，由 test/desktop-load.test.mjs 的反例抓出来）
const mine = segment.filter((l) => /head-neck-workbench|did not activate|plugin-recovery|plugin-removal/.test(l))
const failures = mine.filter((l) =>
  /did not activate/.test(l) ||
  /plugin-recovery/.test(l) ||
  new RegExp(`${PKG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: failed`).test(l))
push('本次段相关日志', mine.length ? `${mine.length} 条` : '无', failures.length === 0)
for (const l of mine.slice(-5)) rows.push({ k: '  日志', v: l.slice(0, 200), ok: !/did not activate|failed/.test(l) })

/* ---------- 5. 服务端 store 数据目录 ---------- */
push('dshHomePath 数据目录', existsSync(DATA_DIR)
  ? `已生成（${readdirSync(DATA_DIR).slice(0, 4).join(', ')}）`
  : '未生成（服务端一次都没跑过）', existsSync(DATA_DIR))

/* ---------- 6. 宿主工作台清单 ---------- */
let listed = false
if (existsSync(STATE)) {
  try {
    const st = JSON.parse(readFileSync(STATE, 'utf8')).state || {}
    listed = [...(st.added || []), ...(st.pinned || [])].includes(OWNER_REPO)
  } catch {}
}
push('宿主工作台清单', listed ? `含 ${OWNER_REPO}` : `不含 ${OWNER_REPO}`, listed)

/* ---------- 7. 目标 profile 是否真的是「加载工作台的那个」 ---------- */
let bundles = []
try { bundles = (JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8')).dsh?.profile?.bundles) || [] } catch {}
const siblings = bundles.filter((b) => b !== PKG && /-workbench$/.test(b))
const inBundles = bundles.includes(PKG)
push('profile bundles', `${bundles.length} 项，兄弟工作台 ${siblings.length} 个，含本包 ${inBundles}`, siblings.length > 0 && inBundles)

/* ---------------- 打印与结论 ---------------- */
const width = Math.max(...rows.map((r) => r.k.length))
console.log('界面加载核验（证据全部来自宿主留下的事实）\n')
for (const r of rows) console.log(`  ${r.ok ? '·' : '!'} ${r.k.padEnd(width)}  ${r.v}`)
console.log('')

if (failures.some((l) => /did not activate/.test(l))) {
  console.log('✗ 结论：**本次运行**里插件激活失败（宿主日志有「did not activate」原文，见上）。')
  console.log('  先跑 npm run smoke:activate 复现，再对照宿主 7 条 register 校验。')
  process.exit(1)
}
if (siblings.length === 0) {
  console.log(`✗ 结论：装错了 profile —— ${PROFILE} 里一个兄弟工作台都没有，`)
  console.log('  它不会加载工作台。检查 check-install.mjs 判定的安装基准。')
  process.exit(2)
}
if (!running) {
  console.log('⏸ 结论：**DSH Desktop 当前没在运行**（最后一次退出见上），插件不可能被加载。')
  console.log('  打开 DSH Desktop（不是 DeepSeek Harness 那个窗口）后重跑本脚本。')
  process.exit(2)
}
if (bootAt && installedAt && bootAt < installedAt && !existsSync(DATA_DIR)) {
  console.log('⏸ 结论：**这一轮启动早于装机**，插件本轮不可能被加载——需要完整退出再打开。')
  process.exit(2)
}
if (existsSync(DATA_DIR) || listed) {
  console.log('✓ 结论：宿主已加载该工作台（数据目录或工作台清单有它的痕迹）。')
  console.log('  这只证明「宿主侧加载成功」，页面长什么样仍需人眼确认一次。')
  process.exit(0)
}
console.log('? 结论：已重启，但没有加载痕迹——可能只是还没打开过这个工作台。')
console.log('  打开一次工作台（会触发 /health 与 store 初始化）后重跑本脚本。')
process.exit(3)
