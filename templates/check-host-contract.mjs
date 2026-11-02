#!/usr/bin/env node
/**
 * 宿主注册契约自查 —— 「本地全绿」与「装进去能活」是两套校验。
 *
 * 为什么需要这个文件：
 * desktopWorkbenches.register() 在**渲染进程**里校验描述符，任一不合格就 throw，
 * 插件 apply 失败后宿主只打三行、不给原因：
 *
 *   [renderer] [stderr] Error: web boot: 1 entry did not activate
 *   [renderer] @your-community/your-workbench: failed
 *   [renderer] [stderr] Failed to load plugins
 *
 * 接着 plugin-recovery 自动把插件从 profile 卸掉，app 才恢复。用户看到的是
 * 「装了个工作台，Desktop 起不来」。而 npm run check / test / audit 全都不会响，
 * 因为这些校验只存在于宿主里。
 *
 * 2026-10-25 head-neck-workbench 就因此崩过一次：businessWidth 写了 0.72，
 * 宿主硬上限是 0.7。所以把宿主那几条规则抄成本地闸门——抄的时候宁可严一点。
 *
 * 宿主规则来源：app.asar → node_modules/dsh-desktop-workbenches/client.js 的 register()。
 * 宿主若改规则，回来同步这份。
 */
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const client = read('lib/client.js')
const layout = read('lib/layout.js')
const both = `${client}\n${layout}`
const problems = []
const notes = []

if (!client) {
  console.log('跳过：还没有 lib/client.js（工作台外壳尚未接入宿主）')
  process.exit(0)
}

/** 取第一处 NAME 的数值：同时认 `const NAME = 0.68` 与 `NAME: 0.68` / `"NAME": 0.68` */
function num(name) {
  for (const src of [client, layout]) {
    const m = src.match(new RegExp(`(?:const\\s+)?["']?${name}["']?\\s*[:=]\\s*([\\d.]+)`))
    if (m) return Number(m[1])
  }
  return undefined
}

// 1) register() 真的被调用，且第一个实参是对象（描述符）、第二个是组件
if (!/desktopWorkbenches\s*\.\s*register\s*\(/.test(client)) {
  notes.push('lib/client.js 里没有 desktopWorkbenches.register()：外壳可能还没接入宿主')
} else if (!/register\s*\(\s*\{[\s\S]{0,4000}?\}\s*,\s*[A-Za-z_$][\w$]*\s*\)/.test(client)) {
  problems.push('register() 的调用形态不是 register({...}, Component)——第二个参数必须是组件函数，否则宿主报 Invalid workbench registration')
}

// 2) title / panelTitle 非空（宿主 `!descriptor.title` → Invalid workbench registration）
for (const key of ['title', 'panelTitle']) {
  const present = new RegExp(`["']?${key}["']?\\s*:\\s*`).test(client)
  if (!present) notes.push(`描述符里没找到 ${key}（若用的是常量名则此条仅供参考）`)
  else if (new RegExp(`["']?${key}["']?\\s*:\\s*["']\\s*["']`).test(client)) problems.push(`${key} 是空字符串（宿主会拒绝注册）`)
}

// 3) repository 必须是 GitHub URL（宿主 repositoryIdentity 的正则）
const repo = client.match(/["']?repository["']?\s*:\s*["'`]([^"'`]+)["'`]/)?.[1]
if (!repo) notes.push('没写 repository（宿主允许省略，但市场识别与更新会退化）')
else if (!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?(?:\.git)?\/?$/i.test(repo)) {
  problems.push(`repository 不是合法 GitHub URL：${repo}（宿主：Workbench repository must be a GitHub URL）`)
}

// 4) customFrame 必须是 boolean（宿主：Invalid custom frame flag）
const cf = both.match(/["']?(?:customFrame|CUSTOM_FRAME)["']?\s*[:=]\s*([^,}\n]+)/)?.[1]?.trim()
if (cf && !/^(true|false)$/.test(cf)) problems.push(`customFrame 不是 true/false 字面量：${cf}（宿主：Invalid custom frame flag）`)

// 5) businessSide ∈ {left,right}（宿主：Invalid workbench business side）
const side = both.match(/["']?(?:businessSide|BUSINESS_SIDE)["']?\s*[:=]\s*["']([^"']+)["']/)?.[1]
if (side && !['left', 'right'].includes(side)) problems.push(`businessSide 只能是 left/right，当前 ${side}`)

// 6) businessWidth ∈ [0.25, 0.7] —— 崩 Desktop 的就是这一条
const width = num('businessWidth') ?? num('BUSINESS_WIDTH')
if (width === undefined) notes.push('没找到 businessWidth（自定义外壳可能不用它，宿主会退回默认 0.36）')
else if (!Number.isFinite(width)) problems.push('businessWidth 不是有限数')
else if (width < 0.25 || width > 0.7) {
  problems.push(
    `businessWidth=${width} 超出宿主硬区间 [0.25, 0.7]\n` +
    '    宿主原文：Workbench business width must be between 0.25 and 0.7\n' +
    '    后果不是样式难看，而是插件激活失败、DSH Desktop 起不来',
  )
}
// 7) 业务区 + 会话区不应超过整宽
const agentDefault = num('AGENT_DEFAULT')
if (width !== undefined && agentDefault !== undefined && width + (agentDefault > 1 ? agentDefault / 100 : agentDefault) > 1.0000001) {
  problems.push(`businessWidth(${width}) + 会话默认占比(${agentDefault}) 超过 1，两区会互相挤压`)
}

// 8) headerLayout 若出现只能是 default/compact
const hl = both.match(/["']?headerLayout["']?\s*:\s*["']([^"']+)["']/)?.[1]
if (hl && !['default', 'compact'].includes(hl)) problems.push(`headerLayout 只能是 default/compact，当前 ${hl}`)

console.log('宿主注册契约自查（lib/client.js + lib/layout.js）')
console.log(`  customFrame=${cf ?? '未设'} · businessSide=${side ?? '未设'} · businessWidth=${width ?? '未设'}`)
for (const n of notes) console.log(`  · ${n}`)
if (problems.length) {
  console.error(`\n✗ ${problems.length} 条不合格——这份包装进 Desktop 后会激活失败：`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('\n✓ 符合宿主 register() 校验')
