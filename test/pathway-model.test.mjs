import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// pathway-model 直接挂在 window 上；用最小 window 上下文加载，避免页面 fixture。
const window = {};
runInNewContext(
  readFileSync(new URL('../prototypes/v0.2/pathway-model.js', import.meta.url), 'utf8'),
  { window },
  { filename: 'pathway-model.js' }
);
const { build } = window.BEIPAL_PATHWAY_MODEL;

const stage = over => ({
  id: 1, kind: '当前用药', date: '2026-03-01', datePrecision: 'day', ongoing: true,
  drug: '药A', dose: '', text: '原文', source: '本人抄录', private: false, history: [],
  ...over
});
const metric = over => ({
  id: 'm', name: '指标M', unit: 'mg/L', method: '甲法', laboratory: '甲机构',
  source: '合成来源', points: [], ...over
});

function metricBlock(points, metricOver = {}) {
  return build([stage()], [metric({ points, ...metricOver })])[0].detail.metrics;
}

function row(block, date) {
  const found = block.items.find(([label]) => label === '指标M · ' + date);
  assert.ok(found, '缺少指标行：' + date);
  return found[1];
}

test('点级空/未知单位、方法、机构不回退到指标级值', () => {
  const block = metricBlock([
    { date: '2026-03-02', value: 1 },
    { date: '2026-03-03', value: 2, unit: '' },
    { date: '2026-03-04', value: 3, method: '待核' },
    { date: '2026-03-05', value: 4, laboratory: '   ' },
    { date: '2026-03-06', value: 5, unit: '未知' }
  ]);
  // 点未声明该字段时才回退到指标级。
  assert.equal(row(block, '2026-03-02'), '1 mg/L（甲法 / 甲机构；来源：合成来源）');
  // 点自己声明为空或未知词：保留“未记录”，不能借用指标级的值冒充可比。
  assert.equal(row(block, '2026-03-03'), '2 单位未记录（甲法 / 甲机构；来源：合成来源）');
  assert.equal(row(block, '2026-03-04'), '3 mg/L（方法未记录 / 甲机构；来源：合成来源）');
  assert.equal(row(block, '2026-03-05'), '4 mg/L（甲法 / 机构未记录；来源：合成来源）');
  assert.equal(row(block, '2026-03-06'), '5 单位未记录（甲法 / 甲机构；来源：合成来源）');
});

test('同名指标按单位/方法/机构拆组，趋势只取同组阶段前点', () => {
  const block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-02-01', value: 9, method: '乙法' },
    { date: '2026-03-02', value: 5 },
    { date: '2026-03-03', value: 10, method: '乙法' }
  ]);
  assert.match(block.summary, /指标M 阶段前最近 2 → 阶段内最后 5（可比组：单位 mg\/L；方法 甲法；机构 甲机构）/);
  assert.match(block.summary, /指标M 阶段前最近 9 → 阶段内最后 10（可比组：单位 mg\/L；方法 乙法；机构 甲机构）/);
  // 不能把甲法的阶段前值接到乙法的阶段内值，反之亦然。
  assert.doesNotMatch(block.summary, /阶段前最近 2 → 阶段内最后 10/);
  assert.doesNotMatch(block.summary, /阶段前最近 9 → 阶段内最后 5/);
  assert.match(block.summary, /不同单位、方法、机构的记录拆成可比组，不跨组比较。/);
});

test('点级未知维度单独成组，不参与指标级组的趋势', () => {
  const block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-02-01', value: 4, unit: '' },
    { date: '2026-03-02', value: 5 },
    { date: '2026-03-03', value: 7, unit: '' }
  ]);
  assert.match(block.summary, /指标M 阶段前最近 2 → 阶段内最后 5（可比组：单位 mg\/L；方法 甲法；机构 甲机构）/);
  // 未知单位组虽然前后都有数值，但可比信息不齐，不做阶段前对比。
  assert.match(block.summary, /指标M 阶段内 1 个点（可比组：单位未记录；方法 甲法；机构 甲机构）/);
  assert.doesNotMatch(block.summary, /阶段前最近 2 → 阶段内最后 7/);
  assert.doesNotMatch(block.summary, /阶段前最近 4 → 阶段内最后 7/);
  assert.equal(row(block, '2026-03-03'), '7 单位未记录（甲法 / 甲机构；来源：合成来源）');
});

test('同组非数值或同日并列不跨过去做趋势', () => {
  let block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-03-02', value: '<5' },
    { date: '2026-03-03', value: 6 }
  ]);
  assert.match(block.summary, /指标M 阶段内 2 个点/);
  assert.doesNotMatch(block.summary, /阶段前最近/);

  block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-03-02', value: 5 },
    { date: '2026-03-02', value: 6 }
  ]);
  assert.match(block.summary, /指标M 阶段内 2 个点/);
  assert.doesNotMatch(block.summary, /阶段前最近/);
});