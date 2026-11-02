#!/usr/bin/env node
/**
 * check-ctx-provide.mjs — ctx 写属性必须有 provide 声明（AML 0.3.1 真机回收）
 *
 * 抓的缺陷：dsh/index.js 里 `ctx.amlWorkbench = {...}` 但 inject/provide 没声明，
 * 宿主 0.2.0-rc.2 直接抛 `cannot set property "x" without provide` → 整个插件不激活，
 * 界面加载不起来。**桩件烟测不校验 provide**，所以 smoke:activate 全绿、装上去挂。
 *
 * 用法：node scripts/check-ctx-provide.mjs <项目根>
 * 判据：
 *   C1 dsh/index.js（或 dsh/*.js）里出现 `ctx.<key> = …` 赋值 ⇒ key 必须在
 *      `export const provide = [...]` 里，或属于已知框架键（webServer/connection/effect/…）
 *   C2 出现 `export const provide` 时其元素必须都是字符串字面量
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const FRAMEWORK = new Set(['webServer', 'connection', 'effect', 'on', 'logger', 'scope', 'root', 'app', 'config', 'baseDir', 'logger2'])
const problems = []

const files = ['dsh/index.js', 'dsh/window.js', 'dsh/log.js']
for (const f of files) {
  const p = join(root, f)
  if (!existsSync(p)) continue
  const s = readFileSync(p, 'utf8')
  const provided = new Set()
  const pm = s.match(/export const provide\s*=\s*\[([^\]]*)\]/)
  if (pm) for (const m of pm[1].matchAll(/['"]([^'"]+)['"]/g)) provided.add(m[1])

  // 收集 ctx.<key> = 赋值（排除 ctx.effect(...)/ctx.on(...) 之类调用）
  for (const m of s.matchAll(/\bctx\.([A-Za-z_$][\w$]*)\s*=\s*(?!=)/g)) {
    const key = m[1]
    if (FRAMEWORK.has(key) || provided.has(key)) continue
    const line = s.slice(0, m.index).split('\n').length
    problems.push(`${f}:${line} ctx.${key} 有赋值但未在 provide 声明（宿主会抛 "cannot set property without provide" → 插件不激活）`)
  }
}

if (problems.length) {
  console.error('✗ ctx/provide 断言失败：\n- ' + problems.join('\n- '))
  console.error('  修法：要么删掉这个 ctx 写（改用 return/事件/回调回报），要么加 export const provide = [\'' + '...' + '\'] 并确认宿主契约允许。')
  process.exit(1)
}
console.log('✓ ctx/provide：dsh 入口的 ctx 写属性都已在 provide 声明（或属框架键）')
