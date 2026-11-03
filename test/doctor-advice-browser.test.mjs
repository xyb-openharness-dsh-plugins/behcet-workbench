import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-doctor-advice-');
  return fx.url;
}

// 真实浏览器回归：S07 医嘱记录可新增、回看、更正；未知字段保持未知；
// 独立 kind 不进入当前用药/治疗阶段；私密默认不进导出与 AI 草稿；仅内存。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const advice=()=>state.records.filter(r=>r.kind==='医嘱记录');
  const meds=()=>state.records.filter(r=>r.kind==='当前用药');
  await waitFor(()=>typeof go==='function'&&document.querySelector('#nav')?.children.length,'应用未就绪');
  const medsBefore=meds().length;

  const card=[...document.querySelectorAll('.grid .card')].find(c=>c.querySelector('h3')?.textContent==='记录医嘱');
  check(card,'首页缺少“记录医嘱”卡片');
  const entry=card.querySelector('button[data-view]');
  check(entry&&entry.dataset.view==='复诊与准备'&&entry.dataset.sub==='医嘱记录','“记录医嘱”未指向复诊与准备/医嘱记录');
  entry.click();
  await waitFor(()=>state.view==='复诊与准备'&&state.sub==='医嘱记录','没有进入医嘱记录页');
  check(advice().length===0,'初始不应有医嘱记录');
  check(!!document.querySelector('[data-action="add"]'),'医嘱记录页没有新增入口');
  check(document.querySelector('main').textContent.includes('暂无医嘱记录'),'缺少零记录空状态');
  check(!!document.querySelector('.tabs [role="tab"][aria-selected="true"]')&&document.querySelector('.tabs [role="tab"][aria-selected="true"]').textContent==='医嘱记录','医嘱记录标签未选中');

  document.querySelector('[data-action="add"]').click();
  for(const id of ['a-text','a-proposer','a-source','a-date','a-review-date','a-private'])check(document.getElementById(id),'新增表单缺少 '+id);
  check(!document.querySelector('#t-drug'),'医嘱表单误用了治疗表单');
  document.querySelector('[data-action="save-advice"]').click();
  check(document.querySelector('#advice-errors').textContent.includes('至少'),'空表单缺少至少一项校验');
  check(document.querySelector('#a-text').getAttribute('aria-invalid')==='true'&&document.activeElement.id==='a-text','校验后未聚焦首个未知字段');
  check(advice().length===0,'校验失败仍写入医嘱');

  document.querySelector('#a-source').value='复诊口述抄录';
  document.querySelector('#a-review-date').value='2026-09-15';
  document.querySelector('[data-action="save-advice"]').click();
  check(advice().length===1,'第一条医嘱未入库');
  const first=advice()[0];
  check(first.text===''&&first.proposer===''&&first.source==='复诊口述抄录','未知原文/提出者被补写');
  check(first.date===''&&first.datePrecision==='unknown'&&first.reviewDate==='2026-09-15','未知记录日期或拟复查日期保存错误');
  check(first.private===false&&first.history.length===0,'第一条医嘱隐私或历史错误');
  check(meds().length===medsBefore,'新增医嘱改动了当前用药');
  check(!window.BEIPAL_PATHWAY_MODEL.build(state.records,demoMetrics).some(s=>s.recordId===first.id),'医嘱进入治疗阶段');
  const mainText=document.querySelector('main').textContent;
  check(mainText.includes('医嘱原文未知（未抄录）')&&mainText.includes('记录日期：未知'),'未知事实没有显示为未知');
  check(mainText.includes('拟复查日期：2026-09-15'),'拟复查日期未回看');
  check(mainText.includes('提出者：未知')&&mainText.includes('来源：复诊口述抄录'),'提出者/来源未回看');

  document.querySelector('[data-action="add"]').click();
  document.querySelector('#a-text').value='请三个月后复查口腔';
  document.querySelector('#a-proposer').value='复诊医生';
  document.querySelector('#a-source').value='复诊口述';
  document.querySelector('#a-date').value='2026-06-01';
  document.querySelector('#a-review-date').value='2026-09-01';
  document.querySelector('#a-private').checked=true;
  document.querySelector('[data-action="save-advice"]').click();
  check(advice().length===2,'第二条医嘱未入库');
  const second=advice().at(-1);
  check(second.text==='请三个月后复查口腔'&&second.proposer==='复诊医生'&&second.source==='复诊口述','第二条事实保存错误');
  check(second.date==='2026-06-01'&&second.datePrecision==='day'&&second.reviewDate==='2026-09-01','第二条日期保存错误');
  check(second.private===true&&!state.selected.has(second.id),'私密医嘱默认进入导出选择');
  check(document.querySelector('[data-advice-row="'+second.id+'"] .private-tag'),'私密标签未显示');

  go('看板');
  const dashboard=document.querySelector('main').textContent;
  check(dashboard.includes('复诊口述抄录'),'首页未回看公开医嘱');
  check(!dashboard.includes('请三个月后复查口腔'),'首页泄露私密医嘱');
  document.querySelector('[data-action="discuss"]').click();
  const draft1=document.querySelector('#draft').value;
  check(draft1.includes('拟复查日期：2026-09-15')&&draft1.includes('提出者：未知'),'AI 草稿未带公开医嘱事实');
  check(!draft1.includes('请三个月后复查口腔'),'AI 草稿泄露私密医嘱');

  go('复诊与准备','就诊准备与导出');
  const privateChoice=document.querySelector('[data-select="'+second.id+'"]');
  check(privateChoice&&!privateChoice.checked,'私密医嘱导出选择未默认关闭');
  check(!document.querySelector('#export-preview').textContent.includes('请三个月后复查口腔'),'私密医嘱默认进入导出预览');
  privateChoice.checked=true;privateChoice.dispatchEvent(new Event('change',{bubbles:true}));
  check(document.querySelector('#export-preview').textContent.includes('请三个月后复查口腔'),'显式勾选后私密医嘱仍不能导出');
  check(document.querySelector('#export-preview').textContent.includes('提出者：复诊医生'),'导出未保留医嘱事实');
  privateChoice.checked=false;privateChoice.dispatchEvent(new Event('change',{bubbles:true}));
  check(!document.querySelector('#export-preview').textContent.includes('请三个月后复查口腔'),'取消勾选后私密医嘱仍在导出预览');

  go('复诊与准备','医嘱记录');
  document.querySelector('[data-advice-view="'+second.id+'"]').click();
  check(document.querySelector('#dialog').open,'回看全文未打开');
  const viewText=document.querySelector('#dialog-body').textContent;
  check(viewText.includes('请三个月后复查口腔')&&viewText.includes('复诊医生')&&viewText.includes('2026-09-01'),'回看全文缺少事实');
  document.querySelector('#dialog [data-correct="'+second.id+'"]').click();
  check(document.querySelector('#a-text').value==='请三个月后复查口腔','更正表单未预填原文');
  check(document.querySelector('#a-proposer').value==='复诊医生'&&document.querySelector('#a-review-date').value==='2026-09-01','更正表单未预填事实');
  document.querySelector('#a-text').value='更正后的医嘱原文';
  document.querySelector('#a-proposer').value='';
  document.querySelector('#a-review-date').value='';
  document.querySelector('#a-private').checked=false;
  document.querySelector('[data-save-correction="'+second.id+'"]').click();
  check(second.history.length===1,'更正未保留旧版本');
  const old=second.history[0];
  check(old.text==='请三个月后复查口腔'&&old.proposer==='复诊医生'&&old.source==='复诊口述','更正历史缺少旧事实');
  check(old.date==='2026-06-01'&&old.datePrecision==='day'&&old.reviewDate==='2026-09-01'&&old.private===true,'更正历史缺少日期或隐私');
  check(second.text==='更正后的医嘱原文'&&second.proposer===''&&second.reviewDate===''&&second.private===false,'更正后的未知字段被补写');
  const corrected=document.querySelector('main').textContent;
  check(corrected.includes('更正后的医嘱原文')&&corrected.includes('提出者：未知')&&corrected.includes('拟复查日期：未知'),'更正后的当前事实未回看');
  check(corrected.includes('更正前（1）')&&corrected.includes('请三个月后复查口腔'),'本人不能回看私密旧版本');

  document.querySelector('[data-correct="'+second.id+'"]').click();
  document.querySelector('[data-save-correction="'+second.id+'"]').click();
  check(second.history.length===1,'内容未变的早退仍追加了更正历史');
  document.querySelector('[data-correct="'+second.id+'"]').click();
  document.querySelector('#a-private').checked=true;
  document.querySelector('[data-save-correction="'+second.id+'"]').click();
  check(second.private===true&&!state.selected.has(second.id),'只切换私密未被识别为更正');
  check(second.history.length===2&&second.history[1].private===false,'只切换私密未保留旧隐私状态');
  document.querySelector('[data-correct="'+second.id+'"]').click();
  document.querySelector('#a-private').checked=false;
  document.querySelector('[data-save-correction="'+second.id+'"]').click();
  check(second.private===false&&second.history.length===3&&second.history[2].private===true,'私密改回公开未保留历史');

  go('看板');
  const correctedDashboard=document.querySelector('main').textContent;
  check(correctedDashboard.includes('更正后的医嘱原文'),'首页未回看更正后的公开医嘱');
  check(!correctedDashboard.includes('请三个月后复查口腔'),'首页泄露私密更正历史');
  document.querySelector('[data-action="discuss"]').click();
  const draft2=document.querySelector('#draft').value;
  check(draft2.includes('更正后的医嘱原文')&&!draft2.includes('请三个月后复查口腔'),'AI 草稿未只使用当前公开版本');

  go('复诊与准备','就诊准备与导出');
  const publicChoice=document.querySelector('[data-select="'+second.id+'"]');
  check(publicChoice&&!publicChoice.checked,'未选择的公开医嘱被默认带出');
  check(!document.querySelector('#export-preview').textContent.includes('更正后的医嘱原文'),'未选择的公开医嘱出现在默认导出');
  publicChoice.checked=true;publicChoice.dispatchEvent(new Event('change',{bubbles:true}));
  check(document.querySelector('#export-preview').textContent.includes('更正后的医嘱原文'),'勾选后公开医嘱不能导出');

  go('治疗与用药','当前用药');
  check(meds().length===medsBefore,'医嘱记录改动了当前用药记录数');
  check(!document.querySelector('main').textContent.includes('更正后的医嘱原文'),'医嘱进入当前用药页');
  check(!!document.querySelector('[data-action="add"]'),'当前用药原有记录入口被破坏');
  check(!window.BEIPAL_PATHWAY_MODEL.build(state.records,demoMetrics).some(s=>[first.id,second.id].includes(s.recordId)),'医嘱进入治疗阶段折叠卡');

  let storageEmpty=true;
  try{storageEmpty=localStorage.length===0&&sessionStorage.length===0}catch{}
  check(storageEmpty,'医嘱写入了浏览器持久化存储');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('S07 医嘱记录可新增回看更正，未知保持未知，独立于用药且私密默认过滤', async t => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});