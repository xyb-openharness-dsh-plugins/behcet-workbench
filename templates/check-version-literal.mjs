#!/usr/bin/env node
/**
 * 页面版本字面量自查 —— 「版本号三处打架」的自动闸门。
 *
 * 为什么需要这个文件：
 * 家族口径是「VERSION 是唯一手写处，其余全部派生」，但**页面是最容易被漏掉的一处**：
 * `public/index.html` 的版本徽标、页脚「关于」都可能手写 `v0.1.0`，
 * 改版时只动了 VERSION 和 package.json，页面还显示旧版本，而**没有任何检查会响**。
 *
 * 两个病种独立复现（L2 门槛）：
 *   ① cervical-workbench `scripts/check-version.mjs:67`（页面字面量去重比对）
 *   ② PF-ILD-workbench v0.2.0 升版时 audit 报红：`public/index.html 里有版本字面量
 *      与 VERSION 不一致（0.1.0）` —— 徽标与页脚各一处，移植脚本只替换了第三处。
 *
 * 正确形态（PF-ILD 已落地）：页面里**一个版本字面量都不许有**，全部走占位符
 * （`__VERSION_DISPLAY__` / `__BUILD_DATE__`），由服务端注入器在响应时填。
 * 这样「页面显示哪一版」永远等于「服务端跑的是哪一版」，物理上无法不一致。
 *
 * 本脚本同时支持两种约定，按项目实际选：
 *   A. 占位符约定（推荐）：页面必须含占位符，且**不得**含任何 `vX.Y.Z` 或 `20XX-XX-XX`；
 *   B. 字面量约定（存量项目）：页面出现的版本字面量必须**全部等于** VERSION。
 *
 * 用法：node scripts/check-version-literal.mjs [--root .]
 * 退出码 0 通过 / 1 失败。失败输出带文件与行号，便于直接改。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : '.')
const page = join(ROOT, 'public/index.html')
const versionFile = join(ROOT, 'VERSION')

const problems = []
/* 原型阶段的项目还没有 public/ 开发版页面：不是故障，是还没到那一步。
   check 必须从第一天就是绿的（脚手架口径），所以这里跳过而不是报错。
   一旦 public/index.html 出现（M5 移植完成），本闸门自动生效。 */
if (!existsSync(page)) {
  console.log('· 跳过：还没有 public/index.html（原型阶段）。M5 移植出开发版页面后本闸门自动生效')
  process.exit(0)
}
if (!existsSync(versionFile)) {
  console.error('✗ 找不到 VERSION（版本唯一手写处）。本项目约定从 VERSION 派生版本号')
  process.exit(1)
}

const html = readFileSync(page, 'utf8')
const version = readFileSync(versionFile, 'utf8').trim()

/** 逐行找字面量，带行号报错 */
function scanLiterals(source) {
  const hits = []
  source.split('\n').forEach((line, i) => {
    const versions = line.match(/v\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?/g) || []
    const dates = line.match(/\b20\d\d-\d\d-\d\d\b/g) || []
    if (versions.length || dates.length) hits.push({ line: i + 1, versions, dates, text: line.trim().slice(0, 100) })
  })
  return hits
}

const hasPlaceholder = html.includes('__VERSION_DISPLAY__') || html.includes('__VERSION__')
const hits = scanLiterals(html)

if (hasPlaceholder) {
  /* 约定 A：占位符约定 —— 页面不许有任何写死的版本/日期 */
  for (const h of hits) {
    problems.push(`public/index.html:${h.line} 写死了${h.versions.length ? '版本 ' + h.versions.join(',') : ''}${h.dates.length ? '日期 ' + h.dates.join(',') : ''} → 应改用 __VERSION_DISPLAY__ / __BUILD_DATE__ 占位`)
  }
  if (!problems.length) {
    console.log(`✓ 页面走占位符约定（VERSION=${version}）：${hits.length === 0 ? '无写死版本/日期' : ''}`)
  }
} else if (hits.length) {
  /* 约定 B：存量字面量约定 —— 出现的字面量必须全部等于 VERSION */
  const display = `v${version}`
  for (const h of hits) {
    for (const v of h.versions) {
      if (v !== display) problems.push(`public/index.html:${h.line} 版本字面量 ${v} ≠ VERSION ${display}`)
    }
  }
  if (!problems.length) console.log(`✓ 页面字面量与 VERSION 一致（${display}）`)
} else {
  /* 既无占位符也无字面量：页面根本不显示版本——这是"看不见就不算错"，也要拦 */
  problems.push('public/index.html 既没有版本占位符也没有版本字面量：用户看不到当前版本，出问题无从判断装的是哪一版')
}

if (problems.length) {
  console.error('✗ 版本字面量检查失败：')
  for (const p of problems) console.error('  ' + p)
  console.error('\n修法（推荐）：页面里版本/日期改占位符，服务端注入时替换。见 docs/06 版本一节。')
  process.exit(1)
}
