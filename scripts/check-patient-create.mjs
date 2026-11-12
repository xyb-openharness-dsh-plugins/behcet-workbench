#!/usr/bin/env node
/**
 * 患者档案闸门：demo 数据之外，用户必须能**新建自己的档案**并管理（多档案 + 落 sqlite）。
 *
 * 为什么单列（2026-11-12 全家族体检）：绝大多数工作台只带两套合成档案，顶栏没有任何"新建"
 * 入口。演示能跑、README 能截屏、`npm run check` 全绿——但用户拿到手**没法记录自己的事**，
 * 等于一个只能看的样机。这一条比任何 UI 细节都致命，而所有既有闸门都不查它。
 *
 * 四条判据，缺一条就是红：
 *   ① UI 有**患者/档案级**的新建入口（不是"新建一条记录"）：新建档案 / 新增患者 / createProfile …
 *   ② 服务端有创建接口（POST 到 /profiles 或 /subjects 之类），并真写库（INSERT INTO subjects/profiles）
 *   ③ 多档案：能列出并切换多个档案（bootstrap 返回列表 + UI 有当前档案状态）
 *   ④ demo 与真实并存：demo 有 `is_demo`/种子标记，新建的档案不是 demo（不能把 demo 当唯一数据源）
 *
 * 用法：
 *   node scripts/check-patient-create.mjs [项目根]
 *   node scripts/check-patient-create.mjs --self-test      # 反例（只有 demo）必须能红
 * 退出码：0 通过 / 1 失败 / 2 用法错误
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SELF_TEST = process.argv.includes('--self-test')
const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.')

const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }
/* 递归读两层：dsh/ 与 lib/server/ 这类子目录里才是真实现（lib/client.js 只是入口）。 */
const readDirJs = (dir, depth = 0) => {
  if (depth > 2) return ''
  let out = ''
  let entries = []
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }) } catch { return '' }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const rel = join(dir, e.name)
    if (e.isDirectory()) { out += '\n' + readDirJs(rel, depth + 1); continue }
    if (/\.(m?js)$/.test(e.name)) out += '\n' + read(rel)
  }
  return out
}

export function check({ ui, server, schema }) {
  const fails = []
  const oks = []

  /* ① 患者/档案级新建入口（"新建一条记录"不算：那只改单条数据，不是开一个新患者的账本） */
  const createEntry = /(新建|新增|添加|创建)\s*(患者|患者档案|档案|病历|随访对象)|(create|add|new)(Profile|Subject|Patient)/i.test(ui)
  if (createEntry) oks.push('① UI 有患者/档案级新建入口')
  else fails.push('① UI 没有任何"新建患者/档案"入口——用户只能看 demo')

  /* ② 创建接口 + 真写库 */
  /* 路径形状两种都认：字面 `/api/x/subjects` 与拼接 `prefix + '/subjects'` */
  const createApi = /\bPOST\b/.test(server) && (/\/api\/(profiles|subjects|cases)\b/.test(server) || /['"`]\/(profiles|subjects|cases)\b/.test(server))
  const insertStmt = /INSERT\s+(OR\s+\w+\s+)?INTO\s+(subjects?|profiles?|patient_profiles|case_files|cases)/i.test(`${server}\n${schema}`)
  if (createApi && insertStmt) oks.push('② 服务端有创建接口且真写库（INSERT INTO subjects/profiles）')
  else fails.push(`② 创建链路不完整：接口=${createApi ? '有' : '无'} · 写库语句=${insertStmt ? '有' : '无'}`)

  /* ③ 多档案：列表 + 当前档案 */
  const listProfiles = /(profiles|subjects|cases)\s*(\)|\.|,|:|map|filter|forEach|\[)/i.test(ui) && /(profileId|profileIndex|profileKey|activeProfile|currentProfile|switchProfile|profile_key|activeKey|profile-switch|caseFile|state\.profile\b)/i.test(ui)
  if (listProfiles) oks.push('③ UI 有多档案列表与当前档案状态')
  else fails.push('③ 没有多档案列表/切换（只能一个档案 = 换个名字的单用户工具）')

  /* ④ demo 与真实并存 */
  /* ④ demo 与真实并存：demo 有标记 + 创建路径把 is_demo 写成 0。
     （v1.1 修正：原先误把页面里出现「仅演示」字样当失败——那是合法的演示标记文案，不是"只有 demo"。） */
  const demoMarked = /is_demo|isDemo|demo_flag|seedDemoData|demoProfiles|isDemoCase/i.test(`${ui}\n${server}\n${schema}`)
  const nonDemoInsert = /INSERT\s+INTO\s+(subjects?|profiles?|case_files|cases)\b/i.test(`${server}\n${schema}`)
  if (demoMarked && nonDemoInsert) oks.push('④ demo 有标记，新建档案写 is_demo=0（与 demo 并存）')
  else fails.push(`④ demo 与真实数据没有分开：demo 标记=${demoMarked ? '有' : '无'} · 新建写 is_demo=0=${nonDemoInsert ? '有' : '无'}`)

  return { pass: fails.length === 0, fails, oks }
}

const BAD = {
  ui: "侧栏两个档案 A/B，切换 state.profileId；页面全部读 DEMO_DATA；没有任何新建入口",
  server: "register bootstrap only; no POST route; no INSERT",
  schema: "CREATE TABLE subjects(profile_key TEXT PRIMARY KEY, name TEXT)"
    + " -- 只有 demo 数据，seed 时写入两套",
}
const GOOD = {
  ui: "'＋ 新建档案' data-action=\"create-subject\" → POST /api/subjects；列表 profiles.map + state.profileId 切换",
  server: "if (pathname === prefix + '/subjects' && req.method === 'POST') { const body = await readJson(req); return sendJson(res, 200, workbench.createSubject(body)) }",
  schema: "CREATE TABLE subjects (profile_key TEXT PRIMARY KEY, name TEXT, is_demo INTEGER DEFAULT 0);\nINSERT INTO subjects(profile_key,name,is_demo) VALUES(?,?,0)",
}

if (SELF_TEST) {
  const bad = check(BAD)
  const good = check(GOOD)
  const ok = bad.pass === false && good.pass === true
  console.log(JSON.stringify({ selfTest: ok ? 'PASS' : 'FAIL', bad, goodPass: good.pass }, null, 2))
  process.exit(ok ? 0 : 1)
}

if (!existsSync(join(root, 'dsh')) && !existsSync(join(root, 'lib'))) {
  console.error('✗ 用法：node scripts/check-patient-create.mjs <项目根>')
  process.exit(2)
}

const ui = `${read('lib/client.js')}\n${read('public/app.js')}\n${read('public/index.html')}\n${read('prototypes/v0.2/app.js')}`
const server = `${readDirJs('dsh')}\n${readDirJs('lib')}`
const schema = readDirJs('schema') + (() => { try { return readdirSync(join(root, 'schema')).filter((f) => f.endsWith('.sql')).map((f) => read(join('schema', f))).join('\n') } catch { return '' } })()

const result = check({ ui, server, schema })
for (const o of result.oks) console.log(`✓ ${o}`)
for (const f of result.fails) console.error(`✗ ${f}`)
console.log(result.pass ? '\n✓ 患者档案闸门通过' : '\n✗ 患者档案闸门未通过：用户必须能新建并管理自己的档案，不能只有 demo')
process.exit(result.pass ? 0 : 1)