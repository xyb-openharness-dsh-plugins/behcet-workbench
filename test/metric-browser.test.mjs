import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('空指标数组不影响其他记录，缺失数据仍显示错误', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-empty-metrics-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const root = resolve('prototypes/v0.2');
  await copyFile(join(root, 'metric-model.js'), join(dir, 'metric-model.js'));
  await copyFile(join(root, 'pathway-model.js'), join(dir, 'pathway-model.js'));
  const data = await readFile(join(root, 'demo-data.js'), 'utf8');
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const runProbe = async (suffix, probe) => {
    await writeFile(join(dir, 'demo-data.js'), data + suffix);
    await writeFile(join(dir, 'index.html'), html.replace('</body>', `<script>try { ${probe} document.body.dataset.emptyTest='PASS'; } catch(e) { document.body.dataset.emptyTest='FAIL: '+e.message; }</script></body>`));
    return spawnSync(process.env.CHROMIUM || '/usr/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--dump-dom','file://' + join(dir, 'index.html')], {encoding:'utf8',timeout:30000});
  };
  const empty = await runProbe('\nwindow.BEIPAL_METRICS=[];', `
    const check=(v,m)=>{if(!v)throw Error(m)};
    check(document.querySelector('main').textContent.includes('最近的记录'),'看板未加载');
    check(document.querySelector('main [data-correct]'),'其他记录丢失');
    go('病情整理','指标检测');
    check(document.querySelector('main').textContent.includes('暂无示例指标'),'指标空态缺失');
    check(!document.querySelector('main').textContent.includes('示例数据不可用'),'误报数据不可用');
    go('病情一图秀');
    check(document.querySelector('#chart-panel').textContent.includes('当前范围没有可绘制的数值记录'),'图表空态缺失');
    check(!document.querySelector('#chart-panel svg'),'空图表不应绘制');
  `);
  if (empty.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /data-empty-test="PASS"/, empty.stdout.match(/data-empty-test="[^"]*"/)?.[0] || empty.stderr);
  const missing = await runProbe('\ndelete window.BEIPAL_METRICS;', `
    if (!document.querySelector('main [role=alert]')?.textContent.includes('示例数据不可用')) throw Error('缺失数据未报错');
  `);
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /data-empty-test="PASS"/, missing.stdout.match(/data-empty-test="[^"]*"/)?.[0] || missing.stderr);
});

test('浏览器显示空指标、极值图和逐点来源', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-metric-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const root = resolve('prototypes/v0.2');
  await copyFile(join(root, 'metric-model.js'), join(dir, 'metric-model.js'));
  await copyFile(join(root, 'pathway-model.js'), join(dir, 'pathway-model.js'));
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
