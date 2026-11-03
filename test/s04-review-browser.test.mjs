import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

const boot = `
 const check=(v,m)=>{if(!v)throw Error(m)};
 const q=s=>{let e=document.querySelector(s);if(!e)throw Error('缺少 '+s);return e};
 const click=s=>q(s).click();
 const change=(el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))};
 const wait=async(fn,label='等待超时')=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(label)};
 await wait(()=>typeof go==='function'&&state.records.length,'原型未就绪');
 const register=async(files)=>{go('资料目录与云解析');let dt=new DataTransfer();files.forEach(f=>dt.items.add(f));let input=q('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>state.files.length>=files.length&&state.files.every(f=>f.content!==''),'文件未读取完成')};
 const makeFile=(text,name)=>new File([text],name,{type:'text/plain'});
`;

const lockProbe = `<script>(async()=>{try{
${boot}
 await register([makeFile('合成私密原件文本','s04-lock.txt')]);let f=state.files.find(x=>x.name==='s04-lock.txt');
 let fp=q('[data-file-private="'+f.id+'"]');fp.checked=true;fp.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>f.private);
 go('器官与专科','血管');click('[data-action="add-vascular"]');q('#v-text').value='锁定原件记录';change(q('#v-file'),String(f.id));
 check(q('#v-private').checked&&q('#v-private').disabled,'私密原件应先锁定记录');click('[data-action="save-vascular"]');
 let r=state.records.find(x=>x.text==='锁定原件记录');check(r&&r.fileId===f.id&&r.private,'关联私密记录未保存');
 click('[data-correct="'+r.id+'"]');change(q('#v-file'),'');
 check(q('#v-private').checked&&!q('#v-private').disabled,'解绑时不应自动取消私密');
 check(!q('#v-file-change-note').hidden&&q('#v-file-change-note').textContent.includes('仍保持私密'),'解绑时应解释私密保留');
 q('#v-private').checked=false;click('[data-save-correction="'+r.id+'"]');
 check(q('#dialog').open,'同一次保存不得解绑并公开');
 check(q('#toast').textContent.includes('不能在同一保存'),'应提示分两步保存');
 check(r.private===true&&r.fileId===f.id&&r.history.length===0,'拒绝后不应改动记录');
 q('#v-private').checked=true;click('[data-save-correction="'+r.id+'"]');await wait(()=>!q('#dialog').open);
 check(r.private===true&&r.fileId===null,'第一步只解绑并保留私密');
 check(r.source==='原件已移除','自动生成来源不应残留私密文件名');
 click('[data-correct="'+r.id+'"]');q('#v-private').checked=false;click('[data-save-correction="'+r.id+'"]');await wait(()=>!q('#dialog').open);
 check(r.private===false&&r.fileId===null,'第二步才允许公开');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

const switchProbe = `<script>(async()=>{try{
${boot}
 await register([makeFile('私密原件 A','s04-a.txt'),makeFile('公开原件 B','s04-b.txt')]);
 let a=state.files.find(x=>x.name==='s04-a.txt'),b=state.files.find(x=>x.name==='s04-b.txt');
 let ap=q('[data-file-private="'+a.id+'"]');ap.checked=true;ap.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>a.private&&!b.private);
 go('器官与专科','血管');click('[data-action="add-vascular"]');q('#v-text').value='换原件记录';change(q('#v-file'),String(a.id));click('[data-action="save-vascular"]');
 let r=state.records.find(x=>x.text==='换原件记录');check(r&&r.private&&r.fileId===a.id,'初始私密关联未保存');
 click('[data-correct="'+r.id+'"]');change(q('#v-file'),String(b.id));
 check(q('#v-private').checked&&!q('#v-private').disabled,'换成公开原件时应保留私密勾选');
 check(!q('#v-file-change-note').hidden&&q('#v-file-change-note').textContent.includes('仍保持私密'),'换原件时应解释私密保留');
 click('[data-save-correction="'+r.id+'"]');await wait(()=>!q('#dialog').open);
 check(r.private===true&&r.fileId===b.id,'换原件后仍应保持私密');
 check(r.source==='原件：s04-b.txt','自动来源应跟随新原件，不残留旧私密文件名');
 click('[data-correct="'+r.id+'"]');q('#v-private').checked=false;click('[data-save-correction="'+r.id+'"]');await wait(()=>!q('#dialog').open);
 check(r.private===false&&r.fileId===b.id,'第二次保存才允许公开');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

const monthProbe = `<script>(async()=>{try{
${boot}
 go('器官与专科','血管');click('[data-action="add-vascular"]');q('#v-text').value='月精度错误';
 change(q('#v-exam-precision'),'month');click('[data-action="save-vascular"]');
 check(document.activeElement===q('#v-exam-month'),'月精度错误应聚焦可见的月份输入');
 check(q('#v-exam-month').getAttribute('aria-invalid')==='true','月份输入应标记 aria-invalid');
 check(!q('#v-exam-day').hasAttribute('aria-invalid'),'隐藏的日输入不应残留 aria-invalid');
 check(q('#v-exam-month').offsetParent!==null,'月份输入应可见');
 change(q('#v-exam-precision'),'unknown');
 check(!q('#v-exam-month').hasAttribute('aria-invalid')&&!q('#v-exam-month').hasAttribute('aria-describedby'),'切换精度应清除旧 aria');
 change(q('#v-exam-precision'),'month');q('#v-exam-month').value='2026-02';
 change(q('#v-report-precision'),'month');click('[data-action="save-vascular"]');
 check(document.activeElement===q('#v-report-month'),'报告月精度错误应聚焦对应月份输入');
 check(q('#v-report-month').getAttribute('aria-invalid')==='true','报告月份应标记 aria-invalid');
 check(!q('#v-exam-month').hasAttribute('aria-invalid'),'新一轮校验应清掉旧字段 aria');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

const deleteProbe = `<script>(async()=>{try{
${boot}
 await register([makeFile('第一行合成候选：停用记录\\n第二行合成候选：门诊随访','s04-manual-source.txt')]);
 let f=state.files.find(x=>x.name==='s04-manual-source.txt');let fp=q('[data-file-private="'+f.id+'"]');fp.checked=true;fp.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>f.private);
 click('[data-parse="'+f.id+'"]');q('#parse-consent').checked=true;click('[data-parse-run="'+f.id+'"]');await wait(()=>state.candidates.length===2,'模拟抽取未生成候选');
 let ids=state.candidates.map(c=>c.id);for(let id of ids){click('[data-accept="'+id+'"]');await wait(()=>state.candidates.length<2)}
 let generated=state.records.find(r=>r.text.includes('第一行')),manual=state.records.find(r=>r.text.includes('第二行'));
 check(generated&&manual,'两个候选都应采纳');check(generated.private&&manual.private,'私密原件采纳后应为私密');
 manual.source='门诊抄录：s04-manual-source.txt 第 2 页（本人整理）';
 click('[data-file-del="'+f.id+'"]');
 check(q('#dialog-body').textContent.includes('来源中的这个文件名会被清除'),'删除确认应保留原有承诺短语');
 check(q('#dialog-body').textContent.includes('仅限本页自动生成'),'删除确认应说明只清理自动来源');
 click('[data-file-del-confirm="'+f.id+'"]');
 check(generated.source==='原件已移除','自动生成来源应清为已移除');
 check(manual.source==='门诊抄录：s04-manual-source.txt 第 2 页（本人整理）','手工来源不应做文件名子串替换');
 check(generated.private&&manual.private,'移除原件后记录仍应保持私密');
 check(generated.fileId===null&&manual.fileId===null,'移除后应解除关联');
 check(q('#toast').textContent.includes('手工来源未改写'),'提示应说明手工来源未改写');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

const markerProbe = `<script>(async()=>{try{
${boot}
 let materialId=nextRecordId();state.records.push({id:materialId,kind:'资料库',department:'资料',date:'2026-01-02',datePrecision:'day',text:'合成资料原文',source:'本人整理',fileId:null,original:null,private:false,history:[]});
 let questionId=nextRecordId();state.records.push({id:questionId,kind:'问题清单',department:'风湿免疫',date:'2026-01-02',datePrecision:'day',text:'下次复诊问什么',source:'本人记录',fileId:null,original:null,private:false,history:[]});
 state.timelineSelected.add(materialId);state.timelineSelected.add(questionId);q('#main').innerHTML=timelineResults();
 let materialArticle=q('[data-timeline-source="'+materialId+'"]').closest('article'),questionArticle=q('[data-timeline-source="'+questionId+'"]').closest('article');
 check(materialArticle.textContent.includes('无原件'),'资料类型无原件应标记');
 check(!questionArticle.textContent.includes('无原件'),'问题清单不应出现无原件标记');
 click('[data-timeline-source="'+questionId+'"]');
 check(!q('#dialog-body').textContent.includes('原件缺失'),'问题清单回源不应出现原件缺失');
 click('[data-action="cancel"]');
 click('[data-timeline-source="'+materialId+'"]');
 check(!!q('[data-no-original-note]')&&q('#dialog-body').textContent.includes('原件缺失'),'资料类型回源应标记原件缺失');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

const uniqueProbe = `<script>(async()=>{try{
${boot}
 await register([makeFile('私密原件文本','s04-unique.txt')]);let f=state.files.find(x=>x.name==='s04-unique.txt');
 let fp=q('[data-file-private="'+f.id+'"]');fp.checked=true;fp.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>f.private);
 go('器官与专科','血管');
 for(let text of ['唯一提示一','唯一提示二']){click('[data-action="add-vascular"]');q('#v-text').value=text;change(q('#v-file'),String(f.id));click('[data-action="save-vascular"]');await wait(()=>!q('#dialog').open)}
 let notes=[...document.querySelectorAll('[data-vascular-row] [id^="private-lock-note"]')];
 check(notes.length===2,'两条私密关联记录都应显示提示');
 check(new Set(notes.map(n=>n.id)).size===notes.length,'私密提示 id 必须唯一');
 check(notes.every(n=>n.textContent.includes('s04-unique.txt')),'提示应指向对应私密原件');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

const focusProbe = `<script>(async()=>{try{
${boot}
 go('器官与专科','血管');let add=q('[data-action="add-vascular"]');add.focus();add.click();q('#v-text').value='焦点恢复记录';
 click('[data-action="save-vascular"]');await wait(()=>!q('#dialog').open,'保存后弹窗未关闭');
 await wait(()=>document.activeElement&&document.activeElement.dataset.action==='add-vascular','新增保存后焦点未回到入口');
 check(document.activeElement===q('[data-action="add-vascular"]'),'焦点应回到录入血管资料按钮');
 window.__s04Review='PASS';
}catch(e){window.__s04Review='FAIL: '+e.message}})()</script>`;

async function run(t,prefix,probe){
  const fx=await makePrototypeFixture(t,prefix);
  await fx.injectProbe(probe);
  assert.equal(await runPage(fx.url,'window.__s04Review || ""'),'PASS');
}

test('S04 私密原件锁定记录不能同一次保存解绑并公开', async t=>{
  await run(t,'beipal-s04-lock-',lockProbe);
});

test('S04 切换原件保留私密并解释，第二次保存才公开', async t=>{
  await run(t,'beipal-s04-switch-',switchProbe);
});

test('S04 月精度错误聚焦 month 并清除旧 aria', async t=>{
  await run(t,'beipal-s04-month-',monthProbe);
});

test('S04 移除原件只清理自动生成来源，不替换手工来源', async t=>{
  await run(t,'beipal-s04-delete-',deleteProbe);
});

test('S04 无原件标记只用于资料类型', async t=>{
  await run(t,'beipal-s04-marker-',markerProbe);
});

test('S04 私密提示 id 唯一与新增保存焦点恢复', async t=>{
  await run(t,'beipal-s04-unique-',uniqueProbe);
  await run(t,'beipal-s04-focus-',focusProbe);
});