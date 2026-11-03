// 走查工具契约测试，不是 15 条路径的验收。
//
// 通过只说明：工具能从看板真实点击推进、如实报告失败、不改 index.html，
// 且报告结构与退出码自洽。当前每条路径是 PASS 还是 FAIL 不受本测试约束；
// 测试会把真实结论逐条打印出来。真正的路径门槛是：
//   npm run probe:paths   # 有 FAIL 时退出码 1
//
// 本文件放在 test/path-walk/ 下，故意不被 `npm test` 的 test/*.test.mjs
// 和 `npm run check` 收集：当前还有产品缺口，不能让 12 条 FAIL 把 check
// 染成绿色，也不能把“固定失败快照”当成永远预期。修复后再决定是否并入 check。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROTOTYPE = join(ROOT, 'prototypes/v0.2/index.html');
const SCRIPT = join(ROOT, 'scripts/path-walk.mjs');
const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium';
const EXPECTED_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15'];
const CHECK_STATUSES = new Set(['PASS', 'FAIL', 'N/A', 'NOT_RUN']);
const OUTCOMES = new Set(['PASS', 'FAIL', 'N/A', 'NOT_RUN']);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

test('走查工具契约：15 条路径可真实点击并如实报告（不代表路径验收）', {
  skip: existsSync(CHROMIUM) ? false : `未找到 Chromium：${CHROMIUM}`,
  timeout: 180000,
}, async (t) => {
  const before = await readFile(PROTOTYPE);
  const result = spawnSync(process.execPath, [SCRIPT, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 150000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, CHROMIUM },
  });
  const after = await readFile(PROTOTYPE);

  assert.equal(sha256(after), sha256(before), '走查工具不得修改 prototypes/v0.2/index.html');
  assert.ok(
    result.status === 0 || result.status === 1,
    `走查未能执行（exit=${result.status}）：${result.stderr || result.stdout}`,
  );

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    assert.fail(`--json 输出不是合法 JSON：${result.stdout.slice(0, 800)}`);
  }

  assert.equal(report.fatal, undefined, `走查发生致命错误：${report.error || ''}`);
  assert.deepEqual(report.harnessErrors, [], '走查报出 harness 错误');
  assert.equal(report.prototype.unchanged, true, '报告称走查期间原型发生变化');
  assert.equal(report.prototype.afterSha256, sha256(before), '报告中的原型 hash 与当前文件不一致');
  assert.equal(report.method.indexModified, false, '方法声明必须明确未改 index.html');

  assert.equal(report.paths.length, 15, '必须覆盖 S01–S15 共 15 条路径');
  assert.deepEqual(report.paths.map((path) => path.id), EXPECTED_IDS, '路径 ID 必须按文档顺序完整覆盖');
  assert.equal(report.summary.total, 15);
  assert.equal(report.summary.pass + report.summary.fail, 15, 'PASS/FAIL 计数必须覆盖全部路径');
  assert.equal(
    result.status,
    report.summary.fail > 0 ? 1 : 0,
    '退出码必须与路径结论一致：有 FAIL 时不能返回 0',
  );

  for (const path of report.paths) {
    assert.ok(Array.isArray(path.checks) && path.checks.length > 0, `${path.id} 没有任何检查项`);
    assert.ok(['PASS', 'FAIL'].includes(path.status), `${path.id} 结论文本非法：${path.status}`);
    assert.ok(OUTCOMES.has(path.manualOutcome), `${path.id} 手工结论非法：${path.manualOutcome}`);
    assert.ok(OUTCOMES.has(path.aiOutcome), `${path.id} AI 结论非法：${path.aiOutcome}`);

    const entry = path.checks.find((check) => check.kind === 'entry');
    assert.ok(entry, `${path.id} 缺少入口检查`);
    assert.ok(path.checks.some((check) => check.kind === 'destination'), `${path.id} 缺少落点检查`);

    for (const check of path.checks) {
      assert.ok(CHECK_STATUSES.has(check.status), `${path.id} 检查状态非法：${check.status}`);
      assert.ok(check.name && check.name.trim(), `${path.id} 有未命名检查项`);
      if (check.status === 'FAIL') {
        assert.ok(check.detail && check.detail.trim(), `${path.id} 的失败项「${check.name}」没有原因`);
      }
    }

    const failed = path.checks.filter((check) => check.status === 'FAIL');
    assert.deepEqual(
      path.failedChecks.map((check) => check.name),
      failed.map((check) => check.name),
      `${path.id} 的 failedChecks 与检查明细不一致`,
    );

    if (path.status === 'PASS') {
      assert.equal(failed.length, 0, `${path.id} 报 PASS 但含失败检查`);
      assert.ok(
        path.checks.every((check) => check.status === 'PASS' || check.status === 'N/A'),
        `${path.id} 报 PASS 但存在 FAIL/NOT_RUN 检查`,
      );
      assert.ok(path.manualOutcome !== 'FAIL' && path.manualOutcome !== 'NOT_RUN', `${path.id} 手工结论失败却报 PASS`);
      assert.ok(path.aiOutcome !== 'FAIL' && path.aiOutcome !== 'NOT_RUN', `${path.id} AI 结论失败却报 PASS`);
    } else {
      assert.ok(failed.length > 0, `${path.id} 报 FAIL 但没有失败定位`);
    }

    if (entry.status === 'PASS') {
      assert.ok(path.entryRendered && path.entryRendered.trim(), `${path.id} 入口 PASS 但未记录实际渲染文案`);
    }
  }

  t.diagnostic(`路径结论：${report.summary.pass}/${report.summary.total} PASS，${report.summary.fail} FAIL；`
    + `手工/产物失败 ${report.summary.failManual}，仅 AI 缺失 ${report.summary.failAiOnly}`);
  for (const path of report.paths.filter((item) => item.status === 'FAIL')) {
    const names = path.failedChecks.map((check) => check.name).join('；');
    t.diagnostic(`${path.id} ${path.title} FAIL：${names}`);
  }
  if (report.summary.fail > 0) {
    t.diagnostic('上述失败是真实产品缺口，不是工具失败；请运行 `npm run probe:paths` 查看逐条定位。');
  }
});