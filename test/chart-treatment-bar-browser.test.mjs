import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';

test('一图秀治疗条来自治疗记录：有起止画条、只有开始画点、仍在进行画到右缘', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-treatment-bar-');
  const html = fx.html;
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('病情一图秀','指标趋势');
    const svg=()=>document.querySelector('#chart-panel svg');
    check(svg(),'图表未绘制');
    const bars=[...svg().querySelectorAll('rect')];
    check(bars.length===2,'治疗条应为 2 条（一条有起止、一条仍在进行），实为 '+bars.length);
    const titles=bars.map(b=>b.querySelector('title').textContent);
    check(titles.some(t=>t.includes('至')),'缺有起止的治疗条');
    check(titles.some(t=>t.includes('仍在进行')),'缺仍在进行的治疗条');
    // 治疗条与数据分层：条在上方泳道，不能落进指标曲线区
    for(const b of bars) check(+b.getAttribute('y')<70,'治疗条落进数据区：y='+b.getAttribute('y'));
    // 治疗条不能来自事件数组，数量须与治疗记录一致
    const treatments=state.records.filter(r=>r.kind==='当前用药'&&isDayDate(r.date)&&day(r.date)>=chartWindow().start);
    check(bars.length===treatments.length,'治疗条数量与治疗记录不一致');
    // 事件仍单独一行圆点
    const dots=[...svg().querySelectorAll('circle')].filter(c=>+c.getAttribute('cy')===62);
    check(dots.length>=1,'事件圆点丢失');
    // 切换开关后治疗条不参与曲线坐标，但治疗泳道随开关隐藏
    document.querySelector('#show-events').click();
    check(!document.querySelector('#chart-panel svg').textContent.includes('仍在进行'),'关闭开关后治疗条仍显示');
    document.body.dataset.barTest='PASS';
  } catch(e) { document.body.dataset.barTest='FAIL: '+e.message }</script>`;
  await writeFile(fx.indexPath, html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', fx.url],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-bar-test="PASS"/, r.stdout.match(/data-bar-test="[^"]*"/)?.[0] || r.stderr);
});