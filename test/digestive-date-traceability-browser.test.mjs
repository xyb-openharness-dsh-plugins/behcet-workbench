import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-digestive-date-traceability-');
  return fx.url;
}

// 真实浏览器回归（S05 旧记录追溯）：
// 1. datePrecision 为 unknown 但仍有原始 date 的旧记录，更正前在本人页与更正表单中显示原始值待核。
// 2. 打开更正后不做修改直接保存，原始 date/datePrecision 不丢失，也不产生虚假历史。
// 3. 仅改原文时，原始 date/datePrecision 继续保留，历史快照保留旧值且可追溯显示。
// 4. 用户明确把已知日期改为未知时，当前 date 清空；旧日期与精度完整进入历史。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const setPrecision=p=>{const sel=q('#entry-precision');sel.value=p;sel.dispatchEvent(new Event('change',{bubbles:true}))};
  const rowFor=text=>[...document.querySelectorAll('#digestive-page .row')].find(row=>row.textContent.includes(text));
  await waitFor(()=>typeof go==='function'&&Array.isArray(state.records),'应用未就绪');

  const legacyText='走查S05合成：旧记录精度未知但保留原始日期（非真实资料）';
  const knownText='走查S05合成：已知日期检查记录（非真实资料）';
  const legacy={id:900101,kind:'消化症状',department:'消化',date:'2026-03-15',datePrecision:'unknown',text:legacyText,source:'旧资料导入 · 浏览器测试',private:false,history:[]};
  const known={id:900102,kind:'消化道检查',department:'消化',date:'2026-10-20',datePrecision:'day',text:knownText,source:'合成检查 · 浏览器测试',private:false,history:[]};
  state.records.push(legacy,known);
  render();
  go('器官与专科','消化道');
  await waitFor(()=>q('#digestive-page'),'未进入消化道页');

  /* ── 1. 更正前：本人页显示原始值待核 ── */
  const legacyRow=rowFor(legacyText);
  check(legacyRow,'消化道页缺少旧记录');
  check(legacyRow.textContent.includes('日期未知'),'旧记录未显示“日期未知”');
  check(legacyRow.textContent.includes('原始值：2026-03-15'),'旧记录未显示原始日期');
  check(legacyRow.textContent.includes('待核'),'旧记录未标记原始日期待核');
  check(legacyRow.textContent.includes('来源：旧资料导入 · 浏览器测试'),'旧记录来源显示异常');

  click('[data-correct="'+legacy.id+'"]');
  await waitFor(()=>q('#dialog').open,'旧记录更正表单未打开');
  const rawNote=q('#entry-raw-date-note');
  check(rawNote.textContent.includes('原始值：2026-03-15'),'更正表单未显示原始日期');
  check(rawNote.textContent.includes('待核'),'更正表单未标记待核');
  check(q('#entry-precision').value==='unknown','旧记录精度未保持 unknown');
  check(q('#entry-text').value===legacyText,'旧记录原文未带入表单');

  /* ── 2. 无修改保存：原始值不丢失，不产生历史 ── */
  click('[data-save-correction="'+legacy.id+'"]');
  await waitFor(()=>!q('#dialog').open,'无修改保存后对话框未关闭');
  check(legacy.date==='2026-03-15','无修改保存丢失了原始日期：'+legacy.date);
  check(legacy.datePrecision==='unknown','无修改保存丢失了原始精度：'+legacy.datePrecision);
  check(legacy.history.length===0,'无修改保存产生了虚假历史');
  const stillShown=rowFor(legacyText);
  check(stillShown.textContent.includes('原始值：2026-03-15'),'无修改保存后本人页不再显示原始日期');

  /* ── 3. 仅改原文：保留原始日期，历史可追溯 ── */
  click('[data-correct="'+legacy.id+'"]');
  await waitFor(()=>q('#dialog').open,'旧记录二次更正未打开');
  q('#entry-text').value=legacyText+'（补充）';
  click('[data-save-correction="'+legacy.id+'"]');
  await waitFor(()=>!q('#dialog').open,'仅改原文后未保存');
  check(legacy.date==='2026-03-15'&&legacy.datePrecision==='unknown','仅改原文时丢失原始日期或精度');
  check(legacy.history.length===1,'仅改原文未保留上一版历史');
  check(legacy.history[0].date==='2026-03-15'&&legacy.history[0].datePrecision==='unknown','历史未保留旧日期与旧精度');
  check(legacy.history[0].text===legacyText,'历史未保留旧原文');
  const correctedRow=rowFor(legacyText+'（补充）');
  check(correctedRow,'更新后的旧记录未显示');
  const historyLine=[...correctedRow.querySelectorAll('details p')].find(p=>p.textContent.startsWith('更正前'));
  check(historyLine,'更新后的旧记录未显示历史');
  check(historyLine.textContent.includes('日期：日期未知（原始值：2026-03-15'),'历史未显示旧记录的原始日期待核');
  check(historyLine.textContent.includes('原文：'+legacyText),'历史未显示旧原文');

  /* ── 4. 已知日期明确改为未知：当前日期清空，历史保留 ── */
  click('[data-correct="'+known.id+'"]');
  await waitFor(()=>q('#dialog').open,'已知日期记录更正未打开');
  check(q('#entry-precision').value==='day','已知日期记录精度未保持具体日期');
  setPrecision('unknown');
  click('[data-save-correction="'+known.id+'"]');
  await waitFor(()=>!q('#dialog').open,'改为日期未知后未保存');
  check(known.date==='','明确改为日期未知后当前日期未清空：'+known.date);
  check(known.datePrecision==='unknown','明确改为日期未知后精度未保存');
  check(known.history.length===1,'改为日期未知未保留历史');
  check(known.history[0].date==='2026-10-20'&&known.history[0].datePrecision==='day','历史未保留旧日期与精度');
  const unknownGroup=q('section.digest-group[data-digest-precision="unknown"]');
  check(unknownGroup.textContent.includes(knownText),'改为未知后检查记录从分组消失');
  check(unknownGroup.textContent.includes('日期：2026-10-20'),'改为未知后历史未显示旧日期');

  let storageError=null,storageEmpty=true;
  try{storageEmpty=localStorage.length===0&&sessionStorage.length===0}catch(e){storageError=e}
  check(!storageError,'无法读取本地存储，不能确认未写入：'+(storageError&&storageError.message));
  check(storageEmpty,'浏览器测试写入了持久化存储');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('S05 旧记录保留 unknown 精度原始日期：待核展示、无修改保存与显式改为未知', async (t) => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});