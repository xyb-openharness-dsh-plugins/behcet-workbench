import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-record-id-draft-');
  return fx.url;
}

// 真实浏览器回归（覆盖独立审计的两个根因）：
// 1. 同一毫秒内连续新增记录也必须得到不同 id；把其中一条标为私密，
//    不得连带把另一条移出摘要/导出选择（Date.now 冲突导致的串记录）。
// 2. 记录改回公开时清空已经过期的 AI 草稿与复制状态，并提示重新生成可能包含该记录；
//    重新生成草稿时同样清空旧复制状态。更正表单里私密→公开也走同一规则。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const setChecked=(el,next)=>{el.checked=next;el.dispatchEvent(new Event('change',{bubbles:true}))};
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');

  /* ── 1. 同毫秒新增：id 唯一，隐私选择不串记录 ── */
  go('发作与病程','发作记录');
  const realNow=Date.now;
  Date.now=()=>1760000000000;
  try{
    click('[data-action="add"]');
    q('#entry-date').value='2026-04-01';
    q('#entry-text').value='同毫秒记录甲';
    click('[data-action="save-episode"]');
    click('[data-action="add"]');
    q('#entry-date').value='2026-04-02';
    q('#entry-text').value='同毫秒记录乙';
    click('[data-action="save-episode"]');
  }finally{Date.now=realNow}
  const first=state.records.at(-2),second=state.records.at(-1);
  check(first&&first.text==='同毫秒记录甲','第一条同毫秒记录未保存');
  check(second&&second.text==='同毫秒记录乙','第二条同毫秒记录未保存');
  check(first.id!==second.id,'同一毫秒新增的两条记录得到相同 id');
  check(state.records.filter(r=>r.id===first.id).length===1,'记录 id 不唯一，查找到重复记录');
  check(state.records.filter(r=>r.id===second.id).length===1,'记录 id 不唯一，查找到重复记录');

  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'打开私密面板失败');
  setChecked(q('[data-privacy-include="'+first.id+'"]'),true);
  await waitFor(()=>state.selected.has(first.id),'第一条记录显式纳入未生效');
  setChecked(q('[data-privacy-include="'+second.id+'"]'),true);
  await waitFor(()=>state.selected.has(second.id),'第二条记录显式纳入未生效');

  setChecked(q('[data-record-private="'+first.id+'"]'),true);
  await waitFor(()=>state.records.find(r=>r.id===first.id).private===true,'第一条记录标私密未生效');
  check(!state.selected.has(first.id),'标私密后第一条记录仍留在摘要/导出选择集');
  check(state.selected.has(second.id),'第一条记录标私密时误删了第二条记录的选择');
  check(q('[data-privacy-include="'+second.id+'"]').checked,'第二条记录的纳入框被连带取消');
  q('#dialog').close();

  /* 私密记录不进入草稿；此时先制造一份带复制状态的旧草稿。 */
  click('[data-action="discuss"]');
  check(q('#draft').value.includes('同毫秒记录乙'),'草稿未包含仍公开的第二条记录');
  check(!q('#draft').value.includes('同毫秒记录甲'),'草稿包含了已标私密的第一条记录');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.trim().length>0,'复制状态未更新');

  /* ── 2. 改回公开：清空过期草稿/复制状态并提示 ── */
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'改回公开时打开面板失败');
  setChecked(q('[data-record-private="'+first.id+'"]'),false);
  await waitFor(()=>state.records.find(r=>r.id===first.id).private===false,'第一条记录改回公开未生效');
  const publicToast=q('#toast').textContent;
  check(publicToast.includes('不会自动加入'),'改回公开缺少不自动纳入提示');
  check(publicToast.includes('重新生成草稿可能包含'),'改回公开缺少重新生成会包含该记录的提示');
  check(q('#draft').value==='','改回公开后过期 AI 草稿未清空');
  check(q('#copy-status').textContent==='','改回公开后过期复制状态未清空');
  check(!state.selected.has(first.id),'改回公开后自动加入了摘要/导出');
  check(state.selected.has(second.id),'改回公开误删了另一条记录的选择');
  check(!q('[data-privacy-include="'+first.id+'"]').checked,'改回公开后第一条记录的纳入框被自动勾选');
  q('#dialog').close();

  /* 重新生成草稿：包含刚公开的记录，并清空上一次的复制状态。 */
  click('[data-action="discuss"]');
  check(q('#draft').value.includes('同毫秒记录甲'),'重新生成的草稿未包含刚改回公开的记录');
  check(q('#draft').value.includes('同毫秒记录乙'),'重新生成的草稿丢失了另一条公开记录');
  check(q('#toast').textContent.includes('重新生成')&&q('#toast').textContent.includes('没有发送'),'重新生成草稿缺少提示');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.trim().length>0,'第二次复制状态未更新');
  click('[data-action="discuss"]');
  check(q('#copy-status').textContent==='','重新生成草稿后旧复制状态未清空');
  check(q('#draft').value.includes('同毫秒记录甲'),'重新生成后的草稿内容不完整');
  check(q('#toast').textContent.includes('旧复制状态已清空'),'重新生成时缺少旧复制状态已清空的提示');

  /* ── 3. 更正表单私密→公开：同样清空并提示 ── */
  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'为通告更正准备私密状态失败');
  setChecked(q('[data-record-private="'+second.id+'"]'),true);
  await waitFor(()=>state.records.find(r=>r.id===second.id).private===true,'第二条记录标私密未生效');
  q('#dialog').close();
  click('[data-action="discuss"]');
  check(!q('#draft').value.includes('同毫秒记录乙'),'私密记录不应进入重新生成的草稿');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.trim().length>0,'更正前复制状态未更新');

  go('发作与病程','发作记录');
  click('[data-correct="'+second.id+'"]');
  await waitFor(()=>q('#dialog').open,'打开更正表单失败');
  const privateBox=q('#entry-private');
  check(privateBox.checked,'更正表单未回显私密状态');
  setChecked(privateBox,false);
  click('[data-save-correction="'+second.id+'"]');
  await waitFor(()=>!q('#dialog').open,'更正经公开后弹窗未关闭');
  const correctionToast=q('#toast').textContent;
  check(state.records.find(r=>r.id===second.id).private===false,'更正表单未保存改回公开');
  check(correctionToast.includes('改回公开'),'更正改回公开缺少提示');
  check(correctionToast.includes('重新生成草稿可能包含'),'更正改回公开缺少重新生成会包含该记录的提示');
  check(!correctionToast.includes('已移出摘要/导出与时间线选择'),'更正改回公开误报私密选择失效');
  check(q('#draft').value==='','更正改回公开后过期 AI 草稿未清空');
  check(q('#copy-status').textContent==='','更正改回公开后过期复制状态未清空');
  check(!state.selected.has(second.id),'更正改回公开后自动加入了摘要/导出');

  click('[data-action="discuss"]');
  check(q('#draft').value.includes('同毫秒记录乙'),'更正改回公开后重新生成的草稿未包含该记录');

  let storageEmpty=true;
  try{storageEmpty=localStorage.length===0&&sessionStorage.length===0}catch{}
  check(storageEmpty,'记录 id/草稿回归写入了浏览器持久化存储');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('同毫秒新增记录 id 唯一且隐私选择互不牵连；公开变更与重生成清理过期草稿和复制状态', async t => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 40000 });
  assert.equal(result, 'PASS');
});