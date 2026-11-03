import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-s09-private-audit-');
  return fx.url;
}

// S09 独立审计回归：
// 1. 已私密记录更正内容后，旧摘要/导出选择与时间线选择都失效；重新打开面板时纳入框不再勾选。
// 2. 明确选中的公开记录更正后，摘要/导出与时间线选择仍保留，不因“涉及私密”被误清。
// 3. 移除私密原件后，记录保留私密标记，但来源与更正历史中不再残留被移除的文件名。
// 4. 取消私密原件保护必须经过明确确认；取消后关联记录不会被自动公开。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const setChecked=(el,next)=>{el.checked=next;el.dispatchEvent(new Event('change',{bubbles:true}))};
  const dialogText=()=>q('#dialog-body').textContent;
  const downloadText=async()=>{
    let captured=null;
    const create=URL.createObjectURL,anchorClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=b=>{captured=b;return 'blob:s09-audit-capture'};
    HTMLAnchorElement.prototype.click=function(){};
    try{click('[data-action="download"]')}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=anchorClick}
    check(captured,'下载没有创建文件内容');
    return await captured.text();
  };
  await waitFor(()=>typeof go==='function'&&state.records.some(r=>r.id===3&&r.private===true),'应用未就绪');

  /* ── 1. 已私密记录更正：旧选择失效 ── */
  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'打开私密面板失败');
  setChecked(q('[data-privacy-include="3"]'),true);
  await waitFor(()=>state.selected.has(3),'私密记录显式纳入未生效');
  q('#dialog').close();
  go('病情一图秀','治疗与事件节点');
  setChecked(q('[data-timeline-select="3"]'),true);
  await waitFor(()=>state.timelineSelected.has(3),'私密记录时间线选择未生效');
  go('复诊与准备','问题清单');
  click('[data-correct="3"]');
  await waitFor(()=>q('#dialog').open,'打开私密记录更正表单失败');
  const revisedPrivate='私密更正后的新问题（仅审计测试）';
  q('#entry-text').value=revisedPrivate;
  click('[data-save-correction="3"]');
  await waitFor(()=>!q('#dialog').open,'更正后弹窗未关闭');
  const privateRecord=state.records.find(r=>r.id===3);
  check(privateRecord.text===revisedPrivate,'私密记录正文未保存');
  check(privateRecord.private===true,'更正不应改变私密属性');
  check(!state.selected.has(3),'私密记录更正后仍留在摘要/导出选择集');
  check(!state.timelineSelected.has(3),'私密记录更正后仍留在时间线选择集');
  check(q('#toast').textContent.includes('已移出摘要/导出与时间线选择'),'私密记录更正后缺少选择失效提示');

  go('看板');
  click('[data-action="privacy"]');
  await waitFor(()=>q('#dialog').open,'更正后重新打开私密面板失败');
  check(!q('[data-privacy-include="3"]').checked,'私密记录更正后纳入框仍勾选');
  check(dialogText().includes('私密已显式纳入 0'),'私密记录更正后纳入计数未归零');
  q('#dialog').close();
  go('复诊与准备','就诊准备与导出');
  check(!q('#export-preview').textContent.includes(revisedPrivate),'私密记录更正后摘要预览仍包含旧内容');
  const privateExport=await downloadText();
  check(!privateExport.includes(revisedPrivate)&&!privateExport.includes('私密更正后的新问题'),'私密记录更正后下载仍包含旧内容');

  /* ── 2. 公开记录明确选择后更正：选择保留 ── */
  const publicRevised='公开更正后仍保留选择（仅审计测试）';
  setChecked(q('[data-select="1"]'),false);
  setChecked(q('[data-select="1"]'),true);
  await waitFor(()=>state.selected.has(1),'公开记录重新明确选择未生效');
  go('病情一图秀','治疗与事件节点');
  setChecked(q('[data-timeline-select="1"]'),true);
  await waitFor(()=>state.timelineSelected.has(1),'公开记录时间线选择未生效');
  go('发作与病程','发作记录');
  click('[data-correct="1"]');
  await waitFor(()=>q('#dialog').open,'打开公开记录更正表单失败');
  q('#entry-text').value=publicRevised;
  click('[data-save-correction="1"]');
  await waitFor(()=>!q('#dialog').open,'公开记录更正后弹窗未关闭');
  const publicRecord=state.records.find(r=>r.id===1);
  check(publicRecord.text===publicRevised,'公开记录正文未保存');
  check(publicRecord.private===false,'公开记录被误标为私密');
  check(state.selected.has(1),'公开记录更正后误删摘要/导出选择');
  check(state.timelineSelected.has(1),'公开记录更正后误删时间线选择');
  check(!q('#toast').textContent.includes('已移出摘要/导出与时间线选择'),'公开记录更正后仍提示私密选择失效');
  go('复诊与准备','就诊准备与导出');
  check(q('#export-preview').textContent.includes(publicRevised),'公开记录更正后摘要预览未更新');
  const publicExport=await downloadText();
  check(publicExport.includes(publicRevised),'公开记录更正后下载未包含新内容');

  /* ── 3. 移除私密原件：来源与更正历史不残留文件名 ── */
  go('资料目录与云解析');
  await waitFor(()=>q('#file-input'),'资料目录页未打开');
  const removalName='s09-audit-remove.txt';
  const input=q('#file-input'),dt=new DataTransfer();
  dt.items.add(new File(['这一行来自将被移除的私密原件（仅测试）'],removalName,{type:'text/plain'}));
  input.files=dt.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>state.files.length===1&&state.files[0].content,'移除测试原件未登记或未读入');
  const removeId=state.files[0].id;
  click('[data-parse="'+removeId+'"]');
  await waitFor(()=>q('#parse-consent'),'移除测试原件抽取弹窗未打开');
  q('#parse-consent').checked=true;
  click('[data-parse-run="'+removeId+'"]');
  await waitFor(()=>state.candidates.length===1,'移除测试原件没有生成候选');
  click('[data-accept="'+state.candidates[0].id+'"]');
  await waitFor(()=>state.records.some(r=>r.fileId===removeId),'移除测试候选未采纳');
  const removedRecord=state.records.find(r=>r.fileId===removeId);
  setChecked(q('[data-file-private="'+removeId+'"]'),true);
  await waitFor(()=>state.records.find(r=>r.id===removedRecord.id).private===true,'移除测试原件标私密未同步记录');

  go('病情整理','资料库');
  click('[data-correct="'+removedRecord.id+'"]');
  await waitFor(()=>q('#dialog').open,'打开待移除记录更正表单失败');
  q('#entry-text').value='移除前已更正但保留来源（仅测试）';
  click('[data-save-correction="'+removedRecord.id+'"]');
  await waitFor(()=>!q('#dialog').open,'待移除记录更正弹窗未关闭');
  check(removedRecord.history.length===1&&String(removedRecord.history[0].source).includes(removalName),'测试未在历史中留下待清理的文件名');

  go('资料目录与云解析');
  click('[data-file-del="'+removeId+'"]');
  await waitFor(()=>q('#dialog').open,'移除原件确认弹窗未打开');
  check(q('#dialog-title').textContent==='移除原件','移除弹窗标题不对');
  check(dialogText().includes(removalName),'移除弹窗未指出被移除的文件名');
  check(dialogText().includes('私密原件'),'移除私密原件时缺少隐私提示');
  check(dialogText().includes('来源中的这个文件名会被清除'),'移除弹窗未说明来源文件名会清除');
  click('[data-file-del-confirm="'+removeId+'"]');
  await waitFor(()=>state.files.length===0,'原件未从目录移除');
  check(removedRecord.fileId===null&&removedRecord.original===null,'移除原件后记录仍关联原件');
  check(removedRecord.private===true,'移除私密原件后记录被自动公开');
  check(!removedRecord.source.includes(removalName),'移除原件后记录来源仍残留文件名');
  check(removedRecord.source==='原件已移除','移除原件后来源未标明原件已移除');
  check(removedRecord.history.length===1,'移除原件不应删除更正历史');
  check(!JSON.stringify(removedRecord.history).includes(removalName),'移除原件后更正历史仍残留文件名');
  check(JSON.stringify(removedRecord.history).includes('原件已移除'),'更正历史的来源未改写为原件已移除');
  check(q('#toast').textContent.includes('文件名已清除'),'移除后缺少文件名已清除提示');
  go('病情整理','资料库');
  check(!q('#main').textContent.includes(removalName),'资料库页面仍显示已移除原件的文件名');
  check(q('#main').textContent.includes('原件已移除'),'资料库页面未显示原件已移除');

  /* ── 4. 取消原件私密保护：必须明确确认，且不自动公开记录 ── */
  go('资料目录与云解析');
  const unprotectName='s09-audit-unprotect.txt';
  const input2=q('#file-input'),dt2=new DataTransfer();
  dt2.items.add(new File(['这一行来自需要确认取消私密的原件（仅测试）'],unprotectName,{type:'text/plain'}));
  input2.files=dt2.files;
  input2.dispatchEvent(new Event('change',{bubbles:true}));
  await waitFor(()=>state.files.length===1&&state.files[0].content,'取消私密测试原件未登记或未读入');
  const keepId=state.files[0].id;
  click('[data-parse="'+keepId+'"]');
  await waitFor(()=>q('#parse-consent'),'取消私密测试原件抽取弹窗未打开');
  q('#parse-consent').checked=true;
  click('[data-parse-run="'+keepId+'"]');
  await waitFor(()=>state.candidates.length===1,'取消私密测试原件没有生成候选');
  click('[data-accept="'+state.candidates[0].id+'"]');
  await waitFor(()=>state.records.some(r=>r.fileId===keepId),'取消私密测试候选未采纳');
  const keepRecord=state.records.find(r=>r.fileId===keepId);
  setChecked(q('[data-file-private="'+keepId+'"]'),true);
  await waitFor(()=>keepRecord.private===true,'取消私密测试原件标私密未同步记录');

  setChecked(q('[data-file-private="'+keepId+'"]'),false);
  await waitFor(()=>q('#dialog').open,'取消原件私密未先要求确认');
  check(state.files.find(f=>f.id===keepId).private===true,'未确认就取消了原件私密');
  check(q('[data-file-private="'+keepId+'"]').checked,'取消确认期间复选框未回滚为已勾选');
  check(q('#dialog-title').textContent==='取消原件私密保护','取消私密确认弹窗标题不对');
  check(dialogText().includes(unprotectName),'取消私密确认弹窗未指出文件名');
  check(dialogText().includes('不会自动公开')&&dialogText().includes('仍需逐条确认'),'取消私密确认弹窗未说明记录不会自动公开');
  check(!!q('[data-file-unprotect-confirm="'+keepId+'"]'),'取消私密确认弹窗缺少明确确认按钮');
  click('[data-action="cancel"]');
  await waitFor(()=>!q('#dialog').open,'取消私密确认弹窗未关闭');
  check(state.files.find(f=>f.id===keepId).private===true,'选择保留私密后原件仍被取消');
  check(keepRecord.private===true,'选择保留私密后关联记录被改动');
  check(q('[data-file-private="'+keepId+'"]').checked,'选择保留私密后复选框未恢复勾选');

  setChecked(q('[data-file-private="'+keepId+'"]'),false);
  await waitFor(()=>q('#dialog').open,'第二次取消原件私密未要求确认');
  click('[data-file-unprotect-confirm="'+keepId+'"]');
  await waitFor(()=>state.files.find(f=>f.id===keepId).private===false,'明确确认后原件私密未取消');
  check(!q('#dialog').open,'确认取消私密后弹窗未关闭');
  check(keepRecord.private===true,'取消原件私密后关联记录被自动公开');
  check(q('#toast').textContent.includes('不会自动公开')&&q('#toast').textContent.includes('逐条确认'),'取消原件私密后缺少逐条确认提示');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('S09 审计：私密更正失效旧选择、移除原件清理来源、取消私密需确认', async t => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 40000 });
  assert.equal(result, 'PASS');
});