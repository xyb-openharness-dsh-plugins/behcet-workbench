#!/usr/bin/env node
/**
 * 临床试验闸门：入口要么**四段齐**（按 35 号），要么**裁剪得有实测依据**——不许靠推断裁掉。
 *
 * 为什么单列（2026-11-12 两个仓同一天踩同一个坑）：
 *   裁剪理由写的是「候选池会长期是已载个位数」「罕见病召回不可靠」，属于**推断**；
 *   随后 30 条的实测说明召回比预想的多（多数是登记研究、不是干预试验）。一条推断就砍掉整条功能线，
 *   而且裁完之后前端只剩一个「裁剪说明页」，`trialMatch` 后端却还在——是最典型的"假入口"。
 *
 * 判据（35 号四段链路：建档 → 检索 → 匹配 → 呈现/收藏）：
 *   A 有数据（research 目录下的 trials 快照 sqlite / jsonl）或后端 `trialMatch`：
 *     前端必须四段齐，缺哪段报哪段；有数据却只有「裁剪说明页」→ 红。
 *   B 没有数据也没有后端（真裁剪）：裁剪理由必须带**实测数字**（N 条 / 快照日期），
 *     且不许只用「个位数 / 极少 / 不可靠」这类推断词当理由。
 *
 * 用法：
 *   node scripts/check-trial-chain.mjs [项目根]
 *   node scripts/check-trial-chain.mjs --self-test
 * 退出码：0 通过 / 1 失败 / 2 用法错误
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SELF_TEST = process.argv.includes('--self-test')
const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.')
const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

function findTrialData(dir, depth = 0) {
  if (depth > 3 || !existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) out.push(...findTrialData(full, depth + 1))
    else if (/trials?.*\.(sqlite|jsonl)$/i.test(name)) out.push(name)
  }
  return out
}

export function check(input) {
  const { ui, backend, docs, trialFiles } = input
  const fails = []
  const oks = []
  const hasData = trialFiles.length > 0
  const hasBackend = /trialMatch\s*\(|trials?\/search|\/trials?\b/.test(backend)
  const trimOnly = /裁剪说明|裁剪临床试验|不假装有功能/.test(ui)

  if (hasData || hasBackend) {
    const segs = [
      ['建档（只有已确认字段参与匹配）', /molecular_marker|pathology_type|档案字段|建档/],
      ['检索（关键词/病理/状态/阶段/地区）', /关键词|keyword/],
      ['匹配（符合度 pct + 四档分层 + 待确认按 0 计）', /符合度|pct|分层|待确认/],
      ['呈现/收藏（saved_trial 或收藏）', /saved_trial|收藏/],
    ]
    const missing = segs.filter(([, re]) => !re.test(ui)).map(([n]) => n)
    if (missing.length) fails.push(`35 号四段链路缺：${missing.join('；')}`)
    else oks.push('35 号四段链路齐：建档 / 检索 / 匹配 / 呈现收藏')
    if (hasData && trimOnly && missing.length) fails.push(`包里有试验快照（${trialFiles.slice(0, 2).join(', ')}）但前端只有「裁剪说明页」——数据在、入口是假的`)
    if (hasData) oks.push(`有试验快照：${trialFiles.slice(0, 3).join(', ')}`)
    if (hasBackend) oks.push('后端有 trialMatch 路由')
  } else {
    const measured = /\d+\s*条/.test(docs) && /(实测|召回|快照|snapshot)/.test(docs)
    const inference = /个位数|极少|不可靠|数量很少|罕见病/.test(docs)
    if (measured) oks.push('裁剪理由带实测数字（N 条 / 快照口径）')
    else if (inference) fails.push('裁剪理由只有推断（个位数/极少/不可靠），没有实测 N 条与快照口径——先实测再裁')
    else fails.push('既没有数据/后端，也没有写得清楚的裁剪理由（实测数字 + 快照日期）')
  }
  return { pass: fails.length === 0, fails, oks }
}

const BAD = {
  ui: "page === 'clinical' → '临床试验（裁剪说明）' + '本台未接入临床试验快照：登记研究数量极少，统一检索通道对罕见病召回不可靠'",
  backend: 'trialMatch(keyword) { ... }',
  docs: '快照 0 条；理由三条：候选池个位数、召回不可靠、字段不对齐。',
  trialFiles: [],
}
const GOOD = {
  ui: "档案字段网格 molecular_marker；关键词/病理/状态/阶段检索；符合度 pct 四档分层 待确认按0计；saved_trial 收藏",
  backend: 'trialMatch(keyword) { ... }',
  docs: '实测 30 条（其中多数为登记研究，干预试验 N 条），快照 2026-11-12',
  trialFiles: ['cidp_trials_2026.sqlite'],
}

if (SELF_TEST) {
  const bad = check(BAD)
  const good = check(GOOD)
  const ok = bad.pass === false && good.pass === true
  console.log(JSON.stringify({ selfTest: ok ? 'PASS' : 'FAIL', bad, goodPass: good.pass }, null, 2))
  process.exit(ok ? 0 : 1)
}

if (!existsSync(join(root, 'lib/client.js')) && !existsSync(join(root, 'public/app.js'))) {
  console.error('✗ 用法：node scripts/check-trial-chain.mjs <项目根>')
  process.exit(2)
}

/* UI 代码不一定都在 app.js：breast 把页面拆在 public/js/*.js 里。
   扫 public/ 下两层所有 js（排除 vendor/node_modules），否则真实页面被判"没实现"。 */
function readTree(dir, depth = 0) {
  if (depth > 2) return ''
  let out = ''
  try {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const rel = join(dir, e.name)
      if (e.isDirectory()) { out += '\n' + readTree(rel, depth + 1); continue }
      if (/\.(m?js)$/.test(e.name)) out += '\n' + read(rel)
    }
  } catch { /* 目录不存在就跳过 */ }
  return out
}
const ui = `${read('lib/client.js')}\n${read('public/app.js')}\n${readTree('public')}\n${read('lib/client-trials.js')}`
const backend = `${read('dsh/index.js')}\n${read('dsh/workbench.js')}`
const docs = `${read('docs/CLINICAL-DATA.md')}\n${read('docs/DEV-REQUIREMENTS.md')}` +
  readdirSync(join(root, 'docs')).filter((n) => /^DEV-REQUIREMENTS/.test(n)).map((n) => read(join('docs', n))).join('\n')

const result = check({ ui, backend, docs, trialFiles: findTrialData(join(root, 'research')) })
for (const o of result.oks) console.log(`✓ ${o}`)
for (const f of result.fails) console.error(`✗ ${f}`)
console.log(result.pass ? '\n✓ 临床试验闸门通过' : '\n✗ 临床试验闸门未通过：要么四段齐，要么裁剪有实测依据')
process.exit(result.pass ? 0 : 1)