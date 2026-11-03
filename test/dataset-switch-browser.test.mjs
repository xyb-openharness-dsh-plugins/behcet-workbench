import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

const noBProbe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');
  check(DATASETS.length===1,'缺少 B 时仍加载了第二套档案');
  const btn=document.querySelector('#group-switch');
  check(btn.textContent.includes('示例 A · 6 条'),'顶部没有显示当前组与条数');
  check(btn.getAttribute('aria-label').includes('查看合成示例组（仅一套可用）'),'单套时 aria 未降级');
  check(!btn.getAttribute('aria-label').includes('切换合成示例组'),'单套时 aria 仍称切换');
  btn.click();
  await waitFor(()=>document.querySelector('#dialog').open,'切换弹窗未打开');
  check(document.querySelector('#dialog-title').textContent==='合成示例组（仅一套可用）','单套时弹窗标题未降级');
  const body=document.querySelector('#dialog-body').textContent;
  check(body.includes('示例组 B 未加载或不可用'),'缺少 B 的用户可见降级提示');
  check(!body.includes('两套'),'缺少 B 时仍误称两套');
  check(!body.includes('切换前请确认'),'单套时仍显示切换损失警告');
  check(document.querySelectorAll('[data-use-dataset]').length===1,'单套时列表数量不对');
  check(document.querySelector('[data-use-dataset="courseA"]').getAttribute('aria-pressed')==='true','当前组未标记');
  window.__datasetFallback='PASS';
}catch(e){window.__datasetFallback='FAIL: '+e.message}})()</script>`;

const rollbackProbe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');
  const before={dataset:currentDataset.id,first:state.records[0].id,metrics:metrics.map(m=>m.id).join(','),status:document.querySelector('.top .status').textContent};
  const original=window.BEIPAL_METRIC_MODEL.build;
  window.BEIPAL_METRIC_MODEL.build=function(list){if(Array.isArray(list)&&list.some(m=>m.id==='ba'))throw Error('synthetic B metrics failure');return original(list)};
  document.querySelector('#group-switch').click();
  await waitFor(()=>document.querySelector('#dialog').open,'B 构建失败时切换弹窗没有打开');
  const bRow=document.querySelector('[data-use-dataset="courseB"]');
  check(!!bRow,'没有列出 B');
  check(bRow.textContent.includes('读模型构建失败'),'B 读模型失败时预览没有降级');
  bRow.click();
  await waitFor(()=>document.querySelector('#dialog-title').textContent==='确认切换合成示例组','没有二次确认');
  document.querySelector('[data-confirm-dataset="courseB"]').click();
  await new Promise(r=>setTimeout(r,80));
  check(currentDataset.id==='courseA','失败后 currentDataset 未回滚：'+currentDataset.id);
  check(state.records.length===6&&state.records[0].id===before.first,'失败后记录状态未回滚');
  check(state.records.every(r=>r.id<200),'失败后混入了 B 记录');
  check(metrics.map(m=>m.id).join(',')===before.metrics,'失败后指标未回滚');
  check(document.querySelector('.top .status').textContent===before.status,'失败后状态栏未回滚');
  check(document.querySelector('#group-switch-text').textContent==='示例 A · 6 条','失败后顶部组名未回滚');
  check(!document.querySelector('#dialog').open,'失败后确认弹窗未关闭');
  check(document.querySelector('#toast').textContent.includes('切换失败'),'失败后没有用户提示');
  window.BEIPAL_METRIC_MODEL.build=original;
  window.__datasetRollback='PASS';
}catch(e){window.__datasetRollback='FAIL: '+e.message}})()</script>`;

const scrollProbe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');
  go('治疗与用药','当前用药');
  window.scrollTo(0,900);
  await new Promise(r=>setTimeout(r,30));
  check(window.scrollY>0,'当前页面不可滚动，无法验证切换回顶');
  document.querySelector('#group-switch').click();
  await waitFor(()=>document.querySelector('[data-use-dataset="courseB"]'),'没有列出 B');
  document.querySelector('[data-use-dataset="courseB"]').click();
  await waitFor(()=>document.querySelector('#dialog-title').textContent==='确认切换合成示例组','没有二次确认');
  document.querySelector('[data-confirm-dataset="courseB"]').click();
  await waitFor(()=>state.records[0].id===201,'没有切到 B');
  await new Promise(r=>setTimeout(r,40));
  check(state.view==='看板','切换后没有回到看板');
  check(window.scrollY===0,'切换后没有回到顶部：'+window.scrollY);
  check(document.activeElement===document.querySelector('#main'),'切换后焦点没有回到主内容');
  check(!document.querySelector('#dialog').open,'切换后确认弹窗未关闭');
  check(document.querySelector('#group-switch-text').textContent==='示例 B · 7 条','顶部没有更新到 B');
  check(document.querySelector('#draft').value===''&&document.querySelector('#copy-status').textContent==='','草稿或复制状态未清空');
  check(document.querySelector('#pane').hidden,'AI 面板未收起');
  window.__datasetScroll='PASS';
}catch(e){window.__datasetScroll='FAIL: '+e.message}})()</script>`;

test('缺少 B 时降级为单套档案且不误称两套', async t => {
  const fixture = await makePrototypeFixture(t, 'beipal-dataset-no-b-');
  await rm(fixture.dataPath('demo-data-b.js'));
  await fixture.injectProbe(noBProbe);
  const result = await runPage(fixture.url, 'window.__datasetFallback || ""');
  assert.equal(result, 'PASS');
});

test('切换构建失败回滚到当前档案并提示', async t => {
  const fixture = await makePrototypeFixture(t, 'beipal-dataset-rollback-');
  await fixture.injectProbe(rollbackProbe);
  const result = await runPage(fixture.url, 'window.__datasetRollback || ""');
  assert.equal(result, 'PASS');
});

test('切换成功后回到看板顶部并把焦点交给主内容', async t => {
  const fixture = await makePrototypeFixture(t, 'beipal-dataset-scroll-');
  await fixture.injectProbe(scrollProbe);
  const result = await runPage(fixture.url, 'window.__datasetScroll || ""');
  assert.equal(result, 'PASS');
});