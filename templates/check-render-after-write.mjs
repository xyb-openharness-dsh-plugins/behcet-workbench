#!/usr/bin/env node
/**
 * check-render-after-write.mjs — 写入点↔渲染点双向核对（AML 0.3.0 回收：只存不显）
 *
 * 抓的缺陷：state.mem().temps.push(...) 写了内存/库，但没有任何渲染读取——
 * 家属代记的体温"能存不能看"，静态断言全绿。
 *
 * 用法：node scripts/check-render-after-write.mjs <项目根>
 * 判据：凡出现 `mem().<field>.push(` 的写入点，同一文件或 public/ 对应产物必须出现对
 *       `mem().<field>` 的读取（非 push 语境）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const targets = []
for (const d of ['prototypes/v0.2', 'public', 'src']) {
  const p = join(root, d)
  if (existsSync(p)) for (const f of readdirSync(p)) if (f.endsWith('.js')) targets.push(join(p, f))
}
const problems = []
for (const f of targets) {
  const s = readFileSync(f, 'utf8')
  const writes = [...s.matchAll(/mem\(\)\.([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*push\s*\(/g)].map((m) => m[1])
  for (const field of new Set(writes)) {
    // 直接访问（含 m.field 形式）或经聚合函数（如 deathsAll/allViewpoints/feelsAll）间接触达
    const direct = [...s.matchAll(new RegExp(`(?:mem\\(\\)|\\bm)\\.${field}\\b(?!\\s*\\.\\s*push)`, 'g'))].length
    const viaAgg = new RegExp(`(?:deathsAll|feelsAll|allViewpoints|allTx|live\\w*)\\([^)]*\\)`).test(s) && direct > 0
    if (direct === 0) problems.push(`${f}: mem().${field} 只写不读（写入后无处渲染——用户看不到自己记的东西）`)
    else if (viaAgg) { /* 经聚合函数渲染，视为已读取 */ }
  }
}
if (problems.length) { console.error('✗ 写入渲染断言失败：\n- ' + problems.join('\n- ')); process.exit(1) }
console.log(`✓ 写入渲染：${targets.length} 个 JS 文件扫描（每个 mem() 写入点都有读取）`)
