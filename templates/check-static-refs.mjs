#!/usr/bin/env node
/**
 * 静态资源引用完整性自查 —— 「页面能开」不等于「脚本真的在跑」。
 *
 * 为什么需要这个文件（2026-10-25 PF-ILD v0.2.0 实测，家族第二次踩）：
 *   开发版把数据层从 `window.DEMO_DATA` 改成了异步 `/api/bootstrap`，
 *   但 `public/index.html` 里还留着 `<script src="demo-data.js"></script>`。
 *   请求 → 静态层找不到文件 → **SPA 兜底把 index.html 当 JS 返回** → 浏览器报
 *   `SyntaxError: Unexpected token '<'` → **整页脚本全废**。
 *
 *   要命的是「看起来能开」：DOM 里 header、导航、卡片标题都在（那是 HTML 本来就有的），
 *   页脚也正常，只有 JS 渲染的部分是空的。dev-server 的 `npm run check` 全绿，
 *   静态 grep 也查不出——因为文件确实"被引用了"，只是引用指向一个不存在的东西。
 *
 *   同族教训已在 docs/LESSONS.md:203 记录（ATTR「业务区全白 Unexpected token '<'」），
 *   这是第二次，按 SCAFFOLD-ITERATION §1 升 L3：**必须自动拦截**。
 *
 * 检查什么：
 *   1. index.html / app 里 `<script src>` `<link href>` `<img src>` 指向的**本地相对路径**
 *      必须在同一目录树里真实存在（跳过 http(s)://、data:、#、//）；
 *   2. 被引用的 `.js` 文件内容**不得以 `<` 开头**（典型的"HTML 兜底当 JS"）；
 *   3. 反向：`public/` 里的 `.js` 若从未被引用，提示（不是错误，可能是动态加载）。
 *
 * 用法：
 *   node scripts/check-static-refs.mjs [--root .] [--page public/index.html]
 * 退出码：0 通过 / 1 有硬问题
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative, extname } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const ROOT = resolve(argOf('--root', '.'))
const PAGE = argOf('--page', 'public/index.html')
const pagePath = join(ROOT, PAGE)

const problems = []
const notes = []

if (!existsSync(pagePath)) {
  // 原型阶段还没有开发版页面：不是故障（check 必须从第一天就绿）
  console.log('· 跳过：还没有 ' + PAGE + '（原型阶段）。M5 移植出开发版后本闸门自动生效')
  process.exit(0)
}

const html = readFileSync(pagePath, 'utf8')
const baseDir = dirname(pagePath)

/** 从 HTML 里抽本地相对引用 */
function localRefs(source) {
  const refs = []
  const push = (raw, kind) => {
    const v = String(raw || '').trim()
    if (!v) return
    if (/^(https?:)?\/\//i.test(v) || /^data:/i.test(v) || /^#/.test(v) || /^mailto:/i.test(v)) return
    /* 去掉 query/hash，只看文件 */
    const clean = v.split('#')[0].split('?')[0]
    if (!clean) return
    /* 服务器注入的占位符不算静态资源 */
    if (/^__[A-Z_]+__$/.test(clean)) return
    refs.push({ ref: clean, kind })
  }
  for (const m of source.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) push(m[1], 'script')
  for (const m of source.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) push(m[1], 'link')
  for (const m of source.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) push(m[1], 'img')
  return refs
}

const refs = localRefs(html)
if (!refs.length) notes.push('页面里没有任何本地相对引用（全是外链或占位符）')

for (const { ref, kind } of refs) {
  /* 绝对路径（/x.js）按 public 根解析；相对路径按页面目录 */
  const target = ref.startsWith('/')
    ? join(ROOT, ref.replace(/^\//, ''))
    : join(baseDir, ref)
  if (!existsSync(target)) {
    const hint = kind === 'script'
      ? '  → 浏览器会去取它；静态层 404 后若 SPA 兜底返回 index.html，就会报 `SyntaxError: Unexpected token \'<\'` 并让整页脚本失效'
      : ''
    problems.push(`${relative(ROOT, pagePath)} 引用了不存在的 ${kind}：\`${ref}\`${hint}`)
    continue
  }
  /* 被引用的 JS 不能是 HTML 兜底（即使文件存在，内容也可能是 HTML） */
  if (kind === 'script' && statSync(target).isFile() && extname(target) === '.js') {
    const body = readFileSync(target, 'utf8').trimStart()
    if (body.startsWith('<')) {
      problems.push(`${relative(ROOT, target)} 的内容以 \`<\` 开头 —— 这是 HTML（兜底页），不是 JS：整页脚本会全部失效`)
    }
  }
}

/* 反向提示：public 下未被引用的 js（弱提示，不判失败：可能由动态 import 或服务端注入） */
const pubDir = join(ROOT, 'public')
if (existsSync(pubDir)) {
  const referenced = new Set(refs.map((r) => r.ref.split('/').pop()))
  const extra = readdirSync(pubDir).filter((f) => extname(f) === '.js' && !referenced.has(f))
  for (const f of extra) notes.push(`public/${f} 没有被 ${PAGE} 直接引用（若靠动态加载可忽略；若已废弃应删掉）`)
}

if (problems.length) {
  console.error('✗ 静态引用完整性检查失败：')
  for (const p of problems) console.error('  ' + p)
  for (const n of notes) console.error('  · ' + n)
  process.exit(1)
}
console.log(`✓ 静态引用完整：${PAGE} 的 ${refs.length} 个本地引用全部真实存在${notes.length ? `（${notes.length} 条提示）` : ''}`)
for (const n of notes) console.log('  · ' + n)
