import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

// 只描述 prototypes/v0.2 当前真实行为，不用目标数据合同反推：
// 1) 各 kind 的更正历史字段集合互不相同：当前用药 9 键、医嘱 7 键、
//    消化症状/消化道检查 5 键、通用记录 3 键、血管 8 键；
//    通用历史不保存 date/datePrecision，尽管记录本身有日期。
// 2) 先主动解除原件关联、再删除原件：删除只清洗仍指向该原件的记录，
//    已解除关联的记录当前来源与历史来源都不会被再次清洗，形成可观察的
//    「原件：文件名」来源残留；仍保持关联的对照记录则会被清洗。
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
  const keysOf=o=>Object.keys(o).sort();
  const sameKeys=(o,expected,label)=>{const actual=keysOf(o);check(JSON.stringify(actual)===JSON.stringify(expected),label+' 字段形态变了：'+actual.join(','))};
`;

test('各记录类型的更正历史字段按类型不同，并保留各自的旧值', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-history-shapes-');
  const probe = `<script>(async()=>{try{${helpers}
    const expect={
      treatment:['date','datePrecision','dose','drug','endDate','ongoing','private','source','text'],
      advice:['date','datePrecision','private','proposer','reviewDate','source','text'],
      digestive:['date','datePrecision','private','source','text'],
      generic:['private','source','text'],
      vascular:['date','datePrecision','fileLinked','private','reportDate','reportDatePrecision','source','text']
    };

    // 当前用药：9 个字段，包含药名/剂量/结束日期/进行中，但不含原件指针。
    go('治疗与用药','当前用药');
    click('[data-action="add"]');
    await waitFor(()=>q('#dialog').open&&q('#t-drug'),'治疗新增表单未打开');
    q('#t-drug').value='旧药名';
    q('#t-dose').value='2片';
    q('#t-text').value='旧治疗原文';
    q('#t-source').value='门诊处方抄录';
    q('#t-private').checked=false;
    click('[data-action="save-treatment"]');
    await waitFor(()=>!q('#dialog').open,'保存治疗后对话框未关闭');
    const med=state.records.find(r=>r.kind==='当前用药'&&r.text==='旧治疗原文');
    check(med,'治疗记录没有写入状态');
    check(med.date===''&&med.datePrecision==='unknown','新增治疗默认精度不是 unknown');
    click('[data-correct="'+med.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#t-text'),'治疗更正表单未打开');
    check(q('#t-drug').value==='旧药名'&&q('#t-dose').value==='2片','治疗更正表单没有带回旧值');
    q('#t-text').value='新治疗原文';
    q('#t-dose').value='3片';
    click('[data-save-correction="'+med.id+'"]');
    await waitFor(()=>!q('#dialog').open,'治疗更正后对话框未关闭');
    check(med.history.length===1,'治疗更正历史数量不对：'+med.history.length);
    const medH=med.history[0];
    sameKeys(medH,expect.treatment,'当前用药历史');
    check(medH.drug==='旧药名'&&medH.dose==='2片','治疗历史没有保留旧药名/剂量');
    check(medH.text==='旧治疗原文'&&medH.source==='门诊处方抄录','治疗历史没有保留旧正文/来源');
    check(medH.date===''&&medH.datePrecision==='unknown','治疗历史没有保留未知日期');
    check(medH.endDate===''&&medH.ongoing===false,'治疗历史补出了结束日期或进行中状态');
    check(medH.private===false,'治疗历史隐私状态不对');
    ['fileId','fileName','fileLinked','original','size','registeredAt','removedAt','removedBy','tombstone'].forEach(k=>check(!(k in medH),'治疗历史不应含有 '+k));

    // 医嘱记录：7 个字段，有提出者/复查日期，没有药名/剂量/结束日期。
    go('复诊与准备','医嘱记录');
    click('[data-action="add"]');
    await waitFor(()=>q('#dialog').open&&q('#a-text'),'医嘱新增表单未打开');
    q('#a-text').value='旧医嘱原文';
    q('#a-proposer').value='复诊医生';
    q('#a-source').value='复诊口述';
    q('#a-date').value='2026-02-10';
    q('#a-review-date').value='2026-05-10';
    q('#a-private').checked=false;
    click('[data-action="save-advice"]');
    await waitFor(()=>!q('#dialog').open,'保存医嘱后对话框未关闭');
    const advice=state.records.find(r=>r.kind==='医嘱记录'&&r.text==='旧医嘱原文');
    check(advice,'医嘱记录没有写入状态');
    click('[data-correct="'+advice.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#a-text'),'医嘱更正表单未打开');
    q('#a-text').value='新医嘱原文';
    click('[data-save-correction="'+advice.id+'"]');
    await waitFor(()=>!q('#dialog').open,'医嘱更正后对话框未关闭');
    check(advice.history.length===1,'医嘱更正历史数量不对');
    const advH=advice.history[0];
    sameKeys(advH,expect.advice,'医嘱历史');
    check(advH.text==='旧医嘱原文'&&advH.proposer==='复诊医生','医嘱历史没有保留旧正文/提出者');
    check(advH.source==='复诊口述'&&advH.date==='2026-02-10'&&advH.datePrecision==='day','医嘱历史日期/来源不对');
    check(advH.reviewDate==='2026-05-10'&&advH.private===false,'医嘱历史复查日期/隐私不对');
    ['drug','dose','endDate','ongoing','fileLinked','fileId','original','tombstone'].forEach(k=>check(!(k in advH),'医嘱历史不应含有 '+k));

    // 消化症状与消化道检查：共用 5 键，和医嘱/治疗明显不同。
    go('器官与专科','消化道');
    click('[data-action="add"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'消化症状新增表单未打开');
    q('#entry-date').value='2026-03-01';
    q('#entry-text').value='旧症状原文';
    q('#entry-source').value='本人记录';
    q('#entry-private').checked=false;
    click('[data-action="save"]');
    await waitFor(()=>!q('#dialog').open,'保存消化症状后对话框未关闭');
    const symptom=state.records.find(r=>r.kind==='消化症状'&&r.text==='旧症状原文');
    check(symptom,'消化症状没有写入状态');
    click('[data-correct="'+symptom.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'消化症状更正表单未打开');
    check(q('#entry-date').value==='2026-03-01','消化症状更正表单没有带回日期');
    q('#entry-text').value='新症状原文';
    q('#entry-source').value='复诊补记';
    click('[data-save-correction="'+symptom.id+'"]');
    await waitFor(()=>!q('#dialog').open,'消化症状更正后对话框未关闭');
    check(symptom.history.length===1,'消化症状更正历史数量不对');
    const symH=symptom.history[0];
    sameKeys(symH,expect.digestive,'消化症状历史');
    check(symH.date==='2026-03-01'&&symH.datePrecision==='day','消化症状历史日期不对');
    check(symH.text==='旧症状原文'&&symH.source==='本人记录'&&symH.private===false,'消化症状历史旧值不对');
    ['drug','dose','proposer','reviewDate','fileLinked','fileId','original','tombstone'].forEach(k=>check(!(k in symH),'消化症状历史不应含有 '+k));

    click('[data-action="add-check"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'消化道检查新增表单未打开');
    q('#entry-date').value='2026-03-02';
    q('#entry-text').value='旧检查原文';
    q('#entry-source').value='合成检查报告';
    q('#entry-private').checked=false;
    click('[data-action="save"]');
    await waitFor(()=>!q('#dialog').open,'保存消化道检查后对话框未关闭');
    const checkRec=state.records.find(r=>r.kind==='消化道检查'&&r.text==='旧检查原文');
    check(checkRec,'消化道检查没有写入状态');
    click('[data-correct="'+checkRec.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'消化道检查更正表单未打开');
    q('#entry-text').value='新检查原文';
    click('[data-save-correction="'+checkRec.id+'"]');
    await waitFor(()=>!q('#dialog').open,'消化道检查更正后对话框未关闭');
    check(checkRec.history.length===1,'消化道检查更正历史数量不对');
    const chkH=checkRec.history[0];
    sameKeys(chkH,expect.digestive,'消化道检查历史');
    check(JSON.stringify(keysOf(chkH))===JSON.stringify(keysOf(symH)),'消化症状与检查的历史字段形态应一致');
    check(chkH.text==='旧检查原文'&&chkH.source==='合成检查报告','消化道检查历史旧值不对');

    // 通用记录（问题清单）：只有正文/来源/隐私 3 键；记录有日期，历史不复制日期。
    go('复诊与准备','问题清单');
    click('[data-action="add"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'问题清单新增表单未打开');
    q('#entry-date').value='2026-04-01';
    q('#entry-text').value='旧问题原文';
    q('#entry-private').checked=false;
    click('[data-action="save"]');
    await waitFor(()=>!q('#dialog').open,'保存问题清单后对话框未关闭');
    const generic=state.records.find(r=>r.kind==='问题清单'&&r.text==='旧问题原文');
    check(generic,'问题清单没有写入状态');
    check(generic.date==='2026-04-01','问题清单记录日期没有保存');
    check(generic.source==='本人记录 · 本次演示','问题清单默认来源不对：'+generic.source);
    click('[data-correct="'+generic.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#entry-text'),'通用更正表单未打开');
    check(!q('#dialog').querySelector('#entry-date'),'通用更正表单不应带日期字段');
    q('#entry-text').value='新问题原文';
    click('[data-save-correction="'+generic.id+'"]');
    await waitFor(()=>!q('#dialog').open,'通用记录更正后对话框未关闭');
    check(generic.history.length===1,'通用记录更正历史数量不对');
    const genH=generic.history[0];
    sameKeys(genH,expect.generic,'通用记录历史');
    check(genH.text==='旧问题原文','通用记录历史没有保留旧正文');
    check(genH.source==='本人记录 · 本次演示'&&genH.private===false,'通用记录历史旧来源/隐私不对');
    check(!('date' in genH)&&!('datePrecision' in genH),'通用记录历史不应复制记录的日期字段');
    ['fileLinked','fileId','original','tombstone'].forEach(k=>check(!(k in genH),'通用记录历史不应含有 '+k));

    // 血管（无原件）：8 键，含 fileLinked 与报告日期；与上述类型都不同。
    go('器官与专科','血管');
    click('[data-action="add-vascular"]');
    await waitFor(()=>q('#dialog').open&&q('#v-text'),'血管新增表单未打开');
    q('#v-text').value='旧血管原文';
    q('#v-source').value='门诊抄录';
    q('#v-private').checked=false;
    click('[data-action="save-vascular"]');
    await waitFor(()=>!q('#dialog').open,'保存血管记录后对话框未关闭');
    const vascular=state.records.find(r=>r.kind==='血管资料'&&r.text==='旧血管原文');
    check(vascular,'血管记录没有写入状态');
    check(vascular.fileId===null,'未关联原件的血管记录 fileId 不是 null');
    click('[data-correct="'+vascular.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#v-text'),'血管更正表单未打开');
    q('#v-text').value='新血管原文';
    click('[data-save-correction="'+vascular.id+'"]');
    await waitFor(()=>!q('#dialog').open,'血管更正后对话框未关闭');
    check(vascular.history.length===1,'血管更正历史数量不对');
    const vasH=vascular.history[0];
    sameKeys(vasH,expect.vascular,'血管历史');
    check(vasH.fileLinked===false,'无原件血管历史 fileLinked 应为 false');
    check(vasH.text==='旧血管原文'&&vasH.source==='门诊抄录'&&vasH.private===false,'血管历史旧值不对');
    check(vasH.reportDate===''&&vasH.reportDatePrecision==='unknown','血管历史补出了报告日期');

    // 字段集合确实按类型分叉：治疗 9、医嘱 7、消化 5、通用 3、血管 8。
    const shapes=[medH,advH,symH,chkH,genH,vasH].map(h=>JSON.stringify(keysOf(h)));
    check(new Set(shapes).size===5,'六种记录的历史字段集合没有形成 5 种不同形态：'+shapes.join(' | '));

    window.__historyShapes='PASS';
  }catch(e){window.__historyShapes='FAIL: '+e.message}})()</script>`;
  await writeFile(fx.indexPath, probePage(fx.html, probe));
  const result = await runPage(fx.url, 'window.__historyShapes || ""');
  assert.equal(result, 'PASS');
});

test('先解除原件关联再删除原件：解除关联记录保留来源文件名残留，仍关联记录被清洗', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-unlinked-source-');
  const probe = `<script>(async()=>{try{${helpers}
    const name='linked-scan.txt';
    const manualSource='门诊报告 '+name+' 抄录（本人补注）';
    go('资料目录与云解析');
    const dt=new DataTransfer();
    dt.items.add(new File(['合成检查：下肢血管超声未见血栓。'],name,{type:'text/plain'}));
    const input=q('#file-input');
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    check(state.files.length===1,'原件未登记');
    const f=state.files[0];
    await waitFor(()=>f.content.includes('未见血栓'),'文件读取未完成');

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
      const saved=state.records.find(r=>r.kind==='血管资料'&&r.text===textValue);
      check(saved,'血管记录没有写入状态');
      check(saved.fileId===f.id,'血管记录没有关联原件');
      return saved;
    };

    const unlinkedAuto=await addVascular('自动来源：解除关联后再删除原件','');
    const unlinkedManual=await addVascular('手工来源：解除关联后再删除原件',manualSource);
    const stillLinked=await addVascular('仍保持关联：删除原件应清洗来源','');
    check(unlinkedAuto.source==='原件：'+name,'自动来源记录初始来源不对');
    check(unlinkedManual.source===manualSource,'手工来源记录初始来源不对');
    check(stillLinked.source==='原件：'+name,'对照记录初始来源不对');

    // 解除自动来源记录的关联：保存时自动来源被改写为「原件已移除」，
    // 但更正历史保存的是解除前的「原件：文件名」。
    click('[data-correct="'+unlinkedAuto.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#v-file'),'自动来源记录更正框未打开');
    q('#v-file').value='';
    q('#v-text').value='自动来源：解除关联后再删除原件（已解除）';
    click('[data-save-correction="'+unlinkedAuto.id+'"]');
    await waitFor(()=>!q('#dialog').open,'自动来源记录解除关联后对话框未关闭');
    check(unlinkedAuto.fileId===null,'自动来源记录未解除关联');
    check(unlinkedAuto.source==='原件已移除','自动来源解除关联后当前来源应被改写：'+unlinkedAuto.source);
    check(unlinkedAuto.history.length===1,'自动来源记录更正历史数量不对');
    check(unlinkedAuto.history[0].source==='原件：'+name,'自动来源历史应保留解除前的文件名：'+unlinkedAuto.history[0].source);
    check(unlinkedAuto.history[0].fileLinked===true,'自动来源历史应保留当时关联原件的事实');

    // 解除手工来源记录的关联：来源不等于自动生成串，保存时不被改写。
    click('[data-correct="'+unlinkedManual.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#v-file'),'手工来源记录更正框未打开');
    q('#v-file').value='';
    q('#v-text').value='手工来源：解除关联后再删除原件（已解除）';
    click('[data-save-correction="'+unlinkedManual.id+'"]');
    await waitFor(()=>!q('#dialog').open,'手工来源记录解除关联后对话框未关闭');
    check(unlinkedManual.fileId===null,'手工来源记录未解除关联');
    check(unlinkedManual.source===manualSource,'手工来源解除关联时被改写：'+unlinkedManual.source);
    check(unlinkedManual.history[0].source===manualSource,'手工来源历史被改写：'+unlinkedManual.history[0].source);

    // 对照记录保持关联，只改正文，历史里仍保存自动来源。
    click('[data-correct="'+stillLinked.id+'"]');
    await waitFor(()=>q('#dialog').open&&q('#v-file'),'对照记录更正框未打开');
    q('#v-text').value='仍保持关联：删除原件应清洗来源（已补记）';
    click('[data-save-correction="'+stillLinked.id+'"]');
    await waitFor(()=>!q('#dialog').open,'对照记录更正后对话框未关闭');
    check(stillLinked.fileId===f.id,'对照记录在更正时丢失了原件关联');
    check(stillLinked.history[0].source==='原件：'+name,'对照记录历史没有保留自动来源');

    // 相同来源标记造成的歧义（解绑后、删除前）：
    // ① 「原件已移除」只表示“本条不再关联”，原件登记此刻仍在目录中，
    //    所以这个标记不能读成“原件已经不存在”；
    // ② 已解绑记录的历史来源与仍关联记录的当前来源是同一串「原件：文件名」，
    //    单看来源文本无法判断记录此刻是否仍关联原件。
    const liveMarker=stillLinked.source;
    const removedMarker=unlinkedAuto.source;
    check(liveMarker==='原件：'+name,'对照记录当前来源不是自动标记：'+liveMarker);
    check(removedMarker==='原件已移除','自动来源记录解绑后当前来源标记不对：'+removedMarker);
    check(state.files.length===1,'解绑后、删除前原件登记已提前消失');
    check(fileById(f.id)===f,'解绑后、删除前按 id 取不到原件');
    check(state.files.some(x=>x.name===name),'解绑后、删除前目录中已没有该文件名');
    check(unlinkedAuto.fileId===null&&unlinkedManual.fileId===null,'解绑后记录仍指向原件');
    check(stillLinked.fileId===f.id,'对照记录在解绑后、删除前丢失了关联');
    check(unlinkedAuto.history[0].source===liveMarker,'已解绑历史来源与仍关联当前来源不是同一串标记');
    go('资料目录与云解析');
    check(q('[data-file-del="'+f.id+'"]'),'解绑后、删除前资料目录已看不到原件行');

    // 删除同一个原件：只遍历仍以 fileId 指向它的记录。
    go('资料目录与云解析');
    click('[data-file-del="'+f.id+'"]');
    await waitFor(()=>q('#dialog').open,'移除原件确认框未打开');
    click('[data-file-del-confirm="'+f.id+'"]');
    await waitFor(()=>state.files.length===0&&!q('#dialog').open,'移除原件后状态未更新');
    check(state.files.length===0,'删除后原件登记仍存在');
    check(!fileById(f.id),'删除后仍能按 id 取到原件');
    check(!state.files.some(x=>x.name===name),'删除后目录仍残留同名原件');
    check(!document.querySelector('[data-file-del="'+f.id+'"]'),'删除后资料目录仍显示原件行');

    // 已解除关联的自动来源记录：当前来源无文件名，但历史来源残留文件名。
    check(unlinkedAuto.fileId===null,'删除原件后已解除关联记录 fileId 被改动');
    check(unlinkedAuto.source==='原件已移除','删除原件改动了已解除关联记录的当前来源：'+unlinkedAuto.source);
    check(unlinkedAuto.history[0].source==='原件：'+name,'删除原件清洗了已解除关联记录的历史来源：'+unlinkedAuto.history[0].source);
    check(JSON.stringify(unlinkedAuto).includes(name),'已解除关联记录的内存状态不再保留文件名残留');
    const autoKeys=['date','datePrecision','fileLinked','private','reportDate','reportDatePrecision','source','text'];
    check(JSON.stringify(keysOf(unlinkedAuto.history[0]))===JSON.stringify(autoKeys),'删除原件改写了已解除关联记录的历史字段形态');

    // 已解除关联的手工来源记录：当前来源与历史来源都逐字保留文件名。
    check(unlinkedManual.fileId===null,'删除原件后手工来源记录 fileId 被改动');
    check(unlinkedManual.source===manualSource,'删除原件清洗了已解除关联手工来源：'+unlinkedManual.source);
    check(unlinkedManual.history[0].source===manualSource,'删除原件清洗了已解除关联手工历史来源：'+unlinkedManual.history[0].source);

    // 仍保持关联的对照记录：当前来源与历史来源都被清洗。
    check(stillLinked.fileId===null,'删除原件后对照记录 fileId 未置空');
    check(stillLinked.source==='原件已移除','删除原件未清洗仍关联记录的当前来源：'+stillLinked.source);
    check(stillLinked.history[0].source==='原件已移除','删除原件未清洗仍关联记录的历史来源：'+stillLinked.history[0].source);
    check(!JSON.stringify(stillLinked).includes(name),'仍关联记录删除后仍残留文件名');

    // 相同来源标记在删除后的歧义：已解绑记录的历史仍保留与 liveMarker 逐字相同的
    // 「原件：文件名」，而当时仍关联的对照记录同一串标记已被清洗成「原件已移除」。
    // 于是同一串来源文本既可读成“仍关联当前原件”，也可读成“只是历史残留、原件
    // 已不存在”；fileLinked=true 只是更正时的旧快照，不能当指针消除歧义。
    // 「原件已移除」同样在删除前（原件还在）与删除后（原件已消失）是同一串标记。
    check(liveMarker==='原件：'+name,'删除前采集的对照来源标记已变化');
    check(unlinkedAuto.source===removedMarker,'删除前后「原件已移除」标记不一致：'+unlinkedAuto.source);
    check(unlinkedAuto.history[0].source===liveMarker,'已解绑历史残留与删除前的关联标记不是同一串：'+unlinkedAuto.history[0].source);
    check(unlinkedAuto.history[0].fileLinked===true,'已解绑历史没有保留当时的关联快照');
    check(!('fileId' in unlinkedAuto.history[0]),'已解绑历史意外带有 fileId 指针');
    check(!state.files.some(x=>x.name===name),'删除后仍存在可用于消歧的同名原件');
    check(stillLinked.source!==liveMarker&&stillLinked.history[0].source!==liveMarker,'仍关联记录删除后没有清洗同一串来源标记');

    // 页面上同样能看到残留：已解除关联记录的历史详情仍显示原文件名。
    go('器官与专科','血管');
    const autoRow=q('[data-vascular-row="'+unlinkedAuto.id+'"]');
    const manualRow=q('[data-vascular-row="'+unlinkedManual.id+'"]');
    const linkedRow=q('[data-vascular-row="'+stillLinked.id+'"]');
    check(autoRow.querySelector('[data-no-original-badge]'),'已解除关联自动记录没有标为无原件');
    check(autoRow.textContent.includes('来源：原件已移除'),'自动记录当前来源显示不对：'+autoRow.textContent);
    check(autoRow.textContent.includes('原件：'+name),'已解除关联自动记录的公开历史没有显示文件名残留');
    check(manualRow.querySelector('[data-no-original-badge]'),'已解除关联手工记录没有标为无原件');
    check(manualRow.textContent.includes(manualSource),'手工来源在当前页面被改写');
    check(manualRow.textContent.includes(name),'已解除关联手工记录的来源文件名未保留');
    check(linkedRow.textContent.includes('来源：原件已移除'),'对照记录当前来源未清洗：'+linkedRow.textContent);
    check(!linkedRow.textContent.includes(name),'对照记录页面仍显示原文件名');

    window.__unlinkedSource='PASS';
  }catch(e){window.__unlinkedSource='FAIL: '+e.message}})()</script>`;
  await writeFile(fx.indexPath, probePage(fx.html, probe));
  const result = await runPage(fx.url, 'window.__unlinkedSource || ""');
  assert.equal(result, 'PASS');
});