import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

/*
 * 隐私审计的可验证提示（不改变隐私合同）：
 * 1. 切换示例只清空本页内存，必须明确系统剪贴板和已下载文件不会被清除；
 * 2. 清空草稿/复制状态只发生在页内，私密改公开要说明重新生成的 AI 草稿可能包含该记录；
 * 3. 时间线与就诊准备要说明私密内容仍在本机页面可见，而不是被隐藏。
 */

const switchBoundaryProbe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>document.querySelector(s);
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');

  q('#group-switch').click();
  await waitFor(()=>q('#dialog').open,'示例组弹窗未打开');
  const overview=q('#dialog-body').textContent;
  check(overview.includes('系统剪贴板'),'切换总览未说明系统剪贴板');
  check(overview.includes('已下载'),'切换总览未说明已下载文件');
  check(overview.includes('不会被清除'),'切换总览未明确剪贴板/下载文件不会被清除');

  q('[data-use-dataset="courseB"]').click();
  await waitFor(()=>q('#dialog-title').textContent==='确认切换合成示例组','未进入切换确认');
  const confirm=q('#dialog-body').textContent;
  check(confirm.includes('系统剪贴板')&&confirm.includes('已下载'),'切换确认缺少剪贴板/下载边界');
  check(confirm.includes('不会被清除'),'切换确认未明确不会被清除');
  check(confirm.includes('请自行核对'),'切换确认未提醒自行核对已复制/已下载内容');
  const action=q('[data-confirm-dataset="courseB"]');
  check(action.textContent.includes('草稿')&&action.textContent.includes('选择'),'切换按钮未说明清空范围');
  check(!action.textContent.includes('临时内容'),'切换按钮仍使用含混的“临时内容”');

  action.click();
  await waitFor(()=>state.records[0].id===201,'未切换到示例组 B');
  const toast=q('#toast').textContent;
  check(toast.includes('系统剪贴板')&&toast.includes('已下载文件'),'切换完成提示缺少剪贴板/下载边界');
  check(toast.includes('不受影响'),'切换完成提示未说明页外内容不受影响');
  check(!toast.includes('本页临时内容已清空'),'切换完成提示仍暗示所有临时内容已清空');
  window.__privacySwitchBoundary='PASS';
}catch(e){window.__privacySwitchBoundary='FAIL: '+e.message}})()</script>`;

const draftBoundaryProbe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>document.querySelector(s);
  const togglePrivate=(id,on)=>{const el=q('[data-record-private="'+id+'"]');el.checked=on;el.dispatchEvent(new Event('change',{bubbles:true}))};
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');

  q('[data-action="discuss"]').click();
  check(q('#draft').value.length>0,'AI 草稿未生成');
  q('#copy').click();
  await waitFor(()=>q('#copy-status').textContent.length>0,'复制状态未更新');

  q('[data-action="privacy"]').click();
  await waitFor(()=>q('#dialog').open,'隐私面板未打开');
  togglePrivate(1,true);
  await waitFor(()=>state.records.find(r=>r.id===1).private===true,'记录一未标为私密');
  let toast=q('#toast').textContent;
  check(toast.includes('系统剪贴板')&&toast.includes('已下载'),'标私密清空草稿时缺少页外边界');
  check(toast.includes('页内 AI 草稿'),'标私密提示未区分页内草稿');
  check(q('#draft').value===''&&q('#copy-status').textContent==='','标私密后过期输出未清空');

  q('#dialog').close();
  q('[data-action="discuss"]').click();
  check(q('#draft').value.length>0,'第二次草稿未生成');
  q('#copy').click();
  await waitFor(()=>q('#copy-status').textContent.length>0,'第二次复制状态未更新');

  q('[data-action="privacy"]').click();
  await waitFor(()=>q('#dialog').open,'隐私面板未再次打开');
  togglePrivate(1,false);
  await waitFor(()=>state.records.find(r=>r.id===1).private===false,'记录一未改回公开');
  toast=q('#toast').textContent;
  check(toast.includes('系统剪贴板')&&toast.includes('已下载'),'清空旧草稿时缺少页外边界');
  check(toast.includes('仅页内'),'清空旧草稿提示未限定为页内状态');
  check(toast.includes('重新生成草稿可能包含'),'改回公开未说明重新生成草稿可能包含该记录');
  check(toast.includes('AI 草稿'),'改回公开未说明涉及 AI 草稿');
  check(q('#draft').value===''&&q('#copy-status').textContent==='','改回公开后过期输出未清空');
  window.__privacyDraftBoundary='PASS';
}catch(e){window.__privacyDraftBoundary='FAIL: '+e.message}})()</script>`;

const localVisibilityProbe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>document.querySelector(s);
  await waitFor(()=>typeof go==='function'&&state.records.length===6,'应用未就绪');

  go('病情一图秀','治疗与事件节点');
  await waitFor(()=>!!q('#timeline-private-visibility-note'),'时间线缺少私密可见性提示');
  const timelineNote=q('#timeline-private-visibility-note').textContent;
  check(timelineNote.includes('本机页面')&&timelineNote.includes('仍可见'),'时间线提示未说明本机页面仍可见');
  check(timelineNote.includes('选择列表'),'时间线提示未指出原文在选择列表可见');
  check(timelineNote.includes('不是在本页隐藏'),'时间线提示未澄清私密不等于隐藏');
  const privateTimeline=q('[data-timeline-select="3"]');
  check(!!privateTimeline&&!privateTimeline.checked,'私密记录在时间线默认应可见但未选中');
  check(privateTimeline.parentElement.textContent.includes('下次复诊想问的问题（示例）'),'时间线选择列表未显示私密原文');
  check(!q('#timeline-results').textContent.includes('下次复诊想问的问题（示例）'),'私密记录未经选择进入了时间线结果');

  go('复诊与准备','就诊准备与导出');
  await waitFor(()=>!!q('#visit-private-visibility-note'),'就诊准备缺少私密可见性提示');
  const visitNote=q('#visit-private-visibility-note').textContent;
  check(visitNote.includes('本机页面')&&visitNote.includes('仍可见'),'就诊准备提示未说明本机页面仍可见');
  check(visitNote.includes('预览与下载内容'),'就诊准备提示未说明勾选后进入预览/下载');
  const privateVisit=q('[data-select="3"]');
  check(!!privateVisit&&!privateVisit.checked,'私密记录在就诊准备默认应可见但未选中');
  check(privateVisit.parentElement.textContent.includes('下次复诊想问的问题（示例）'),'就诊准备选择列表未显示私密原文');
  check(!q('#export-preview').textContent.includes('下次复诊想问的问题（示例）'),'私密记录未经选择进入了预览');
  window.__privacyLocalVisibility='PASS';
}catch(e){window.__privacyLocalVisibility='FAIL: '+e.message}})()</script>`;

test('切换合成示例：只清空本页，明确剪贴板和已下载文件不受影响', async t => {
  const fixture = await makePrototypeFixture(t, 'beipal-privacy-switch-boundary-');
  await fixture.injectProbe(switchBoundaryProbe);
  const result = await runPage(fixture.url, 'window.__privacySwitchBoundary || ""', {timeoutMs:40000});
  assert.equal(result, 'PASS');
});

test('清理草稿与私密改公开：区分页内状态并说明新 AI 草稿可能包含记录', async t => {
  const fixture = await makePrototypeFixture(t, 'beipal-privacy-draft-boundary-');
  await fixture.injectProbe(draftBoundaryProbe);
  const result = await runPage(fixture.url, 'window.__privacyDraftBoundary || ""', {timeoutMs:40000});
  assert.equal(result, 'PASS');
});

test('时间线与就诊准备：私密原文仍在本机页面可见且默认不入结果', async t => {
  const fixture = await makePrototypeFixture(t, 'beipal-privacy-local-visibility-');
  await fixture.injectProbe(localVisibilityProbe);
  const result = await runPage(fixture.url, 'window.__privacyLocalVisibility || ""', {timeoutMs:40000});
  assert.equal(result, 'PASS');
});