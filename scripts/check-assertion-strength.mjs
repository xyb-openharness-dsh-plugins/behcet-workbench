/* 断言强度断言（LESSONS「假面孔 C：被空值骗过的真」的可断言版）
   用法：node scripts/check-assertion-strength.mjs
   判据：凡是"比较两态相同"的断言（`a === b` / `a !== b`）
        必须在它之前（同一段内）先断言过 a 或 b 非空非零。
   为什么：`before === after` 在两个值都是空字符串时恒真——
        绘图函数一条线都没画出来，这条断言仍然绿。
        慢性粒细胞白血病工作台实测：一整轮评审里 `d` 全是 ''，R3 断言全绿。

   检测范围（只查探针脚本里真正会骗人的那些形态）：
   - 变量来自 getAttribute / textContent / innerText / innerHTML / getBBox / evaluate
   - 两个变量用 === 或 !== 比较
   豁免：与字面量比较（`x === 'ok'`）不算——那不是在比两态。
*/
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = join(ROOT, 'scripts');
const fails = [], oks = [];

// 不用手写清单——手写清单漏新文件正是本检查器要防的那类错（LESSONS 第 10 类）。
// 扫 scripts 下所有以 probe- 或 verify- 开头的 .py / .mjs，新加的探针自动纳入。
const CANDIDATES = existsSync(SCRIPTS)
  ? readdirSync(SCRIPTS).filter((f) => /^(probe|verify)[-_].*\.(py|mjs)$/.test(f))
  : [];

/* 变量取值来源：这些读法都可能读到空值 */
/* 取值来源要同时认驼峰（JS）与下划线（Playwright Python）两种写法——
   只认驼峰的话，Python 探针里的 get_attribute 会被当成"普通变量"，整条检查失效。
   第一版就是这样：故意写坏的 verify-bad.py 被判成 pass。 */
const VALUE_SRC = /(?:getAttribute|get_attribute|textContent|text_content|innerText|inner_text|innerHTML|inner_html|getBBox|get_bbox|querySelectorAll|query_selector_all|\.d\b|value|getProperty|evaluate)/;
/* 非空断言：出现其中之一即认为"先证了有东西" */
const NONEMPTY = [
  /\.length\s*>\s*0/, /\.length\s*!==?\s*0/, /\.length\s*>=\s*1/,
  /len\s*\(\s*\)\s*>\s*0/, /len\(/,
  /width\s*>\s*0/, /height\s*>\s*0/,
  /:\s*['"]\s*['"]\s*\)/,            // 形如 != '' 的反面：显式排除空
  /!==\s*['"]{2}/, /!=\s*['"]{2}/, /!==?\s*''/,
  /[Nn]on-?empty/, /非空/, /必须非空/, /有东西/,
];
/* 比较两态：ident === ident / ident !== ident（不是与字面量比） */
/* 比较两态：a === b / a == b / a != b（不是与字面量比）。
   字面量用引号、数字、True/False/None/null 开头，靠"两侧都必须像标识符"筛掉。 */
const CMP = /(\b[A-Za-z_$][\w$.]*)\s*(?:===?|!==?)\s*([A-Za-z_$][\w$.]*)\b/;

let checked = 0;
for (const name of CANDIDATES) {
  const p = join(SCRIPTS, name);
  if (!existsSync(p)) continue;
  checked++;
  const lines = readFileSync(p, 'utf8').split('\n');
  /* 记录每个变量的赋值行，用于找"这个变量是哪来的" */
  const assigned = new Map();
  lines.forEach((ln, i) => {
    const m = ln.match(/(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(.+)/);
    if (m && VALUE_SRC.test(m[2])) {
      if (!assigned.has(m[1])) assigned.set(m[1], []);
      assigned.get(m[1]).push({ line: i, rhs: m[2] });
    }
  });

  const bad = [];
  lines.forEach((ln, i) => {
    const m = ln.match(CMP);
    if (!m) return;
    const [, a, b] = m;
    /* 两侧都必须是我们关心的"两态变量"，否则不算 */
    const aIsVal = assigned.has(a), bIsVal = assigned.has(b);
    if (!aIsVal && !bIsVal) return;
    /* 只看真正的断言上下文：断言函数调用 / assert / ok( / check( */
    const isAssertion = /assert|expect|ok\(|check\(|fails\.push|raise|throw/.test(ln)
      || /assert|expect|ok\(|check\(|fails\.push|raise|throw/.test(lines[Math.max(0, i - 1)] || '');
    if (!isAssertion) return;
    /* 往上找 20 行内有没有非空守卫 */
    const window = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
    const guarded = NONEMPTY.some((re) => re.test(window));
    if (!guarded) {
      bad.push(`L${i + 1}: 比较 ${a} === ${b} 之前没有「非空」断言（两侧若都是空值，这条恒真）`);
    }
  });

  if (bad.length) for (const b of bad) fails.push(`strength: ${name} ${b}`);
  else oks.push(`strength: ${name} 的比较型断言都有非空前置守卫`);
}

if (checked === 0) {
  console.log(JSON.stringify({ pass: true, skipped: true,
    reason: '还没有任何探针脚本：断言强度检查暂不启用，探针落地后自动生效。',
    fails: [], oks: [] }, null, 2));
  process.exit(0);
}

if (!fails.length) oks.push(`strength: ${checked} 个探针脚本通过「先证有东西，再比不变」检查`);
console.log(JSON.stringify({ pass: fails.length === 0, fails, oks }, null, 2));
process.exit(fails.length === 0 ? 0 : 1);
