import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../prototypes/v0.2/metric-model.js';
const { build } = globalThis.BEIPAL_METRIC_MODEL;
const base = { id:'x', name:'示例', unit:'mg/L', method:'甲', laboratory:'机构', points:[] };
const model = points => build([{...base, points}]);

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
