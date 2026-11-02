#!/usr/bin/env node
/**
 * check-dialog-handoff.mjs — 弹窗接管断言（AML 0.3.0 回收：判定对≠提示可见）
 *
 * 抓的缺陷：表单保存回调里再开一个对话框（如急症提示），外层却无条件 closeModal()，
 * 把刚弹的框一起关掉——用户什么都看不到，数据静默入库，纯函数断言全绿。
 *
 * 用法：node scripts/check-dialog-handoff.mjs <项目根>
 * 判据：
 *   D1 表单保存处若出现 openModal/feverFlag 类调用，必须是「先 close 再开」或「onSave 返回 true 接管」
 *   D2 存在"不可忽略"类对话框 ⇒ 必须有 dataset/cancel 拦截证据
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const files = []
for (const d of ['prototypes/v0.2', 'public', 'src']) {
  const p = join(root, d)
  if (existsSync(p)) for (const f of readdirSync(p)) if (f.endsWith('.js')) files.push(join(p, f))
}
const problems = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  // D1：同一保存回调里 onSave(...) 紧跟 closeModal()，且 onSave 体内有 openModal 类调用
  const saveBlocks = s.match(/onSave\(vals\)[^\n]*\n?[^\n]*closeModal\(\)/g) || []
  if (saveBlocks.length) {
    const hasHandoff = /const handled = onSave\(vals\)/.test(s) && /if \(handled !== true\) closeModal\(\)/.test(s)
    const reopens = /(openModal|feverFlag|emergency)\s*\(/.test(s)
    if (reopens && !hasHandoff) problems.push(`${f}: 保存回调里可能再开弹窗但无「接管」判定（onSave 返回 true 时不得 closeModal）`)
  }
  // D2：不可忽略对话框必须有事件拦截
  const hasEmergencyDialog = /emergency|不可忽略/.test(s) && /openModal\(/.test(s)
  if (hasEmergencyDialog) {
    const hasGuard = /dataset\.emergency/.test(s) && /addEventListener\('cancel'/.test(s)
    if (!hasGuard) problems.push(`${f}: 声明了"不可忽略"对话框但缺少 cancel/遮罩 拦截（Esc 与点遮罩会关掉它）`)
  }
}
if (problems.length) { console.error('✗ 弹窗接管断言失败：\n- ' + problems.join('\n- ')); process.exit(1) }
console.log(`✓ 弹窗接管：${files.length} 个 JS 文件扫描（保存回调接管 / 不可忽略框拦截）`)
