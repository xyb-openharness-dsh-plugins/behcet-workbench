import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-record-privacy-');
  return fx.url;
}

// 真实浏览器回归：
// 1. 首页（非本人视图）打开医嘱“回看全文”时过滤私密历史版本；本人医嘱页保留。
// 2. 通用记录更正要能切换私密；公开→私密移出导出/时间线选择并清空旧 AI 草稿；
//    更正历史保存当时的隐私属性；内容与隐私均未变化时不追加历史。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const dialogText=()=>q('#dialog-body').textContent;
  await waitFor(()=>typeof go==='function'&&state.records.length,'应用未就绪');

  /* ── 1. 医嘱回看全文：非本人视图过滤私密历史 ── */
  go('复诊与准备','医嘱记录');
  click('[data-action="add"]');
  q('#a-text').value='医嘱初版公开';
  q('#a-proposer').value='医生甲';
  q('#a-source').value='纸质医嘱';
  q('#a-date').value='2026-05-01';
  q('#a-review-date').value='2026-08-01';
  click('[data-action="save-advice"]');
  const advice=state.records.filter(r=>r.kind==='医嘱记录').at(-1);
  check(advice&&advice.private===false,'医嘱未以公开状态创建');

  const correctAdvice=(text,priv)=>{click('[data-correct="'+advice.id+'"]');q('#a-text').value=text;q('#a-private').checked=priv;click('[data-save-correction="'+advice.id+'"]')};
  correctAdvice('医嘱第二公开版',false);
  correctAdvice('医嘱私密旧版',true);
  correctAdvice('医嘱当前公开版',false);
  check(advice.history.length===3,'医嘱三次更正未保存三段历史');
  check(advice.history[2].text==='医嘱私密旧版'&&advice.history[2].private===true,'私密旧版本未记录隐私属性');

  go('看板');
  const homeRow=q('[data-advice-row="'+advice.id+'"]');
  check(homeRow,'首页缺少医嘱回看入口');
  const homeView=homeRow.querySelector('[data-advice-view]');
  check(homeView.dataset.adviceOwner==='0','首页医嘱回看未标记为非本人视图');
  homeView.click();
  check(q('#dialog').open,'首页回看全文未打开');
  let body=dialogText();
  check(body.includes('医嘱当前公开版'),'首页回看缺少当前公开事实');
  check(body.includes('医嘱第二公开版'),'首页回看误过滤了公开历史');
  check(!body.includes('医嘱私密旧版'),'首页回看泄露私密历史版本');
  click('#dialog [data-action="cancel"]');

  go('复诊与准备','医嘱记录');
  const ownerView=q('[data-advice-view="'+advice.id+'"]');
  check(ownerView.dataset.adviceOwner==='1','本人医嘱页回看未标记为本人视图');
  ownerView.click();
  body=dialogText();
  check(body.includes('医嘱私密旧版'),'本人页回看丢失私密历史版本');
  check(body.includes('医嘱第二公开版')&&body.includes('医嘱当前公开版'),'本人页回看缺少公开版本');
  click('#dialog [data-action="cancel"]');
  check(q('[data-advice-row="'+advice.id+'"]').textContent.includes('医嘱私密旧版'),'本人页列表未显示私密更正历史');

  /* ── 2. 通用记录更正：私密切换、清选择与草稿、历史隐私、未变不追加 ── */
  go('看板');
  click('[data-action="discuss"]');
  check(q('#draft').value.includes('口腔科示例记录：口腔不适'),'草稿未包含待更正的公开记录');
  click('#copy');
  await waitFor(()=>q('#copy-status').textContent.length>0,'复制状态未更新');
  go('复诊与准备','就诊准备与导出');
  let cb=q('[data-select="4"]');
  cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));
  go('病情一图秀','治疗与事件节点');
  let tcb=q('[data-timeline-select="4"]');
  tcb.checked=true;tcb.dispatchEvent(new Event('change',{bubbles:true}));
  check(state.selected.has(4)&&state.timelineSelected.has(4),'通用记录选择未生效');

  go('看板');
  click('[data-correct="4"]');
  check(q('#dialog').open,'通用记录更正未打开');
  check(!!q('#entry-private'),'通用更正缺少私密切换');
  check(q('#entry-private').checked===false,'公开记录更正默认勾选了私密');
  q('#entry-text').value='资料库私密更正后';
  q('#entry-private').checked=true;
  click('[data-save-correction="4"]');
  const generic=state.records.find(r=>r.id===4);
  check(generic.private===true&&generic.text==='资料库私密更正后','通用记录未保存私密更正');
  check(generic.history.length===1,'公开→私密更正未保存一段历史');
  const old=generic.history[0];
  check(old.text==='口腔科示例记录：口腔不适'&&old.source==='口腔科合成记录'&&old.private===false,'通用更正历史缺少旧内容或隐私属性');
  check(!state.selected.has(4),'公开→私密后仍留在导出选择');
  check(!state.timelineSelected.has(4),'公开→私密后仍留在时间线选择');
  check(q('#draft').value==='','公开→私密后旧 AI 草稿未清空');
  check(q('#copy-status').textContent==='','公开→私密后复制状态未清空');

  go('病情整理','资料库');
  const ownerPage=q('main').textContent;
  check(ownerPage.includes('资料库私密更正后'),'本人资料页未显示当前版本');
  check(ownerPage.includes('原文：口腔科示例记录：口腔不适'),'本人资料页未显示通用记录旧版本');
  check(ownerPage.includes('非私密'),'通用记录历史未显示当时的隐私属性');
  check(!ownerPage.includes('开始：'),'通用记录历史误用了发作字段');

  click('[data-correct="4"]');
  click('[data-save-correction="4"]');
  check(generic.history.length===1,'内容与隐私均未变时仍追加了通用更正历史');
  check(q('#toast').textContent.includes('内容未变'),'未变化时缺少“内容未变”提示');

  click('[data-correct="4"]');
  q('#entry-text').value='资料库更正为公开';
  q('#entry-private').checked=false;
  click('[data-save-correction="4"]');
  check(generic.private===false&&generic.text==='资料库更正为公开','通用记录未保存改回公开');
  check(generic.history.length===2&&generic.history[1].private===true&&generic.history[1].text==='资料库私密更正后','私密→公开未保留带隐私属性的旧版本');

  go('看板');
  const dashboard=q('main').textContent;
  check(dashboard.includes('资料库更正为公开'),'首页未展示改回公开的当前版本');
  check(dashboard.includes('口腔科示例记录：口腔不适'),'首页未展示公开的更正历史');
  check(!dashboard.includes('资料库私密更正后'),'首页泄露通用记录的私密历史版本');

  let storageEmpty=true;
  try{storageEmpty=localStorage.length===0&&sessionStorage.length===0}catch{}
  check(storageEmpty,'隐私回归写入了浏览器持久化存储');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('医嘱回看按视图过滤私密历史；通用更正支持私密切换且历史带隐私属性', async t => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});