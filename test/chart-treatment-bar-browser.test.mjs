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

test('一图秀治疗条跨窗口时裁到绘图区，不丢跨窗记录', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-treatment-clip-');
  const html = fx.html;
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    const near=(a,b,m)=>check(Math.abs(a-b)<1.5,m);
    go('病情一图秀','指标趋势');
    document.querySelector('[data-range="90"]').click();
    const w=chartWindow(),svg=()=>document.querySelector('#chart-panel svg');
    check(w.start>day('2026-05-02'),'近 3 月窗口应晚于 2026-05-02');
    state.records.push({id:991,kind:'当前用药',date:'2026-04-01',datePrecision:'day',endDate:'2026-12-31',ongoing:false,drug:'跨窗治疗',private:false,history:[]});
    state.records.push({id:992,kind:'当前用药',date:'2026-04-01',datePrecision:'day',endDate:'2026-05-01',ongoing:false,drug:'窗外已结束',private:false,history:[]});
    state.records.push({id:993,kind:'当前用药',date:'2026-04-01',datePrecision:'day',endDate:'',ongoing:false,drug:'窗外单点',private:false,history:[]});
    state.records.push({id:994,kind:'当前用药',date:'2026-04-01',datePrecision:'day',endDate:'',ongoing:true,drug:'跨窗进行中',private:false,history:[]});
    refreshChart();
    const bars=[...svg().querySelectorAll('rect[data-treatment]')];
    const bar=id=>bars.find(b=>b.dataset.treatment===String(id));
    for(const b of bars){
      const x=+b.getAttribute('x'),width=+b.getAttribute('width');
      check(x>=60,'治疗条越过左缘：x='+x);
      check(x+width<=730.01,'治疗条越过右缘：'+(x+width));
      check(+b.getAttribute('y')<70,'治疗条落进数据区');
    }
    const clipped=bar(6);
    check(clipped,'跨左缘的已结束治疗条被丢弃');
    near(+clipped.getAttribute('x'),60,'跨左缘未裁到 x=60');
    check(+clipped.getAttribute('width')>4,'跨左缘治疗条宽度异常');
    check(clipped.querySelector('title').textContent.includes('2026-05-02 至 2026-08-20'),'裁剪后标题丢失真实日期');
    const spanning=bar(991);
    check(spanning,'两端跨窗的治疗条被丢弃');
    near(+spanning.getAttribute('x'),60,'两端跨窗左缘未裁');
    near(+spanning.getAttribute('x')+ +spanning.getAttribute('width'),730,'两端跨窗右缘未裁');
    check(spanning.querySelector('title').textContent.includes('2026-04-01 至 2026-12-31'),'跨窗条标题丢失真实日期');
    const ongoing=bar(2);
    check(ongoing,'窗口内仍在进行的治疗条丢失');
    check(+ongoing.getAttribute('x')>60,'窗口内进行中治疗条起点被移动');
    near(+ongoing.getAttribute('x')+ +ongoing.getAttribute('width'),730,'进行中治疗条未画到右缘');
    const ongoingCross=bar(994);
    check(ongoingCross,'窗口前开始且仍在进行的治疗条被丢弃');
    near(+ongoingCross.getAttribute('x'),60,'跨窗进行中治疗条未裁到左缘');
    near(+ongoingCross.getAttribute('width'),670,'跨窗进行中治疗条未覆盖全窗');
    check(!bar(992),'窗口前已结束的治疗条不应出现');
    check(!svg().querySelector('[data-treatment="993"]'),'窗口前的单点不应出现');
    const expected=state.records.filter(r=>r.kind==='当前用药'&&r.private!==true&&isDayDate(r.date)).filter(r=>{
      let s=day(r.date);
      if(r.ongoing)return s<=w.end;
      if(isDayDate(r.endDate)&&day(r.endDate)>=s)return day(r.endDate)>=w.start&&s<=w.end;
      return s>=w.start&&s<=w.end;
    });
    check(bars.length===expected.length,'治疗条数量应等于与窗口相交的治疗记录数：'+bars.length+'/'+expected.length);
    document.body.dataset.barClipTest='PASS';
  } catch(e) { document.body.dataset.barClipTest='FAIL: '+e.message }</script>`;
  await writeFile(fx.indexPath, html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', fx.url],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-bar-clip-test="PASS"/, r.stdout.match(/data-bar-clip-test="[^"]*"/)?.[0] || r.stderr);
});