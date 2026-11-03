import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  return makePrototypeFixture(t, 'beipal-file-privacy-');
}

// 回归：公开原件改为私密时，只把“本次由公开变私密”的关联记录移出导出/时间线选择，
// 并清空可能已包含这些内容的 AI 草稿与复制状态；原本已私密且被显式选择的记录要保留。
const probe = `<script>(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const dialogText=()=>q('#dialog').textContent;
  await waitFor(()=>typeof go==='function'&&state.records.length,'应用未就绪');

  go('资料目录与云解析');
  const dt=new DataTransfer();
  dt.items.add(new File(['2026-09-01 隐私测试一：口腔好转'],'privacy-one.txt',{type:'text/plain'}));
  dt.items.add(new File(['2026-09-02 隐私测试二：皮肤减轻'],'privacy-two.txt',{type:'text/plain'}));
  const input=q('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  check(state.files.length===2,'两个原件未登记');
  const [f1,f2]=state.files;
  await waitFor(()=>f1.content.includes('隐私测试一')&&f2.content.includes('隐私测试二'),'原件文本未在本机读取');

  const parseAndAccept=async f=>{
    click('[data-parse="'+f.id+'"]');
    q('#parse-consent').checked=true;
    click('[data-parse-run="'+f.id+'"]');
    await waitFor(()=>state.candidates.some(c=>c.fileId===f.id),'抽取没有生成候选');
    check(state.candidates.length===1,'一份原件应只切出一条候选');
    check(dialogText().includes(f.name),'抽取确认没有显示原件名');
    click('[data-accept="'+state.candidates[0].id+'"]');
    await sleep(8);
  };
  await parseAndAccept(f1);
  await parseAndAccept(f2);
  const r1=state.records.find(r=>r.fileId===f1.id),r2=state.records.find(r=>r.fileId===f2.id);
  check(r1&&r2,'采纳后未生成两条关联记录');
  check(!r1.private&&!r2.private,'采纳记录初始应为公开');
  check(state.selected.has(r1.id)===false,'新采纳记录不应自动进入导出选择');
  check(state.timelineSelected.has(r1.id)===false,'新采纳记录不应自动进入时间线选择');

  // 先选择两条记录并勾选时间线，再生成 AI 草稿并复制。
  go('复诊与准备','就诊准备与导出');
  for(const r of [r1,r2]){const cb=q('[data-select="'+r.id+'"]');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}))}
  check(state.selected.has(r1.id)&&state.selected.has(r2.id),'导出选择未生效');
  go('病情一图秀','治疗与事件节点');
  for(const r of [r1,r2]){const cb=q('[data-timeline-select="'+r.id+'"]');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}))}
  check(state.timelineSelected.has(r1.id)&&state.timelineSelected.has(r2.id),'时间线选择未生效');
  go('看板');
  click('[data-action="discuss"]');
  check(q('#draft').value.includes('隐私测试一')&&q('#draft').value.includes('隐私测试二'),'草稿没有包含已选公开记录');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.length>0,'复制状态未更新');
  check(!q('#pane').hidden,'AI 面板未打开');

  // 只把原件一改为私密：记录一移出两个选择，草稿与复制状态清空；记录二保持。
  go('资料目录与云解析');
  let box=q('[data-file-private="'+f1.id+'"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  check(r1.private===true&&f1.private===true,'原件一未同步为私密');
  check(r2.private===false&&f2.private===false,'未关联的原件二或记录二被误改');
  check(!state.selected.has(r1.id),'公开→私密记录仍留在导出选择');
  check(state.selected.has(r2.id),'无关记录被移出导出选择');
  check(!state.timelineSelected.has(r1.id),'公开→私密记录仍留在时间线选择');
  check(state.timelineSelected.has(r2.id),'无关记录被移出时间线选择');
  check(q('#draft').value==='','AI 草稿未清空');
  check(q('#copy-status').textContent==='','复制状态未清空');
  check(state.records.some(r=>r.id===r1.id)&&state.records.some(r=>r.id===r2.id),'隐私同步不应删除记录');

  // 取消原件私密不会自动公开已生成记录；显式选择已是私密的记录后再次标私密，应保留这些选择。
  box=q('[data-file-private="'+f1.id+'"]');box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));
  check(r1.private===true,'取消原件私密不应自动公开已生成记录');
  go('复诊与准备','就诊准备与导出');
  let cb=q('[data-select="'+r1.id+'"]');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));
  go('病情一图秀','治疗与事件节点');
  let tcb=q('[data-timeline-select="'+r1.id+'"]');tcb.checked=true;tcb.dispatchEvent(new Event('change',{bubbles:true}));
  check(state.selected.has(r1.id)&&state.timelineSelected.has(r1.id),'已私密记录不能显式选择');
  go('看板');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.length>0,'复制状态未更新');
  const copyBefore=q('#copy-status').textContent;
  go('资料目录与云解析');
  box=q('[data-file-private="'+f1.id+'"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  check(state.selected.has(r1.id),'已是私密的显式选择被再次标私密清掉');
  check(state.timelineSelected.has(r1.id),'已是私密的时间线选择被再次标私密清掉');
  check(q('#copy-status').textContent===copyBefore,'没有新的公开→私密记录时不应清空复制状态');

  window.__filePrivacyTest='PASS';
}catch(e){window.__filePrivacyTest='FAIL: '+e.message}})()</script>`;

test('原件改私密：移除关联记录选择、清空草稿与复制状态，保留已私密显式选择', async t => {
  const fx = await fixture(t);
  await fx.injectProbe(probe);
  const result = await runPage(fx.url, 'window.__filePrivacyTest || ""');
  assert.equal(result, 'PASS');
});