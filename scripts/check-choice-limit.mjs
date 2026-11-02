#!/usr/bin/env node
/**
 * 「数量上限」类控件的状态一致性 —— 提示对了、界面错了，是最难发现的一类错。
 *
 * 为什么需要这个文件（2026-10-25 PF-ILD v0.2.0 实测）：
 *   一图秀指标选择窗最多选 4 项。点第 5 项时：
 *     - toast 弹出「最多选 4 项（先去勾掉一个）」—— **提示是对的**；
 *     - 但 `<input type="checkbox">` 的浏览器原生勾选**已经发生**，
 *       代码 `return` 在 `render()` 之前，界面停在「已选 5 项」而数据只有 4 项。
 *   用户看到 5 个勾，图表只画 4 条线，而且再点一次会取消掉一个"根本没生效"的选择。
 *
 *   这类缺陷的共同形态：**拒绝分支只做了"说"，没做"改回去"**。
 *   同类还有：至少选 1 项、单选组互斥、依赖禁用的联动项。
 *
 * 设计层其实早就写了（docs/19-PROTOTYPE-CRAFT.md §5-6）：
 *   「数量上限不硬拒：指标最多 4 个，超出时**回弹 checkbox 并 toast 解释**，不静默失败。」
 *   —— 但只有文档、没有检查，PF-ILD 照样踩了。设计覆盖 ≠ 实现覆盖 ≠ 检查覆盖。
 *
 * 本检查器做**静态结构分析**（不跑浏览器）：
 *   找到所有「上限判断 + toast + return」的分支，要求同一分支里存在**状态回滚**动作
 *   （`checked = false` / `render()` / 重置类调用）。缺失即报错。
 *
 * 静态分析有局限（动态 DOM 重绘也可能"碰巧"修好），所以它只拦最典型的形态：
 *   上限判断后直接 return 且分支体内既无 DOM 回滚也无重渲染。
 *
 * 用法：
 *   node scripts/check-choice-limit.mjs [--root .] [--files "public/app.js,public/js/*.js"]
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

/** 收集要检查的 JS（默认 public 下所有 js；跳过不存在） */
function collect(dir, acc) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) collect(p, acc)
    else if (extname(name) === '.js') acc.add(relative(ROOT, p))
  }
  return acc
}
const files = [...collect(join(ROOT, 'public'), new Set())]

/* --self-test 必须在"没有 public/ 就跳过"之前处理：
   自检用的是内置 fixture，与被检查项目有没有 public/ 无关。
   顺序写反时，在脚手架仓里跑 --self-test 会直接输出"跳过"并 exit 0——
   看起来像自检通过，其实一条用例都没跑（2026-10-26 实测踩到）。 */
const SELF_TEST = args.includes('--self-test')

if (!files.length && !SELF_TEST) {
  console.log('· 跳过：没有 public/ 下的 JS（原型阶段）。M5 移植出开发版后本闸门自动生效')
  process.exit(0)
}


/**
 * 抽出「拒绝分支体」：从 if(...) 行到其体内 return/continue 语句为止（含 return 那行）。
 * 支持单行 if 与跨行块。返回 { body, hasReject }。
 */
/**
 * 抽出「拒绝分支体」：从 if(...) 行到该 if 语句结束为止（单行块到此为止）。
 * 关键：绝不能把 return 之后的行算进分支——那行在拒绝路径上根本执行不到。
 */
function rejectBranch(lines, start) {
  const first = lines[start]
  /* 非 if 形态（三元 / && 短路）：只判本行 */
  if (!/if\s*\(/.test(first)) {
    return { body: first, hasReject: /\btoast\s*\(|\breturn\b|\bcontinue\b/.test(first) }
  }
  const out = []
  let depth = 0
  let sawBrace = false
  for (let i = start; i < Math.min(start + 15, lines.length); i++) {
    const line = lines[i]
    out.push(line)
    for (const ch of line) {
      if (ch === '{') { depth++; sawBrace = true }
      else if (ch === '}') depth = Math.max(0, depth - 1)
    }
    const body = out.join('\n')
    /* 有花括号：块闭合即结束（不再吞下一行） */
    if (sawBrace && depth === 0) return { body, hasReject: /\btoast\s*\(|\breturn\b|\bcontinue\b/.test(body) }
    /* 无花括号的单行 if (x) return; */
    if (!sawBrace && /\b(?:return|continue)\b\s*;?\s*$/.test(line)) {
      return { body, hasReject: true }
    }
    /* 无花括号但 body 在下一行：最多再看一行 */
    if (!sawBrace && i > start) {
      return { body, hasReject: /\btoast\s*\(|\breturn\b|\bcontinue\b/.test(body) }
    }
  }
  const body = out.join('\n')
  return { body, hasReject: /\btoast\s*\(|\breturn\b|\bcontinue\b/.test(body) }
}

/* 上限判断的常见写法：length >= N / length > N-1 / count === MAX */
const LIMIT_RE = /\b(?:length|size|count|sel)\s*(?:>=|>|===|==)\s*(?:[\w.]*MAX\w*|\d+)/i
/* 状态回滚动作：
   ① checkbox 回写——**两个方向都算**。上限拒绝把刚勾上的回弹成 false；
      「至少留一个」拒绝把刚取消的改回 true。只认 false 会把下限分支判成没回滚
      （2026-10-26 AML 实测误报：`el.checked = true` 明明就是回写）。
   ② 重渲染 / reset / 显式回滚动词。 */
const ROLLBACK_RE = /\b(?:\.?checked\s*=\s*(?:false|true|!1|!0)|render\s*\(|reset\w*\s*\(|rollback|回弹|改回去)/i
/* 拒绝提示：分支里得真的"说了"才算拒绝分支。
   没有 toast/alert 的 return 多半是别的东西——典型是路径构造
   `if (coords.length === 1) return \`M x y\``（2026-10-26 AML smoothPath 实测误报），
   它压根不是控件状态闸门，不该进这个检查器。 */
const REJECT_MSG_RE = /\b(?:toast|alert|notify|snackbar)\s*\(/

const problems = []
const suppressed = []

/** 纯分析：喂一个文件的文本，返回该文件的 problems / suppressed。自检与主流程共用。 */
function analyze(rel, src) {
  const out = { problems: [], suppressed: [] }
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (!LIMIT_RE.test(line)) return
    if (!/if\s*\(/.test(line) && !/&&|\?/.test(line)) return
    /* 出现在注释里不算 */
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return
    /* 只取「拒绝分支体」：从 if 那行起，到体内 return/continue 为止。
       关键：不能把 return 之后的 render() 算进分支——那行根本跑不到。
       （PF-ILD 的实际形态就是这样：toast → return → 调用方末尾 render()，
         回滚"看起来有"其实在拒绝路径上不可达。） */
    const { body, hasReject } = rejectBranch(lines, i)
    if (!hasReject) return
    /* 没"说"就不是拒绝分支（排除路径构造、边界早退等非控件闸门） */
    if (!REJECT_MSG_RE.test(body)) return
    if (ROLLBACK_RE.test(body)) {
      out.suppressed.push(rel + ':' + (i + 1))
      return
    }
    out.problems.push(`${rel}:${i + 1} 数量上限分支既没有回滚 DOM 状态也没有重渲染：\n    ${line.trim()}\n    分支体：${body.trim().replace(/\n\s*/g, ' ').slice(0, 120)}\n    → 典型后果：toast 说"超了"，但 checkbox 已经勾上，界面显示 N+1 而数据只有 N（PF-ILD 2026-10-25 实测）`)
  })
  return out
}

/* 双形态回归（2026-10-26 追加）：上限拒绝（回写 false）与下限拒绝（回写 true）都必须判成"有回滚"；
   只有真正"说了但没改"的分支才允许报警。
   检查器自己写错时，静态门禁会静默全绿——和它要防的缺陷同类，所以检查器本身也带 fixture。
   用法：node scripts/check-choice-limit.mjs --self-test */
if (args.includes('--self-test')) {
  const FIXTURES = [
    ['上限拒绝·回写 false（正确）', `if (el.checked) { if (arr.length >= 4) { el.checked = false; toast('最多 4 个'); return; } arr.push(c); }`, 0],
    ['下限拒绝·回写 true（正确）', `else { if (arr.length === 1) { el.checked = true; toast('至少留一个'); return; } }`, 0],
    ['上限拒绝·只说不改（缺陷）', `if (arr.length >= 4) { toast('最多 4 个'); return; }`, 1],
    ['路径构造·非控件（不该命中）', `if (coords.length === 1) return \`M \${coords[0].x} \${coords[0].y}\`;`, 0],
    ['渲染后重绘（正确）', `if (arr.length >= 4) { toast('最多 4 个'); return render(); }`, 0],
  ]
  let bad = 0
  for (const [name, src, want] of FIXTURES) {
    const { problems: p } = analyze('<fixture>', src)
    const ok = p.length === want
    if (!ok) bad++
    console.log(`${ok ? '✓' : '✗'} ${name}：期望 ${want} 条报警，实得 ${p.length}`)
  }
  console.log(bad ? `✗ 自检失败 ${bad}/${FIXTURES.length}` : `✓ 自检通过 ${FIXTURES.length}/${FIXTURES.length}（上限/下限/非控件三形态）`)
  process.exit(bad ? 1 : 0)
}

for (const rel of files.sort()) {
  const r = analyze(rel, readFileSync(join(ROOT, rel), 'utf8'))
  problems.push(...r.problems)
  suppressed.push(...r.suppressed)
}

if (problems.length) {
  console.error('✗ 选择上限一致性检查失败：')
  for (const p of problems) console.error('  ' + p)
  if (suppressed.length) console.error('  （已识别到 ' + suppressed.length + ' 处带正确回滚的分支：' + suppressed.join(', ') + '）')
  process.exit(1)
}
if (!suppressed.length) {
  console.log('· 没有发现"数量上限"类分支（若本项目确实没有这类控件，可忽略）')
}
console.log(`✓ 选择上限一致性：扫描 ${files.length} 个文件，${suppressed.length} 处上限分支都带状态回滚`)
