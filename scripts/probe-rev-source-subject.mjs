#!/usr/bin/env node
/**
 * record_revision ↔ source_document 跨 subject 约束的内存实验（独立手动探针）。
 *
 * 对象：DATA-MODEL-DRAFT.md §9.3 的示意 DDL，以及 §9.7 对
 *       `record_revision.record_id` / `source_document_id` 同 subject 的要求。
 * 判据：
 *   A 组——把 §9.3 的 DDL 原样放进 :memory:。凡 §9.7 要求拒绝、但 SQLite
 *          接受的，记为 GAP；这不是“通过”，而是已登记缺口复现。
 *   B 组——复合外键原型：record_revision 去规范化 subject_id，用
 *          (record_id, subject_id) 与 (source_document_id, subject_id) 两条
 *          复合外键钉住 subject。只证明 SQLite 语义可行，不是生产方案。
 *   C 组——连接、触发器、迁移与 §9.7 不变量查询的诊断项，不判通过。
 *
 * 用法（在仓库根目录）：
 *   node scripts/probe-rev-source-subject.mjs
 *   node scripts/probe-rev-source-subject.mjs --docs docs/DATA-MODEL-DRAFT.md
 *   node scripts/probe-rev-source-subject.mjs --help
 *
 * 只读边界：只建 :memory: 库；不写 .sqlite 文件；不访问网络；不修改仓库。
 * 独立边界：本脚本刻意不接入 scripts.check / npm test。合同示例本身仍有
 *           已登记缺口，不能让常规 check 的绿灯把缺口染绿。
 *
 * 退出码（真实表达本次观察，而不是验收）：
 *   0 = 本次未复现已登记缺口，且没有 FAIL / 新缺口（仍需复核文档基线）
 *   1 = 已登记缺口按基线复现（当前状态；这不是验收）
 *   2 = 工具无法运行（缺文档、缺 §9.3、node:sqlite 不可用、参数错误）
 *   3 = 结果偏离基线（合同期望 accept 被拒，或出现新缺口 / 基线缺口部分关闭）
 *   退出码 0 或 1 都只说明内存实验的观察结果；Q-30 未关闭，不能据此声称
 *   “多 subject 隔离已成立”，也不是 G3 验收。
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DOC = 'docs/DATA-MODEL-DRAFT.md';
const KNOWN_GAPS = new Set(['A2', 'A7', 'A10']);
const EXIT = { OK: 0, KNOWN_GAP: 1, CANNOT_RUN: 2, DEVIATION: 3 };

const USAGE = `用法: node scripts/probe-rev-source-subject.mjs [--docs <path>]

  --docs <path>  覆盖默认文档（默认 ${DEFAULT_DOC}；主要供测试夹具使用）
  --help         显示本说明

只建 :memory: 库，不写 .sqlite，不修改仓库；不接入常规 check。`;

function bail(message) {
  console.error(`无法运行：${message}`);
  console.error('未完成实验；退出码 2。');
  process.exit(EXIT.CANNOT_RUN);
}

function parseArgs(argv) {
  let docs = DEFAULT_DOC;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(EXIT.OK);
    }
    if (arg === '--docs') {
      const next = argv[++i];
      if (!next || next.startsWith('--')) bail('--docs 后缺少路径');
      docs = next;
      continue;
    }
    if (arg.startsWith('--docs=')) {
      docs = arg.slice('--docs='.length);
      if (!docs) bail('--docs= 后缺少路径');
      continue;
    }
    bail(`未知参数 ${JSON.stringify(arg)}\n${USAGE}`);
  }
  return { docs };
}

const { docs: docsArg } = parseArgs(process.argv.slice(2));
const docsAbs = isAbsolute(docsArg) ? docsArg : resolve(ROOT, docsArg);
const docsDisplay = isAbsolute(docsArg)
  ? (relative(ROOT, docsAbs) || docsAbs)
  : docsArg;

let md;
try {
  md = readFileSync(docsAbs, 'utf8');
} catch (err) {
  bail(`读取 ${docsDisplay} 失败：${err.message}`);
}
const docSha = createHash('sha256').update(md).digest('hex').slice(0, 16);
const start = md.indexOf('### 9.3 ');
const end = md.indexOf('### 9.4 ');
if (start < 0 || end < 0 || end <= start) {
  bail(`${docsDisplay} 找不到 §9.3 到 §9.4 的边界`);
}
const section = md.slice(start, end);
const fence = section.match(/```sql\r?\n([\s\S]*?)```/);
if (!fence || !fence[1].trim()) {
  bail(`${docsDisplay} 的 §9.3 里没有非空 sql fenced block`);
}
const ddl = fence[1];

const dbs = [];
function openDb(name, options) {
  const db = options ? new DatabaseSync(name, options) : new DatabaseSync(name);
  dbs.push(db);
  return db;
}
function closeAll() {
  for (const db of dbs) {
    try {
      db.close();
    } catch {
      // 已关闭或连接已失效时忽略；不影响已经打印的观察结果。
    }
  }
}

let sqliteVersion;
try {
  sqliteVersion = openDb(':memory:').prepare('select sqlite_version() v').get().v;
} catch (err) {
  bail(`node:sqlite 不可用：${err.message}`);
}

const INV = `SELECT rr.revision_id FROM record_revision rr
  JOIN record r ON r.record_id = rr.record_id
  JOIN source_document d ON d.document_id = rr.source_document_id
 WHERE d.subject_id <> r.subject_id`;

const rows = [];
const attempt = (fn) => {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, errcode: err.errcode ?? null, msg: err.message };
  }
};
// expect: 'accept' | 'reject' 表示 §9.7 / INV-25 的期望；'info' 是诊断项，不判通过。
const add = (g, id, desc, expect, res, note = '') =>
  rows.push({ g, id, desc, expect, res, note });
const statusOf = (r) =>
  r.expect === 'info' ? 'INFO'
    : r.expect === 'accept' ? (r.res.ok ? 'PASS' : 'FAIL')
      : (r.res.ok ? 'GAP' : 'PASS');

let revSeq = 0;
function insCur(db, over = {}) {
  const row = {
    revision_id: `rev-${++revSeq}`, record_id: 'r1', revision_no: revSeq,
    base_revision_no: null, merged_from_revision_no: null,
    occurred_date: null, occurred_precision: 'unknown', occurred_raw: null,
    end_date: null, end_precision: null, end_raw: null, ongoing: null,
    review_date: null, review_precision: null, review_raw: null,
    report_date: null, report_precision: null, report_raw: null,
    body_system: null, text: null,
    source_kind: 'manual', source_text: null, source_document_id: null,
    privacy_state: 'unknown', privacy_origin: 'migration',
    metric_code: null, metric_definition_version: null,
    value_num: null, value_text: null, unit_code: null,
    method_text: null, laboratory_text: null, reference_text: null,
    details_json: null, details_schema_version: null,
    validation_state: 'ok', change_kind: 'initial', changed_fields_json: null,
    created_at: '2026-11-04T00:00:00Z', created_by_actor_id: 'a1',
    ...over,
  };
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO record_revision (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((c) => row[c]));
}

// 现合同 §9.3 原样 DDL + §9.2/§11.2 的最小 stub。
function makeCurrent() {
  const db = openDb(':memory:');
  db.exec(`CREATE TABLE actor (actor_id TEXT PRIMARY KEY);
CREATE TABLE record (record_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, UNIQUE(record_id, subject_id));
CREATE TABLE source_document (document_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL);
INSERT INTO actor VALUES ('a1');
INSERT INTO record VALUES ('r1','s1'), ('r2','s2');
INSERT INTO source_document VALUES ('d1','s1'), ('d2','s2');
${ddl}`);
  return db;
}

// 复合外键原型：记录修订去规范化 subject_id，两个复合 FK 共同钉住 subject。
function makeComposite({ docUnique = true, nullableSubject = false } = {}) {
  const db = openDb(':memory:');
  db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE record (record_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, UNIQUE(record_id, subject_id));
CREATE TABLE source_document (document_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL${docUnique ? ', UNIQUE(document_id, subject_id)' : ''});
INSERT INTO record VALUES ('r1','s1'), ('r2','s2');
INSERT INTO source_document VALUES ('d1','s1'), ('d2','s2');
CREATE TABLE record_revision (
  revision_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  subject_id TEXT ${nullableSubject ? '' : 'NOT NULL'},
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual','document','legacy_text','removed_irrecoverable')),
  source_text TEXT,
  source_document_id TEXT,
  privacy_state TEXT NOT NULL CHECK (privacy_state IN ('private','not_private','unknown')),
  created_at TEXT NOT NULL,
  validation_state TEXT NOT NULL DEFAULT 'ok',
  UNIQUE (record_id, revision_no),
  CHECK (source_kind = 'document' OR source_document_id IS NULL),
  FOREIGN KEY (record_id, subject_id) REFERENCES record(record_id, subject_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_document_id, subject_id) REFERENCES source_document(document_id, subject_id) ON DELETE RESTRICT
);`);
  return db;
}
function insV2(db, over = {}) {
  const row = {
    revision_id: `v2-${++revSeq}`, record_id: 'r1', subject_id: 's1', revision_no: revSeq,
    source_kind: 'manual', source_text: null, source_document_id: null,
    privacy_state: 'unknown', created_at: '2026-11-04T00:00:00Z', ...over,
  };
  db.prepare(`INSERT INTO record_revision (revision_id,record_id,subject_id,revision_no,source_kind,source_text,source_document_id,privacy_state,created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(row.revision_id, row.record_id, row.subject_id, row.revision_no,
    row.source_kind, row.source_text, row.source_document_id, row.privacy_state, row.created_at);
}

// 执行段统一兜底：文档 DDL 若与探针假设的表形状偏离，属于“结果偏离基线”，
// 应退出 3 并明确不是验收，而不是以未捕获异常伪装成普通崩溃。
try {
// ---------- A. 现合同 §9.3：单列 FK ----------
let db = makeCurrent();
add('A', 'A1', '合法：r1/s1 → d1/s1', 'accept',
  attempt(() => insCur(db, { source_kind: 'document', source_document_id: 'd1' })));
db = makeCurrent();
add('A', 'A2', '跨主体：r1/s1 → d2/s2', 'reject',
  attempt(() => insCur(db, { source_kind: 'document', source_document_id: 'd2' })),
  '普通外键只查行存在；§9.7 要求同 subject');
db = makeCurrent();
add('A', 'A3', '空指针：source_document_id NULL + manual', 'accept',
  attempt(() => insCur(db, { source_kind: 'manual', source_document_id: null })));
db = makeCurrent();
add('A', 'A4', '悬空指针：dX 不存在', 'reject',
  attempt(() => insCur(db, { source_kind: 'document', source_document_id: 'dX' })));
db = makeCurrent();
insCur(db, { source_kind: 'document', source_document_id: 'd1' });
add('A', 'A5', '删除被引用原件 d1', 'reject',
  attempt(() => db.prepare("DELETE FROM source_document WHERE document_id='d1'").run()),
  'ON DELETE RESTRICT');
db = makeCurrent();
insCur(db, { source_kind: 'document', source_document_id: 'd1' });
const a7 = attempt(() => db.prepare("UPDATE source_document SET subject_id='s2' WHERE document_id='d1'").run());
add('A', 'A7', '把原件 d1 的 subject 从 s1 改成 s2（已有修订引用）', 'reject', a7,
  `改后外键仍满足，fk_check=${db.prepare('PRAGMA foreign_key_check').all().length} 行，` +
  `§9.7 不变量=${db.prepare(INV).all().length} 行`);
db = makeCurrent();
add('A', 'A8', 'subject 大小写：插入 s1 但原件是 S1', 'info', (() => {
  db.prepare("INSERT INTO source_document VALUES ('d9','S1')").run();
  return attempt(() => insCur(db, { source_kind: 'document', source_document_id: 'd9' }));
})(), '单列 FK 不比较 subject，大小写自然无关；复合 FK 下才字节敏感（见 B18）');
db = makeCurrent();
add('A', 'A9', "source_kind='document' 但指针 NULL", 'info',
  attempt(() => insCur(db, { source_kind: 'document', source_document_id: null })),
  'CHECK 为 OR 形式，document+NULL 通过（§4.1/§11.2 已登记残余）');
db = makeCurrent();
insCur(db, { source_kind: 'document', source_document_id: 'd1' });
const a10 = attempt(() => db.prepare("UPDATE record SET subject_id='s2' WHERE record_id='r1'").run());
add('A', 'A10', '把 record r1 的 subject 从 s1 改成 s2（已有修订引用 d1/s1）', 'reject', a10,
  `fk_check=${db.prepare('PRAGMA foreign_key_check').all().length} 行，` +
  `§9.7 不变量=${db.prepare(INV).all().length} 行`);

// A6：FK 关闭 + 迁移检查。
db = makeCurrent();
db.exec('PRAGMA foreign_keys = OFF');
const a6ins = attempt(() => {
  insCur(db, { source_kind: 'document', source_document_id: 'd2' }); // 跨主体
  insCur(db, { source_kind: 'document', source_document_id: 'dX' }); // 悬空
});
add('A', 'A6', 'FK=OFF：同时写跨主体行与悬空行', 'info', a6ins,
  `foreign_key_check 只报 ${db.prepare('PRAGMA foreign_key_check').all().length} 行（悬空），跨主体查不出`);

// ---------- B. 复合外键原型 ----------
db = makeComposite();
add('B', 'B1', '合法：r1/s1 → d1/s1', 'accept',
  attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd1' })));
db = makeComposite();
add('B', 'B2', '跨主体：r1/s1 → d2/s2', 'reject',
  attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd2' })));
db = makeComposite();
add('B', 'B3', '空指针：doc NULL + manual', 'accept',
  attempt(() => insV2(db, { source_kind: 'manual', source_document_id: null })));
db = makeComposite();
add('B', 'B4', 'doc NULL 但 subject_id 写成 s2（记录属于 s1）', 'reject',
  attempt(() => insV2(db, { subject_id: 's2', source_kind: 'manual', source_document_id: null })),
  '靠 record 侧复合 FK 钉住 subject');
db = makeComposite();
insV2(db, { source_kind: 'document', source_document_id: 'd1' });
add('B', 'B5', 'UPDATE 指针 d1 → d2（跨主体）', 'reject',
  attempt(() => db.prepare("UPDATE record_revision SET source_document_id='d2'").run()));
db = makeComposite();
insV2(db, { source_kind: 'manual', source_document_id: null });
add('B', 'B6', 'UPDATE 指针 NULL → d1（同主体）', 'accept',
  attempt(() => db.prepare("UPDATE record_revision SET source_kind='document', source_document_id='d1'").run()));
db = makeComposite();
insV2(db, { source_kind: 'document', source_document_id: 'd1' });
add('B', 'B7', '改 record.subject_id s1 → s2（已有修订）', 'reject',
  attempt(() => db.prepare("UPDATE record SET subject_id='s2' WHERE record_id='r1'").run()),
  'NO ACTION 默认');
db = makeComposite();
insV2(db, { source_kind: 'document', source_document_id: 'd1' });
add('B', 'B8', '改 source_document.subject_id s1 → s2', 'reject',
  attempt(() => db.prepare("UPDATE source_document SET subject_id='s2' WHERE document_id='d1'").run()));
db = makeComposite();
insV2(db, { source_kind: 'document', source_document_id: 'd1' });
add('B', 'B9', '删除被引用原件 d1', 'reject',
  attempt(() => db.prepare("DELETE FROM source_document WHERE document_id='d1'").run()));

// B10：FK 关闭时的迁移检查。
db = makeComposite();
db.exec('PRAGMA foreign_keys = OFF');
add('B', 'B10', 'FK=OFF：写入跨主体行', 'info',
  attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd2' })),
  `foreign_key_check 报 ${db.prepare('PRAGMA foreign_key_check').all().length} 行（复合 FK 能查出）`);

// B11：延迟外键。
db = makeComposite();
const b11 = (() => {
  db.exec('BEGIN');
  db.exec('PRAGMA defer_foreign_keys = ON');
  const ins = attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd2' }));
  if (!ins.ok) {
    db.exec('ROLLBACK');
    return ins;
  }
  const commit = attempt(() => db.exec('COMMIT'));
  if (!commit.ok) db.exec('ROLLBACK');
  return commit;
})();
add('B', 'B11', 'defer_foreign_keys=ON：INSERT 暂过、COMMIT 拒绝', 'info', b11,
  '延迟只推迟到提交，不是放行');

// B12：父表缺 UNIQUE。
db = makeComposite({ docUnique: false });
add('B', 'B12', '父表缺 UNIQUE(document_id,subject_id)', 'info',
  attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd1' })),
  '报 foreign key mismatch（errcode 1）');

// B13：事务内 PRAGMA 无效。
db = makeComposite();
const b13 = (() => {
  db.exec('BEGIN');
  db.exec('PRAGMA foreign_keys = OFF');
  const ins = attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd2' }));
  db.exec('ROLLBACK');
  return ins;
})();
add('B', 'B13', '事务内 PRAGMA foreign_keys=OFF 后再写跨主体', 'info', b13,
  'PRAGMA 在事务内是 no-op，仍被拒');

// B14：document 但空指针。
db = makeComposite();
add('B', 'B14', "source_kind='document' 但指针 NULL", 'info',
  attempt(() => insV2(db, { source_kind: 'document', source_document_id: null })),
  '复合 FK 不检查 NULL；DB 层无法区分，属 §4.1 残余');

// B15：subject_id 可空。
db = makeComposite({ nullableSubject: true });
add('B', 'B15', 'subject_id 可空 + doc d2（跨主体）', 'info',
  attempt(() => insV2(db, { subject_id: null, source_kind: 'document', source_document_id: 'd2' })),
  'MATCH SIMPLE：任一列 NULL 即跳过整条复合 FK → NOT NULL 必不可少');

// B16/B17：迁移可达性。
db = makeCurrent();
add('B', 'B16', 'ALTER TABLE 声明双列 FK', 'info',
  attempt(() => db.exec('ALTER TABLE record_revision ADD COLUMN sid TEXT REFERENCES source_document(document_id, subject_id)')),
  'SQLite 不支持 ADD COLUMN 写复合 FK');
db = makeCurrent();
insCur(db, { source_kind: 'manual' });
add('B', 'B17', '非空表 ADD COLUMN subject_id NOT NULL（无默认）', 'info',
  attempt(() => db.exec('ALTER TABLE record_revision ADD COLUMN subject_id TEXT NOT NULL')),
  'Cannot add a NOT NULL column with default value NULL');
db = makeComposite();
db.prepare("INSERT INTO source_document VALUES ('d9','S1')").run();
add('B', 'B18', 'subject 大小写：原件 d9/S1，修订声明 r1/s1', 'info',
  attempt(() => insV2(db, { source_kind: 'document', source_document_id: 'd9' })),
  '复合 FK 字节精确：大小写不同即拒绝');

// ---------- C. 连接、触发器、迁移诊断 ----------
// C1：共享内存两个连接，pragma 各自独立；A 关 FK 写入，B 开 FK 复查。
const uri = 'file:revprobe?mode=memory&cache=shared';
const c1a = openDb(uri, { enableForeignKeyConstraints: false });
c1a.exec(`CREATE TABLE record (record_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, UNIQUE(record_id, subject_id));
CREATE TABLE source_document (document_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, UNIQUE(document_id, subject_id));
CREATE TABLE record_revision (revision_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, subject_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_kind TEXT NOT NULL, source_document_id TEXT,
  FOREIGN KEY (record_id, subject_id) REFERENCES record(record_id, subject_id),
  FOREIGN KEY (source_document_id, subject_id) REFERENCES source_document(document_id, subject_id));
INSERT INTO record VALUES ('r1','s1'); INSERT INTO source_document VALUES ('d1','s1'),('d2','s2');`);
const c1b = openDb(uri);
const c1aRes = attempt(() => c1a.prepare('INSERT INTO record_revision VALUES (?,?,?,?,?,?)')
  .run('c1', 'r1', 's1', 1, 'document', 'd2'));
const c1bRes = attempt(() => c1b.prepare('INSERT INTO record_revision VALUES (?,?,?,?,?,?)')
  .run('c2', 'r1', 's1', 1, 'document', 'd2'));
add('C', 'C1', '共享内存双连接：A 关 FK 写入，B 开 FK 复查', 'info', c1bRes,
  `A(关FK) 写入=${c1aRes.ok ? 'accepted' : 'rejected'}, ` +
  `B(开FK) 写入=${c1bRes.ok ? 'accepted' : 'rejected'}, ` +
  `B.fk_check=${c1b.prepare('PRAGMA foreign_key_check').all().length} 行（A 写进的跨主体行）`);

// C2：触发器方案（不新增列）。
db = makeCurrent();
db.exec(`
CREATE TRIGGER rev_cross_subject_ins BEFORE INSERT ON record_revision
WHEN NEW.source_document_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM source_document WHERE document_id = NEW.source_document_id)
  AND (SELECT subject_id FROM record WHERE record_id = NEW.record_id)
      IS NOT (SELECT subject_id FROM source_document WHERE document_id = NEW.source_document_id)
BEGIN SELECT RAISE(ABORT, 'cross_subject_reference'); END;`);
add('C', 'C2', '触发器：跨主体 INSERT', 'info',
  attempt(() => insCur(db, { source_kind: 'document', source_document_id: 'd2' })),
  '无新增列即可拒绝');
db.exec('PRAGMA foreign_keys = OFF');
add('C', 'C3', '触发器 + FK=OFF：跨主体 INSERT', 'info',
  attempt(() => insCur(db, { source_kind: 'document', source_document_id: 'd2' })),
  '触发器不受 foreign_keys pragma 影响');
add('C', 'C4', '触发器只护子表：改 record.subject_id', 'info',
  attempt(() => db.prepare("UPDATE record SET subject_id='s2' WHERE record_id='r1'").run()),
  '父表改名不被子表触发器拦截，仍需父表触发器/复合 FK');

// C5：迁移可行性与 append-only 冲突。
db = makeCurrent();
insCur(db, { source_kind: 'document', source_document_id: 'd1' });
insCur(db, { source_kind: 'document', source_document_id: 'd2' }); // 跨主体旧数据
add('C', 'C5', '现表 ADD COLUMN subject_id TEXT（可空）', 'info',
  attempt(() => db.exec('ALTER TABLE record_revision ADD COLUMN subject_id TEXT')),
  '可空列能加，但加不了复合 FK');
add('C', 'C6', '回填 UPDATE subject_id', 'info',
  attempt(() => db.prepare("UPDATE record_revision SET subject_id=(SELECT subject_id FROM record WHERE record_id=record_revision.record_id)").run()),
  'append-only 触发器 ABORT，无法用 UPDATE 回填');

// C7/C8：重建 + INSERT..SELECT，FK=ON 与 FK=OFF 两种迁移路径。
function rebuildAttempt(fkOn) {
  const d = makeCurrent();
  insCur(d, { source_kind: 'document', source_document_id: 'd1' });
  insCur(d, { source_kind: 'document', source_document_id: 'd2' });
  d.exec('CREATE UNIQUE INDEX ux_src_doc_subject ON source_document(document_id, subject_id);');
  d.exec(`CREATE TABLE record_revision_v2 (
    revision_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, subject_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
    source_kind TEXT NOT NULL, source_text TEXT, source_document_id TEXT, privacy_state TEXT NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY (record_id, subject_id) REFERENCES record(record_id, subject_id),
    FOREIGN KEY (source_document_id, subject_id) REFERENCES source_document(document_id, subject_id));`);
  d.exec(`PRAGMA foreign_keys = ${fkOn ? 'ON' : 'OFF'}`);
  const ins = attempt(() => d.exec(`INSERT INTO record_revision_v2
    SELECT r.revision_id, r.record_id, rec.subject_id, r.revision_no, r.source_kind, r.source_text,
           r.source_document_id, r.privacy_state, r.created_at
    FROM record_revision r JOIN record rec ON rec.record_id = r.record_id;`));
  return { ins, check: d.prepare('PRAGMA foreign_key_check').all(), n: d.prepare('SELECT count(*) n FROM record_revision_v2').get().n };
}
const rOn = rebuildAttempt(true);
const rOff = rebuildAttempt(false);
add('C', 'C7', '重建表 + INSERT..SELECT（FK=ON）', 'info', rOn.ins,
  `迁移直接拒绝跨主体旧行（迁移成功行数=${rOn.n}）`);
add('C', 'C8', '重建表 + INSERT..SELECT（FK=OFF）', 'info', rOff.ins,
  `写入 ${rOff.n} 行，foreign_key_check 报 ${rOff.check.length} 行 → 必须判 0 才 COMMIT`);
add('C', 'C9', '驱动默认值：node:sqlite vs C 库', 'info', { ok: true },
  `node:sqlite enableForeignKeyConstraints 默认 true（本机=${openDb(':memory:').prepare('PRAGMA foreign_keys').get().foreign_keys}）；C 库默认 0，合同“每连接 PRAGMA”仍成立`);

// C11：父表 subject 不可变触发器，补 C4 缺口。
db = makeCurrent();
insCur(db, { source_kind: 'document', source_document_id: 'd1' });
db.exec(`CREATE TRIGGER record_subject_immutable BEFORE UPDATE OF subject_id ON record
BEGIN SELECT RAISE(ABORT, 'subject_immutable'); END;
CREATE TRIGGER doc_subject_immutable BEFORE UPDATE OF subject_id ON source_document
BEGIN SELECT RAISE(ABORT, 'subject_immutable'); END;`);
const c11a = attempt(() => db.prepare("UPDATE record SET subject_id='s2' WHERE record_id='r1'").run());
const c11b = attempt(() => db.prepare("UPDATE source_document SET subject_id='s2' WHERE document_id='d1'").run());
const c11both = !c11a.ok && !c11b.ok;
add('C', 'C11', '父表 subject 不可变触发器：改 record / 原件 subject', 'info',
  c11both
    ? { ok: false, errcode: 1811, msg: 'subject_immutable' }
    : { ok: true, msg: `record=${c11a.ok}, doc=${c11b.ok}` },
  '与 C2 子表触发器合起来，不加列也能在 FK=OFF 下闭合');

// C10：§9.7 迁移后不变量查询（两库同名表，直接复用）。
const q1 = makeCurrent();
q1.exec('PRAGMA foreign_keys = OFF');
insCur(q1, { source_kind: 'document', source_document_id: 'd2' });
const q2 = makeComposite();
q2.exec('PRAGMA foreign_keys = OFF');
insV2(q2, { source_kind: 'document', source_document_id: 'd2' });
const q3 = makeComposite();
insV2(q3, { source_kind: 'document', source_document_id: 'd1' });
add('C', 'C10', '§9.7 迁移后不变量查询', 'info', { ok: true },
  `现合同(含跨主体)=${q1.prepare(INV).all().length} 行, 复合(强制跨主体)=${q2.prepare(INV).all().length} 行, 复合(合法)=${q3.prepare(INV).all().length} 行`);

// ---------- 输出 ----------
console.log('# record_revision ↔ source_document 跨主体约束内存实验（独立探针，不接入常规 check）');
console.log(`# docs=${docsDisplay}  sha256(doc)=${docSha}  sqlite=${sqliteVersion}  node=${process.version}`);
console.log('# 只建 :memory:；不写 .sqlite；不访问网络；不修改仓库。');
console.log('# A=现合同 §9.3；B=复合外键原型（未用于生产）；C=诊断项（不判通过）。\n');

for (const r of rows) {
  const expect = r.expect === 'accept' ? 'accept' : r.expect === 'reject' ? 'reject' : 'info';
  const actual = r.res.ok ? 'accepted' : `rejected(${r.res.errcode ?? '?'})`;
  console.log(`[${r.id}] ${statusOf(r).padEnd(4)} expect=${expect.padEnd(6)} actual=${actual.padEnd(18)} ${r.desc}` +
    (r.note ? ` — ${r.note}` : ''));
}

console.log('\n关键消息（errcode / message）:');
for (const id of ['A5', 'B9', 'C2', 'C3', 'C6', 'B11', 'B12', 'B16', 'B17']) {
  const r = rows.find((x) => x.id === id);
  if (r) console.log(`  ${id}: errcode=${r.res.errcode ?? '-'} msg=${JSON.stringify(r.res.msg ?? 'accepted')}`);
}

const byGroup = (g) => rows.filter((r) => r.g === g && r.expect !== 'info');
for (const g of ['A', 'B']) {
  const counts = byGroup(g).reduce((m, r) => {
    const s = statusOf(r);
    m[s] = (m[s] ?? 0) + 1;
    return m;
  }, {});
  console.log(`\n${g} 组（合同期望）: PASS=${counts.PASS ?? 0} GAP=${counts.GAP ?? 0} FAIL=${counts.FAIL ?? 0}`);
}
const infoRows = rows.filter((r) => r.expect === 'info');
const infoByGroup = ['A', 'B', 'C']
  .map((g) => `${g}=${infoRows.filter((r) => r.g === g).length}`)
  .join(' ');
console.log(`诊断项合计: INFO=${infoRows.length}（${infoByGroup}；不计通过）`);

const reproduced = rows.filter((r) => statusOf(r) === 'GAP');
const unexpected = reproduced.filter((r) => !KNOWN_GAPS.has(r.id));
const closed = rows.filter((r) => KNOWN_GAPS.has(r.id) && statusOf(r) !== 'GAP');
const missingKnown = [...KNOWN_GAPS].filter((id) => !rows.some((r) => r.id === id));
const failed = rows.filter((r) => statusOf(r) === 'FAIL');

console.log(`\n已知缺口（GAP，复现）: ${reproduced.map((r) => r.id).join(', ') || '无'}`);
for (const r of reproduced) console.log(`  ${r.id}: ${r.desc}${r.note ? ` — ${r.note}` : ''}`);
if (closed.length) {
  console.log(`已登记缺口本次未复现（需复核 §11.2/Q-30 与基线）: ${closed.map((r) => r.id).join(', ')}`);
}
if (unexpected.length) {
  console.log(`意外缺口（不在基线）: ${unexpected.map((r) => r.id).join(', ')}`);
}
if (failed.length) {
  console.log(`FAIL（合同期望 accept 被拒）: ${failed.map((r) => r.id).join(', ')}`);
}
if (missingKnown.length) {
  console.log(`基线用例缺失（脚本自身不完整）: ${missingKnown.join(', ')}`);
}
console.log(`\n诊断项 ID（INFO，不判通过）: ${infoRows.map((r) => r.id).join(' ')}`);
console.log('已知限制：只执行 §9.3 一张表 + 最小 stub；不覆盖其余引用、真实迁移、导入、');
console.log('          命令层、授权、隐私传播、UI、并发、崩溃恢复或 Desktop 宿主。');
console.log('          B 组复合外键只是原型，未选定、未用于生产；C 组触发器/迁移只是诊断。');

let exitCode;
if (failed.length || unexpected.length || missingKnown.length || (reproduced.length && closed.length)) {
  exitCode = EXIT.DEVIATION;
} else if (reproduced.length) {
  exitCode = EXIT.KNOWN_GAP;
} else {
  exitCode = EXIT.OK;
}

console.log('');
if (exitCode === EXIT.DEVIATION) {
  console.log('结论：结果偏离基线（FAIL / 新缺口 / 基线用例变化），不能当作通过，也不是验收。');
} else if (exitCode === EXIT.KNOWN_GAP) {
  console.log('结论：本次按基线复现已登记缺口，缺口仍存在。Q-30 未关闭；');
  console.log('      这不是验收，不能作为“多 subject 隔离已成立”的证据。');
} else {
  console.log('结论：本次未复现已登记缺口（若文档/基线未同步更新，仍需复核）。');
  console.log('      Q-30 未关闭；这不是验收，不能作为“多 subject 隔离已成立”的证据。');
}
console.log(`退出码: ${exitCode}（0=未复现已登记缺口；1=已登记缺口复现；2=无法运行；3=偏离基线）`);

  process.exitCode = exitCode;
} catch (err) {
  console.error(`\n结果偏离基线：实验执行中断：${err.message}`);
  console.error('这不是验收。退出码 3。');
  process.exitCode = EXIT.DEVIATION;
} finally {
  closeAll();
}