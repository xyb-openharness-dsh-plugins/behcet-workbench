import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

// 这组回归只描述原型当前真实形态，不用数据合同里的目标 schema 反推实现：
// 1) 手工记录缺日期精度时，日期保持未知，历史和导出不得补日期；
// 2) 原件候选采纳后更正，历史只保存内容字段，不保存 fileId/原文件名；
// 3) 移除原件只清除「原件：文件名」这一种自动来源，手工来源逐字保留，且没有墓碑。
function probePage(html, probe) {
  const page = html.replace('</body>', probe + '</body>');
  assert.notEqual(page, html, '探针未注入');
  return page;
}

const helpers = `
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async (fn,msg)=>{const deadline=Date.now()+6000;while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  const q=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少元素 '+s);return el};
  const click=s=>q(s).click();
  const text=s=>q(s).textContent;
`;

test('手工发作记录缺日期精度：未知保持未知，更正历史、导出与时间线都不补日期', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-manual-unknown-date-');
  const probe = `<script>(async()=>{try{${helpers}
    const now=new Date();
    const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    const original='口腔溃疡反复，具体开始日期记不清，只记得去年冬天前后';
    const source='本人回忆（日期不详）';
    go('发作与病程','发作记录');
    click('[data-action="add"]');
    await waitFor(()=>q('#dialog').open,'新增发作对话框未打开');
    const precision=q('#entry-precision');
    precision.value='unknown';precision.dispatchEvent(new Event('change',{bubbles:true}));
    q('#entry-text').value=original;
    q('#entry-source').value=source;
    click('[data-action="save-episode"]');
    await waitFor(()=>!q('#dialog').open,'保存发作后对话框未关闭');

    const rec=state.records.find(r=>r.text===original);
    check(rec,'新增发作记录没有写入状态');
    check(rec.kind==='发作记录','新增记录类型不对：'+rec.kind);
    check(rec.date===''&&rec.datePrecision==='unknown','未知日期被写入了推测值：'+JSON.stringify({date:rec.date,datePrecision:rec.datePrecision}));
    check(rec.history.length===0,'新增记录不应自带更正历史');
    check(dateText(rec)==='日期未知','未知日期显示不对：'+dateText(rec));
    check(startText(rec)==='未知','未知开始时间显示不对：'+startText(rec));

    const exported=visitLine(rec);
    check(exported.includes('开始：未知'),'导出行没有写开始时间未知：'+exported);
    check(exported.includes('结束：未知'),'导出行没有写结束时间未知：'+exported);
    check(exported.includes(original),'导出行丢了原文');
    check(!exported.includes(today),'导出行伪造了今天日期');
    check(!exported.includes('原始值'),'未知日期不应凭空产生原始值注释');

    const rowBefore=[...document.querySelectorAll('main .row')].find(x=>x.textContent.includes(original));
    check(rowBefore,'资料库记录行未渲染');
    check(rowBefore.textContent.includes('日期未知'),'资料库未显示日期未知');
    check(!rowBefore.textContent.includes(today),'记录行把今天日期当成了发作日期：'+rowBefore.textContent);

    click('[data-correct="'+rec.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'更正对话框未打开');
    check(q('#entry-text').value===original,'更正表单没有带回原文');
    const revised=original+'（补充：夜间疼痛更明显）';
    q('#entry-text').value=revised;
    click('[data-save-correction="'+rec.id+'"]');
    await waitFor(()=>!q('#dialog').open,'保存更正后对话框未关闭');

    check(rec.text===revised,'当前正文未更新');
    check(rec.date===''&&rec.datePrecision==='unknown','更正时补出了日期精度');
    check(rec.history.length===1,'更正历史数量不对：'+rec.history.length);
    const h=rec.history[0];
    check(JSON.stringify(Object.keys(h).sort())===JSON.stringify(['date','datePrecision','endDate','private','site','source','text']),'发作更正历史字段形态变了：'+Object.keys(h).join(','));
    check(h.date===''&&h.datePrecision==='unknown','历史里的旧日期精度被改写');
    check(h.endDate===''&&h.site==='','历史补出了未填过的字段');
    check(h.source===source,'历史来源被改写：'+h.source);
    check(h.private===false,'历史隐私状态不对：'+h.private);
    check(h.text===original,'历史没有保留更正前原文');
    ['fileId','fileName','original','size','registeredAt','removedAt','removedBy','tombstone'].forEach(k=>check(!(k in h),'历史不应含有 '+k));

    const rowAfter=[...document.querySelectorAll('main .row')].find(x=>x.textContent.includes(revised));
    check(rowAfter,'更正后的记录行未渲染');
    check(rowAfter.textContent.includes('更正前'),'公开更正历史未显示');
    check(rowAfter.textContent.includes(original),'公开更正历史没有旧原文');
    check(rowAfter.textContent.includes('开始：未知'),'更正历史把开始时间显示成了具体日期');
    check(rowAfter.textContent.includes('日期未知'),'更正后记录页不再显示日期未知');

    go('看板');
    click('[data-action="discuss"]');
    await waitFor(()=>q('#draft').value.includes(revised),'AI 草稿未包含更正后的记录');
    const draftLine=q('#draft').value.split(String.fromCharCode(10)).find(line=>line.includes(revised));
    check(draftLine,'AI 草稿没有包含更正后的记录：'+q('#draft').value.slice(0,200));
    check(draftLine.includes('开始：未知'),'AI 草稿没有沿用开始时间未知，而是补了日期：'+draftLine);
    check(!draftLine.includes(today),'AI 草稿把今天日期写进了这条记录：'+draftLine);

    go('病情一图秀','治疗与事件节点');
    const cb=q('[data-timeline-select="'+rec.id+'"]');
    cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));
    await waitFor(()=>q('[data-timeline-source="'+rec.id+'"]'),'时间线未渲染所选记录');
    const article=q('[data-timeline-source="'+rec.id+'"]').closest('article');
    const section=article.closest('section');
    check(section&&section.querySelector('h3').textContent.includes('日期未知（不参与排序）'),'未知日期没有进入未知分组');
    check(article.textContent.includes('来源：'+source),'时间线来源显示不对：'+article.textContent);
    window.__manualUnknownDate='PASS';
  }catch(e){window.__manualUnknownDate='FAIL: '+e.message}})()</script>`;
  await writeFile(fx.indexPath, probePage(fx.html, probe));
  const result = await runPage(fx.url, 'window.__manualUnknownDate || ""');
  assert.equal(result, 'PASS');
});

test('候选采纳后更正再移除原件：当前/历史来源被清除，但历史不携带原件指针或墓碑', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-adoption-history-');
  const probe = `<script>(async()=>{try{${helpers}
    const name='adopted-note.txt';
    go('资料目录与云解析');
    const dt=new DataTransfer();
    dt.items.add(new File(['2026-09-01 口腔溃疡好转，进食受影响\\n医生建议三个月后复诊'],name,{type:'text/plain'}));
    const input=q('#file-input');
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    check(state.files.length===1,'原件未登记');
    const f=state.files[0];
    await waitFor(()=>f.content.includes('口腔溃疡好转'),'文件读取未完成');
    click('[data-parse="'+f.id+'"]');
    q('#parse-consent').checked=true;
    click('[data-parse-run="'+f.id+'"]');
    check(state.candidates.length===2,'候选数量不对：'+state.candidates.length);

    const c=state.candidates[0],original=c.text;
    click('[data-accept="'+c.id+'"]');
    const rec=state.records.find(r=>r.kind==='资料库'&&r.text===original);
    check(rec,'采纳记录没有写入状态');
    check(rec.kind==='资料库','采纳记录类型不对：'+rec.kind);
    check(rec.fileId===f.id&&rec.original&&rec.original.title===name,'采纳记录没有保留原件引用');
    check(rec.source==='原件：'+name,'采纳记录的自动来源不对：'+rec.source);
    check(rec.date===''&&rec.datePrecision==='unknown','采纳记录不该有日期');

    go('病情整理','资料库');
    click('[data-correct="'+rec.id+'"]');
    await waitFor(()=>q('#dialog').open,'更正对话框未打开');
    check(q('#entry-text').value===original,'更正表单没有带回候选取出的原文');
    const revised=original+'（复诊后补记：已停药）';
    q('#entry-text').value=revised;
    click('[data-save-correction="'+rec.id+'"]');
    await waitFor(()=>!q('#dialog').open,'保存更正后对话框未关闭');

    check(rec.text===revised,'当前正文未更新');
    check(rec.date===''&&rec.datePrecision==='unknown','更正给采纳记录补了日期');
    check(rec.fileId===f.id&&rec.original&&rec.original.title===name,'更正阶段不应清掉原件关联');
    check(rec.history.length===1,'更正历史数量不对');
    const h=rec.history[0];
    check(JSON.stringify(Object.keys(h).sort())===JSON.stringify(['private','source','text']),'资料库更正历史字段形态变了：'+Object.keys(h).join(','));
    check(h.text===original&&h.source==='原件：'+name&&h.private===false,'历史没有保存更正前的正文/来源');
    ['fileId','fileName','original','size','registeredAt','date','datePrecision','fileLinked','removedAt','removedBy','tombstone'].forEach(k=>check(!(k in h),'历史不应含有 '+k));
    const rowBefore=[...document.querySelectorAll('main .row')].find(x=>x.textContent.includes(revised));
    check(rowBefore&&rowBefore.textContent.includes('更正前'),'公开更正历史未显示');
    check(rowBefore.textContent.includes('来源：原件：'+name),'更正历史未显示原自动来源');

    go('资料目录与云解析');
    click('[data-file-del="'+f.id+'"]');
    await waitFor(()=>q('#dialog').open,'移除原件确认框未打开');
    const confirmText=text('#dialog');
    check(confirmText.includes(name),'确认框没有显示要移除的文件名');
    check(confirmText.includes('手工填写或修改过的来源不会被改写'),'确认框没有说明手工来源不改写');
    check(confirmText.includes('原文件不会被删除'),'确认框没有说明磁盘原件不受影响');
    click('[data-file-del-confirm="'+f.id+'"]');
    await waitFor(()=>state.files.length===0&&!q('#dialog').open,'移除原件后状态未更新');
    check(q('#toast').textContent.includes('自动生成的来源文件名已清除'),'提示没有说明自动来源已清除');
    check(q('#toast').textContent.includes('手工来源未改写'),'提示没有说明手工来源不改写');

    check(state.candidates.length===0,'移除原件后候选没有清空');
    check(state.records.some(r=>r.id===rec.id),'移除原件误删了已采纳记录');
    check(rec.fileId===null,'移除原件后 fileId 未置空：'+rec.fileId);
    check(rec.original===null,'移除原件后 original 未置空');
    check(rec.source==='原件已移除','当前来源未清除自动文件名：'+rec.source);
    check(rec.private===false,'移除原件改变了记录隐私');
    check(rec.history.length===1,'移除原件改动了历史数量');
    check(rec.history[0].source==='原件已移除','历史来源未清除自动文件名：'+rec.history[0].source);
    check(rec.history[0].text===original,'移除原件改动了历史正文');
    check(JSON.stringify(Object.keys(rec.history[0]).sort())===JSON.stringify(['private','source','text']),'移除原件改写了历史字段形态');
    ['removedAt','removedBy','removedName','tombstone','linkState','link_state'].forEach(k=>check(!(k in rec)&&!(k in rec.history[0]),'不应出现墓碑字段 '+k));
    check(!JSON.stringify(state).includes(name),'移除后内存状态仍保留原文件名');

    go('病情整理','资料库');
    const rowAfter=[...document.querySelectorAll('main .row')].find(x=>x.textContent.includes(revised));
    check(rowAfter,'移除原件后记录行消失');
    check(rowAfter.textContent.includes('来源：原件已移除'),'记录页当前来源没有清除文件名：'+rowAfter.textContent);
    check(rowAfter.textContent.includes('更正前'),'移除原件后公开历史消失');
    check(!rowAfter.textContent.includes(name),'移除原件后页面仍显示原文件名');

    go('病情一图秀','治疗与事件节点');
    const cb=q('[data-timeline-select="'+rec.id+'"]');
    cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));
    await waitFor(()=>q('[data-timeline-source="'+rec.id+'"]'),'时间线未渲染记录');
    const article=q('[data-timeline-source="'+rec.id+'"]').closest('article');
    check(article.textContent.includes('当前记录已更正'),'时间线没保留更正标记');
    check(article.textContent.includes('来源：原件已移除'),'时间线来源没有清除文件名');
    check(article.textContent.includes('无原件'),'时间线没有标出无原件');
    check(!article.textContent.includes(name),'时间线仍显示原文件名');
    click('[data-timeline-source="'+rec.id+'"]');
    await waitFor(()=>q('#dialog').open,'来源弹窗未打开');
    const sourceDialog=text('#dialog');
    check(sourceDialog.includes('来源：原件已移除'),'来源弹窗没有清除文件名');
    check(sourceDialog.includes('原件缺失'),'来源弹窗没有说明原件缺失');
    check(!sourceDialog.includes(name),'来源弹窗仍显示原文件名');
    window.__adoptionHistory='PASS';
  }catch(e){window.__adoptionHistory='FAIL: '+e.message}})()</script>`;
  await writeFile(fx.indexPath, probePage(fx.html, probe));
  const result = await runPage(fx.url, 'window.__adoptionHistory || ""');
  assert.equal(result, 'PASS');
});

test('移除原件只清洗全等自动来源：手工来源在当前位置和历史中都逐字保留', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-removal-source-boundary-');
  const probe = `<script>(async()=>{try{${helpers}
    const name='scan-note.txt';
    const manualSource='门诊报告复印件 · 本人抄录（字迹不清）';
    go('资料目录与云解析');
    const dt=new DataTransfer();
    dt.items.add(new File(['门诊报告抄录：下肢结节性红斑，超声未见血栓。'],name,{type:'text/plain'}));
    const input=q('#file-input');
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    check(state.files.length===1,'原件未登记');
    const f=state.files[0];
    await waitFor(()=>f.content.includes('结节性红斑'),'文件读取未完成');

    const addVascular=async (textValue,sourceValue)=>{
      go('器官与专科','血管');
      click('[data-action="add-vascular"]');
      await waitFor(()=>q('#dialog').open&&q('#v-file'),'血管表单未打开');
      q('#v-text').value=textValue;
      q('#v-source').value=sourceValue;
      const sel=q('#v-file');
      sel.value=String(f.id);sel.dispatchEvent(new Event('change',{bubbles:true}));
      q('#v-private').checked=false;
      click('[data-action="save-vascular"]');
      await waitFor(()=>!q('#dialog').open,'保存血管记录后对话框未关闭');
      const saved=state.records.find(r=>r.text===textValue);
      check(saved,'血管记录没有写入状态');
      return saved;
    };

    const manual=await addVascular('下肢结节性红斑，超声未见血栓（复印件字迹不清）',manualSource);
    check(manual.fileId===f.id,'手工记录没有关联原件');
    check(manual.source===manualSource,'手工来源被表单改写：'+manual.source);
    check(manual.private===false,'血管记录应被显式设为公开');
    click('[data-correct="'+manual.id+'"]');
    await waitFor(()=>q('#dialog').open,'手工记录更正框未打开');
    q('#v-text').value='下肢结节性红斑，超声未见血栓（复印件字迹不清）；复查仍未记录日期';
    click('[data-save-correction="'+manual.id+'"]');
    await waitFor(()=>!q('#dialog').open,'手工记录更正未关闭');
    check(manual.history.length===1,'手工记录更正历史数量不对');

    const auto=await addVascular('复查：下肢结节较前减少。','');
    check(auto.source==='原件：'+name,'留空来源没有生成自动来源：'+auto.source);
    click('[data-correct="'+auto.id+'"]');
    await waitFor(()=>q('#dialog').open,'自动来源更正框未打开');
    q('#v-text').value='复查：下肢结节较前减少（补记）。';
    click('[data-save-correction="'+auto.id+'"]');
    await waitFor(()=>!q('#dialog').open,'自动来源更正未关闭');
    check(auto.history.length===1,'自动来源更正历史数量不对');

    go('资料目录与云解析');
    click('[data-file-del="'+f.id+'"]');
    await waitFor(()=>q('#dialog').open,'移除确认框未打开');
    click('[data-file-del-confirm="'+f.id+'"]');
    await waitFor(()=>state.files.length===0&&!q('#dialog').open,'移除后状态未更新');

    check(manual.fileId===null&&manual.original===null,'手工记录的原件指针未清空');
    check(manual.source===manualSource,'手工来源被错误清洗：'+manual.source);
    check(manual.history[0].source===manualSource,'手工历史来源被错误清洗：'+manual.history[0].source);
    check(manual.history[0].fileLinked===true,'历史应保留“当时关联过原件”的事实');
    check(auto.source==='原件已移除','自动来源未清洗：'+auto.source);
    check(auto.history[0].source==='原件已移除','自动历史来源未清洗：'+auto.history[0].source);
    check(auto.history[0].fileLinked===true,'自动历史应保留“当时关联过原件”的事实');

    const vascularKeys=['date','datePrecision','fileLinked','private','reportDate','reportDatePrecision','source','text'];
    check(JSON.stringify(Object.keys(manual.history[0]).sort())===JSON.stringify(vascularKeys),'手工血管历史字段形态变了：'+Object.keys(manual.history[0]).join(','));
    check(JSON.stringify(Object.keys(auto.history[0]).sort())===JSON.stringify(vascularKeys),'自动血管历史字段形态变了：'+Object.keys(auto.history[0]).join(','));
    ['removedAt','removedBy','removedName','tombstone','linkState','link_state'].forEach(k=>{
      check(!(k in manual)&&!(k in auto),'记录不应出现墓碑字段 '+k);
      check(!(k in manual.history[0])&&!(k in auto.history[0]),'历史不应出现墓碑字段 '+k);
    });

    go('器官与专科','血管');
    const manualRow=q('[data-vascular-row="'+manual.id+'"]');
    const autoRow=q('[data-vascular-row="'+auto.id+'"]');
    check(manualRow.textContent.includes('来源：'+manualSource),'手工来源在页面上被改写');
    check(autoRow.textContent.includes('来源：原件已移除'),'自动来源在页面上未清洗：'+autoRow.textContent);
    check(manualRow.querySelector('[data-no-original-badge]'),'手工记录移除后没有标为无原件');
    check(autoRow.querySelector('[data-no-original-badge]'),'自动记录移除后没有标为无原件');
    check(!manualRow.textContent.includes(name)&&!autoRow.textContent.includes(name),'移除后页面仍显示原文件名');
    window.__removalBoundary='PASS';
  }catch(e){window.__removalBoundary='FAIL: '+e.message}})()</script>`;
  await writeFile(fx.indexPath, probePage(fx.html, probe));
  const result = await runPage(fx.url, 'window.__removalBoundary || ""');
  assert.equal(result, 'PASS');
});