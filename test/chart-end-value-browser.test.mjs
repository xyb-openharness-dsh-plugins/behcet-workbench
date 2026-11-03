import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { makePrototypeFixture } from './helpers/prototype-fixture.mjs';

test('一图秀末点数值只标末点、带单位，且纵向避让不叠字', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-end-value-');
  const html = fx.html;
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
  await writeFile(fx.indexPath, html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', fx.url],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-end-value-test="PASS"/, r.stdout.match(/data-end-value-test="[^"]*"/)?.[0] || r.stderr);
});

test('一图秀同日末点不任取：不标任选值，改标同日多条', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-end-value-same-day-');
  const data = await readFile(fx.dataPath('demo-data.js'), 'utf8');
  await fx.writeData('demo-data.js', data + `
window.BEIPAL_METRICS=[
  {id:'a',name:'示例指标 A',group:'示例检验',unit:'mg/L',method:'示例方法甲',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:4},{date:'2026-06-01',value:8}]},
  {id:'b',name:'示例指标 B',group:'示例检验',unit:'mm',method:'示例方法乙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:3},{date:'2026-06-01',value:5},{date:'2026-06-01',value:6}]},
  {id:'c',name:'示例指标 C',group:'示例测量',unit:'mm',method:'示例方法丙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-03-01',value:2},{date:'2026-03-01',value:7},{date:'2026-09-01',value:9}]}
];`);
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('病情一图秀','指标趋势');
    const panel=document.querySelector('#chart-panel');
    const labels=[...panel.querySelectorAll('.chart-end-value')];
    check(labels.length===2,'同日末点不取后应只剩 2 个数值标签，实为 '+labels.length);
    check(!labels.some(l=>l.dataset.series==='b~0'),'同日末点仍被任取了一个值');
    const a=labels.find(l=>l.dataset.series==='a~0'),c=labels.find(l=>l.dataset.series==='c~0');
    check(a&&a.textContent.includes('8 mg/L'),'唯一末点 A 未标 8 mg/L');
    check(c&&c.textContent.includes('9 mm'),'非末点同日的 C 应正常标 9 mm');
    const note=panel.querySelector('.chart-end-ambiguous');
    check(note,'缺少同日末点未取值的说明');
    const noteB=note.querySelector('[data-series="b~0"]');
    check(noteB&&noteB.textContent.includes('同日 2 条')&&noteB.textContent.includes('未取末值'),'B 的同日末点说明不完整：'+(note?note.textContent:''));
    check(!note.textContent.includes(' 5 ')&&!note.textContent.includes(' 6 '),'说明里不应写出任选值');
    check(!note.querySelector('[data-series="c~0"]'),'C 的末点唯一，不应误报同日歧义');
    const bPoints=[...panel.querySelectorAll('.chart-point[data-point="b~0"]')];
    check(bPoints.length===3,'同日末点的每条记录都应保留：'+bPoints.length);
    check(new Set(bPoints.map(p=>p.getAttribute('cx'))).size===2,'同日记录应共享同一横坐标');
    check(new Set(bPoints.map(p=>p.getAttribute('cy'))).size===3,'同日记录应保留各自数值高度');
    document.body.dataset.endValueSameDayTest='PASS';
  } catch(e) { document.body.dataset.endValueSameDayTest='FAIL: '+e.message }</script>`;
  await writeFile(fx.indexPath, fx.html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', fx.url],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-end-value-same-day-test="PASS"/, r.stdout.match(/data-end-value-same-day-test="[^"]*"/)?.[0] || r.stderr);
});

test('一图秀末点标签贴底不重叠、四条也不越出绘图区', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-end-value-layout-');
  const data = await readFile(fx.dataPath('demo-data.js'), 'utf8');
  await fx.writeData('demo-data.js', data + `
window.BEIPAL_METRICS=[
  {id:'a',name:'贴底甲',group:'示例检验',unit:'u1',method:'示例方法甲',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:30},{date:'2026-06-01',value:0}]},
  {id:'b',name:'贴底乙',group:'示例检验',unit:'u2',method:'示例方法乙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:30},{date:'2026-06-01',value:2}]},
  {id:'c',name:'贴底丙',group:'示例检验',unit:'u3',method:'示例方法丙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:30},{date:'2026-06-01',value:1}]},
  {id:'d',name:'贴底丁',group:'示例检验',unit:'u4',method:'示例方法丁',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:30},{date:'2026-06-01',value:3}]}
];`);
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('病情一图秀','指标趋势');
    const fourth=document.querySelector('input[data-metric="d~0"]');
    check(fourth,'第 4 条指标复选框缺失');
    if(!fourth.checked)fourth.click();
    const panel=document.querySelector('#chart-panel');
    const labels=[...panel.querySelectorAll('.chart-end-value')];
    check(labels.length===4,'四条指标应各有一个末点标签，实为 '+labels.length);
    check(new Set(labels.map(l=>l.dataset.series)).size===4,'末点标签序列重复');
    const ys=labels.map(l=>+l.getAttribute('y')).sort((a,b)=>a-b);
    check(ys[0]>=112,'标签越过绘图区上缘：'+ys[0]);
    check(ys[ys.length-1]<=244,'标签越过绘图区下缘：'+ys[ys.length-1]);
    for(let i=1;i<ys.length;i++)check(ys[i]-ys[i-1]>=16,'贴底标签重叠：'+ys[i-1]+'/'+ys[i]);
    for(const l of labels){
      check(+l.getAttribute('x')>=60&&+l.getAttribute('x')<=730,'标签横向越界');
      check(/\\d/.test(l.textContent),'标签缺数值');
    }
    document.body.dataset.endValueLayoutTest='PASS';
  } catch(e) { document.body.dataset.endValueLayoutTest='FAIL: '+e.message }</script>`;
  await writeFile(fx.indexPath, fx.html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', fx.url],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-end-value-layout-test="PASS"/, r.stdout.match(/data-end-value-layout-test="[^"]*"/)?.[0] || r.stderr);
});

test('一图秀最新记录非数值时不为更早数值标末点', async t => {
  const fx = await makePrototypeFixture(t, 'beipal-end-value-non-numeric-');
  const data = await readFile(fx.dataPath('demo-data.js'), 'utf8');
  await fx.writeData('demo-data.js', data + `
window.BEIPAL_METRICS=[
  {id:'a',name:'末条文字甲',group:'示例检验',unit:'mg/L',method:'示例方法甲',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:2},{date:'2026-06-01',value:'<0.1'}]},
  {id:'b',name:'末条数值乙',group:'示例检验',unit:'mm',method:'示例方法乙',laboratory:'合成示例机构',source:'合成示例',points:[{date:'2026-01-01',value:1},{date:'2026-05-01',value:5}]}
];`);
  const probe = `<script>try {
    const check=(v,m)=>{if(!v)throw Error(m)};
    go('病情一图秀','指标趋势');
    const panel=document.querySelector('#chart-panel');
    const labels=[...panel.querySelectorAll('.chart-end-value')];
    check(labels.length===1,'最新记录非数值的指标不应标末值，标签数实为 '+labels.length);
    check(labels[0].dataset.series==='b~0','唯一标签应属于末条为数值的 B：'+labels[0].dataset.series);
    check(labels[0].textContent.includes('5 mm'),'B 的末值 5 mm 未显示');
    check(!labels.some(l=>l.dataset.series==='a~0'),'A 的最新记录非数值，却仍标了更早数值');
    check(!panel.textContent.includes('2 mg/L'),'把更早的 2 当成了 A 的末值');
    const note=panel.querySelector('.chart-end-nonnumeric');
    check(note,'缺少最新记录非数值的说明');
    const noteA=note.querySelector('[data-series="a~0"]');
    check(noteA&&noteA.textContent.includes('非数值')&&noteA.textContent.includes('未标末值'),'A 的非数值末条说明不完整：'+(note?note.textContent:''));
    document.body.dataset.endValueNonNumericTest='PASS';
  } catch(e) { document.body.dataset.endValueNonNumericTest='FAIL: '+e.message }</script>`;
  await writeFile(fx.indexPath, fx.html.replace('</body>', probe + '</body>'));
  const r = spawnSync(process.env.CHROMIUM || '/usr/bin/chromium',
    ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', fx.url],
    { encoding: 'utf8', timeout: 30000 });
  if (r.error?.code === 'ENOENT') { t.skip('Chromium 不可用'); return; }
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /data-end-value-non-numeric-test="PASS"/, r.stdout.match(/data-end-value-non-numeric-test="[^"]*"/)?.[0] || r.stderr);
});