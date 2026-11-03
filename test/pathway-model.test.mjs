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
runInNewContext(
  readFileSync(new URL('../prototypes/v0.2/metric-model.js', import.meta.url), 'utf8'),
  { window },
  { filename: 'metric-model.js' }
);
const { build } = window.BEIPAL_PATHWAY_MODEL;
const { build: buildMetric } = window.BEIPAL_METRIC_MODEL;

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

test('同名指标按单位/方法/机构拆组，跨组交错不做趋势', () => {
  const block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-02-01', value: 9, method: '乙法' },
    { date: '2026-03-02', value: 5 },
    { date: '2026-03-03', value: 10, method: '乙法' }
  ]);
  // 甲法 prior→last 区间内出现乙法 2026-02-01；乙法区间内出现甲法 2026-03-02。
  assert.match(block.summary, /指标M 阶段内 1 个点（可比组：单位 mg\/L；方法 甲法；机构 甲机构）/);
  assert.match(block.summary, /指标M 阶段内 1 个点（可比组：单位 mg\/L；方法 乙法；机构 甲机构）/);
  assert.doesNotMatch(block.summary, /阶段前最近/);
  assert.doesNotMatch(block.summary, /阶段前最近 2 → 阶段内最后 10/);
  assert.doesNotMatch(block.summary, /阶段前最近 9 → 阶段内最后 5/);
  assert.match(block.summary, /不同单位、方法、机构的记录拆成可比组，不跨组比较。/);
});

test('没有其他可比组交错时仍比较同组阶段前后', () => {
  const block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-03-02', value: 5 }
  ]);
  assert.match(block.summary, /阶段前最近 2 → 阶段内最后 5/);
  assert.doesNotMatch(block.summary, /可比组：/);
});

test('点级未知维度单独成组，不参与指标级组的趋势', () => {
  const block = metricBlock([
    { date: '2025-12-01', value: 4, unit: '' },
    { date: '2026-01-01', value: 2 },
    { date: '2026-03-02', value: 5 },
    { date: '2026-03-03', value: 7, unit: '' }
  ]);
  // 未知单位组不完整，即使阶段前后都有值也不做趋势；它也不阻断指标级组的区间。
  assert.match(block.summary, /指标M 阶段前最近 2 → 阶段内最后 5（可比组：单位 mg\/L；方法 甲法；机构 甲机构）/);
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

test('非法日期和非法月份不进入阶段或指标点', () => {
  const stageWith = over => build(
    [stage(over)],
    [metric({ points: [{ date: '2026-03-02', value: 5 }] })]
  )[0].detail.metrics;
  for (const date of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10']) {
    const block = stageWith({ date, datePrecision: 'day' });
    assert.match(block.summary, /^无记录；开始日期未知/);
  }
  for (const date of ['2026-13', '2026-00']) {
    const block = stageWith({ date, datePrecision: 'month' });
    assert.match(block.summary, /^无记录；开始日期未知/);
  }

  // 合法闰日和合法月份仍应可用。
  const leap = build(
    [stage({ date: '2024-02-29' })],
    [metric({ points: [{ date: '2024-03-02', value: 5 }] })]
  )[0].detail.metrics;
  assert.doesNotMatch(leap.summary, /^无记录/);
  assert.match(leap.items.find(([label]) => label === '阶段范围')[1], /^2024-02-29 至/);

  const feb = build(
    [stage({ date: '2026-02', datePrecision: 'month' })],
    [metric({ points: [{ date: '2026-03-02', value: 5 }] })]
  )[0].detail.metrics;
  assert.match(feb.items.find(([label]) => label === '阶段范围')[1], /^2026-02-01 至/);

  // 指标点里的非法日期按未记录日期处理，不冒充有日期点，也不断掉有效点之间的趋势。
  const block = metricBlock([
    { date: '2026-01-01', value: 2 },
    { date: '2026-02-30', value: 5 },
    { date: '2026-03-03', value: 6 }
  ]);
  assert.match(block.summary, /阶段内 1 个记录点/);
  assert.match(block.summary, /阶段前最近 2 → 阶段内最后 6/);
  assert.ok(!block.items.some(([label]) => label.includes('2026-02-30')));
});

test('与 metric-model 一致：跨组交错（含端点）中断趋势', () => {
  const pointsOf = points => metric({ points });

  // 纯净单组：两模型都认可 2→5。
  const cleanPoints = [
    { date: '2026-01-01', value: 2 },
    { date: '2026-03-02', value: 5 }
  ];
  const [cleanGroup] = buildMetric([pointsOf(cleanPoints)]);
  assert.equal(cleanGroup.delta, 3);
  assert.match(metricBlock(cleanPoints).summary, /阶段前最近 2 → 阶段内最后 5/);

  // 另一组在区间内：metric-model 差值为 null，pathway 同样不做阶段趋势。
  const crossingPoints = [
    { date: '2026-01-01', value: 2 },
    { date: '2026-01-10', value: 9, method: '乙法' },
    { date: '2026-03-02', value: 5 }
  ];
  const [crossingGroup] = buildMetric([pointsOf(crossingPoints)]);
  assert.equal(crossingGroup.delta, null);
  assert.doesNotMatch(metricBlock(crossingPoints).summary, /阶段前最近/);

  // metric-model 可只比较最近一段（3/2→3/4），但 pathway 的 prior 是 1/1，
  // 中间 1/10 的乙法点仍在区间内，因此必须拒绝跨过它做阶段趋势。
  const laterPoints = [
    { date: '2026-01-01', value: 2 },
    { date: '2026-01-10', value: 9, method: '乙法' },
    { date: '2026-03-02', value: 5 },
    { date: '2026-03-04', value: 6 }
  ];
  const [laterGroup] = buildMetric([pointsOf(laterPoints)]);
  assert.equal(laterGroup.delta, 1);
  assert.doesNotMatch(metricBlock(laterPoints).summary, /阶段前最近/);

  // 端点也包含：另一组恰好落在 prior 或 last 日期，metric-model 和 pathway 都拒绝。
  for (const endpoint of ['2026-01-01', '2026-03-02']) {
    const endpointPoints = [
      { date: '2026-01-01', value: 2 },
      { date: '2026-03-02', value: 5 },
      { date: endpoint, value: 9, method: '乙法' }
    ];
    const [baseGroup] = buildMetric([pointsOf(endpointPoints)]);
    assert.equal(baseGroup.delta, null, 'metric-model 应因端点交错拒绝差值');
    assert.doesNotMatch(metricBlock(endpointPoints).summary, /阶段前最近/, '端点交错时 pathway 不应比较');
  }
});
