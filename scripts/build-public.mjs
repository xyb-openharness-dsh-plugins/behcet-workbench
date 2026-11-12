#!/usr/bin/env node
/**
 * 生成 public/（装机界面）：从 prototypes/v0.2 原样复制业务前端 + 疾病概要两件共享件。
 *
 * 为什么需要它：本仓只有 prototypes/，没有 public/，dsh/index.js 也只注册了 /health ——
 * 装进 Desktop 后外壳（lib/client.js）没有可加载的业务页，面板只剩骨架卡片。
 *
 * 两个容易漏的点（踩过）：
 *   ① 原型里的疾病概要走仓级 `assets/patterns/disease-primer.{css,js}`，路径是 `../../assets/...`。
 *      装机后 public/ 是同源静态目录，那个相对路径会 404 —— 页面看着正常，「?」点了没反应。
 *      所以这里把两件落到 public/patterns/ 并把引用改写成 `./patterns/`。
 *   ② 版本字面量只改 title 一处，且用锚点正则而不是写死原型的版本号。
 *
 * 纪律：与原型同一份渲染代码，只做上面两件事。
 *
 * 用法：
 *   node scripts/build-public.mjs          写入
 *   node scripts/build-public.mjs --check  只校验，不同步退出 1
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'prototypes', 'v0.2')
const PATTERNS = join(root, 'assets', 'patterns')
const OUT = join(root, 'public')
const checkOnly = process.argv.includes('--check')
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim()

const FILES = ['demo-data.js', 'demo-data-b.js', 'metric-model.js', 'pathway-model.js', 'primer-data.js', 'host-bridge.js']
const PATTERN_FILES = ['disease-primer.css', 'disease-primer.js']
const read = (dir, name) => readFileSync(join(dir, name), 'utf8')

function fail(messages) {
  for (const m of messages) console.error(`✗ ${m}`)
  process.exit(1)
}

/* 原型 → 开发版只允许这两类改动：版本字面量、共享件相对路径。 */
function patchIndex(html) {
  const edits = [
    {
      from: /<title>[^<]*交互原型 v[\d.]+<\/title>/,
      to: `<title>小贝宝 BeiPal · 白塞病工作台（开发版 v${version}）</title>`,
      what: '<title>',
    },
    {
      from: /\.\.\/\.\.\/assets\/patterns\//g,
      to: './patterns/',
      what: '../../assets/patterns/ → ./patterns/',
    },
  ]
  let out = html
  for (const { from, to, what } of edits) {
    if (!from.test(out)) fail(`prototypes/v0.2/index.html 结构变了，找不到锚点：${what}`)
    out = out.replace(from, to)
  }
  return out
}

const outputs = { 'index.html': patchIndex(read(SRC, 'index.html')) }
for (const name of FILES) outputs[name] = read(SRC, name)
for (const name of PATTERN_FILES) outputs[`patterns/${name}`] = read(PATTERNS, name)

if (checkOnly) {
  const problems = []
  for (const [name, content] of Object.entries(outputs)) {
    const file = join(OUT, name)
    if (!existsSync(file)) problems.push(`缺 public/${name}`)
    else if (readFileSync(file, 'utf8') !== content) problems.push(`public/${name} 与源不同步（或版本字面量过期）`)
  }
  if (problems.length) fail(problems)
  console.log(`✓ public/ 与 prototypes/v0.2 + assets/patterns 同步（v${version}，${Object.keys(outputs).length} 个文件）`)
  process.exit(0)
}

mkdirSync(join(OUT, 'patterns'), { recursive: true })
for (const [name, content] of Object.entries(outputs)) writeFileSync(join(OUT, name), content)
console.log(`已生成 public/：${Object.keys(outputs).join(', ')}（v${version}）`)