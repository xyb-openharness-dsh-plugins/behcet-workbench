import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-s09-private-');
  return fx.url;
}

// S09 垂直切片（真实浏览器）：
// 1. 「私密标记 →」打开逐条设置，不再只是只读说明；文案不宣称加密或真实权限。
// 2. 私密默认不进摘要/导出；本人逐条勾选后，摘要、预览与下载文件同步纳入。
// 3. AI 草稿始终排除私密，即使该条已被显式纳入摘要/导出。
// 4. 标为私密会移出已有选择并清空时间线选择、AI 草稿与复制状态；改回公开不自动纳入。
// 5. 关联私密原件的记录不能单独改回公开（勾选框禁用 + 表单保存守卫）。
// 6. 全程不写 localStorage/sessionStorage。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const setChecked=(el,next)=>{el.checked=next;el.dispatchEvent(new Event('change',{bubbles:true}))};
  const dialogText=()=>q('#dialog-body').textContent;
  const privateText='下次复诊想问的问题（示例）';
  const episodeText='影响进食（示例）';
  const downloadText=async()=>{
    let captured=null;
    const create=URL.createObjectURL,anchorClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=b=>{captured=b;return 'blob:s09-capture'};
    HTMLAnchorElement.prototype.click=function(){};
    try{click('[data-action="download"]')}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=anchorClick}
    check(captured,'下载没有创建文件内容');
    return await captured.text();
  };
  await waitFor(()=>typeof go==='function'&&state.records.some(r=>r.id===3&&r.private===true),'应用未就绪');
  check(state.selected.has(1)&&!state.selected.has(3),'初始选择集不应含私密记录');

  /* ── 1. 看板入口与逐条面板 ── */
  go('看板');
  const entry=q('#main [data-action="privacy"]');
  check(entry.textContent.trim()==='私密标记 →','入口文案不是「私密标记 →」');
  entry.click();
  await waitFor(()=>q('#dialog').open,'私密标记弹窗未打开');
  check(q('#dialog-title').textContent==='授权与隐私','弹窗标题不对');
  check(dialogText().includes('不宣称加密'),'缺少不宣称加密的边界说明');
  check(dialogText().includes('AI 草稿始终排除私密'),'缺少 AI 始终排除私密说明');
  check(dialogText().includes('账号权限')&&dialogText().includes('服务端隔离'),'缺少不宣称真实权限/服务端隔离的说明');
  check(!dialogText().includes('已加密'),'文案不应声称已加密');
  check(q('[data-record-private="3"]').checked,'私密记录未显示为已标记');
  check(q('[data-record-private="3"]').getAttribute('aria-label').includes('私密'),'私密开关缺少可区分的无障碍名称');
  check(q('[data-privacy-include="1"]').getAttribute('aria-label').includes('本次纳入'),'纳入开关缺少可区分的无障碍名称');
  check(!q('[data-privacy-include="3"]').checked,'私密记录不应默认纳入');
  check(q('[data-privacy-include="1"]').checked,'公开记录应默认纳入');
  check(dialogText().includes('私密已显式纳入 0'),'初始私密纳入计数不为 0');

  /* ── 2. 默认不导出私密 ── */
  q('#dialog').close();
  go('复诊与准备','就诊准备与导出');
  check(!q('#export-preview').textContent.includes(privateText),'摘要预览默认出现了私密记录');
  const defaultExport=await downloadText();
  check(!defaultExport.includes(privateText),'默认下载包含了私密记录');
  check(!defaultExport.includes('【私密】'),'默认下载出现了私密标记');
  check(defaultExport.includes(episodeText),'默认下载缺少公开记录');

  /* ── 3. 本人逐条显式纳入：摘要与文件同步 ── */
  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'第二次打开私密标记弹窗失败');
  setChecked(q('[data-privacy-include="3"]'),true);
  await waitFor(()=>state.selected.has(3),'勾选「本次纳入」没有加入选择集');
  check(q('[data-privacy-include="3"]').checked,'重渲染后显式纳入状态丢失');
  check(dialogText().includes('私密已显式纳入 1'),'显式纳入计数未更新');
  check(q('[data-record-private="3"]').checked,'显式纳入不应改变私密属性');
  q('#dialog').close();
  go('复诊与准备','就诊准备与导出');
  check(q('#export-preview').textContent.includes('【私密】'),'摘要预览未把显式纳入标为私密');
  check(q('#export-preview').textContent.includes(privateText),'摘要预览未包含显式纳入的私密记录');
  const includedExport=await downloadText();
  check(includedExport.includes(privateText)&&includedExport.includes('【私密】'),'下载文件未包含显式纳入的私密记录');

  /* ── 4. AI 草稿始终排除私密 ── */
  click('[data-action="discuss"]');
  check(q('#draft').value.length>0,'没有生成讨论草稿');
  check(!q('#draft').value.includes(privateText),'AI 草稿包含了已显式纳入的私密记录');
  check(state.selected.has(3),'生成草稿不应改变摘要/导出选择');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.trim().length>0,'复制状态未更新');

  /* ── 5. 标为私密：移出已有选择，清时间线与草稿 ── */
  go('病情一图秀','治疗与事件节点');
  const timeline=q('[data-timeline-select="1"]');
  setChecked(timeline,true);
  await waitFor(()=>state.timelineSelected.has(1),'时间线选择未生效');
  go('看板');
  const toggle=q('[data-toggle-private="1"]');
  toggle.closest('details').open=true;
  toggle.click();
  await waitFor(()=>state.records.find(r=>r.id===1).private===true,'记录卡「标为私密」未生效');
  check(!state.selected.has(1),'标为私密后仍留在摘要/导出选择集');
  check(!state.timelineSelected.has(1),'标为私密后仍留在时间线选择集');
  check(q('#draft').value==='','标为私密后未清空 AI 草稿');
  check(q('#copy-status').textContent==='','标为私密后未清空复制状态');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'标记后打开私密面板失败');
  check(q('[data-record-private="1"]').checked,'面板未显示记录已私密');
  check(!q('[data-privacy-include="1"]').checked,'刚标私密的记录不应仍在纳入选区');
  check(dialogText().includes('私密 2'),'私密计数未增加');
  q('#dialog').close();
  go('复诊与准备','就诊准备与导出');
  check(!q('#export-preview').textContent.includes(episodeText),'标私密后摘要预览仍出现该记录');
  const afterPrivate=await downloadText();
  check(!afterPrivate.includes(episodeText),'标私密后下载仍包含该记录');
  check(afterPrivate.includes(privateText),'标私密后下载丢失已显式纳入的另一条私密记录');

  /* ── 6. 改回公开不自动纳入 ── */
  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'撤回私密时打开面板失败');
  setChecked(q('[data-record-private="1"]'),false);
  await waitFor(()=>state.records.find(r=>r.id===1).private===false,'改回公开未生效');
  check(!state.selected.has(1),'改回公开后自动加入了摘要/导出');
  check(!q('[data-privacy-include="1"]').checked,'改回公开后纳入框被自动勾选');
  check(q('#toast').textContent.includes('不会自动加入'),'改回公开缺少需逐条勾选的提示');

  /* ── 7. 清空私密纳入 ── */
  click('[data-action="privacy-clear"]');
  await waitFor(()=>!state.selected.has(3),'清空私密纳入未生效');
  check(!q('[data-privacy-include="3"]').checked,'清空后纳入框仍勾选');
  check(dialogText().includes('私密已显式纳入 0'),'清空后纳入计数不为 0');
  check(q('[data-action="privacy-clear"]').disabled,'清空后按钮未禁用');
  q('#dialog').close();

  /* ── 8. 关联私密原件的记录不得公开 ── */
  go('资料目录与云解析');
  await waitFor(()=>q('#file-input'),'资料目录页未打开');
  const input=q('#file-input'),dt=new DataTransfer();
  dt.items.add(new File(['这一行来自私密原件，仅用于浏览器测试'],'s09-private-source.txt',{type:'text/plain'}));
  input.files=dt.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>state.files.length===1&&state.files[0].content,'本机文本没有读入');
  const fileId=state.files[0].id;
  click('[data-parse="'+fileId+'"]');
  await waitFor(()=>q('#parse-consent'),'抽取确认弹窗未打开');
  q('#parse-consent').checked=true;
  click('[data-parse-run="'+fileId+'"]');
  await waitFor(()=>state.candidates.length===1,'没有生成候选');
  check(!state.candidates[0].private,'候选不应是无来源的私密');
  click('[data-accept="'+state.candidates[0].id+'"]');
  await waitFor(()=>state.records.some(r=>r.fileId===fileId),'候选未采纳为记录');
  const linked=state.records.find(r=>r.fileId===fileId);
  check(linked.private===false&&!state.selected.has(linked.id),'采纳的公开原件记录初始状态不对');
  setChecked(q('[data-file-private="'+fileId+'"]'),true);
  await waitFor(()=>state.records.find(r=>r.id===linked.id).private===true,'原件标私密未同步记录');
  check(!state.selected.has(linked.id),'原件标私密后关联记录仍在选择集');
  check(q('#draft').value==='','原件标私密后未清空 AI 草稿');

  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'关联原件锁定时打开面板失败');
  const lock=q('#dialog [data-record-private="'+linked.id+'"]');
  check(lock.disabled,'关联私密原件的记录仍可勾选公开');
  check(dialogText().includes('s09-private-source.txt'),'面板未说明被哪个私密原件锁定');
  lock.disabled=false;lock.checked=false;lock.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,30));
  check(state.records.find(r=>r.id===linked.id).private===true,'绕过禁用把关联记录改成了公开');
  check(q('#dialog [data-record-private="'+linked.id+'"]').checked,'失败后勾选框未回滚为私密');
  check(q('#toast').textContent.includes('不能改回公开'),'绕过禁用时缺少拒绝提示');
  q('#dialog').close();
  go('病情整理','资料库');
  click('[data-correct="'+linked.id+'"]');
  const box=q('#entry-private');
  check(box.disabled,'更正表单的私密框未禁用');
  check(q('#dialog-body').textContent.includes('关联私密原件「s09-private-source.txt」'),'更正表单未说明原件锁定');
  box.disabled=false;box.checked=false;
  click('[data-save-correction="'+linked.id+'"]');
  check(state.records.find(r=>r.id===linked.id).private===true,'更正表单绕过禁用把关联记录改成了公开');
  check(q('#dialog').open,'守卫拒绝后不应关闭更正表单');
  check(q('#toast').textContent.includes('不能改回公开'),'更正表单缺少拒绝提示');
  q('#dialog').close();

  let storageEmpty=true;
  try{storageEmpty=localStorage.length===0&&sessionStorage.length===0}catch{}
  check(storageEmpty,'S09 垂直切片写入了浏览器持久化存储');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('S09 逐条私密标记、显式纳入与关联私密原件锁定', async t => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 40000 });
  assert.equal(result, 'PASS');
});