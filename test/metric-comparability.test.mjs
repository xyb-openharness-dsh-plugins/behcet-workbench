import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import '../prototypes/v0.2/metric-model.js';
const { build } = globalThis.BEIPAL_METRIC_MODEL;
const base = { id:'x', name:'示例', unit:'mg/L', method:'甲', laboratory:'机构', points:[] };
const model = points => build([{...base, points}]);

test('空指标保留一组且无差值，极值差值溢出时不可比较', () => {
  const [empty] = model([]);
  assert.equal(empty.metricId, 'x'); assert.deepEqual(empty.points, []); assert.equal(empty.latest, null); assert.equal(empty.delta, null);
  const [extreme] = model([{date:'2026-01-01',value:-Number.MAX_VALUE},{date:'2026-02-01',value:Number.MAX_VALUE}]);
  assert.equal(extreme.delta, null);
});

test('页面缩放只使用有效日期的数值，并安全处理极值', () => {
  const html = readFileSync(new URL('../prototypes/v0.2/index.html', import.meta.url), 'utf8');
  const bounds = runInNewContext('(' + html.match(/function bounds\(m\)\{[^\n]+/)[0] + ')');
  const [g] = model([{date:'2026-01-01',value:-Number.MAX_VALUE},{date:'2026-02-01',value:Number.MAX_VALUE},{date:'',value:0}]);
  const norm = bounds(g);
  assert.equal(norm(g.dated[0]), 0); assert.equal(norm(g.dated[1]), 1);
  const [ordinary] = model([{date:'2026-01-01',value:1},{date:'2026-02-01',value:2},{date:'',value:Number.MAX_VALUE}]);
  assert.equal(bounds(ordinary)(ordinary.dated[1]), 1);
});

test('固定摘要与来源详情使用点的来源和原始元数据', () => {
  const html = readFileSync(new URL('../prototypes/v0.2/index.html', import.meta.url), 'utf8');
  const [g] = model([{date:'2026-01-01',value:1,source:'点来源',unit:'未知',method:'待核',laboratory:'不详'},{date:'2026-02-01',value:2,unit:'不详',method:'未知',laboratory:'待核'}]);
  g.source = '指标来源'; let detail = '';
  const context = {metrics:[g], state:{pin:{id:g.id,date:'0'},metricIds:new Set([g.id])},chartWindow:()=>({start:0,end:Infinity}),day:()=>1,esc:String,dialog:(_title,body)=>{detail=body}};
  const pin = runInNewContext('(' + html.match(/function pinHTML\(\)\{[^\n]+/)[0] + ')', context);
  const source = runInNewContext('(' + html.match(/function showSource\(id,date\)\{[^\n]+/)[0] + ')', context);
  assert.match(pin(), /点来源/); source(g.id,'1');
  assert.match(detail, /指标来源/); assert.match(detail, /不详/); assert.match(detail, /方法：未知/); assert.match(detail, /机构：待核/);
});

test('按单位、方法和机构拆组，未知维度不能连线或做差', () => {
  for (const field of ['unit','method','laboratory']) {
    const groups = model([{date:'2026-01-01',value:1},{date:'2026-02-01',value:3,[field]:'另一种'},{date:'2026-03-01',value:5,[field]:''},{date:'2026-04-01',value:6,[field]:''}]);
    assert.equal(groups.length, 3);
    assert.equal(groups[2].segments.length, 0);
    assert.equal(groups[2].delta, null);
  }
});
test('按日期排序并保留零值，最新或前次同日无序不算差值', () => {
  let [g] = model([{date:'2026-03-01',value:4},{date:'2026-01-01',value:0},{date:'2026-02-01',value:2}]);
  assert.deepEqual(g.dated.map(p=>p.value),[0,2,4]); assert.equal(g.delta,2); assert.equal(g.segments[0].length,3);
  [g] = model([{date:'2026-01-01',value:1},{date:'2026-02-01',value:2},{date:'2026-02-01',value:3}]);
  assert.equal(g.latest,null); assert.equal(g.latestRows.length,2); assert.equal(g.delta,null); assert.equal(g.segments.length,0);
  [g] = model([{date:'2026-01-01',value:1},{date:'2026-01-01',value:2},{date:'2026-02-01',value:3}]); assert.equal(g.delta,null);
});
test('文字、非法数字、未知日期保留原文，断线且不能隐式转换', () => {
  const [g] = model([{date:'2026-01-01',value:0},{date:'2026-02-01',value:'<0.1'},{date:'2026-03-01',value:4},{date:'2026-04-01',value:5},{date:'2026-02-30',value:9},{date:'',value:NaN}]);
  assert.equal(g.undated,2); assert.equal(g.points.find(p=>p.value==='<0.1').numeric,false);
  assert.deepEqual(g.segments.map(s=>s.map(p=>p.value)),[[4,5]]); assert.equal(g.delta,1);
  assert.equal(new Set(g.points.map(p=>p.key)).size,6);
});

test('不同组交错日期中断该组线段和差值', () => {
  const [a,b] = model([{date:'2026-01-01',value:1},{date:'2026-02-01',value:2,method:'乙'},{date:'2026-03-01',value:3},{date:'2026-04-01',value:4}]);
  assert.deepEqual(a.segments.map(s=>s.map(p=>p.value)),[[3,4]]);
  assert.equal(a.delta,1); assert.equal(b.segments.length,0);
  const [c] = model([{date:'2026-01-01',value:1},{date:'2026-02-01',value:2,method:'乙'},{date:'2026-03-01',value:3}]);
  assert.equal(c.delta,null); assert.equal(c.segments.length,0);
});
