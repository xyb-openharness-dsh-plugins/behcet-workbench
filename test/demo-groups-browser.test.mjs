import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  return makePrototypeFixture(t, 'beipal-demo-groups-');
}

// 真实浏览器：两套合成示例组必须可显式切换；切换清空本页临时状态并回到看板；
// B 的私密治疗（205）不得进入一图秀，但记录本身仍保留。
const probe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const dialogText=()=>q('#dialog').textContent;
  await waitFor(()=>typeof go==='function'&&state.records.length&&q('#group-switch'),'应用未就绪');

  check(state.records.length===6,'默认组 A 记录数应为 6，实际 '+state.records.length);
  check(q('#group-switch-text').textContent==='示例 A · 6 条','顶部没有显示当前组 A 与条数');
  check(q('.top .status').textContent.includes('示例组 A · 长病程'),'状态栏没有当前组');
  check(!state.records.some(r=>r.id>=200),'默认组混入了 B 的记录');

  click('#group-switch');
  await waitFor(()=>q('#dialog').open,'切换弹窗未打开');
  check(q('#dialog-title').textContent==='切换合成示例组','弹窗标题不对');
  check(document.querySelectorAll('[data-use-dataset]').length===2,'没有列出两套独立档案');
  let text=dialogText();
  check(text.includes('示例组 A · 长病程（默认）')&&text.includes('示例组 B · 短时段 / 资料不全'),'两套档案标签不完整');
  check(text.includes('6 条记录（私密 1）'),'A 的数量/私密计数没有从数据派生');
  check(text.includes('7 条记录（私密 2）'),'B 的数量/私密计数没有从数据派生');
  check(text.includes('日期未知 1 条')&&text.includes('仅知月份 1 条')&&text.includes('单位未知 1 组')&&text.includes('私密治疗阶段 1 段'),'B 的资料缺口没有从数据派生');
  check(text.includes('不会保存；刷新页面会回到默认示例组 A'),'没有说明刷新回默认组');
  check(text.includes('无法恢复')&&text.includes('不代表病情轻重'),'没有告知临时内容会丢失且不暗示病情');
  check(q('[data-use-dataset="courseA"]').getAttribute('aria-pressed')==='true','当前组 A 未标记');
  click('[data-action="cancel"]');

  // 造一点只属于本页的临时状态：登记原件、生成草稿、补一条记录。
  go('资料目录与云解析');
  const dt=new DataTransfer();
  dt.items.add(new File(['2026-10-01 临时原件，切换后应消失'],'switch-temp.txt',{type:'text/plain'}));
  const input=q('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  check(state.files.length===1,'原件未登记');
  go('看板');
  click('[data-action="discuss"]');
  check(q('#draft').value.includes('临时')||q('#draft').value.length>20,'草稿未生成');
  check(!q('#pane').hidden,'AI 面板未打开');
  go('复诊与准备','问题清单');
  click('[data-action="add"]');
  q('#entry-date').value='2026-10-26';
  q('#entry-text').value='切换前临时补记（示例）';
  click('[data-action="save"]');
  check(state.records.length===7,'临时记录未添加');

  // 显式两步切换：先看两套档案，再确认清空。
  click('#group-switch');
  click('[data-use-dataset="courseB"]');
  await waitFor(()=>q('#dialog-title').textContent==='确认切换合成示例组','没有二次确认');
  check(dialogText().includes('新增、更正、勾选、已登记原件与 AI 草稿会全部清空'),'确认页没有列清丢失范围');
  click('[data-confirm-dataset="courseB"]');
  await waitFor(()=>state.records.length===7&&state.records[0].id===201,'没有切到 B');

  const ids=state.records.map(r=>r.id).join(',');
  check(ids==='201,202,203,204,205,206,207','B 记录不完整或混入 A：'+ids);
  check(state.view==='看板'&&state.sub==='','切换后没有回到看板');
  check(state.selected.size===5&&!state.selected.has(205)&&!state.selected.has(206),'B 私密记录默认不应选中');
  check(state.timelineSelected.size===0,'时间线选择未清空');
  check(state.files.length===0&&state.candidates.length===0,'原件或候选未清空');
  check(q('#draft').value===''&&q('#copy-status').textContent==='','AI 草稿或复制状态未清空');
  check(q('#pane').hidden,'AI 面板未收起');
  check(q('#group-switch-text').textContent==='示例 B · 7 条','顶部没有更新到 B');
  check(q('.top .status').textContent.includes('示例组 B · 短时段'),'状态栏没有更新到 B');
  const dash=document.querySelector('main').textContent;
  check(dash.includes('示例 B')&&!dash.includes('疗程结束（示例）'),'看板仍显示 A 的内容或没有 B 的内容');

  // 一图秀：B 的公开治疗 204 应画入治疗道；私密 205 不应出现，但仍留在记录里。
  go('病情一图秀','指标趋势');
  check(state.view==='病情一图秀','没有进入一图秀');
  const lane=[...document.querySelectorAll('[data-treatment]')];
  check(lane.length===1,'治疗道应只画 1 条公开治疗，实际 '+lane.length);
  check(lane[0].dataset.treatment==='204','公开治疗 204 未画入治疗道');
  const chartText=q('#chart-panel').textContent;
  check(chartText.includes('示例药物 B1'),'公开治疗药名未显示');
  check(!chartText.includes('示例药物 B2')&&!chartText.includes('私密治疗记录'),'私密治疗 205 进入了 一图秀');
  check(state.records.some(r=>r.id===205&&r.private===true),'私密治疗被错误删除而非仅过滤');
  check(state.metricIds.size===3,'B 的 3 个可比组未全部选中');

  // 治疗阶段仍显示“记录存在 + 已过滤”，不泄露药名/原文。
  go('治疗与用药','当前用药');
  check(document.querySelectorAll('.phase-fold').length===2,'B 应有 2 个治疗阶段');
  const priv=q('details.phase-fold[data-private="true"]');
  check(priv.textContent.includes('记录存在')&&!priv.textContent.includes('示例药物 B2')&&!priv.textContent.includes('私密治疗记录（示例 B）'),'私密阶段泄露了药名或原文');
  check(document.querySelector('details.phase-fold[data-private="false"]').textContent.includes('示例药物 B1'),'公开阶段没有显示 B1');

  // 切回 A，确认默认组数据与计数恢复。
  go('看板');
  click('#group-switch');
  click('[data-use-dataset="courseA"]');
  await waitFor(()=>q('#dialog-title').textContent==='确认切换合成示例组','切回 A 没有二次确认');
  click('[data-confirm-dataset="courseA"]');
  await waitFor(()=>state.records.length===6&&state.records.some(r=>r.id===1),'没有切回 A');
  check(q('#group-switch-text').textContent==='示例 A · 6 条','切回后顶部计数不对');
  check(state.records.every(r=>r.id<200),'切回 A 后仍混入 B');
  check(state.files.length===0&&q('#draft').value==='','切回后临时状态未隔离');
  await sleep(10);
  window.__demoGroupsTest='PASS';
}catch(e){window.__demoGroupsTest='FAIL: '+e.message}})()</script>`;

test('两套合成示例组可切换、临时状态隔离、私密治疗不进一图秀', async t => {
  const fx = await fixture(t);
  await fx.injectProbe(probe);
  const result = await runPage(fx.url, 'window.__demoGroupsTest || ""');
  assert.equal(result, 'PASS');
});