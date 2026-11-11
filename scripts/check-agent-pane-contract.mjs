#!/usr/bin/env node
/**
 * check-agent-pane-contract.mjs — DSH 原生 AI 对话面板的**静态**契约断言。
 *
 * 来源：2026-11 小暖宝（cold-agglutinin-workbench）实机激活失败一轮 + 2026-11-10 用户点名复核。
 * 现场：customFrame 下宿主即使没有会话也会传一个隐藏的 conversation 容器，用它判断
 *      「有没有会话」必然误判；再用 ensureSession({}) 兜底，点击后既没面板也没反馈。
 *      这类错不报错、能打包、能装机，只在用户点「AI 对话」时表现为"点了没反应"。
 *
 * 为什么只能做静态断言：会话创建与面板挂载发生在真实宿主里，纯 Node 无法验；
 * 这里把**能靠源码判死的反模式**先钉住（少一条就红），剩下的（面板是否真出现、
 * 取消目录后的空会话、失败提示）只能装机人工走查——不要声称已自动覆盖。
 *
 * 判据（有 src/client.js 或 lib/client.js 才生效；原型阶段 SKIP 并说明）：
 *  1 禁止 `Boolean(conversation)` 一类判断（allow 注释可豁免单行）
 *  2 禁止 `ensureSession({})`
 *  3 必须出现 `newSession(`（有会话创建路径）
 *  4 必须出现 `defaultWorkspace`（工作区来源）
 *  5 必须出现会话订阅/重渲染钩子（subscribe / onSession / useEffect 之一）
 *  6 必须存在"草稿只填不发"的证据：agent-draft 桥（postMessage 含 agent-draft 且无自动 send）
 *  7 生成物同步：lib/client.js 存在且不含裸占位符（__XXX__）
 *
 * 用法：
 *   node scripts/check-agent-pane-contract.mjs [项目目录]
 *   node scripts/check-agent-pane-contract.mjs --self-test   # 正反样本，必须能红
 * 退出码：0 通过 / 1 违反 / 2 环境（self-test 失败）
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const SELF_TEST = args.includes('--self-test')
const target = resolve(args.find((a) => !a.startsWith('-')) || SELF)

const ALLOW = /pane-contract-allow/
const fails = []
const oks = []

/** 先整体剥块注释（保留换行数以对齐行号），再逐行剥行注释并处理 allow 豁免。
 *  为什么不能逐行剥：多行块注释里的示例代码会被当成真实代码误报（2026-11-11 实测踩到）。 */
function stripSource(source) {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
  return noBlock.split('\n').map((line) => (ALLOW.test(line) ? '' : line.replace(/\/\/.*$/, '')))
}

/** 对一段源码跑全部 7 条判据；返回 {fails, oks}。自测复用同一函数。 */
export function inspect(source, { hasGenerated = true, generatedSource = null } = {}) {
  const f = [], o = []
  const lines = source.split('\n')
  const codeLines = stripSource(source)
  const code = codeLines.join('\n')

  const banned = [
    [/Boolean\s*\(\s*conversation\s*\)/, '1 禁止用 Boolean(conversation) 判断是否有会话（customFrame 下宿主恒传隐藏容器）'],
    [/ensureSession\s*\(\s*\{\s*\}\s*\)/, '2 禁止调用 ensureSession({})（会留下无归属会话/无面板）'],
  ]
  for (const [re, msg] of banned) {
    const hit = codeLines.findIndex((l) => re.test(l))
    if (hit >= 0) f.push(`L${hit + 1} ${msg}`)
    else o.push(msg.replace(/^[12]\s*/, '').replace(/（.*$/, '') + '：未出现 ✓')
  }

  const need = [
    [/newSession\s*\(/, '3 必须通过 service.newSession(workspaceId) 创建会话'],
    [/defaultWorkspace/, '4 必须优先取 service.defaultWorkspace?.()?.workspaceId'],
    [/subscribe|onSession|useEffect\s*\(/, '5 必须订阅会话变化并触发重渲染'],
  ]
  for (const [re, msg] of need) {
    if (re.test(code)) o.push(msg.replace(/^[3-5]\s*/, '').split('（')[0] + '：存在 ✓')
    else f.push(msg)
  }
  /* 6 草稿桥：契约是「保留只填不发」。仓里本来没有草稿入口时这条**不适用**，
     但必须明确记 n/a（不能静默算通过），且一旦出现草稿通道就不允许自动发送。 */
  if (/agent-draft/.test(code)) {
    if (/send\s*:\s*true[^}]*agent-draft|agent-draft[^}]*send\s*:\s*true/.test(code)) {
      f.push('6 草稿桥出现 send:true —— 草稿必须只填不发')
    } else o.push('6 agent-draft 草稿桥：存在且只填不发 ✓')
  } else if (/setDraft\s*\(/.test(code)) {
    o.push('6 本仓用自有 setDraft 机制填充草稿（未走 agent-draft 协议）：记 WARN，待架构统一')
  } else if (/和 ?AI ?讨论|讨论这个|discuss/i.test(code)) {
    f.push('6 有「和 AI 讨论」入口但找不到草稿填充通道（会点不动或直接发送）')
  } else {
    o.push('6 本仓未提供草稿入口：agent-draft 一项不适用（n/a，非通过）')
  }

  /* 7 生成物同步（只在有 lib/client.js 时判；自测用参数注入）
     构建器会先声明 `const __PANEL_LAYOUT__ = {...}`，再在渲染/注册代码里引用它。
     声明名与对它的引用都不是漏替换；真正要抓的是**从未被声明**的 __XXX__。
     2026-11-10 cold-agglutinin 实测：只按“声明行”豁免仍会把引用判红，必须按名字收集。 */
  if (hasGenerated) {
    const gen = generatedSource ?? ''
    const declared = new Set()
    /* window.__X__ = 是宿主页写入的运行时全局（lymphoma 实测），也算声明，不算漏注入。 */
    for (const m of gen.matchAll(/\b(?:const|let|var)\s+(__[A-Z][A-Z0-9_]+__)\s*=|\bwindow\.(__[A-Z][A-Z0-9_]+__)\s*=/g)) declared.add(m[1] || m[2])
    const genNoComments = gen.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    let unresolved = genNoComments
    for (const name of declared) unresolved = unresolved.split(name).join('DECLARED')
    if (/__[A-Z][A-Z0-9_]+__/.test(unresolved)) f.push('7 lib/client.js 残留注入占位符（构建注入未执行，装进去就是字面量）')
    else o.push('7 生成物无未替换占位符 ✓')
  }

  return { fails: f, oks: o }
}

if (SELF_TEST) {
  const bad = [
    "const has = Boolean(conversation)",
    "if (!has) service.ensureSession({})",
    "<div onClick={open}>AI 对话</div>",
  ].join('\n')
  const good = [
    "const session = useSession()",
    "onClick(() => { if (!session) { const id = service.defaultWorkspace?.()?.workspaceId; service.newSession(id) } })",
    "service.subscribe(() => rerender())",
    "postMessage({ type: 'thymic:agent-draft', prompt, send: false })",
  ].join('\n')
  const r1 = inspect(bad, { hasGenerated: true, generatedSource: 'const X = __CUSTOM_FRAME__' })
  const r2 = inspect(good, { hasGenerated: true, generatedSource: 'const X = true' })
  const r3 = inspect(good, { hasGenerated: true, generatedSource: 'const __VERSION__ = "0.2.1"\nconst __AGENT_PANE__ = {"default":0.35}\nconst AGENT = __AGENT_PANE__' })
  const badCaught = r1.fails.length >= 5
  const goodClean = r2.fails.length === 0
  const declarationsClean = r3.fails.length === 0
  console.log(`${badCaught ? 'PASS' : 'FAIL'}  self-test 反例被抓住（${r1.fails.length} 条）`)
  for (const x of r1.fails) console.log('   · ' + x)
  console.log(`${goodClean ? 'PASS' : 'FAIL'}  self-test 正例零误报${goodClean ? '' : '：' + r2.fails.join(' | ')}`)
  console.log(`${declarationsClean ? 'PASS' : 'FAIL'}  self-test 已声明的注入常量不误报${declarationsClean ? '' : '：' + r3.fails.join(' | ')}`)
  process.exit(badCaught && goodClean && declarationsClean ? 0 : 2)
}

const candidates = ['src/client.js', 'lib/client.js'].map((p) => join(target, p))
const srcPath = candidates.find((p) => existsSync(p))
if (!srcPath) {
  console.log(JSON.stringify({
    pass: true, skipped: true,
    reason: '没有 src/client.js 或 lib/client.js（原型阶段或尚未移植）：AI 面板契约检查暂不启用，移植后自动生效。',
    fails: [], oks: [],
  }, null, 2))
  process.exit(0)
}

const source = readFileSync(srcPath, 'utf8')
const genPath = join(target, 'lib/client.js')
const generatedSource = existsSync(genPath) ? readFileSync(genPath, 'utf8') : ''
const { fails: f, oks: o } = inspect(source, { hasGenerated: existsSync(genPath), generatedSource })

console.log(JSON.stringify({
  pass: f.length === 0,
  file: srcPath.replace(target + '/', ''),
  fails: f,
  oks: o,
  limits: [
    '静态断言只覆盖源码反模式；面板是否真的出现、取消选目录后是否留空会话、失败是否有提示，必须装机后人工走查（V3）。',
  ],
}, null, 2))
process.exit(f.length === 0 ? 0 : 1)
