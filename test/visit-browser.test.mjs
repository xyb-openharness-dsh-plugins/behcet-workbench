import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('复诊准备区分资料和问题，导出失败保留选择并可重试', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-visit-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js','metric-model.js']) await copyFile(join(root,name),join(dir,name));
  const html = await readFile(join(root,'index.html'),'utf8');
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    const select=(id,on)=>{const el=document.querySelector('[data-select="'+id+'"]');el.checked=on;el.dispatchEvent(new Event('change',{bubbles:true}))};
    go('复诊与准备','就诊准备与导出');
    check(!document.querySelector('[data-select="3"]').checked,'私密问题默认不选');
    check(!document.querySelector('#export-preview').textContent.includes('下次复诊想问的问题'),'默认预览排除私密');
    // 不写死 id：示例数据增删记录后仍应能清空默认选择
    for(const el of document.querySelectorAll('[data-select]'))if(el.checked)select(el.dataset.select,false);
    check(document.querySelector('[data-action=download]').disabled,'空选择不可下载');
    select(4,true);select(5,true);select(3,true);
    let preview=document.querySelector('#export-preview').textContent;
    check(preview.includes('资料（2）') && preview.includes('问题（1）') && preview.includes('口腔科示例记录') && preview.includes('眼科示例记录') && preview.includes('下次复诊想问的问题'),'预览与选择一致并分类');
    const create=URL.createObjectURL;URL.createObjectURL=()=>{throw Error('模拟失败')};
    document.querySelector('[data-action=download]').click();
    check(document.querySelector('#export-status').textContent.includes('保留选择') && [3,4,5].every(id=>document.querySelector('[data-select="'+id+'"]').checked),'失败提示与选择保留');
    let output;URL.createObjectURL=blob=>{output=blob;return 'blob:test'};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){};
    document.querySelector('[data-action=download]').click();
    check(document.querySelector('#export-status').textContent.includes('已发起下载') && output,'重试发起');
    const reader=new FileReader();reader.onload=()=>{try{const text=reader.result;check(text.includes('资料\\n')&&text.includes('问题\\n')&&text.includes('口腔科示例记录')&&text.includes('眼科示例记录')&&text.includes('下次复诊想问的问题')&&!text.includes('示例药物'),'导出与选择一致');document.body.dataset.visitTest='PASS'}catch(e){document.body.dataset.visitTest='FAIL: '+e.message}};reader.readAsText(output);
    URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;
  } catch(e) { document.body.dataset.visitTest='FAIL: '+e.message; }</script>`;
  await writeFile(join(dir,'index.html'),html.replace('</body>',probe+'</body>'));
  const run=spawnSync(process.env.CHROMIUM||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--virtual-time-budget=3000','--dump-dom','file://'+join(dir,'index.html')],{encoding:'utf8',timeout:30000});
  if(run.error?.code==='ENOENT'){t.skip('Chromium 不可用');return}
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/data-visit-test="PASS"/,run.stdout.match(/data-visit-test="[^"]*"/)?.[0]||run.stderr);
});
