import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('浏览器显示空指标、极值图和逐点来源', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-metric-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const root = resolve('prototypes/v0.2');
  await copyFile(join(root, 'metric-model.js'), join(dir, 'metric-model.js'));
  const data = await readFile(join(root, 'demo-data.js'), 'utf8');
  await writeFile(join(dir, 'demo-data.js'), data + `\nwindow.BEIPAL_METRICS=[{id:'empty',name:'空指标',group:'测试',unit:'u',method:'m',laboratory:'l',points:[]},{id:'extreme',name:'极值',group:'测试',unit:'u',method:'m',laboratory:'l',source:'指标来源',color:'#123456',points:[{date:'2026-01-01',value:-Number.MAX_VALUE,source:'点来源'},{date:'2026-02-01',value:Number.MAX_VALUE}]}];`);
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('病情整理','指标检测');
    check(document.querySelector('main').textContent.includes('空指标') && document.querySelector('main').textContent.includes('暂无记录'),'空指标');
    check(!document.querySelector('main').innerHTML.match(/(?:NaN|Infinity)/),'卡片坐标或差值');
    go('病情一图秀');
    check(!document.querySelector('#chart-panel').innerHTML.match(/(?:NaN|Infinity)/),'图表坐标');
    document.querySelector('[data-point="extreme~0"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    check(document.querySelector('.pin').textContent.includes('点来源'),'点来源');
    document.querySelector('[data-point="extreme~0"][data-date="1"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    check(document.querySelector('.pin').textContent.includes('指标来源'),'来源回退');
    document.body.dataset.metricTest='PASS';
  } catch(e) { document.body.dataset.metricTest='FAIL: '+e.message; }</script>`;
  await writeFile(join(dir, 'index.html'), html.replace('</body>', probe + '</body>'));
  const run = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--dump-dom','file://' + join(dir, 'index.html')], {encoding:'utf8',timeout:30000});
  if (run.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /data-metric-test="PASS"/, run.stdout.match(/data-metric-test="[^"]*"/)?.[0] || run.stderr);
});
