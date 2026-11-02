import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('跨科时间线按选择并列同日记录并分别回源', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-timeline-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js', 'metric-model.js']) await copyFile(join(root, name), join(dir, name));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    const select=(id,on)=>{let el=document.querySelector('[data-timeline-select="'+id+'"]');el.checked=on;el.dispatchEvent(new Event('change',{bubbles:true}))};
    go('病情一图秀','治疗与事件节点');
    check(document.querySelector('#timeline-results').textContent.includes('尚未选择'),'空状态');
    check(!document.querySelector('[data-timeline-select="3"]').checked,'私密默认排除');
    select(4,true);select(5,true);select(1,true);
    let result=document.querySelector('#timeline-results');
    check(result.querySelectorAll('section').length===1 && result.querySelectorAll('article').length===3,'同日并列');
    check(result.textContent.includes('口腔科') && result.textContent.includes('眼科') && !result.textContent.includes('下次复诊想问的问题'),'选择与私密边界');
    document.querySelector('[data-timeline-source="4"]').click();
    check(document.querySelector('#dialog-body').textContent.includes('口腔科合成原件') && !document.querySelector('#dialog-body').textContent.includes('眼科合成原件'),'口腔来源');
    document.querySelector('#dialog').close();
    document.querySelector('[data-timeline-source="5"]').click();
    check(document.querySelector('#dialog-body').textContent.includes('眼科合成原件') && !document.querySelector('#dialog-body').textContent.includes('口腔科合成原件'),'眼科来源');
    document.querySelector('#dialog').close();
    document.querySelector('[data-timeline-source="1"]').click();
    check(document.querySelector('#dialog-body').textContent.includes('无原件'),'缺失原件');
    document.querySelector('#dialog').close();
    select(4,false);check(!document.querySelector('#timeline-results').textContent.includes('口腔科示例记录'),'取消选择');
    select(3,true);check(document.querySelector('#timeline-results').textContent.includes('下次复诊想问的问题'),'显式选择私密');
    document.body.dataset.timelineTest='PASS';
  } catch(e) { document.body.dataset.timelineTest='FAIL: '+e.message; }</script>`;
  await writeFile(join(dir, 'index.html'), html.replace('</body>', probe + '</body>'));
  const run = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--dump-dom','file://' + join(dir, 'index.html')], {encoding:'utf8',timeout:30000});
  if (run.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /data-timeline-test="PASS"/, run.stdout.match(/data-timeline-test="[^"]*"/)?.[0] || run.stderr);
});
