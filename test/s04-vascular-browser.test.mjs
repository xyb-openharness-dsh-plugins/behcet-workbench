import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';
import { runPage } from './helpers/cdp-probe.mjs';

const probe = `<script>(async()=>{try{
 const check=(v,m)=>{if(!v)throw Error(m)};
 const q=s=>{let e=document.querySelector(s);if(!e)throw Error('缺少 '+s);return e};
 const click=s=>q(s).click();
 const change=(el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))};
 const wait=async(fn)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('等待超时')};
 await wait(()=>typeof go==='function'&&state.records.length);
 click('[data-view="器官与专科"][data-sub="血管"]');
 check(!!q('#vascular-page'),'看板未进入血管专页');
 click('[data-action="add-vascular"]');
 check(q('#v-private').checked,'默认私密');
 q('#v-text').value='合成血管原文';q('#v-source').value='合成来源';
 click('[data-action="save-vascular"]');
 let r=state.records.find(x=>x.text==='合成血管原文');
 check(r&&r.private&&r.datePrecision==='unknown'&&r.reportDatePrecision==='unknown','日期未知或私密未保存');
 check(!state.selected.has(r.id)&&!state.timelineSelected.has(r.id),'私密默认选择');
 check(q('[data-no-original-badge="'+r.id+'"]').textContent.includes('无原件'),'缺失原件标记');
 click('[data-vascular-source="'+r.id+'"]');check(q('#dialog-body').textContent.includes('合成来源')&&q('#dialog-body').textContent.includes('无原件'),'缺失原件回源');click('[data-action="cancel"]');
 go('资料目录与云解析');let dt=new DataTransfer();dt.items.add(new File(['合成文件原文'],'vascular.txt',{type:'text/plain'}));let input=q('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));let f=state.files[0];await wait(()=>f.content);
 let fp=q('[data-file-private]');fp.checked=true;fp.dispatchEvent(new Event('change',{bubbles:true}));
 go('器官与专科','血管');click('[data-action="add-vascular"]');q('#v-text').value='关联记录';change(q('#v-exam-precision'),'day');q('#v-exam-day').value='2026-01-02';change(q('#v-file'),String(f.id));
 check(q('#v-private').checked&&q('#v-private').disabled,'私密原件锁定');click('[data-action="save-vascular"]');let linked=state.records.find(x=>x.text==='关联记录');check(linked&&linked.fileId===f.id&&linked.private,'关联保存');
 click('[data-vascular-source="'+linked.id+'"]');check(q('#dialog-body').textContent.includes('vascular.txt')&&q('[data-vascular-open-file]'),'回源原件');click('[data-action="cancel"]');
 check(q('[data-toggle-private="'+linked.id+'"]').disabled,'原件私密公开锁定');
 go('资料目录与云解析');click('[data-file-del="'+f.id+'"]');click('[data-file-del-confirm="'+f.id+'"]');go('器官与专科','血管');check(linked.private&&linked.fileId===null&&!!q('[data-no-original-badge="'+linked.id+'"]'),'移除后保留私密及缺失标记');
 window.__s04='PASS';
}catch(e){window.__s04='FAIL: '+e.message}})()</script>`;

test('S04 手工血管资料回源与私密原件保护', async t=>{
 const fx=await makePrototypeFixture(t,'beipal-s04-');
 await fx.injectProbe(probe);
 assert.equal(await runPage(fx.url,'window.__s04 || ""'),'PASS');
});
