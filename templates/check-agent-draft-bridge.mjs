#!/usr/bin/env node
/**
 * check-agent-draft-bridge.mjs — AI 协助一键发送「对穿断言」（34 号 §四）
 *
 * 防"两端各自实现了"的假接通（肢端肥大症 0.2.0 真实坑：页面渲染了协议链接、
 * 壳层监听了 postMessage，但 public/app.js 从未 postMessage，链路实际不通）。
 *
 * 用法：node scripts/check-agent-draft-bridge.mjs <项目根> [<app-slug>]
 * 断言（任一失败即非零退出）：
 *   A1 public/app.js 出现 agent-draft 协议链接 ⇒ 必须出现 parent.postMessage 且消息带 send
 *   A2 lib/client.js 必须监听同 <app>:agent-draft 且校验 event.source
 *   A3 lib/client.js 若自动发送 ⇒ 必须带双守卫证据（plain 相判断 + submit）
 *   A4 面板唯一性：门控必须出现在**面板显隐函数体内**，不是只查常量存在
 *
 * A4 为什么从"查常量"改成"查显隐函数体"（2026-10-26 AML v0.2.0 实测）：
 *   初版只要求 `const EMBEDDED` 存在或 `window.parent !== window` 出现 ≥2 次。
 *   AML 满足了前者（常量有、发送分支也用了），但 `setAgent()` 无条件显示面板——
 *   装机后右侧会出现「AI 对话 · 演示」+ 原生会话两个面板并存。
 *   **常量存在 ≠ 面板被门控**；门控必须落在"谁决定显隐"的那段代码里。
 *   同时保留原来的宽松判据作为兜底（自定义显隐实现的项目），只在找到显隐函数时收紧。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const slug = process.argv[3] ?? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name.replace(/^@[^/]+\//, '')
const read = (p) => existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null

const problems = []
const notes = []
const pub = read('public/app.js')
const cli = read('lib/client.js')

if (pub === null && cli === null) { console.log('- 无 public/app.js 与 lib/client.js，跳过（未到 M5）'); process.exit(0) }

if (pub) {
  const hasLink = pub.includes(`agent-draft`)
  const hasPost = pub.includes('parent.postMessage') || pub.includes('window.parent.postMessage')
  const hasSend = /\bsend\s*:\s*true\b/.test(pub)
  if (hasLink && !hasPost) problems.push('A1 页面有 agent-draft 协议链接但没有 parent.postMessage（假接通）')
  if (hasLink && hasPost && !hasSend) problems.push('A1 postMessage 未携带 send:true（34 号默认一键发送；回退须留痕）')
  // A4 面板唯一性（34 号 §一 2b）：支持嵌入式的页面不得无条件渲染自有演示面板
  if (hasPost && pub.includes('agent-pane')) {
    /* 找"面板显隐函数"：常见名 setAgent / setAgentPane / toggleAgent / applyAgent。
       找不到就退回宽松判据并留一条 note（自定义实现需要人工确认）。 */
    const fnName = ['setAgent', 'setAgentPane', 'toggleAgent', 'applyAgent']
      .find((n) => new RegExp(`function\\s+${n}\\s*\\(`).test(pub))
    const fnBody = fnName
      ? (pub.match(new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)) || [])[1]
      : null
    const gateInFn = fnBody && (/EMBEDDED\s*\(/.test(fnBody) || /window\.parent\s*!==\s*window/.test(fnBody))
    const gateAnywhere = /const\s+EMBEDDED/.test(pub) || (pub.match(/window\.parent\s*!==\s*window/g) || []).length >= 2
    if (!gateAnywhere) problems.push('A4 嵌入式支持但演示面板无门控（需 EMBEDDED 常量或 window.parent !== window ≥2 处）——面板会漏进装机版')
    else if (fnBody && !gateInFn) problems.push(`A4 有 EMBEDDED 常量但面板显隐函数（${fnName}）体内没有门控——常量只用在发送分支，装机后仍会出现双面板`)
    else if (!fnBody) notes.push('A4 未找到已知命名的面板显隐函数（setAgent/setAgentPane/toggleAgent/applyAgent）：门控需人工确认落在显隐路径上')
  }
}
if (cli) {
  /* 阶段感知：M0 占位骨架不查壳层契约，但必须明说跳过原因，不假装通过 */
  const placeholder = /业务功能待按 spec 实现/.test(cli)
  if (placeholder) {
    notes.push('A2/A3 跳过：lib/client.js 仍是 M0 占位骨架（壳层尚未监听 agent-draft）——M5 接真实客户端后本断言自动生效')
  } else {
    if (!cli.includes(`${slug.split('/').pop()}:agent-draft`) && !cli.includes(':agent-draft')) problems.push('A2 壳层未监听 <app>:agent-draft 消息')
    if (!/event\.source\s*!==?\s*frame/.test(cli) && !/event\.source\s*===?\s*frame/.test(cli)) problems.push('A2 壳层未校验 event.source（只校 origin 挡不住同源窗口）')
    if (/submit\(/.test(cli) && !/plain/.test(cli)) problems.push('A3 自动发送缺 plain 相守卫')
  }
}
if (notes.length && problems.length) for (const n of notes) console.error('  · ' + n)
else if (notes.length) for (const n of notes) console.log('  · ' + n)

if (problems.length) { console.error('✗ agent-draft 对穿断言失败：\n- ' + problems.join('\n- ')); process.exit(1) }
console.log('✓ agent-draft 链路对穿（页面发送 ↔ 壳层监听 ↔ 双守卫提交）')
