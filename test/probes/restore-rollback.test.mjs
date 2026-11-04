#!/usr/bin/env node
/**
 * 恢复回滚探针：合成、临时、独立，不联网，不读写任何真实数据。
 *
 * 放在 test/probes/ 是为了不进入 `node --test test/*.test.mjs`；
 * 手动运行：
 *
 *   node --test test/probes/restore-rollback.test.mjs
 *
 * 场景（只验证恢复后的库状态与重试语义，不实现恢复策略）：
 *
 *   1. 初始化一个临时 SQLite 工作库（subject / local_effect / command_receipt）。
 *   2. 在 T0 用 `VACUUM INTO` 做快照。
 *   3. T1 执行一次带 request_id 的合成命令：本地效果行、回执、外部副作用
 *      都发生；随后用同一 request_id 重放，验证回执仍能去重。
 *   4. 把 T0 快照复制到新目录当作恢复后的活动库。本地效果和回执回到 T0，
 *      但数据库外的 append-only 日志仍保留 T1 的外部副作用。
 *   5. 恢复后再次用同一 request_id 重试。库内回执和三键主键都已消失，
 *      重试被当作新命令执行，外部副作用发生第二次；库内只留下第二次的
 *      效果和回执，单看库无法区分“首次已执行”还是“这次才首次执行”。
 *
 * 外部服务只用本地 append-only 文件模拟：它不提供幂等键，也不会因为
 * SQLite 回滚而撤销。这里的重试是显式注入，用来检验恢复后的语义，不代表
 * 真实客户端一定会重试；正是这种“可能重试、也可能不重试”的两难需要外部
 * 幂等、独立日志或对账来消除，而库内键在恢复后已经不存在。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const NOW = '2026-11-04T00:00:00.000Z';
const SUBJECT_ID = 'subject-synthetic-restore-rollback-1';
const ACTOR_ID = 'actor-synthetic-restore-rollback-1';
const REQUEST_ID = 'request-synthetic-restore-rollback-1';
const COMMAND = 'synthetic.effect.create';

const REQUEST_PAYLOAD = {
  subject_id: SUBJECT_ID,
  actor_id: ACTOR_ID,
  request_id: REQUEST_ID,
  command: COMMAND,
  expected_data_version: 0,
};
const REQUEST_HASH = createHash('sha256')
  .update(JSON.stringify(REQUEST_PAYLOAD))
  .digest('hex');

const REQUEST = Object.freeze({
  subjectId: SUBJECT_ID,
  actorId: ACTOR_ID,
  requestId: REQUEST_ID,
  command: COMMAND,
  requestHash: REQUEST_HASH,
  expectedDataVersion: 0,
});

function createSchema(db) {
  db.exec(`
    CREATE TABLE subject (
      subject_id TEXT PRIMARY KEY,
      data_version INTEGER NOT NULL
    );

    CREATE TABLE local_effect (
      effect_id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      effect_kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
    );

    CREATE TABLE command_receipt (
      subject_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      command TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (subject_id, actor_id, request_id),
      FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
    );

    INSERT INTO subject (subject_id, data_version)
    VALUES ('${SUBJECT_ID}', 0);
  `);
}

function getReceipt(db, request) {
  return db
    .prepare(`
      SELECT request_hash, result_json
      FROM command_receipt
      WHERE subject_id = ? AND actor_id = ? AND request_id = ?
    `)
    .get(request.subjectId, request.actorId, request.requestId);
}

function countReceiptsByRequestId(db, requestId) {
  return Number(
    db
      .prepare('SELECT count(*) AS n FROM command_receipt WHERE request_id = ?')
      .get(requestId).n,
  );
}

function countEffectsByRequestId(db, requestId) {
  return Number(
    db
      .prepare('SELECT count(*) AS n FROM local_effect WHERE request_id = ?')
      .get(requestId).n,
  );
}

function readCounts(db, subjectId) {
  const subject = db
    .prepare('SELECT data_version FROM subject WHERE subject_id = ?')
    .get(subjectId);
  assert.ok(subject, `缺少合成 subject：${subjectId}`);

  return {
    local_effect: Number(
      db.prepare('SELECT count(*) AS n FROM local_effect').get().n,
    ),
    command_receipt: Number(
      db.prepare('SELECT count(*) AS n FROM command_receipt').get().n,
    ),
    data_version: Number(subject.data_version),
  };
}

function appendExternalEffect(logPath, requestId, effectId) {
  // 合成外部副作用：每次调用都追加一行，没有幂等去重。
  const effect = {
    service: 'synthetic-external-service',
    request_id: requestId,
    effect_id: effectId,
  };
  appendFileSync(logPath, `${JSON.stringify(effect)}\n`, 'utf8');
  return effect;
}

function readExternalEffects(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * 合成写命令。事务顺序按合同草案 §9.5：校验 → 执行副作用 → 写回执 → 提交。
 * 外部追加发生在 SQLite 事务内，但 SQLite 回滚不能撤销它；本测试只覆盖
 * 外部副作用已发生且本地事务提交成功的主路径。
 */
function executeBuildCommand(db, request, externalLogPath) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = getReceipt(db, request);
    if (existing) {
      if (existing.request_hash !== request.requestHash) {
        throw new Error('同一 request_id 携带了不同 request_hash');
      }
      db.exec('COMMIT');
      return {
        replayed: true,
        result: JSON.parse(existing.result_json),
        externalEffect: null,
      };
    }

    const subject = db
      .prepare('SELECT data_version FROM subject WHERE subject_id = ?')
      .get(request.subjectId);
    if (!subject) throw new Error(`缺少 subject：${request.subjectId}`);
    if (Number(subject.data_version) !== request.expectedDataVersion) {
      throw new Error(
        `data_version 已变化：期望 ${request.expectedDataVersion}，实际 ${subject.data_version}`,
      );
    }

    const effectId = `effect-${randomUUID()}`;
    const result = { effect_id: effectId, status: 'ready' };

    db.prepare(`
      INSERT INTO local_effect
        (effect_id, subject_id, request_id, effect_kind, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(effectId, request.subjectId, request.requestId, 'ready', NOW);

    db.prepare(`
      UPDATE subject
      SET data_version = data_version + 1
      WHERE subject_id = ?
    `).run(request.subjectId);

    const externalEffect = appendExternalEffect(
      externalLogPath,
      request.requestId,
      effectId,
    );

    db.prepare(`
      INSERT INTO command_receipt
        (subject_id, actor_id, request_id, command, request_hash, result_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.subjectId,
      request.actorId,
      request.requestId,
      request.command,
      request.requestHash,
      JSON.stringify(result),
      NOW,
    );

    db.exec('COMMIT');
    return { replayed: false, result, externalEffect };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 事务可能已经结束；保留原始错误。
    }
    throw error;
  }
}

function openDb(path, options = {}) {
  const db = new DatabaseSync(path, options);
  handles.add(db);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 2000');
  if (!options.readOnly) db.exec('PRAGMA journal_mode = WAL');
  return db;
}

function closeDb(db) {
  if (!db) return;
  try {
    db.close();
  } catch {
    // 已关闭或关闭失败都不阻塞清理；清理阶段会再尝试一次。
  }
  handles.delete(db);
}

function assertSafeCleanupTarget(root) {
  if (!existsSync(root)) return;
  const actualRoot = realpathSync(root);
  const actualTmp = realpathSync(tmpdir());
  assert.equal(
    dirname(actualRoot),
    actualTmp,
    `拒绝清理非临时目录直接子目录：${actualRoot}`,
  );
  assert.match(
    basename(actualRoot),
    /^behcet-restore-rollback-/,
    `拒绝清理非本探针临时目录：${actualRoot}`,
  );
}

const handles = new Set();

test('恢复 T0 丢失本地效果与回执但保留外部副作用，库内键无法阻止重试', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'behcet-restore-rollback-'));
  t.after(async () => {
    for (const db of [...handles]) closeDb(db);
    assertSafeCleanupTarget(root);
    await rm(root, { recursive: true, force: true });
  });

  const dataDir = join(root, 'data');
  const backupDir = join(root, 'backups', 't0');
  const restoreDir = join(root, 'restore');
  const externalDir = join(root, 'external-service');
  await mkdir(dataDir, { recursive: true });
  await mkdir(backupDir, { recursive: true });
  await mkdir(restoreDir, { recursive: true });
  await mkdir(externalDir, { recursive: true });

  const livePath = join(dataDir, 'workspace.sqlite');
  const backupPath = join(backupDir, 'workspace.t0.sqlite');
  const restorePath = join(restoreDir, 'workspace.sqlite');
  const externalLog = join(externalDir, 'received.log');

  // T0 之前：空库、无回执、无外部副作用。
  const db = openDb(livePath);
  createSchema(db);
  assert.deepEqual(readCounts(db, REQUEST.subjectId), {
    local_effect: 0,
    command_receipt: 0,
    data_version: 0,
  });
  assert.equal(getReceipt(db, REQUEST), undefined);
  assert.equal(countReceiptsByRequestId(db, REQUEST.requestId), 0);
  assert.equal(countEffectsByRequestId(db, REQUEST.requestId), 0);
  assert.equal(existsSync(externalLog), false);

  // T0：用 VACUUM INTO 做一致性快照，而不是直接拷主库文件。
  db.prepare('VACUUM INTO ?').run(backupPath);
  assert.ok(existsSync(backupPath), 'T0 快照应已生成');

  const snapshot = openDb(backupPath, { readOnly: true });
  assert.equal(
    snapshot.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
  assert.deepEqual(snapshot.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(readCounts(snapshot, REQUEST.subjectId), {
    local_effect: 0,
    command_receipt: 0,
    data_version: 0,
  });
  closeDb(snapshot);

  // T1：提交本地效果与回执，并触发一次外部副作用。
  const first = executeBuildCommand(db, REQUEST, externalLog);
  assert.equal(first.replayed, false);
  assert.equal(first.result.status, 'ready');
  assert.deepEqual(readCounts(db, REQUEST.subjectId), {
    local_effect: 1,
    command_receipt: 1,
    data_version: 1,
  });

  const firstReceipt = getReceipt(db, REQUEST);
  assert.ok(firstReceipt, 'T1 提交后应存在回执');
  assert.equal(firstReceipt.request_hash, REQUEST.requestHash);
  assert.deepEqual(JSON.parse(firstReceipt.result_json), first.result);

  let externalEffects = readExternalEffects(externalLog);
  assert.equal(externalEffects.length, 1);
  assert.equal(externalEffects[0].request_id, REQUEST.requestId);
  assert.equal(externalEffects[0].effect_id, first.result.effect_id);

  // T1 后、恢复前：同一 request_id 重放仍能靠库内回执去重。
  const replayBeforeRestore = executeBuildCommand(db, REQUEST, externalLog);
  assert.equal(replayBeforeRestore.replayed, true);
  assert.deepEqual(replayBeforeRestore.result, first.result);
  assert.deepEqual(readCounts(db, REQUEST.subjectId), {
    local_effect: 1,
    command_receipt: 1,
    data_version: 1,
  });
  externalEffects = readExternalEffects(externalLog);
  assert.equal(externalEffects.length, 1, '恢复前重放不应产生第二次外部副作用');

  closeDb(db);

  // 恢复 T0：复制到新目录后作为活动库打开；外部日志不在数据库内，保持原样。
  // 旧 T1 库文件仍留在 data/，但不再作为活动库使用；这里只对恢复后的活动库断言。
  await copyFile(backupPath, restorePath);
  const restored = openDb(restorePath);
  assert.equal(
    restored.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  assert.deepEqual(readCounts(restored, REQUEST.subjectId), {
    local_effect: 0,
    command_receipt: 0,
    data_version: 0,
  });

  // 恢复后：三键主键对应的回执、本地效果都不存在；外部副作用仍存在。
  assert.equal(getReceipt(restored, REQUEST), undefined);
  assert.equal(countReceiptsByRequestId(restored, REQUEST.requestId), 0);
  assert.equal(countEffectsByRequestId(restored, REQUEST.requestId), 0);
  externalEffects = readExternalEffects(externalLog);
  assert.equal(externalEffects.length, 1);
  assert.equal(externalEffects[0].effect_id, first.result.effect_id);

  // 恢复后重试：库内没有可识别的键，同一 request_id 被当作新命令执行。
  const retryAfterRestore = executeBuildCommand(
    restored,
    REQUEST,
    externalLog,
  );
  assert.equal(retryAfterRestore.replayed, false);
  assert.equal(retryAfterRestore.result.status, 'ready');
  assert.notEqual(
    retryAfterRestore.result.effect_id,
    first.result.effect_id,
    '恢复后重试应生成新的本地效果 id',
  );

  // 库内只剩第二次执行：1 条效果、1 条回执、data_version=1。
  assert.deepEqual(readCounts(restored, REQUEST.subjectId), {
    local_effect: 1,
    command_receipt: 1,
    data_version: 1,
  });
  assert.equal(
    getReceipt(restored, REQUEST)?.request_hash,
    REQUEST.requestHash,
  );
  assert.equal(countReceiptsByRequestId(restored, REQUEST.requestId), 1);
  assert.equal(countEffectsByRequestId(restored, REQUEST.requestId), 1);

  // 外部日志显示同一 request_id 已发生两次；仅看库无法识别这一点。
  externalEffects = readExternalEffects(externalLog);
  assert.equal(externalEffects.length, 2);
  assert.equal(externalEffects[0].request_id, REQUEST.requestId);
  assert.equal(externalEffects[1].request_id, REQUEST.requestId);
  assert.equal(externalEffects[0].effect_id, first.result.effect_id);
  assert.equal(
    externalEffects[1].effect_id,
    retryAfterRestore.result.effect_id,
  );
  assert.equal(
    Number(
      restored
        .prepare('SELECT count(*) AS n FROM local_effect WHERE effect_id = ?')
        .get(first.result.effect_id).n,
    ),
    0,
    'T1 的本地效果不应在恢复后的库中留下痕迹',
  );

  closeDb(restored);
});