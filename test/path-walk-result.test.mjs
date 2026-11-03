import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateChecks, buildPathResult, summarize } from '../scripts/lib/path-walk-result.mjs';

const check = (kind, name, status, detail = '') => ({ kind, name, status, detail });

test('路径聚合：全部 PASS（含文档红线 N/A）才得到 PASS', () => {
  const result = aggregateChecks([
    check('entry', '入口点击', 'PASS'),
    check('manual', '手工步骤', 'PASS'),
    check('product', '产物', 'PASS'),
    check('ai', '文档红线', 'N/A'),
    check('return', '回首页', 'PASS'),
  ]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.reason, '');
});

test('路径聚合：任一 FAIL 不得被其它 PASS 掩盖', () => {
  const result = aggregateChecks([
    check('entry', '入口点击', 'PASS'),
    check('manual', '手工步骤', 'FAIL', '表单打不开'),
    check('product', '产物', 'PASS'),
  ]);
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason, /手工步骤：表单打不开/);
});

test('路径聚合：NOT_RUN 不能当作通过', () => {
  const result = aggregateChecks([
    check('entry', '入口点击', 'FAIL', '入口不存在'),
    check('destination', '目标页', 'NOT_RUN', '入口未到达'),
  ]);
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason, /NOT_RUN|入口不存在/);
});

test('路径聚合：空检查必须 FAIL，不能默认绿灯', () => {
  assert.equal(aggregateChecks([]).status, 'FAIL');
  assert.equal(aggregateChecks(undefined).status, 'FAIL');
});

test('路径结果：手工失败与仅 AI 通道缺失分开计数', () => {
  const spec = { id: 'S00', title: '示例', entry: { label: '入口' } };
  const manualFail = buildPathResult(spec, [
    check('entry', '入口点击', 'PASS'),
    check('destination', '目标页', 'PASS'),
    check('manual', '手工步骤', 'FAIL', '无表单'),
    check('product', '产物', 'FAIL', '无产物'),
    check('ai', 'AI 默认通道', 'FAIL', '未实现'),
    check('return', '回首页', 'PASS'),
  ]);
  assert.equal(manualFail.status, 'FAIL');
  assert.equal(manualFail.manualOutcome, 'FAIL');
  assert.equal(manualFail.aiOutcome, 'FAIL');

  const aiOnly = buildPathResult({ ...spec, id: 'S01' }, [
    check('entry', '入口点击', 'PASS'),
    check('destination', '目标页', 'PASS'),
    check('manual', '手工步骤', 'PASS'),
    check('product', '产物', 'PASS'),
    check('ai', 'AI 默认通道', 'FAIL', '未实现'),
    check('return', '回首页', 'PASS'),
  ]);
  assert.equal(aiOnly.status, 'FAIL');
  assert.equal(aiOnly.manualOutcome, 'PASS');
  assert.equal(aiOnly.aiOutcome, 'FAIL');

  const summary = summarize([manualFail, aiOnly]);
  assert.deepEqual(summary, { total: 2, pass: 0, fail: 2, failManual: 1, failAiOnly: 1 });
});