#!/usr/bin/env node
/**
 * 恢复后授权复活探针：合成、临时、独立，不联网，不读写生产数据。
 *
 * 放在 test/probes/ 是为了不进入 `node --test test/*.test.mjs`；
 * 手动运行：
 *
 *   node --test test/probes/restore-revocation.test.mjs
 *
 * 只复现反例，不实现恢复策略：
 *
 *   1. T0 建立最小的合成 subject / actor / access_grant，并用 `VACUUM INTO`
 *      生成一致性备份。
 *   2. T1 撤销授权：库里写入 revoked 状态与库内撤销事件；当前库拒绝新的
 *      代理写入。
 *   3. 把 T0 备份复制到新目录当作恢复后的活动库：撤销标记全部回到 T0，
 *      授权重新是 active，代理写入再次被接受 —— 授权“复活”。
 *   4. 一个只查库内撤销标记的检测桩，在恢复后的库上返回“未检测到”；
 *      恢复后的库与从未撤销的库在本地授权状态上同形，单看库无法区分。
 *
 * 这里复现的是风险，不是修复：不设计、不验证外部不可回滚记录、恢复代次、
 * 授权重核或人工对账；不声称撤权安全、恢复策略或任何 G3 阻塞项已解决。
 * 合成模型只保留验证所需的最少字段，不复刻生产 schema 或合同的完整约束。
 * 所有数据库均为本次运行创建的临时文件；结束时校验路径并删除整个临时目录。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const T0 = '2026-11-04T00:00:00.000Z';
const T1 = '2026-11-04T01:00:00.000Z';
const SUBJECT_ID = 'subject-synthetic-restore-revocation-1';
const SELF_ACTOR_ID = 'actor-synthetic-self-1';
const PROXY_ACTOR_ID = 'actor-synthetic-proxy-1';
const GRANT_ID = 'grant-synthetic-restore-revocation-1';
const T0_RECORD_ID = 'record-synthetic-t0-1';
const REVOCATION_EVENT_ID = 'event-synthetic-revocation-1';
const RECORD_KIND = 'symptom';
const OCCURRED_DATE = '2026-11-04';

function createSchema(db) {
  db.exec(`
    CREATE TABLE subject (
      subject_id TEXT PRIMARY KEY,
      self_actor_id TEXT NOT NULL,
      data_version INTEGER NOT NULL
    );

    CREATE TABLE actor (
      actor_id TEXT PRIMARY KEY,
      actor_kind TEXT NOT NULL CHECK (actor_kind IN ('self', 'proxy', 'system'))
    );

    CREATE TABLE access_grant (
      grant_id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      proxy_actor_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      revoked_at TEXT,
      record_kind TEXT NOT NULL,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
      FOREIGN KEY (proxy_actor_id) REFERENCES actor(actor_id)
    );

    CREATE TABLE record (
      record_id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      author_actor_id TEXT NOT NULL,
      on_behalf_grant_id TEXT,
      record_kind TEXT NOT NULL,
      occurred_date TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
      FOREIGN KEY (author_actor_id) REFERENCES actor(actor_id),
      FOREIGN KEY (on_behalf_grant_id) REFERENCES access_grant(grant_id)
    );

    CREATE TABLE security_event (
      event_id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      grant_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subject(subject_id)
    );
  `);
}

function seedBaseline(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO actor (actor_id, actor_kind) VALUES (?, 'self')
    `).run(SELF_ACTOR_ID);
    db.prepare(`
      INSERT INTO actor (actor_id, actor_kind) VALUES (?, 'proxy')
    `).run(PROXY_ACTOR_ID);
    db.prepare(`
      INSERT INTO subject (subject_id, self_actor_id, data_version)
      VALUES (?, ?, 1)
    `).run(SUBJECT_ID, SELF_ACTOR_ID);
    db.prepare(`
      INSERT INTO access_grant
        (grant_id, subject_id, proxy_actor_id, status, revoked_at,
         record_kind, period_from, period_to, created_at)
      VALUES (?, ?, ?, 'active', NULL, ?, '2026-01-01', '2026-12-31', ?)
    `).run(GRANT_ID, SUBJECT_ID, PROXY_ACTOR_ID, RECORD_KIND, T0);
    db.prepare(`
      INSERT INTO record
        (record_id, subject_id, author_actor_id, on_behalf_grant_id,
         record_kind, occurred_date, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'T0 代记记录', ?)
    `).run(
      T0_RECORD_ID,
      SUBJECT_ID,
      PROXY_ACTOR_ID,
      GRANT_ID,
      RECORD_KIND,
      OCCURRED_DATE,
      T0,
    );
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 事务可能已结束；保留原始错误。
    }
    throw error;
  }
}

/**
 * 合成代理写入：只校验 active 授权、记录类别与发生日期，然后写记录。
 * 这不是生产授权实现，只用来观察恢复前后“同一条写入是否被接受”。
 */
function authorizeProxyWrite(db, { body }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const grant = db.prepare(`
      SELECT grant_id
      FROM access_grant
      WHERE subject_id = ?
        AND proxy_actor_id = ?
        AND status = 'active'
        AND revoked_at IS NULL
        AND record_kind = ?
        AND period_from <= ?
        AND period_to >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(
      SUBJECT_ID,
      PROXY_ACTOR_ID,
      RECORD_KIND,
      OCCURRED_DATE,
      OCCURRED_DATE,
    );

    if (!grant) {
      db.exec('ROLLBACK');
      return { ok: false, code: 'not_authorized' };
    }

    const recordId = `record-${randomUUID()}`;
    db.prepare(`
      INSERT INTO record
        (record_id, subject_id, author_actor_id, on_behalf_grant_id,
         record_kind, occurred_date, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recordId,
      SUBJECT_ID,
      PROXY_ACTOR_ID,
      grant.grant_id,
      RECORD_KIND,
      OCCURRED_DATE,
      body,
      T1,
    );
    db.prepare(`
      UPDATE subject
      SET data_version = data_version + 1
      WHERE subject_id = ?
    `).run(SUBJECT_ID);
    db.exec('COMMIT');
    return { ok: true, recordId, grantId: grant.grant_id };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 事务可能已结束；保留原始错误。
    }
    throw error;
  }
}

/** T1 撤销授权：状态、撤销时间与一条库内撤销事件都在同一个库内。 */
function revokeGrant(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const updated = db.prepare(`
      UPDATE access_grant
      SET status = 'revoked', revoked_at = ?
      WHERE grant_id = ? AND status = 'active'
    `).run(T1, GRANT_ID);
    assert.equal(Number(updated.changes), 1, '撤销应恰好命中一条 active 授权');

    db.prepare(`
      INSERT INTO security_event (event_id, subject_id, kind, grant_id, created_at)
      VALUES (?, ?, 'grant.revoked', ?, ?)
    `).run(REVOCATION_EVENT_ID, SUBJECT_ID, GRANT_ID, T1);
    db.prepare(`
      UPDATE subject
      SET data_version = data_version + 1
      WHERE subject_id = ?
    `).run(SUBJECT_ID);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 事务可能已结束；保留原始错误。
    }
    throw error;
  }
}

/**
 * 只查库内撤销标记的最小检测桩。它刻意不读外部日志、备份清单或时间线，
 * 用来检验“仅存库内撤销标记”能否识别恢复后的回退；不代表产品检测实现。
 */
function detectRevocationFromLocalEvidence(db) {
  const revokedGrants = Number(
    db.prepare(`
      SELECT count(*) AS n
      FROM access_grant
      WHERE subject_id = ? AND (status = 'revoked' OR revoked_at IS NOT NULL)
    `).get(SUBJECT_ID).n,
  );
  const revocationEvents = Number(
    db.prepare(`
      SELECT count(*) AS n
      FROM security_event
      WHERE subject_id = ? AND kind = 'grant.revoked'
    `).get(SUBJECT_ID).n,
  );
  return {
    detected: revokedGrants + revocationEvents > 0,
    revokedGrants,
    revocationEvents,
  };
}

function grantRows(db) {
  return db.prepare(`
    SELECT grant_id, subject_id, proxy_actor_id, status, revoked_at,
           record_kind, period_from, period_to, created_at
    FROM access_grant
    WHERE subject_id = ?
    ORDER BY grant_id
  `).all(SUBJECT_ID).map((row) => ({ ...row }));
}

function securityEventRows(db) {
  return db.prepare(`
    SELECT event_id, subject_id, kind, grant_id, created_at
    FROM security_event
    WHERE subject_id = ?
    ORDER BY event_id
  `).all(SUBJECT_ID).map((row) => ({ ...row }));
}

function recordRows(db) {
  return db.prepare(`
    SELECT record_id, subject_id, author_actor_id, on_behalf_grant_id,
           record_kind, occurred_date, body, created_at
    FROM record
    WHERE subject_id = ?
    ORDER BY record_id
  `).all(SUBJECT_ID).map((row) => ({ ...row }));
}

/** 本地授权状态：只由当前库的行组成，不含任何外部/时间线证据。 */
function localAuthorizationState(db) {
  const subject = db.prepare(`
    SELECT data_version FROM subject WHERE subject_id = ?
  `).get(SUBJECT_ID);
  assert.ok(subject, `缺少合成 subject：${SUBJECT_ID}`);
  return {
    data_version: Number(subject.data_version),
    grants: grantRows(db),
    security_events: securityEventRows(db),
    records: recordRows(db),
  };
}

function assertHealthy(db) {
  assert.equal(
    db.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
}

function openDb(path, options = {}, handles = null) {
  const db = new DatabaseSync(path, options);
  if (handles) handles.add(db);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 2000');
  if (!options.readOnly) db.exec('PRAGMA journal_mode = WAL');
  return db;
}

function closeDb(db, handles = null) {
  if (!db) return;
  try {
    db.close();
  } catch {
    // 已关闭或关闭失败都不阻塞清理；清理阶段会再尝试一次。
  }
  if (handles) handles.delete(db);
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
    /^behcet-restore-revocation-/,
    `拒绝清理非本探针临时目录：${actualRoot}`,
  );
}

async function makeTempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'behcet-restore-revocation-'));
  const handles = new Set();
  const open = (path, options = {}) => openDb(path, options, handles);
  const close = (db) => closeDb(db, handles);

  t.after(async () => {
    for (const db of [...handles]) closeDb(db, handles);
    assertSafeCleanupTarget(root);
    await rm(root, { recursive: true, force: true });
  });

  return { root, open, close };
}

test('备份后撤销授权：恢复 T0 旧库使授权复活并可再次代记写入', async (t) => {
  const { root, open, close } = await makeTempRoot(t);
  const dataDir = join(root, 'data');
  const backupDir = join(root, 'backups', 't0');
  const restoreDir = join(root, 'restore');
  await mkdir(dataDir, { recursive: true });
  await mkdir(backupDir, { recursive: true });
  await mkdir(restoreDir, { recursive: true });

  const livePath = join(dataDir, 'workspace.sqlite');
  const backupPath = join(backupDir, 'workspace.t0.sqlite');
  const restorePath = join(restoreDir, 'workspace.sqlite');

  // T0：授权 active，已有一条代记记录；做一致性快照。
  const live = open(livePath);
  createSchema(live);
  seedBaseline(live);
  assertHealthy(live);

  const t0State = localAuthorizationState(live);
  assert.equal(t0State.grants.length, 1);
  assert.equal(t0State.grants[0].status, 'active');
  assert.equal(t0State.grants[0].revoked_at, null);
  assert.equal(t0State.security_events.length, 0);
  assert.deepEqual(detectRevocationFromLocalEvidence(live), {
    detected: false,
    revokedGrants: 0,
    revocationEvents: 0,
  });

  live.prepare('VACUUM INTO ?').run(backupPath);
  assert.ok(existsSync(backupPath), 'T0 备份应已生成');

  const snapshot = open(backupPath, { readOnly: true });
  assertHealthy(snapshot);
  assert.deepEqual(localAuthorizationState(snapshot), t0State);
  close(snapshot);
  close(live);

  // T1：撤销授权。当前库拒绝新的代理写入，库内留下撤销标记。
  const revoked = open(livePath);
  revokeGrant(revoked);
  assertHealthy(revoked);

  const revokedState = localAuthorizationState(revoked);
  assert.equal(revokedState.grants.length, 1);
  assert.equal(revokedState.grants[0].status, 'revoked');
  assert.equal(revokedState.grants[0].revoked_at, T1);
  assert.equal(revokedState.security_events.length, 1);
  assert.deepEqual(detectRevocationFromLocalEvidence(revoked), {
    detected: true,
    revokedGrants: 1,
    revocationEvents: 1,
  });

  const blocked = authorizeProxyWrite(revoked, { body: 'T1 撤销后写入' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'not_authorized');
  assert.equal(recordRows(revoked).length, 1, '撤销后拒绝写入不应新增记录');
  close(revoked);

  // 恢复：把 T0 备份复制到新目录作为活动库；撤销标记随库回到 T0 而消失。
  await copyFile(backupPath, restorePath);
  const restored = open(restorePath);
  assertHealthy(restored);
  assert.deepEqual(
    localAuthorizationState(restored),
    t0State,
    '恢复后的本地授权状态应与 T0 完全一致，包括撤销标记消失',
  );

  const restoredGrant = grantRows(restored)[0];
  assert.equal(restoredGrant.status, 'active');
  assert.equal(restoredGrant.revoked_at, null);
  assert.deepEqual(detectRevocationFromLocalEvidence(restored), {
    detected: false,
    revokedGrants: 0,
    revocationEvents: 0,
  });

  // 授权复活：同一条代理写入在恢复后的库上再次被接受。
  const allowed = authorizeProxyWrite(restored, { body: '恢复后再次代记写入' });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.grantId, GRANT_ID);
  assert.equal(recordRows(restored).length, 2);
  assert.ok(
    recordRows(restored).some((row) => row.record_id === T0_RECORD_ID),
    'T0 的代记记录应仍在恢复后的库中',
  );
  assert.equal(
    Number(
      restored
        .prepare('SELECT data_version FROM subject WHERE subject_id = ?')
        .get(SUBJECT_ID).data_version,
    ),
    2,
  );
  close(restored);
});

test('仅存库内撤销标记：恢复后的库与从未撤销的库同形，库内检测桩无法识别', async (t) => {
  const { root, open, close } = await makeTempRoot(t);
  const revokedDir = join(root, 'revoked');
  const controlDir = join(root, 'control');
  const backupDir = join(root, 'backups', 't0');
  const restoreDir = join(root, 'restore');
  await mkdir(revokedDir, { recursive: true });
  await mkdir(controlDir, { recursive: true });
  await mkdir(backupDir, { recursive: true });
  await mkdir(restoreDir, { recursive: true });

  const revokedPath = join(revokedDir, 'workspace.sqlite');
  const controlPath = join(controlDir, 'workspace.sqlite');
  const backupPath = join(backupDir, 'workspace.t0.sqlite');
  const restorePath = join(restoreDir, 'workspace.sqlite');

  // 被撤销过的那条时间线：T0 备份 → T1 撤销。
  const revoked = open(revokedPath);
  createSchema(revoked);
  seedBaseline(revoked);
  revoked.prepare('VACUUM INTO ?').run(backupPath);
  revokeGrant(revoked);
  assert.equal(detectRevocationFromLocalEvidence(revoked).detected, true);
  assertHealthy(revoked);
  close(revoked);

  // 从未撤销的对照库：同 schema、同 baseline，没有任何撤销标记。
  const control = open(controlPath);
  createSchema(control);
  seedBaseline(control);
  assertHealthy(control);
  const controlState = localAuthorizationState(control);
  assert.equal(controlState.grants[0].status, 'active');
  assert.equal(controlState.security_events.length, 0);
  assert.deepEqual(detectRevocationFromLocalEvidence(control), {
    detected: false,
    revokedGrants: 0,
    revocationEvents: 0,
  });
  close(control);

  // 恢复 T0 备份：撤销标记丢失，只剩本地可观测状态。
  await copyFile(backupPath, restorePath);
  const restored = open(restorePath);
  assertHealthy(restored);
  const restoredState = localAuthorizationState(restored);

  assert.deepEqual(
    restoredState,
    controlState,
    '恢复后的库与从未撤销的库在本地授权状态上应同形',
  );
  assert.deepEqual(detectRevocationFromLocalEvidence(restored), {
    detected: false,
    revokedGrants: 0,
    revocationEvents: 0,
  }, '仅查库内标记的检测桩在恢复后无法识别曾经撤销');
  close(restored);
});