import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('疾病概要入口、四段数据与单层返回', async t => {
  const dir=await mkdtemp(join(tmpdir(),'beipal-primer-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const page=join(dir,'prototypes/v0.2'), patterns=join(dir,'assets/patterns');
  await mkdir(page,{recursive:true}); await mkdir(patterns,{recursive:true});
  for(const name of ['demo-data.js','metric-model.js','pathway-model.js','primer-data.js']) await copyFile(resolve('prototypes/v0.2',name),join(page,name));
  for(const name of ['disease-primer.js','disease-primer.css']) await copyFile(resolve('assets/patterns',name),join(patterns,name));
  const html=await readFile(resolve('prototypes/v0.2/index.html'),'utf8');
  const probe=`<script>(async()=>{try{
    const check=(v,m)=>{if(!v)throw Error(m)};
    const wait=()=>new Promise(r=>setTimeout(r,120));
    if(document.readyState==='loading') await new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true}));
    const btn=document.querySelector('[data-primer-entry="hero"]');
    check(btn && btn.offsetWidth && /定义/.test(btn.getAttribute('aria-label')) && /趋势/.test(btn.getAttribute('aria-label')),'P1 入口');
    const sections=window.DISEASE_PRIMER.sections;
    check(sections.map(s=>s.title).join('|')==='定义|医学资料规范和指南情况|目前治疗全景概要|发展趋势','P8 顺序');
    check(sections.every(s=>s.sources?.length && s.sources.every(x=>x.original ? x.kind && x.url : x.secondaryUrl)),'P8 来源');
    check(!/未来将|未来会|预计|预测|有望|即将|前景|未来可期|突破性|颠覆|革命性|首选|优于|疗效更好|建议使用|强烈推荐|治愈率|生存期延长|大幅提高|迎来新选择/.test(JSON.stringify(sections[3])),'P8 趋势禁词');
    window.scrollTo(0,300);const y=window.scrollY; const before=history.length;
    btn.focus({preventScroll:true});btn.click();await wait();
    const panel=document.querySelector('#disease-primer');
    check(panel && !panel.hidden && panel.querySelectorAll('.dp-section').length===4,'P2 整页四段');
    check(history.length===before+1 && history.state?.dp,'P4 history 压栈');
    check(panel.querySelector('[data-dp=back]').offsetWidth && panel.querySelector('[data-dp=close]').offsetWidth,'P5 两入口');
    history.back();await wait();check(panel.hidden && document.activeElement===btn && window.scrollY===y,'P4 P6 后退、焦点与滚动');
    const afterBack=history.length;
    history.forward();await wait();
    check(!panel.hidden && history.state?.dp && history.length===afterBack && document.activeElement===panel.querySelector('.dp-panel') && window.scrollY===y,'前进恢复面板、焦点与滚动且不压栈');
    history.back();await wait();check(panel.hidden && document.activeElement===btn && window.scrollY===y,'前进后再次后退');
    btn.click();await wait();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait();
    check(panel.hidden && document.activeElement===btn && window.scrollY===y,'P7 Esc');
    btn.click();await wait();panel.querySelector('[data-dp=close]').click();await wait();check(panel.hidden && document.activeElement===btn,'P5 关闭');
    btn.click();await wait();panel.querySelector('[data-dp=back]').click();await wait();check(panel.hidden && document.activeElement===btn,'P5 返回');
    document.body.dataset.primerTest='PASS';
  }catch(e){document.body.dataset.primerTest='FAIL: '+e.message}})();</script>`;
  await writeFile(join(page,'index.html'),html.replace('</body>',probe+'</body>'));
  const run=spawnSync(process.env.CHROMIUM||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--virtual-time-budget=5000','--dump-dom','file://'+join(page,'index.html')],{encoding:'utf8',timeout:30000});
  if(run.error?.code==='ENOENT'){t.skip('Chromium 不可用；设置 CHROMIUM');return}
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/data-primer-test="PASS"/,run.stdout.match(/data-primer-test="[^"]*"/)?.[0]||run.stderr);
});
