/* 探针覆盖断言（LESSONS 第 10 类「检查器全绿可能是它没在看你那一页」的可断言版）
   用法：node scripts/check-probe-coverage.mjs
   判据：全量渲染探针必须覆盖 prototypes/v0.2/app.js 里的每一条 ROUTES 叶子路由。
        探针的路由清单是手写常量，加路由时极易漏改 —— 漏改时探针"全绿"只是因为它没扫新页。

   三条容易踩空的约定：
   ① ROUTES 有两种写法，都要认（早期模板只认数组式，对象式项目一上来就红）：
        数组式  var ROUTES = ['dash', 'dx/dx-wk', ...]
        对象式  const ROUTES = { dash: pageDash, 'dx/dx-wk': pageDxWk, ... }
   ② 父级别名不算必测路由：'dx' 与 'dx/dx-wk' 指向同一个 page 函数（hash 兜底用），
      扫 'dx/dx-wk' 就等于扫了 'dx'。只对「叶子路由」提覆盖要求。
   ③ 探针分两类，要求不同：
        全量探针（ALL_ROUTE_PROBES）：逐个路由渲染，必须一条不漏
        抽样探针（SAMPLE_PROBES）：窄宽/单页深挖，故意只取样本，只要求清单里的路由真实存在
      把抽样探针当全量判会制造假失败——它本来就不打算扫完。
*/
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = join(ROOT, 'prototypes/v0.2/app.js');
const fails = [], oks = [];

/* 新项目从第一天起 check 必须全绿（此时还没有原型）。
   原型不存在 → 明确 skip 并说清"等原型出来才开始保护"，而不是静默通过或直接崩。
   注意：skip 不是静默——它会把 skip 原因打出来，避免以后误以为已经被保护了。 */
if (!existsSync(APP)) {
  console.log(JSON.stringify({ pass: true, skipped: true,
    reason: 'prototypes/v0.2/app.js 还不存在（原型未开始）：探针覆盖断言暂不启用，原型落地后自动生效。',
    fails: [], oks: [] }, null, 2));
  process.exit(0);
}

const app = readFileSync(APP, 'utf8');

/** 从 app.js 提取全部路由名；两种写法都支持，返回 null 表示两种都没找到。 */
function extractRoutes(src) {
  const arr = src.match(/(?:var|const|let)\s+ROUTES\s*=\s*\[([\s\S]*?)\];/);
  if (arr) {
    const routes = [...arr[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    if (routes.length) return routes;
  }
  /* 对象式：只取「键后面跟 page 函数」的条目，避免把对象里其它字面量误当路由。 */
  const obj = src.match(/(?:var|const|let)\s+ROUTES\s*=\s*\{([\s\S]*?)\n\};/);
  if (obj) {
    const routes = [];
    for (const m of obj[1].matchAll(/(?:['"]([a-z][a-z0-9/-]*)['"]|([a-z][a-z0-9]*))\s*:\s*(page[A-Za-z0-9]+)/g)) {
      routes.push(m[1] || m[2]);
    }
    if (routes.length) return [...new Set(routes)];
  }
  return null;
}

/* 全量渲染探针：必须覆盖每一条叶子路由。新项目改名/新增探针时改这里。 */
const ALL_ROUTE_PROBES = [
  'scripts/probe-aml-m2.mjs',
];
/* 抽样探针：只要求它列出的路由在 ROUTES 里真实存在（防止页面改名后探针扫空气仍全绿）。 */
const SAMPLE_PROBES = [
  'scripts/probe-responsive.mjs',
];

const routes = extractRoutes(app);
if (!routes) {
  fails.push('routes: 在 app.js 里找不到 ROUTES（数组式 var ROUTES = [...] 或对象式 const ROUTES = {...} 均未命中）');
} else {
  /* 叶子路由 = 带 '/' 的子页，或压根没有子页的顶层页（如 dash/chart）。
     父级别名（有同名子页前缀的纯顶层键）不单独要求。 */
  const prefixes = new Set(routes.filter((r) => r.includes('/')).map((r) => r.split('/')[0]));
  const leaves = routes.filter((r) => r.includes('/') || !prefixes.has(r));
  oks.push(`routes: 解析出 ${routes.length} 条，其中叶子 ${leaves.length} 条`);

  const probeRoutes = (txt) => new Set([...txt.matchAll(/['"]([a-z][a-z0-9]*(?:\/[a-z0-9-]+)?)['"]/g)].map((m) => m[1]));

  for (const rel of ALL_ROUTE_PROBES) {
    let txt;
    try { txt = readFileSync(join(ROOT, rel), 'utf8'); } catch {
      fails.push(`coverage: 全量探针 ${rel} 不存在（改名或未生成？）——它缺失时没有任何东西在扫新页面`);
      continue;
    }
    const have = probeRoutes(txt);
    const missing = leaves.filter((r) => !have.has(r));
    if (missing.length) fails.push(`coverage: ${rel} 漏了 ${missing.length} 条叶子路由 [${missing.join(', ')}]（新页不会被它扫到）`);
    else oks.push(`coverage: ${rel} 覆盖全部 ${leaves.length} 条叶子路由`);
  }

  for (const rel of SAMPLE_PROBES) {
    let txt;
    try { txt = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; } // 抽样探针可选
    const have = probeRoutes(txt);
    const ghost = [...have].filter((r) => r.includes('/') && !routes.includes(r));
    if (ghost.length) fails.push(`coverage: ${rel} 引用了不存在的路由 [${ghost.join(', ')}]（页面改名后探针在扫空气，全绿不代表通过）`);
    else oks.push(`coverage: ${rel} 的 ${have.size} 条抽样路由全部真实存在`);
  }

  if (ALL_ROUTE_PROBES.length === 0)
    fails.push('coverage: 没有配置全量探针——此时没有任何东西在扫全部页面');
}
console.log(JSON.stringify({ pass: fails.length === 0, fails, oks }, null, 2));
process.exit(fails.length === 0 ? 0 : 1);
