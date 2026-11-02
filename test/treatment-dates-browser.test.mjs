import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('治疗记录的开始/结束/仍在进行：校验、回看与更正历史', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-treatment-dates-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js', 'metric-model.js']) await copyFile(join(root, name), join(dir, name));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const probe = `<script>(async()=>{try{
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('治疗与用药','当前用药');
    document.querySelector('[data-action=add]').click();
    document.querySelector('#t-drug').value='合成药名';
    document.querySelector('#t-precision').value='day';
    document.querySelector('#t-precision').dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#t-day').value='2026-05-01';
    document.querySelector('#t-end').value='2026-04-01';
    document.querySelector('[data-action=save-treatment]').click();
    check(document.querySelector('#t-end').getAttribute('aria-invalid')==='true','结束早于开始未报错');
    check(document.activeElement.id==='t-end','错误未聚焦结束日期');
    const before=state.records.length;
    check(state.records.length===before,'校验失败仍写入记录');
    // 改成仍在进行：结束日期被忽略，记录 ongoing
    document.querySelector('#t-end').value='';
    document.querySelector('#t-ongoing').checked=true;
    document.querySelector('[data-action=save-treatment]').click();
    const on=state.records.at(-1);
    check(on.ongoing===true && on.endDate==='','仍在进行未按未结束保存');
    check(document.querySelector('main').textContent.includes('仍在进行'),'回看未显示仍在进行');
    // 有起止
    document.querySelector('[data-action=add]').click();
    document.querySelector('#t-drug').value='合成既往药';
    document.querySelector('#t-precision').value='day';
    document.querySelector('#t-precision').dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#t-day').value='2026-03-01';
    document.querySelector('#t-end').value='2026-04-15';
    document.querySelector('[data-action=save-treatment]').click();
    const ended=state.records.at(-1);
    check(ended.endDate==='2026-04-15' && !ended.ongoing,'起止日期未保存');
    // 更正保留历史
    document.querySelector('[data-correct="'+ended.id+'"]').click();
    check(document.querySelector('#t-end').value==='2026-04-15','更正表单未带出结束日期');
    document.querySelector('#t-end').value='2026-04-20';
    document.querySelector('[data-save-correction]').click();
    check(ended.endDate==='2026-04-20','更正未生效');
    check(ended.history[0].endDate==='2026-04-15','更正历史缺旧结束日期');
    document.body.dataset.datesTest='PASS';
  }catch(e){document.body.dataset.datesTest='FAIL: '+e.message}})();</script>`;
  await writeFile(join(dir, 'index.html'), html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'file://' + join(dir, 'index.html')],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-dates-test="PASS"/, r.stdout.match(/data-dates-test="[^"]*"/)?.[0] || r.stderr);
});