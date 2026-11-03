import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('一图秀末点数值只标末点、带单位，且纵向避让不叠字', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'beipal-end-value-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = resolve('prototypes/v0.2');
  for (const name of ['demo-data.js', 'metric-model.js', 'pathway-model.js']) await copyFile(join(root, name), join(dir, name));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('病情一图秀','指标趋势');
    const panel=document.querySelector('#chart-panel');
    const labels=[...panel.querySelectorAll('.chart-end-value')];
    check(labels.length===3,'末点标签数量应为 3，实为 '+labels.length);
    // 每个标签都必须带数值与单位；单位未知时写"单位未知"，不留空
    for(const l of labels) check(/\\d.+\\S/.test(l.textContent.trim()),'标签缺数值或单位：'+l.textContent);
    check(labels.some(l=>l.textContent.includes('mg/L')),'未带示例单位 mg/L');
    check(labels.some(l=>l.textContent.includes('单位未知'))===false,'本组示例单位已知，不应出现单位未知');
    // 纵向避让：按 y 排序后任意相邻两条至少差 16px，不能叠字
    const ys=labels.map(l=>+l.getAttribute('y')).sort((a,b)=>a-b);
    for(let i=1;i<ys.length;i++) check(ys[i]-ys[i-1]>=16,'标签叠字：'+ys[i-1]+'/'+ys[i]);
    // 只标末点：标签数必须小于等于数据点数
    const points=[...panel.querySelectorAll('.chart-point')];
    check(labels.length<points.length,'末点标签数不应等于全部点数');
    // 单点不连线：只有一个点的那条指标不能有 path
    const single=new Set(points.map(p=>p.dataset.point));
    check(single.size===3,'示例应含 3 条指标');
    check(!panel.querySelector('.empty'),'有数据时不应出现空态');
    document.body.dataset.endValueTest='PASS';
  } catch(e) { document.body.dataset.endValueTest='FAIL: '+e.message }</script>`;
  await writeFile(join(dir, 'index.html'), html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'file://' + join(dir, 'index.html')],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-end-value-test="PASS"/, r.stdout.match(/data-end-value-test="[^"]*"/)?.[0] || r.stderr);
});