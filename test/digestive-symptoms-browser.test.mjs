import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const fx = await makePrototypeFixture(t, 'beipal-digestive-symptoms-');
  return fx.url;
}

// 真实浏览器回归（S05）：
// 1. 看板「消化症状」进入器官与专科 / 消化道。
// 2. 症状与检查各有独立入口和表单；保存后在内存中形成不同 kind。
// 3. 同日两项各占一栏；具体日期、仅知月份、日期未知分开分组，不混排。
// 4. 空来源按未填写保存和显示，不伪造“本人记录/本人抄录”来源。
// 5. 更正日期、精度、来源、原文时保留上一版完整历史，并在本人页展示旧日期/来源。
// 6. 私密记录默认不勾选，仍带标记出现在本人页、时间线和就诊准备列表，但不进首页、AI 草稿。
// 7. 跨入口「症状记录」不自动归入消化道页，页面明确说明并互链。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const visibleFields=()=>[...document.querySelectorAll('#dialog-body label.field')].filter(el=>el.offsetParent!==null).length;
  const setPrecision=p=>{const sel=q('#entry-precision');sel.value=p;sel.dispatchEvent(new Event('change',{bubbles:true}))};
  const addDigestive=async(action,opts)=>{
    click('[data-action="'+action+'"]');
    await waitFor(()=>q('#dialog').open,'表单未打开');
    if(opts.precision&&opts.precision!=='day')setPrecision(opts.precision);
    if(opts.precision==='month'){
      q('#entry-month').value=opts.month;
      q('#entry-month').dispatchEvent(new Event('input',{bubbles:true}));
    }else if(opts.precision!=='unknown'){
      q('#entry-date').value=opts.date;
    }
    q('#entry-text').value=opts.text;
    q('#entry-source').value=opts.source||'';
    if(opts.private)q('#entry-private').checked=true;
    click('[data-action="save"]');
    await waitFor(()=>!q('#dialog').open,'保存后对话框未关闭');
  };
  const symptomText='走查S05合成：同日餐后腹部不适，按本人原话记录（非真实资料）';
  const examText='走查S05合成：同日肠道检查结论原文，仅抄录（非真实资料）';
  const monthText='走查S05合成：仅记得月份的腹胀记录（非真实资料）';
  const unknownText='走查S05合成：日期记不清的检查补记（非真实资料）';
  const genericText='走查S05合成：症状记录页的普通症状（非真实资料）';
  await waitFor(()=>typeof go==='function'&&state.records.length,'应用未就绪');

  /* ── 1. 从看板任务卡进入消化道页 ── */
  go('看板');
  const task=[...document.querySelectorAll('#main .card')].find(card=>card.querySelector('h3')?.textContent.trim()==='消化症状');
  check(task,'看板缺少「消化症状」任务卡');
  task.querySelector('button[data-view]').click();
  await waitFor(()=>q('#digestive-page'),'未进入器官与专科 / 消化道');
  check(q('#main').textContent.includes('器官与专科'),'页面未显示「器官与专科」标题');
  check(q('[data-action="add"]').textContent.trim()==='手工补一条','缺少症状手工入口');
  check(q('[data-action="add-check"]').textContent.includes('手工补检查'),'缺少独立的检查入口');
  check(q('#digest-empty'),'空态未提示分别记录两类资料');
  const pageText=q('#main').textContent;
  check(pageText.includes('不推断因果'),'页面未声明不推断因果');
  check(!/(?:因此|所以|导致|引起|说明症状|提示症状)/.test(pageText),'页面出现因果或解释性语句');

  /* ── 2. 跨入口明确：普通症状记录页不会自动归入消化道 ── */
  check(q('#digestive-cross-entry-note').textContent.includes('不会自动归入'),'消化道页未说明跨入口边界');
  q('#digestive-cross-entry-note button').click();
  await waitFor(()=>q('#symptom-cross-entry-note'),'未进入症状记录页');
  check(q('#main').textContent.includes('器官与专科 / 消化道'),'症状记录页未指向消化道入口');
  click('[data-action="add"]');
  await waitFor(()=>q('#dialog').open,'症状记录页手工入口未打开');
  q('#entry-date').value='2026-10-18';
  q('#entry-text').value=genericText;
  click('[data-action="save"]');
  await waitFor(()=>!q('#dialog').open,'普通症状记录未保存');
  [...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='去消化道页').click();
  await waitFor(()=>q('#digestive-page'),'未返回消化道页');
  check(!q('#digestive-page').textContent.includes(genericText),'普通症状记录被自动误标为消化症状');

  /* ── 3. 同日分别记录症状与检查；空来源不伪造 ── */
  click('[data-action="add"]');
  await waitFor(()=>q('#dialog').open,'症状表单未打开');
  check(q('#dialog-title').textContent==='手工补一条','症状表单标题不一致');
  check(visibleFields()<=6,'症状表单可见字段超过 6 个');
  check(visibleFields()>=3,'症状表单可见字段过少');
  q('#entry-date').value='2026-10-20';
  q('#entry-text').value=symptomText;
  q('#entry-source').value='';
  click('[data-action="save"]');
  await waitFor(()=>!q('#dialog').open,'症状未保存');
  const symptom=state.records.find(r=>r.text===symptomText);
  check(symptom,'症状未进入内存记录');
  check(symptom.kind==='消化症状'&&symptom.department==='消化','症状记录类型或科别不正确');
  check(symptom.private===false,'症状默认被标成私密');
  check(symptom.source==='','空来源被保存成了伪造来源：'+symptom.source);

  click('[data-action="add-check"]');
  await waitFor(()=>q('#dialog').open,'检查表单未打开');
  check(q('#dialog-title').textContent==='手工补检查','检查表单标题不一致');
  check(visibleFields()<=6,'检查表单可见字段超过 6 个');
  q('#entry-date').value='2026-10-20';
  q('#entry-text').value=examText;
  q('#entry-source').value='合成检查报告抄录 · 浏览器测试';
  click('[data-action="save"]');
  await waitFor(()=>!q('#dialog').open,'检查未保存');
  const exam=state.records.find(r=>r.text===examText);
  check(exam,'检查未进入内存记录');
  check(exam.kind==='消化道检查'&&exam.department==='消化','检查记录类型或科别不正确');
  check(exam.private===false,'检查默认被标成私密');

  /* ── 4. 月份与未知日期分别录入，按精度分组 ── */
  await addDigestive('add',{precision:'month',month:'2026-08',text:monthText,source:''});
  const monthRec=state.records.find(r=>r.text===monthText);
  check(monthRec,'月份记录未进入内存记录');
  check(monthRec.kind==='消化症状'&&monthRec.department==='消化','月份记录类型或科别不正确');
  check(monthRec.datePrecision==='month'&&monthRec.date==='2026-08','月份精度未保存');
  check(monthRec.source==='','空来源月份记录被伪造成来源：'+monthRec.source);
  await addDigestive('add-check',{precision:'unknown',text:unknownText,source:''});
  const unknownRec=state.records.find(r=>r.text===unknownText);
  check(unknownRec,'未知日期记录未进入内存记录');
  check(unknownRec.kind==='消化道检查'&&unknownRec.department==='消化','未知日期记录类型或科别不正确');
  check(unknownRec.datePrecision==='unknown'&&unknownRec.date==='','未知日期未保存为空');
  check(unknownRec.source==='','空来源未知记录被伪造成来源：'+unknownRec.source);

  /* ── 5. 同日双栏、日期/来源分别显示、空来源不补造 ── */
  const dayGroup=q('section.digest-group[data-digest-precision="day"]');
  const monthGroup=q('section.digest-group[data-digest-precision="month"]');
  const unknownGroup=q('section.digest-group[data-digest-precision="unknown"]');
  check(dayGroup.querySelectorAll('[data-digest-date]').length===1,'同一天记录未合并为一行');
  const sameDay=dayGroup.querySelector('[data-digest-date="2026-10-20"]');
  const daySymCell=sameDay.querySelector('[data-digest-kind="消化症状"]');
  const dayExamCell=sameDay.querySelector('[data-digest-kind="消化道检查"]');
  check(daySymCell.textContent.includes(symptomText),'症状未出现在同一天的症状栏');
  check(dayExamCell.textContent.includes(examText),'检查未出现在同一天的检查栏');
  check(!daySymCell.textContent.includes(examText),'检查文本混入症状栏');
  check(!dayExamCell.textContent.includes(symptomText),'症状文本混入检查栏');
  check(daySymCell.textContent.includes('2026-10-20')&&daySymCell.textContent.includes('来源：未填写'),'空来源症状未显示日期与未填写来源');
  check(!daySymCell.textContent.includes('本人记录 · 本次演示'),'空来源被伪造成本人记录来源');
  check(dayExamCell.textContent.includes('来源：合成检查报告抄录 · 浏览器测试'),'检查来源未分别显示');
  check(monthGroup.textContent.includes('2026-08（仅月份）'),'仅知月份未单独标识');
  const monthAugRow=q('section.digest-group[data-digest-precision="month"] [data-digest-date="2026-08"]');
  check(monthAugRow.querySelector('[data-digest-kind="消化症状"]').textContent.includes(monthText),'仅知月份的记录未出现在症状栏');
  check(monthAugRow.querySelector('[data-digest-kind="消化道检查"]').textContent.includes('未记录'),'月份记录日期的检查栏未显示未记录');
  check(!monthAugRow.querySelector('[data-digest-kind="消化道检查"]').textContent.includes(monthText),'月份症状混入检查栏');
  const unknownRow=q('section.digest-group[data-digest-precision="unknown"] [data-digest-date="unknown"]');
  check(unknownRow.querySelector('[data-digest-kind="消化道检查"]').textContent.includes(unknownText),'日期未知的记录未出现在检查栏');
  check(unknownRow.querySelector('[data-digest-kind="消化症状"]').textContent.includes('未记录'),'未知记录日期的症状栏未显示未记录');
  check(!unknownRow.querySelector('[data-digest-kind="消化症状"]').textContent.includes(unknownText),'未知检查混入症状栏');
  check(unknownGroup.textContent.includes('日期未知'),'未知日期未单独标识');
  check(!dayGroup.textContent.includes(monthText)&&!monthGroup.textContent.includes(symptomText),'月份记录与具体日期混排');
  check(!unknownGroup.textContent.includes(monthText)&&!monthGroup.textContent.includes(unknownText),'未知日期与月份混排');
  const pageCounts=q('#digestive-page').textContent;
  check(pageCounts.includes('2 条症状 · 2 条检查'),'症状/检查条数未分别统计：'+pageCounts.slice(0,260));

  /* ── 6. 公开记录可进 AI 草稿；更正日期/来源/私密后清空并排除 ── */
  click('[data-action="discuss"]');
  check(q('#draft').value.includes(symptomText)&&q('#draft').value.includes(examText),'公开症状或检查未进入草稿');
  const draft=q('#draft').value;
  const draftLines=draft.split('\\n').filter(line=>line.includes(symptomText)||line.includes(examText));
  check(draftLines.length===2,'AI 草稿中症状/检查行数不是 2');
  check(draftLines.every(line=>!line.trimEnd().endsWith('｜')),'AI 草稿为空来源留下多余分隔符');
  check(!draft.includes('来源未知'),'AI 草稿把空来源写成来源未知');

  click('[data-correct="'+symptom.id+'"]');
  await waitFor(()=>q('#dialog').open,'症状更正未打开');
  check(q('#entry-text').value===symptomText,'更正表单未回填原文');
  check(q('#entry-source').value==='','更正表单把空来源回填成了伪造来源');
  check(q('#entry-date').value==='2026-10-20','更正表单未回填原日期');
  setPrecision('month');
  q('#entry-month').value='2026-09';
  q('#entry-month').dispatchEvent(new Event('input',{bubbles:true}));
  q('#entry-text').value=symptomText.replace('同日','同日更正');
  q('#entry-source').value='复核来源 · 浏览器测试';
  q('#entry-private').checked=true;
  click('[data-save-correction="'+symptom.id+'"]');
  await waitFor(()=>!q('#dialog').open,'症状更正未保存');
  check(symptom.private===true,'症状未保存私密更正');
  check(symptom.date==='2026-09'&&symptom.datePrecision==='month','更正后的月份精度未保存');
  check(symptom.source==='复核来源 · 浏览器测试','更正后的来源未保存');
  check(symptom.history.length===1,'更正未保留上一版历史');
  check(symptom.history[0].text===symptomText&&symptom.history[0].date==='2026-10-20','历史未保留旧原文或旧日期');
  check(symptom.history[0].datePrecision==='day'&&symptom.history[0].source==='','历史未保留旧日期精度或旧空来源');
  check(q('#draft').value==='','公开→私密后旧 AI 草稿未清空');

  const monthRow=q('section[data-digest-precision="month"] [data-digest-date="2026-09"]');
  const correctedCell=monthRow.querySelector('[data-digest-kind="消化症状"]');
  check(correctedCell.textContent.includes('私密'),'本人页未显示私密标记');
  check(correctedCell.textContent.includes('来源：复核来源 · 浏览器测试'),'本人页未显示更正后的来源');
  check(correctedCell.textContent.includes('日期：2026-10-20'),'本人页历史未显示旧日期');
  check(correctedCell.textContent.includes('来源：未填写'),'本人页历史未显示旧空来源');
  check(correctedCell.textContent.includes('原文：'+symptomText),'本人页历史未显示旧原文');
  check(q('section.digest-group[data-digest-precision="day"] [data-digest-date="2026-10-20"]').querySelector('[data-digest-kind="消化症状"]').textContent.includes('未记录'),'更正日期后旧日期栏未更新');

  click('[data-action="discuss"]');
  check(!q('#draft').value.includes(symptomText),'私密症状进入了 AI 草稿');
  check(q('#draft').value.includes(examText),'公开检查被误排除出 AI 草稿');

  /* ── 7. 私密文案与选择器行为一致；首页、时间线、就诊准备按各自规则处理 ── */
  const note=q('#digestive-causality-note').textContent;
  check(note.includes('默认不勾选')&&note.includes('时间线')&&note.includes('就诊准备')&&note.includes('AI 草稿不会包含'),'私密显示文案未说明真实选择器行为');
  check(!note.includes('只在本页显示'),'私密文案仍声称只在本页显示');

  go('看板');
  const home=q('#main').textContent;
  check(home.includes(examText),'首页未显示公开检查记录');
  check(!home.includes(symptomText),'首页泄露私密症状记录');

  go('复诊与准备','就诊准备与导出');
  const visitBox=q('[data-select="'+symptom.id+'"]');
  check(visitBox.checked===false,'私密症状在就诊准备列表默认被选中');
  check(visitBox.parentElement.textContent.includes('私密 · 逐条选择'),'就诊准备列表未显示私密标记');
  const exportBox=q('[data-select="'+unknownRec.id+'"]');
  check(exportBox.checked===false,'空来源记录在导出列表默认被选中');
  exportBox.checked=true;
  exportBox.dispatchEvent(new Event('change',{bubbles:true}));
  const preview=q('#export-preview').textContent;
  check(preview.includes(unknownText),'导出预览未包含空来源记录');
  check(preview.includes('来源：未填写'),'导出预览空来源未显示为未填写');
  check(!preview.includes('来源未知'),'导出预览空来源被伪造成来源未知');

  go('病情一图秀','治疗与事件节点');
  const examBox=q('[data-timeline-select="'+exam.id+'"]');
  const symptomBox=q('[data-timeline-select="'+symptom.id+'"]');
  check(examBox.checked===false,'公开检查在时间线默认被选中');
  check(symptomBox.checked===false,'私密症状在时间线默认被选中');
  check(symptomBox.parentElement.textContent.includes('私密 · 逐条选择'),'时间线未显示私密标记');
  examBox.checked=true;
  examBox.dispatchEvent(new Event('change',{bubbles:true}));
  const timeline=q('#timeline-results').textContent;
  check(timeline.includes(examText)&&timeline.includes('消化'),'时间线未显示公开检查的原文或科别');
  check(!timeline.includes(symptomText),'时间线泄露私密症状');
  const unknownBox=q('[data-timeline-select="'+unknownRec.id+'"]');
  check(unknownBox.checked===false,'空来源记录在时间线默认被选中');
  unknownBox.checked=true;
  unknownBox.dispatchEvent(new Event('change',{bubbles:true}));
  const timelineWithEmpty=q('#timeline-results').textContent;
  check(timelineWithEmpty.includes(unknownText),'时间线未显示空来源记录');
  check(timelineWithEmpty.includes('来源：未填写'),'时间线空来源未显示为未填写');
  check(!timelineWithEmpty.includes('来源：来源未知'),'时间线空来源出现重复前缀');

  /* ── 8. 未知精度保留原始日期时，记录不能被分组丢掉 ── */
  go('器官与专科','消化道');
  await waitFor(()=>q('#digestive-page'),'未回到消化道页面');
  click('[data-correct="'+exam.id+'"]');
  await waitFor(()=>q('#dialog').open,'检查更正未打开');
  setPrecision('unknown');
  click('[data-save-correction="'+exam.id+'"]');
  await waitFor(()=>!q('#dialog').open,'检查精度更正未保存');
  check(exam.datePrecision==='unknown'&&exam.date==='','更正为日期未知后当前日期未清空：'+exam.date);
  check(exam.history.length===1,'日期未知更正未保留上一版历史');
  check(exam.history[0].date==='2026-10-20'&&exam.history[0].datePrecision==='day','历史未保留旧日期与精度');
  const unknownAfter=q('section.digest-group[data-digest-precision="unknown"]');
  check(unknownAfter.textContent.includes(examText),'日期未知后记录从分组消失');
  check(unknownAfter.textContent.includes('日期未知'),'日期未知分组缺少未知标识');
  check(unknownAfter.textContent.includes('日期：2026-10-20'),'日期未知分组未在历史中保留旧日期');
  check(!document.querySelector('section.digest-group[data-digest-precision="day"]'),'两段记录都移出后仍残留具体日期分组');

  let storageError=null,storageEmpty=true;
  try{storageEmpty=localStorage.length===0&&sessionStorage.length===0}catch(e){storageError=e}
  check(!storageError,'无法读取本地存储，不能确认未写入：'+(storageError&&storageError.message));
  check(storageEmpty,'浏览器测试写入了持久化存储');

  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('消化道页支持同日症状与检查并列、日期精度分组、空来源与历史更正', async (t) => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});

// 窄屏回归：两栏在窄窗口内改为纵向堆叠，不产生整页横向滚动，栏目标签保留。
const narrowProbe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  await waitFor(()=>typeof go==='function'&&state.records.length,'应用未就绪');
  go('器官与专科','消化道');
  await waitFor(()=>q('#digestive-page'),'未进入消化道页面');
  q('[data-action="add"]').click();
  await waitFor(()=>q('#dialog').open,'症状表单未打开');
  q('#entry-date').value='2026-10-20';
  q('#entry-text').value='走查S05窄屏合成症状（非真实资料）';
  q('#entry-source').value='';
  q('[data-action="save"]').click();
  await waitFor(()=>!q('#dialog').open&&!document.querySelector('#digest-empty'),'症状未保存');
  const layout={
    viewport:window.innerWidth,
    overflow:document.documentElement.scrollWidth-window.innerWidth,
    head:getComputedStyle(q('.digest-head')).display,
    dayColumns:getComputedStyle(q('.digest-day')).gridTemplateColumns,
    label:getComputedStyle(q('.digest-cell-label')).display,
    labels:[...document.querySelectorAll('.digest-cell-label')].map(el=>el.textContent.trim()),
    source:q('.digest-day').textContent.includes('来源：未填写')
  };
  check(layout.viewport<=420,'窄屏视口未生效：'+layout.viewport);
  check(layout.overflow<=1,'窄屏出现整页横向滚动：'+layout.overflow);
  check(layout.head==='none','窄屏仍显示两栏表头');
  check(layout.dayColumns.split(' ').length===1,'窄屏日期行仍为多列：'+layout.dayColumns);
  check(layout.label==='block','窄屏栏目标签未显示');
  check(layout.labels.includes('消化症状')&&layout.labels.includes('消化道检查'),'窄屏缺少症状/检查栏目标签');
  check(layout.source,'窄屏空来源未显示为未填写');
  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('消化道并列视图在窄屏纵向堆叠且无整页横向滚动', async (t) => {
  const url = await fixture(t);
  const result = await runPage(url, narrowProbe, { timeoutMs: 30000, width: 390, height: 844 });
  assert.equal(result, 'PASS');
});