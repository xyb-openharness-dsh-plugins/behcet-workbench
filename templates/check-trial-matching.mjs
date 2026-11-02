#!/usr/bin/env node
/**
 * check-trial-matching.mjs — 试验匹配"三态 + 无判读 + 不骗人"断言（35 号 §三 / §四 / §七）
 *
 * 用法：
 *   node scripts/check-trial-matching.mjs [项目根]      # 省略则用 cwd
 *   node scripts/check-trial-matching.mjs --self-test  # 9 条反向对照（每条规则都要证明它会报 FAIL）
 *
 * 断言：
 *   T1 有匹配输出 ⇒ 必须能读出"第三态"。认两种写法：字面 '无法自动匹配' / '条目无法结构化'，
 *      或 '待确认' 与 '需核|待核对' 同时出现（v3 起等价，理由见 35 号 §三）。
 *   T2 禁 suitability / 适配度 / 入组概率 命名；禁 match_score 综合分字面量；
 *      禁 eligible 判读列——只认**结构定义形态**（`eligible: true`、`eligible TINYINT`、CREATE TABLE 里的列），
 *      不认注释里出现英文单词（小肺宝实测：无关模块注释 "resolving only eligible, full-identity series"
 *      被旧版判成判读列，属于纯误报）。
 *   T2b 实现匹配 ⇒ 有档位词 + '不是入组资格' 声明。v3 起档位词两套都认：
 *      「字段都对得上 / 部分对得上」（新，推荐）与「高度符合 / 部分符合」（v2 存量）。
 *   T2d 判据类别 `cat:` 里不得出现"靶点"——药物靶点是"药打哪里"，不是患者条件，不进分母。
 *   T3 匹配结果须有 '未核实' 或 '以官方…为准'，且提到快照 / snapshot。
 *
 * 扫描面：dsh / src / public / **lib**。lib 是 v3 新加的——小肺宝的匹配实现全在 `lib/client-trials.js`，
 * 旧版只扫前三个目录，实际只看到 dsh/index.js 一个无关文件，于是"100% 通过"。闸门看不见被测代码，
 * 比没有闸门更危险。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SCAN_DIRS = ['dsh', 'src', 'public', 'lib']

/* 触发条件：存在明确匹配模块（trialMatch 符号 / 路由 / "匹配引擎"标注）才启用三态断言；
   只提到"试验"与"匹配"二词的仓（如一期演示线）不算实现，跳过不误报。 */
const TRIGGER = /trialMatch|trial_match|matchTrials|匹配引擎/
const THREE_STATE = (s) =>
  s.includes('无法自动匹配') || s.includes('条目无法结构化') || (s.includes('待确认') && /需核|待核对/.test(s))
const UNVERIFIED = (s) => s.includes('未核实') || /以官方[^。\n]{0,8}为准/.test(s)
/* eligible 只认结构定义形态：字段声明、类型声明、建表语句里的列。 */
const ELIGIBLE_COLUMN = /(?:CREATE|ALTER)\s+TABLE[^;]{0,600}\beligible\b|\beligible\s*:\s*(?:true|false|1|0|'|\")|\beligible\s+(?:TINYINT|INTEGER|INT|TEXT|BOOLEAN|VARCHAR)\b/

export function audit(texts) {
  const problems = []
  const hasMatch = texts.filter(({ s }) => TRIGGER.test(s))
  if (!hasMatch.length) return problems

  if (!hasMatch.some(({ s }) => THREE_STATE(s))) {
    problems.push('T1 有匹配输出但读不出第三态（或写 "无法自动匹配" / "条目无法结构化"，或写 "待确认" 并说明"需核"）')
  }
  for (const { f, s } of texts) {
    if (/suitability|适配度|入组概率/i.test(s)) problems.push(`T2 ${f} 出现误导命名（suitability/适配度/入组概率）`)
    if (/match_score|matchScore/i.test(s)) problems.push(`T2 ${f} 出现 match_score 综合分字面量（pct=符合÷已对照 才合规）`)
    if (ELIGIBLE_COLUMN.test(s)) problems.push(`T2 ${f} 出现 eligible 判读列（只允许三态字符串，不允许落库判定列）`)
    if (/cat\s*:\s*['"`][^'"`]*靶点/.test(s)) problems.push(`T2d ${f} 把药物靶点写进判据类别（靶点只可单列展示，不进分母）`)
  }
  if (!hasMatch.some(({ s }) => UNVERIFIED(s))) problems.push('T3 匹配结果未写"未核实"（或"以官方登记页为准"）')
  if (!hasMatch.some(({ s }) => /snapshot|快照/i.test(s))) problems.push('T3 匹配结果未含快照日期语境')
  /* T2b 只对"真的显示了百分数"的实现生效：不显示分数的三态清单（小胰宝那版「匹配分析」）
     不需要档位词，也不该被要求写"不是入组资格"——它没有分数可误解。 */
  const scored = hasMatch.filter(({ s }) => /符合度|\bpct\b|百分之/.test(s))
  if (scored.length) {
    const scoredText = scored.map(({ s }) => s).join('')
    if (!/高度符合|部分符合|字段都对得上|部分对得上/.test(scoredText)) {
      problems.push('T2b 有百分数但缺档位词（字段都对得上/部分对得上，或存量 v2 词 高度符合/部分符合）')
    }
    if (!scoredText.includes('不是入组资格')) problems.push('T2b 有百分数但缺『不是入组资格』声明（35 号语义规则 3）')
  }
  return problems
}

const GOOD = `
const trialMatchCard = (study, score) => ({ pct: 75, label: '登记字段符合度', band: '部分对得上',
  note: '这不是入组资格，也不代表效果',
  unknown: '这条登记读不出，标为待确认，需核方案原文', foot: '登记状态未核实 · 快照 2026-10-18' })`

const SELFTEST = [
  ['合规样本（v3 词 + 等价三态 + 未核实）', GOOD, null],
  ['无关模块注释里的 eligible 不算判读列', `const schemaVersion = 1
    // resolving only eligible, full-identity series
    const trialMatch = () => ({ pct: 60, label: '登记字段符合度', band: '部分对得上', note: '不是入组资格', unknown: '待确认，需核方案原文', at: '快照 2026-10-18 · 未核实' })`, null],
  ['没有百分数的三态清单不查档位词', `const trialMatchPanel = () => h('p', null, '没有匹配结果，可调整关键词后重试；待确认项需核方案原文；快照 2026-10-18 · 未核实')`, null],
  ['eligible: true 是判读列', `${GOOD}\nconst row = { id: 1, eligible: true }`, 'T2'],
  ['suitability 命名', `${GOOD}\nconst suitability = 1`, 'T2'],
  ['matchScore 综合分', `${GOOD}\nconst matchScore = 88`, 'T2'],
  ['靶点进判据类别', `${GOOD}\nconst c = { key: 'g', cat: '研究靶点', state: 'met' }`, 'T2d'],
  ['缺三态词（只有待确认、没说需核）', GOOD.replace('这条登记读不出，标为待确认，需核方案原文', '待确认'), 'T1'],
  ['缺未核实', GOOD.replace('登记状态未核实 · 快照 2026-10-18', '快照 2026-10-18'), 'T3'],
  ['缺档位词', GOOD.replace("'部分对得上'", "'疑似'"), 'T2b'],
]

const runSelfTest = () => {
  let bad = 0
  for (const [name, src, expect] of SELFTEST) {
    const got = audit([{ f: 'fixture.js', s: src }])
    const hit = expect ? got.some((p) => p.startsWith(expect)) : got.length === 0
    if (!hit) { bad++; console.error(`✗ self-test 失败：${name} → ${got.length ? got.join('；') : '无问题'}`) }
    else console.log(`✓ ${name}`)
  }
  if (bad) { console.error(`\nself-test ${SELFTEST.length - bad}/${SELFTEST.length}`); process.exit(1) }
  console.log(`\nself-test ${SELFTEST.length}/${SELFTEST.length}（每条规则都证明过它会报 FAIL）`)
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
} else {
  const root = process.argv[2] ?? process.cwd()
  const sources = []
  for (const dir of SCAN_DIRS) {
    const p = join(root, dir)
    if (existsSync(p)) for (const f of readdirSync(p).filter((x) => x.endsWith('.js'))) sources.push(join(dir, f))
  }
  const texts = sources.map((f) => ({ f, s: readFileSync(join(root, f), 'utf8') }))
  const problems = audit(texts)
  if (problems.length) {
    console.error('✗ 试验匹配断言失败：\n- ' + problems.join('\n- '))
    process.exit(1)
  }
  console.log(`✓ 试验匹配契约（${sources.length} 个 JS 文件扫描：三态词 / 无判读列 / 未核实+快照 / 靶点不进分母）`)
}
