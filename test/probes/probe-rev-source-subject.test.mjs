#!/usr/bin/env node
/**
 * `scripts/probe-rev-source-subject.mjs` 的专属正反例。
 *
 * 这个测试刻意放在 test/probes/，不进入 `node --test test/*.test.mjs`：
 * 探针的基线就是“合同示例仍有已登记缺口”，把它接进常规 check 会让
 * 退出码 1 变成红灯，或者反过来逼探针假装通过。手动运行：
 *
 *   node --test test/probes/probe-rev-source-subject.test.mjs
 *
 * 覆盖：当前文档的基线（A2/A7/A10 GAP、B 组 PASS、退出码 1、
 * 明示 Q-30 未关闭且不是验收）、坏 DDL 夹具（退出码 3）、缺 §9.3
 * 与缺文件（退出码 2），以及 `--docs` 相对仓库根解析而不是相对 cwd。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const probe = join(root, 'scripts', 'probe-rev-source-subject.mjs');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function runProbe(args = [], cwd = root) {
  const result = spawnSync(process.execPath, [probe, ...args], { cwd, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function writeFixture(t, contents) {
  const base = await mkdtemp(join(tmpdir(), 'rev-source-subject-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const file = join(base, 'DATA-MODEL-DRAFT.md');
  await writeFile(file, contents);
  return { base, file };
}

test('当前合同基线：复现 A2/A7/A10，B 组通过，退出码 1 且不声称验收', () => {
  const result = runProbe();

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /docs=docs\/DATA-MODEL-DRAFT\.md/);
  // 输出路径应相对项目，不把本机绝对根路径带进报告。
  assert.doesNotMatch(result.stdout, new RegExp(escapeRe(root)));
  assert.match(result.stdout, /已知缺口（GAP，复现）: A2, A7, A10/);
  assert.match(result.stdout, /A 组（合同期望）: PASS=4 GAP=3 FAIL=0/);
  assert.match(result.stdout, /B 组（合同期望）: PASS=9 GAP=0 FAIL=0/);
  assert.match(result.stdout, /诊断项合计: INFO=23（A=3 B=9 C=11；不计通过）/);
  assert.match(result.stdout, /Q-30 未关闭/);
  assert.match(result.stdout, /这不是验收/);
  assert.match(result.stdout, /不能作为“多 subject 隔离已成立”的证据/);
  assert.match(result.stdout, /退出码: 1/);
  assert.doesNotMatch(result.stdout, /验收通过|已验收|隔离已验证/);
});

test('坏 DDL 夹具：结果偏离基线时退出码 3，不冒充通过', async (t) => {
  const { file } = await writeFixture(t, `# 夹具

### 9.3 关键 DDL 片段（示意，未执行，非完整合同）

\`\`\`sql
CREATE TABLE record_revision (revision_id TEXT PRIMARY KEY);
\`\`\`

### 9.4 命令与错误码（合同级）

夹具到此为止。
`);

  // 从 cwd 传相对路径：探针必须相对仓库根解析，而不是相对 cwd。
  const result = runProbe(['--docs', relative(root, file)], tmpdir());

  assert.equal(result.status, 3, result.stderr);
  assert.doesNotMatch(result.stderr, /无法运行/);
  assert.match(result.stderr, /结果偏离基线：实验执行中断：/);
  assert.match(result.stderr, /这不是验收/);
  assert.match(result.stderr, /退出码 3/);
});

test('缺 §9.3 或缺文档时明确“无法运行”，退出码 2', async (t) => {
  await t.test('缺 §9.3 边界', async (t) => {
    const { file } = await writeFixture(t, '# 夹具\n\n### 9.4 命令与错误码\n');
    const result = runProbe(['--docs', file]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /无法运行：.*找不到 §9\.3 到 §9\.4 的边界/);
    assert.match(result.stderr, /退出码 2/);
  });

  await t.test('文件不存在', async (t) => {
    const { base } = await writeFixture(t, '');
    const result = runProbe(['--docs', join(base, 'missing.md')]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /无法运行：读取 .* 失败/);
  });
});

test('--help 只打印用法，退出码 0', () => {
  const result = runProbe(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /node scripts\/probe-rev-source-subject\.mjs/);
  assert.match(result.stdout, /不接入常规 check/);
});