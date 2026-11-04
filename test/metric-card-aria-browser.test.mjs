import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

// 指标卡可翻转，读屏只能靠 aria-label 知道背面是什么。drawable=false 的非空卡背面
// 是记录列表（单点、同日多条等），不是趋势图；初始、翻面、翻回三处提示必须同一口径。
// A 组覆盖单点与可画，B 组覆盖单点/单位缺失与同日多点，外加空目录卡。
const probe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const eq=(a,b,m)=>{if(a!==b)throw Error(m+'：'+a+' ≠ '+b)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function'&&typeof flipCard==='function'&&state.records.length>0,'应用未就绪');
  const card=id=>document.querySelector('.mcard[data-card="'+id+'"]');
  const toggle=id=>card(id).querySelector(':scope > .mcard-hit');
  const aria=id=>toggle(id).getAttribute('aria-label');
  // 原生按钮的 Enter/Space 由浏览器转成 click；这里直接 click 验证状态机，真实键盘另由 CDP 回归覆盖。
  const flipKey=id=>toggle(id).click();
  go('病情整理','指标检测');
  await waitFor(()=>card('a~0')&&card('c~0')&&card('empty~z'),'A 组指标卡未渲染');

  // A 可画卡：保持“趋势面”
  const a0=aria('a~0');
  check(/最新值.*查看趋势/.test(a0),'A 可画卡初始应提示查看趋势：'+a0);
  flipKey('a~0');
  check(/趋势面.*返回/.test(aria('a~0')),'A 可画卡翻面后应为趋势面：'+aria('a~0'));
  check(card('a~0').querySelector('.mface.back svg'),'A 可画卡背面应绘制趋势图');
  flipKey('a~0');
  eq(aria('a~0'),a0,'A 可画卡翻回提示应与初始一致');

  // A 单点卡：背面是记录而不是趋势
  const c0=aria('c~0');
  check(/最新值.*查看记录/.test(c0),'A 单点卡初始应提示查看记录：'+c0);
  check(!/趋势/.test(c0),'A 单点卡初始不应提示趋势：'+c0);
  flipKey('c~0');
  const cBack=aria('c~0');
  check(/记录面.*返回/.test(cBack),'A 单点卡翻面后应为记录面：'+cBack);
  check(!/趋势/.test(cBack),'A 单点卡翻面后不应称趋势：'+cBack);
  const cBackFace=card('c~0').querySelector('.mface.back');
  check(cBackFace.textContent.includes('暂不画趋势')&&cBackFace.textContent.includes('只有 1 次记录'),'A 单点卡背面应说明只有 1 次记录：'+cBackFace.textContent);
  check(!cBackFace.querySelector('svg'),'A 单点卡背面不应有趋势线');
  check(card('c~0').querySelector('.mface.front').inert,'A 单点卡翻面后正面应 inert');
  check(cBackFace.inert===false,'A 单点卡背面翻面后不应 inert');
  flipKey('c~0');
  eq(aria('c~0'),c0,'A 单点卡翻回提示应与初始一致');
  check(card('c~0').querySelector('.mface.front').getAttribute('aria-hidden')!=='true','A 单点卡翻回后正面应对读屏可见');
  check(card('c~0').querySelector('.mface.back').inert,'A 单点卡翻回后背面应惰性');

  // 空目录卡：说明面保持正确
  const z0=aria('empty~z');
  check(/记录面.*查看说明/.test(z0),'空卡初始应提示查看说明：'+z0);
  card('empty~z').click();
  check(/说明面.*返回/.test(aria('empty~z')),'空卡翻面后应为说明面：'+aria('empty~z'));
  check(card('empty~z').querySelector('.mface.back').textContent.includes('还没有记录'),'空卡背面应说明还没有记录');
  card('empty~z').click();
  eq(aria('empty~z'),z0,'空卡翻回提示应与初始一致');

  // 切到 B：单点（含单位缺失）与同日多点都只能称记录面
  document.querySelector('#group-switch').click();
  await waitFor(()=>document.querySelector('[data-use-dataset="courseB"]'),'没有列出示例组 B');
  document.querySelector('[data-use-dataset="courseB"]').click();
  await waitFor(()=>document.querySelector('#dialog-title').textContent==='确认切换合成示例组','没有切换确认');
  document.querySelector('[data-confirm-dataset="courseB"]').click();
  await waitFor(()=>state.records[0]&&state.records[0].id===201,'没有切到示例组 B');
  go('病情整理','指标检测');
  await waitFor(()=>card('ba~1')&&card('bb~0'),'B 组指标卡未渲染');

  const ba1=aria('ba~1');
  check(/最新值.*查看记录/.test(ba1)&&!/趋势/.test(ba1),'B 单点卡初始提示不对：'+ba1);
  flipKey('ba~1');
  check(/记录面.*返回/.test(aria('ba~1'))&&!/趋势/.test(aria('ba~1')),'B 单点卡翻面提示不对：'+aria('ba~1'));
  check(card('ba~1').querySelector('.mface.back').textContent.includes('只有 1 次记录'),'B 单点卡背面未说明只有 1 次记录');
  flipKey('ba~1');
  eq(aria('ba~1'),ba1,'B 单点卡翻回提示应与初始一致');

  const bb0=aria('bb~0');
  check(/最新值.*查看记录/.test(bb0)&&!/趋势/.test(bb0),'B 同日多点卡初始提示不对：'+bb0);
  card('bb~0').click();
  check(/记录面.*返回/.test(aria('bb~0'))&&!/趋势/.test(aria('bb~0')),'B 同日多点卡翻面提示不对：'+aria('bb~0'));
  const bbBack=card('bb~0').querySelector('.mface.back');
  check(bbBack.textContent.includes('同一天有 2 条记录'),'B 同日多点卡背面未说明同日多条：'+bbBack.textContent);
  check(!bbBack.querySelector('svg'),'B 同日多点卡背面不应有趋势线');
  card('bb~0').click();
  eq(aria('bb~0'),bb0,'B 同日多点卡翻回提示应与初始一致');

  // B 的可比组仍有趋势，不能被“记录面”修复误伤
  const ba0=aria('ba~0');
  check(/最新值.*查看趋势/.test(ba0),'B 可画卡初始应提示查看趋势：'+ba0);
  flipKey('ba~0');
  check(/趋势面.*返回/.test(aria('ba~0')),'B 可画卡翻面后应为趋势面：'+aria('ba~0'));
  check(card('ba~0').querySelector('.mface.back svg'),'B 可画卡背面应绘制趋势图');

  window.__metricAria='PASS';
}catch(e){window.__metricAria='FAIL: '+e.message}})()</script>`;

test('指标卡 aria-label 在单点、同日多点、可画与空卡间口径一致', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-metric-aria-');
  await fx.injectProbe(probe);
  const result = await runPage(fx.url, 'window.__metricAria || ""');
  assert.equal(result, 'PASS');
});