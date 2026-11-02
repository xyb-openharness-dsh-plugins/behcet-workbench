#!/usr/bin/env node
/**
 * 患者可见文案红线（禁词）——「文档写了不许说，代码里照样说」是最容易漏的一类错。
 *
 * 为什么需要这个文件：
 *   `docs/SPEC.md` §「明确不做（边界清单）」写明本工作台不诊断、不分型、不做活动度评分、
 *   不作预后判断、不作因果判断、不推荐用药；`docs/INTERACTION-DESIGN.md` 还禁止
 *   「缺项/还差几项/可以开始用药」这类**推导性结论**，以及试验匹配指数。
 *   这些是**产品文案**层面的约束——文档写得很清楚，但**没有任何检查器在拦**。
 *   于是原型/开发版只要有人顺手写一句「你的病情属于中度活动」，门禁全绿、评审也未必看得出。
 *
 *   本检查器把「边界清单」变成可执行的断言：扫描**患者可见面**（`prototypes/`、`lib/`、
 *   `public/`），命中「结论/建议/预后/分级/匹配」形态的句子即失败。
 *
 * 只扫患者可见面，**不扫 docs/**：
 *   文档必须能够**讨论**这些词（例如 SPEC 的边界清单本身就写着「不作诊断」、
 *   UI-DESIGN 的页面树里有「病程与诊断过程」这一合法的二级页名）。
 *   把 docs 也纳入扫描会制造大量必然的误报，反而让人学会忽略这个检查器。
 *
 * 因此禁词一律写成**断言形态**（需要主谓/结论宾语），不裸匹配「诊断」「分级」这些话题词：
 *   合法：「病程与诊断过程」「什么情况要马上就医」「待核」
 *   非法：「诊断为白塞病」「病情分级为中度」「建议服用」「可以停药」
 *
 * 不支持行级豁免：压缩代码可能整页只有一行，行级豁免会屏蔽其他命中；误报须修改规则并添加回归。静态模式覆盖有限，不能证明文案安全，也不能替代临床审核。
 *
 * 用法：
 *   node scripts/check-wording.mjs [--root .]
 *   node scripts/check-wording.mjs --self-test
 * 退出码：0 通过 / 1 有硬问题
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, extname } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const ROOT = resolve(argOf('--root', '.'))

/* 患者可见面：原型、装配层、开发版。不存在就跳过（原型/开发版不同阶段）。 */
const SURFACES = ['prototypes', 'lib', 'public']
const EXTS = new Set(['.js', '.mjs', '.html', '.htm', '.json', '.css'])

function collect(dir, acc) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) collect(p, acc)
    else if (EXTS.has(extname(name))) acc.add(relative(ROOT, p))
  }
  return acc
}
const files = (() => {
  const acc = new Set()
  for (const s of SURFACES) collect(join(ROOT, s), acc)
  return [...acc]
})()

/**
 * 禁词表。每条 = [说明, 正则, 为什么]。
 * 一律锚在**结论形态**上，避免把话题词（诊断过程、就医提示）误伤。
 */
const RULES = [
  ['断言诊断', /(?:你|您|患者|本人)(?:已)?(?:确诊|患有|得的是|就是)\s*[\u4e00-\u9fa5A-Za-z]/,
    '工作台不诊断，不得替患者下诊断结论'],
  ['断言病情分级', /病情\s*(?:已)?(?:分级|活动度|严重程度)\s*(?:为|是|：|:)\s*\S/,
    '分级/活动度是派生判断，不落库、不展示结论'],
  ['断言预后', /预后\s*(?:良好|较差|不佳|尚可)|生存期\s*(?:约|为|是|还有)\s*\S|生存率\s*\d/,
    '不作预后或生存期估计'],
  ['用药建议', /(?:建议|推荐|应该|需要)\s*(?:服用|使用|加量|减量|停用|换药|改用)|可以\s*(?:停药|减药|加药|减量|加量)/,
    '不作治疗选择或剂量建议'],
  ['缺项推导', /还差\s*(?:几项|哪几项|哪些项)|缺(?:哪|少哪|了哪)项|缺项清单|可以开始用药/,
    '「缺什么」本身是临床判断；S15/AC15 明确禁止此类文案'],
  ['试验匹配指数', /匹配(?:指数|度|百分比|概率)|入选概率|中签率|\b\d{1,3}\s*%\s*(?:匹配|可能入选)/,
    '禁匹配指数/百分比（用户任务书与 26 号口径）'],
  ['判定列', /(?:diagnosis|riskLevel|risk_level|severity|severityLevel|judgment|conclusion|verdict)\s*[:=]/i,
    '判定/分级是派生值，不落库、不进数据结构'],
]

/** 纯分析：喂一段文本，返回 problems。自检与主流程共用。 */
function analyze(rel, src) {
  const problems = []
  src.split('\n').forEach((line, i) => {
    /* 纯注释行不算产品文案（本检查器自己的说明、开发注释） */
    if (/^\s*(?:\/\/|\*|\/\*|<!--)/.test(line)) return
    for (const [id, re, why] of RULES) {
      const m = line.match(re)
      if (!m) continue
      problems.push(`${rel}:${i + 1} [${id}] 命中禁词「${m[0]}」—— ${why}\n    ${line.trim().slice(0, 140)}`)
    }
  })
  return problems
}

/* --self-test 必须在「没有患者可见面就跳过」之前处理：
   自检用内置 fixture，与被检查项目当前阶段无关。顺序写反时，
   在还没原型/开发版的仓里跑 --self-test 会输出"跳过"并 exit 0——看着像通过，其实一条没跑。 */
if (args.includes('--self-test')) {
  const FIXTURES = [
    ['合法·话题词（不该命中）', `<button data-sub="病程与诊断过程">病程与诊断过程</button>`, 0],
    ['合法·就医提示（不该命中）', `<h3>什么情况要马上就医</h3>`, 0],
    ['合法·待核占位（不该命中）', `<p>相关内容尚待临床审核，原型暂不提供判断或指导。</p>`, 0],
    ['非法·断言诊断', `const s = '你已确诊为白塞病';`, 1],
    ['非法·病情分级', `<p>病情分级为中度活动</p>`, 1],
    ['非法·用药建议', `<li>建议服用秋水仙碱</li>`, 1],
    ['非法·可以停药', `<p>可以停药观察</p>`, 1],
    ['非法·缺项推导', `<p>还差 2 项检查就可以开始用药</p>`, 1],
    ['非法·匹配指数', `<span>匹配度 87%</span>`, 1],
    ['非法·预后', `<p>预后良好，生存期约 5 年</p>`, 1],
    ['非法·判定列', `const row = { diagnosis: '白塞病' };`, 1],
    ['同行标记不能屏蔽其他内容', `const note = '建议服用'; // wording-allow`, 1],
  ]
  let bad = 0
  for (const [name, src, want] of FIXTURES) {
    const got = analyze('<fixture>', src).length
    const ok = got === want
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} ${name}：期望 ${want} 条，实得 ${got}`)
  }
  console.log(bad ? `✗ 自检失败 ${bad}/${FIXTURES.length}` : `✓ 自检通过 ${FIXTURES.length}/${FIXTURES.length}（合法话题词、违规样例与同行标记）`)
  process.exit(bad ? 1 : 0)
}

if (!files.length) {
  console.log('· 跳过：还没有患者可见面（prototypes/、lib/、public/ 均不存在）')
  process.exit(0)
}

const problems = []
for (const rel of files.sort()) problems.push(...analyze(rel, readFileSync(join(ROOT, rel), 'utf8')))

if (problems.length) {
  console.error('✗ 患者可见文案红线失败：')
  for (const p of problems) console.error('  ' + p)
  console.error('  → 依据 docs/SPEC.md §「明确不做（边界清单）」与 docs/INTERACTION-DESIGN.md；误报须修订规则并补回归。')
  process.exit(1)
}
console.log(`✓ 患者可见文案红线：扫描 ${files.length} 个文件，${RULES.length} 条禁词规则，0 命中`)
