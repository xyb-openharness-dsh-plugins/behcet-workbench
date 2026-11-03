import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';

// 患者可见面不得出现的判读/建议词。这里显式断言，因为 check-wording 不拦「偏高/偏低」。
const JUDGMENT = /偏高|偏低|异常|正常范围|阴性|阳性|轻度|中度|重度|好转|恶化|有效|无效|建议|需要处理|可以停药|诊断为|分级为|预后/;

async function runProbe(t, body, attr, transformData) {
  const fx = await makePrototypeFixture(t, 'beipal-catalog-');
  if (transformData) {
    const data = await readFile(fx.dataPath('demo-data.js'), 'utf8');
    await fx.writeData('demo-data.js', data + transformData);
  }
  const script = `<script>try { const JUDGMENT=${JUDGMENT}; ${body} document.body.setAttribute('data-${attr}','PASS'); } catch(e) { document.body.setAttribute('data-${attr}','FAIL: '+e.message); }</script>`;
  await fx.writeIndex(fx.html.replace('</body>', script + '</body>'));
  const run = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--dump-dom',fx.url], {encoding:'utf8',timeout:30000});
  if (run.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, new RegExp(`data-${attr}="PASS"`), run.stdout.match(new RegExp(`data-${attr}="[^"]*"`))?.[0] || run.stderr);
}

test('目录、空卡、看板摘要与一图秀同源', async t => {
  await runProbe(t, `
    const check=(v,m)=>{if(!v)throw Error(m)};
    const txt=s=>document.querySelector(s)?.textContent||'';
    check(txt('main').includes('最近的记录'),'看板未加载');
    check(txt('[data-check-summary="recorded"]').includes('有记录 3 项'),'看板有记录计数');
    check(txt('[data-check-summary="recorded"]').includes('目录 6 项'),'看板目录计数');
    check(txt('[data-check-summary="recorded"]').includes('3 项暂无记录'),'看板未记录计数');
    check(txt('[data-check-summary="recorded"]').includes('最近采样 2026-10-20'),'看板最近采样');
    go('病情整理','指标检测');
    const heads=[...document.querySelectorAll('.cat-name')].map(x=>x.textContent.trim());
    check(heads.join('|')==='示例检验|示例测量|示例空类别','目录顺序或空类丢失: '+heads.join('|'));
    check(txt('main').includes('目录共 6 项'),'指标页目录统计');
    const empty=document.querySelector('[data-card="empty~z"]');
    check(empty&&empty.dataset.empty==='true','空卡缺失');
    check(empty.querySelector('.metric-value').textContent.includes('还没有记录'),'空卡冒充 0 值');
    check(empty.querySelector('.mface.back').textContent.includes('未记录只表示尚未录入'),'空卡背面边界说明');
    empty.click();
    check(empty.dataset.flipped==='true','空卡不能翻转');
    check(empty.querySelector('.mface.front').hasAttribute('inert'),'翻面后正面未 inert');
    empty.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
    check(empty.dataset.flipped==='false','空卡空格键不能翻回');
    check(empty.querySelector('.mface.back').hasAttribute('inert'),'翻回后背面未 inert');
    check(parseFloat(getComputedStyle(empty).height)===276,'空卡高度不是 276px');
    go('病情一图秀');
    const opts=txt('.metric-options');
    check(opts.includes('示例检验')&&opts.includes('示例测量')&&opts.includes('示例空类别'),'一图秀类别不同源');
    check(opts.includes('目录中暂无记录'),'一图秀空类空态');
    check(!JUDGMENT.test(txt('main')),'指标页出现判读词');
  `, 'catalog-default');
});

test('空指标数组保留完整目录、看板空态与图表空态', async t => {
  await runProbe(t, `
    const check=(v,m)=>{if(!v)throw Error(m)};
    const txt=s=>document.querySelector(s)?.textContent||'';
    check(txt('main').includes('最近的记录'),'看板未加载');
    check(document.querySelector('[data-check-summary="empty"]'),'看板缺检查值空态');
    check(txt('[data-check-summary="empty"]').includes('还没有检查值记录'),'空态文案');
    check(txt('[data-check-summary="empty"]').includes('没有记录只表示尚未录入'),'空态边界说明');
    go('病情整理','指标检测');
    check(txt('main').includes('暂无示例指标'),'旧空态字符串丢失');
    check(txt('main').includes('目录仍按类别列出全部检查项'),'目录空态说明');
    check(document.querySelectorAll('[data-card^="empty~"]').length>=6,'目录空卡未列出');
    check(!document.querySelector('main').innerHTML.match(/(?:NaN|Infinity)/),'空目录出现 NaN/Infinity');
    go('病情一图秀');
    check(txt('#chart-panel').includes('当前范围没有可绘制的数值记录'),'图表空态');
    check(!document.querySelector('#chart-panel svg'),'空图表不应绘制');
    check(!JUDGMENT.test(txt('main')),'空目录出现判读词');
  `, 'catalog-empty', '\nwindow.BEIPAL_METRICS=[];');
});

test('0、单点、同日多条、文本值都不冒充空卡', async t => {
  await runProbe(t, `
    const check=(v,m)=>{if(!v)throw Error(m)};
    const txt=s=>document.querySelector(s)?.textContent||'';
    go('病情整理','指标检测');
    const a=document.querySelector('[data-card="a~0"]'), b=document.querySelector('[data-card="b~0"]'), c=document.querySelector('[data-card="c~0"]'), d=document.querySelector('[data-card="ba~0"]');
    check(a,'缺 0 值卡');
    check(a.dataset.empty==='false','0 值被当成空卡');
    check(a.querySelector('.metric-value').textContent.includes('0'),'0 值未显示');
    check(a.querySelector('.mface.back').textContent.includes('只有 1 次记录'),'单点背面对话');
    check(b.querySelector('.metric-value').textContent.includes('<0.1'),'文本值未保留原文');
    check(b.querySelector('.mface.back').textContent.includes('只有记录原文'),'文本值不应画线');
    check(c.querySelector('.metric-value').textContent.includes('同日多次'),'同日多条未标注');
    check(c.textContent.includes('同日 2 条'),'同日未说明不合并');
    check(c.querySelector('.mface.back').textContent.includes('同一天有 2 条记录'),'同日背面说明');
    check(d&&d.dataset.empty==='true'&&d.querySelector('.metric-value').textContent.includes('还没有记录'),'空序列未显示空卡');
    check(!document.querySelector('main').innerHTML.match(/(?:NaN|Infinity)/),'出现 NaN/Infinity');
    check(!JUDGMENT.test(txt('main')),'指标页出现判读词');
  `, 'catalog-values', `
    window.BEIPAL_METRICS=[
      {id:'a',name:'示例指标 A',group:'示例检验',unit:'mg/L',method:'示例方法甲',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:0}]},
      {id:'b',name:'示例指标 B',group:'示例检验',unit:'×10⁹/L',method:'示例方法乙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-02-01',value:'<0.1'}]},
      {id:'c',name:'示例指标 C',group:'示例测量',unit:'mm',method:'示例方法丙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-03-01',value:5},{date:'2026-03-01',value:6}]},
      {id:'ba',name:'示例指标 D',group:'示例检验',unit:'mg/L',method:'示例方法甲',laboratory:'合成示例机构',source:'合成示例',points:[]},
      {id:'bb',name:'示例指标 E',group:'示例测量',unit:'mm',method:'示例方法丙',laboratory:'合成示例机构',source:'合成示例',points:[]}
    ];`);
});

test('目录缺失时回退旧分组且不白屏', async t => {
  await runProbe(t, `
    const check=(v,m)=>{if(!v)throw Error(m)};
    const txt=s=>document.querySelector(s)?.textContent||'';
    go('病情整理','指标检测');
    check(txt('main').includes('示例指标 A'),'回退后缺卡片');
    check(txt('main').includes('示例检验'),'回退后缺分组');
    check(!txt('main').includes('undefined'),'回退出现 undefined');
    check(!document.querySelector('main').innerHTML.match(/(?:NaN|Infinity)/),'回退出现 NaN/Infinity');
    check(!JUDGMENT.test(txt('main')),'回退页出现判读词');
    go('病情一图秀');
    check(txt('.metric-options').includes('示例检验'),'回退后图表选项丢失');
    check(document.querySelector('#chart-panel svg'),'回退后图表未绘制');
  `, 'catalog-fallback', '\ndelete window.BEIPAL_METRIC_CATALOG;');
});

test('切换示例组 B 后目录仍同源、空单位与同日多条不造假', async t => {
  await runProbe(t, `
    const check=(v,m)=>{if(!v)throw Error(m)};
    const txt=s=>document.querySelector(s)?.textContent||'';
    check(window.BEIPAL_SET_B,'缺少示例组 B');
    applyDataset('courseB');
    go('看板');
    check(txt('[data-check-summary="recorded"]').includes('目录 6 项'),'B 组看板目录数');
    check(txt('[data-check-summary="recorded"]').includes('最近采样 2026-10-22'),'B 组最近采样');
    go('病情整理','指标检测');
    const d=document.querySelector('[data-card="ba~0"]'), e=document.querySelector('[data-card="bb~0"]');
    check(d&&e,'B 组 D/E 卡丢失');
    check(e.querySelector('.metric-value').textContent.includes('同日多次'),'B 组同日未标注');
    check(txt('main').includes('目录共 6 项'),'B 组目录统计');
    check(!document.querySelector('main').innerHTML.match(/(?:NaN|Infinity)/),'B 组出现 NaN/Infinity');
    check(!JUDGMENT.test(txt('main')),'B 组出现判读词');
  `, 'catalog-b');
});

test('同名可比指标的选择标签能区分单位，悬停仍保留方法与机构', async t => {
  await runProbe(t, `
    const check=(v,m)=>{if(!v)throw Error(m)};
    check(window.BEIPAL_SET_B,'缺少示例组 B');
    applyDataset('courseB');
    go('病情一图秀');
    const labels=[...document.querySelectorAll('.metric-options label')].map(l=>l.textContent.trim());
    const d=labels.filter(t=>t.startsWith('示例指标 D'));
    check(d.length===2,'B 组 D 应有两个可比组，实为 '+d.length);
    check(new Set(d).size===2,'同名可比指标的选择标签重复：'+d.join(' | '));
    check(d.some(t=>t.includes('mg/L')),'已知单位未进入标签');
    check(d.some(t=>t.includes('单位未知')),'未知单位未进入标签');
    const inputs=[...document.querySelectorAll('.metric-options input[data-metric^="ba~"]')];
    check(inputs.length===2,'D 的两个复选框缺失');
    for(const i of inputs){
      const title=i.closest('label').title;
      check(title.includes('示例方法丁'),'悬停提示缺方法：'+title);
      check(title.includes('合成示例机构 B'),'悬停提示缺机构：'+title);
    }
  `, 'catalog-label-b');
});
