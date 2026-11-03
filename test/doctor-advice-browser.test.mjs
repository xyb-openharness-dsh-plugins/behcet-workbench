import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runPage } from './helpers/cdp-probe.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-doctor-advice-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js', 'metric-model.js', 'pathway-model.js']) {
    await copyFile(join(root, name), join(dir, name));
  }
  const html = await readFile(join(root, 'index.html'), 'utf8');
  await writeFile(join(dir, 'index.html'), html);
  return 'file://' + join(dir, 'index.html');
}

// 真实浏览器回归：首页“记录医嘱”必须进入复诊与准备下的占位页，且不产生当前用药。
const probe = `(async()=>{try{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const waitFor=async(fn,msg)=>{const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(msg)};
  await waitFor(()=>typeof go==='function'&&document.querySelector('#nav')?.children.length,'应用未就绪');
  const before=state.records.filter(r=>r.kind==='当前用药').length;
  const card=[...document.querySelectorAll('.grid .card')].find(c=>c.querySelector('h3')?.textContent==='记录医嘱');
  check(card,'首页缺少“记录医嘱”卡片');
  const button=card.querySelector('button[data-view]');
  check(button,'“记录医嘱”卡片缺少入口');
  check(button.dataset.view==='复诊与准备'&&button.dataset.sub==='医嘱记录','“记录医嘱”仍指向 '+button.dataset.view+' / '+button.dataset.sub);
  button.click();
  await waitFor(()=>state.view==='复诊与准备'&&state.sub==='医嘱记录','没有进入医嘱记录占位页');
  const text=document.querySelector('main').textContent;
  check(text.includes('本页只是占位，尚不能记录医嘱'),'占位页没有明确“尚不能记录”');
  check(text.includes('不会创建任何记录')&&text.includes('不会生成或修改「当前用药」'),'占位页没有说明不会生成当前用药');
  check(!document.querySelector('[data-action="add"]'),'占位页不应提供记录入口');
  check(!document.querySelector('#t-drug'),'占位页不应打开治疗记录表单');
  const tab=[...document.querySelectorAll('.tabs [role="tab"]')].find(x=>x.textContent==='医嘱记录');
  check(tab&&tab.getAttribute('aria-selected')==='true','复诊与准备下没有选中的“医嘱记录”标签');
  check(!state.records.some(r=>r.kind==='医嘱记录'),'占位页产生了医嘱记录');
  check(state.records.filter(r=>r.kind==='当前用药').length===before,'打开占位页生成了当前用药');
  go('治疗与用药','当前用药');
  check(!!document.querySelector('[data-action="add"]'),'修复误伤了“当前用药”原有的记录入口');
  check(state.records.filter(r=>r.kind==='当前用药').length===before,'浏览当前用药改动了记录数');
  return 'PASS';
}catch(e){return 'FAIL: '+e.message}})()`;

test('记录医嘱进入占位页，尚不能记录且不生成当前用药', async t => {
  const url = await fixture(t);
  const result = await runPage(url, probe, { timeoutMs: 30000 });
  assert.equal(result, 'PASS');
});
