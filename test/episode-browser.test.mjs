import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('发作记录可新增未知结束、更正回看并遵守私密出口', async t => {
  const browser = process.env.CHROMIUM || '/usr/bin/chromium';
  const dir = await mkdtemp(join(tmpdir(), 'beipal-episode-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js', 'metric-model.js']) await copyFile(join(root, name), join(dir, name));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const probe = `<script>
  try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('发作与病程','发作记录');
    document.querySelector('[data-action=add]').click();
    document.querySelector('#entry-date').value='2026-01-02';
    document.querySelector('#entry-site').value='口腔';
    document.querySelector('#entry-text').value='测试私密原文';
    document.querySelector('#entry-source').value='本人转述';
    document.querySelector('#entry-private').checked=true;
    document.querySelector('[data-action=save-episode]').click();
    let r=state.records.at(-1); check(r.endDate==='' && r.site==='口腔','新增字段');
    check(document.querySelector('main').textContent.includes('结束：未知'),'未知结束回看');
    check(!state.selected.has(r.id),'私密默认不选');
    document.querySelector('[data-action=discuss]').click();
    check(!document.querySelector('#draft').value.includes('测试私密原文'),'AI 私密过滤');
    go('复诊与准备','就诊准备与导出');
    check(!document.querySelector('#export-preview').textContent.includes('测试私密原文'),'摘要默认过滤');
    go('发作与病程','发作记录');
    document.querySelector('[data-correct="'+r.id+'"]').click();
    document.querySelector('#entry-end').value='2026-01-01';
    document.querySelector('[data-save-correction]').click();
    check(document.querySelector('#dialog').open && r.endDate==='', '无效日期不能保存');
    document.querySelector('#entry-end').value='2026-01-05';
    document.querySelector('#entry-site').value='舌';
    document.querySelector('#entry-text').value='更正原文';
    document.querySelector('[data-save-correction]').click();
    check(r.endDate==='2026-01-05' && r.site==='舌' && r.history[0].endDate==='', '更正历史');
    check(document.querySelector('main').textContent.includes('结束：未知') && document.querySelector('main').textContent.includes('测试私密原文'),'旧值回看');
    document.querySelector('[data-action=discuss]').click();
    check(document.querySelector('#draft').value.includes('口腔不适'),'公开记录进入草稿');
    document.querySelector('[data-correct="1"]').click();
    document.querySelector('#entry-private').checked=true;
    document.querySelector('[data-save-correction]').click();
    check(!state.selected.has(1) && !document.querySelector('#draft').value, '改为私密后撤销选择并清除旧草稿');
    document.body.dataset.episodeTest='PASS';
  } catch(e) { document.body.dataset.episodeTest='FAIL: '+e.message; }
  </script>`;
  await writeFile(join(dir, 'index.html'), html.replace('</body>', probe + '</body>'));
  const run = spawnSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'file://' + join(dir, 'index.html')], { encoding:'utf8', timeout:30000 });
  if (run.error?.code === 'ENOENT') { t.skip('Chromium 不可用；设置 CHROMIUM 指向浏览器'); return; }
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /data-episode-test="PASS"/, run.stdout.match(/data-episode-test="[^"]*"/)?.[0] || run.stderr);
});
