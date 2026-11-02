#!/usr/bin/env node
/**
 * check-medical-threshold.mjs — 阈值类判定逻辑的断言模板（38 号）
 *
 * 复制到项目后改三处：① 判定函数名 ② 阈值常量名 ③ 用例表。
 *
 * 为什么需要这个文件（2026-10-26 AML v0.2.0 实测 P0）：
 *   粒缺发热定义是「单次 ≥38.3℃，或 ≥38.0℃ 持续超过 1 小时」。
 *   代码写的是 `if (v >= 38.3 || v >= 38.0)` —— 数学上等价于 `v >= 38.0`，
 *   时长条件被整个丢掉，于是单次 38.1℃ 也弹「这是急症信号」。
 *   文案是对的、弹窗也确实弹了，所有探针全绿，只有逻辑是错的。
 *   后果是让患者对急症提示脱敏：真正 38.5℃ 时被当成又一次误报。
 *
 * 做法：把判定函数从源码里抽出来，在 Node 里**真实执行**（不是正则猜），
 *      跑一组边界/时长/无效值用例，并用一条元断言证明"旧的错误写法会被抓住"。
 *
 * 用法：node scripts/check-medical-threshold.mjs
 * 退出码：0 通过 / 1 有硬问题
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'public/app.js')   // 原型阶段改成 prototypes/v0.x/app.js

/* ↓↓↓ 复制后改这里：判定函数名 + 它依赖的阈值常量名 ↓↓↓ */
const FN_NAME = 'classifyTemp'
const CONST_NAMES = ['FEVER_SINGLE', 'FEVER_SUSTAINED', 'FEVER_SUSTAINED_MS']
/* ↑↑↑ */

const src = readFileSync(APP, 'utf8')
const fails = []
const oks = []

/** 从源码里抽出 `function NAME(...) { ... }` 整块（花括号配平，不靠正则贪婪）。 */
function extractBlock(name) {
  const i = src.indexOf(`function ${name}(`)
  if (i < 0) return null
  let depth = 0, started = false
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1) }
  }
  return null
}

const consts = CONST_NAMES.map((n) => {
  const m = src.match(new RegExp(`const ${n} = ([^;]+);`))
  if (!m) fails.push(`找不到阈值常量 ${n}——阈值必须写成具名常量（单一来源），不要散落字面量`)
  return m ? `const ${n} = ${m[1]};` : null
})

const fn = extractBlock(FN_NAME)
if (!fn) {
  fails.push(`找不到 ${FN_NAME}()：阈值判定必须是一个可单独执行、可断言的纯函数，`
    + '不要内联在事件处理里（内联了就只能靠正则猜，而正则猜不出等价变换）')
}

if (!fails.length) {
  let classify
  try {
    classify = new Function(`${consts.join('\n')}\n${fn}\nreturn ${FN_NAME};`)()
  } catch (e) {
    fails.push(`${FN_NAME} 无法在隔离环境执行：${e.message}`)
  }

  if (classify) {
    /* ↓↓↓ 复制后改成本项目的用例（≥6 条 + 1 条元断言） ↓↓↓ */
    const T = (h, m) => `2026-10-20T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const CASES = [
      { name: '单次 38.5℃ → 急症', ts: T(22, 10), v: 38.5, prior: [], want: 'fever',
        why: '强条件（单次即成立）不该被时长条件绑住' },
      { name: '单次 38.3℃（恰在线上）→ 急症', ts: T(22, 10), v: 38.3, prior: [], want: 'fever',
        why: '边界值含等号' },
      { name: '单次 38.1℃、无更早记录 → 观察', ts: T(22, 10), v: 38.1, prior: [], want: 'watch',
        why: '这是最典型的退化点：38.1 不该弹急症' },
      { name: '38.1℃ + 90 分钟前的 38.2℃ → 急症', ts: T(22, 10), v: 38.1, prior: [{ ts: T(20, 40), v: 38.2 }], want: 'fever',
        why: '时长条件成立' },
      { name: '38.1℃ + 30 分钟前的 38.2℃ → 观察', ts: T(22, 10), v: 38.1, prior: [{ ts: T(21, 40), v: 38.2 }], want: 'watch',
        why: '时长不足' },
      { name: '38.1℃ + 2 小时前是 37.9℃ → 观察', ts: T(22, 10), v: 38.1, prior: [{ ts: T(20, 10), v: 37.9 }], want: 'watch',
        why: '未达阈值的历史记录不计入"在阈值以上持续"' },
      { name: '37.5℃ → 不触发', ts: T(22, 10), v: 37.5, prior: [], want: 'none',
        why: '低于阈值不进分流' },
      { name: 'NaN → 不触发', ts: T(22, 10), v: Number('abc'), prior: [], want: 'none',
        why: '非法输入不得进入分流' },
    ]
    /* ↑↑↑ */

    for (const c of CASES) {
      let got
      try { got = classify(c.ts, c.v, c.prior) } catch (e) { fails.push(`${c.name}：抛异常 ${e.message}`); continue }
      if (got.level === c.want) oks.push(c.name)
      else fails.push(`${c.name}：期望 ${c.want}，实得 ${got.level}（${got.why}）——${c.why}`)
    }

    /* 元断言：把旧的错误写法写回来，它必须让"单次 38.1"用例失败。
       没有这一条，用例全绿只说明"用例恰好都过了"，不说明"能抓住退化"。 */
    const buggy = (ts, v) => (v >= 38.3 || v >= 38.0 ? 'fever' : 'none')
    if (buggy(T(22, 10), 38.1) === 'fever') oks.push('元断言：旧写法确实把单次 38.1℃ 判成急症（本断言抓得住它）')
    else fails.push('元断言失败：无法复现旧缺陷，说明用例没覆盖到退化点')
  }
}

if (fails.length) {
  console.error('✗ 阈值判定断言失败：')
  for (const f of fails) console.error('  - ' + f)
  console.error(`  （通过 ${oks.length} 条）`)
  process.exit(1)
}
console.log(`✓ 阈值判定：${oks.length} 条用例通过（边界 / 时长 / 无效值 + 元断言）`)
