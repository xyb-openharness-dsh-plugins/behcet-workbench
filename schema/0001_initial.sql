/* 白塞病工作台 · 初始数据模型（0001，冻结后只增不改）
 *
 * 设计口径：
 *   ① 用户真实数据与合成 demo 同表不同行：subjects.is_demo 区分，demo 永不覆盖用户档案；
 *   ② 未知就是 NULL：年龄、性别、妊娠状态没填就不写默认值，匹配时按「待确认」处理；
 *   ③ 记录本体按原型同一形状存 JSON（subject_records），派生指标/评分不入库——
 *      评分只在请求时计算并返回，避免变成"判定列"；
 *   ④ 试验收藏只存 {记录号, 标题, 登记元信息, 收藏时间}，零副作用；
 *   ⑤ app_setting 存用户选过的资料目录，重开 Desktop 时优先于 cordis 默认值。
 *
 * 迁移只增不改：要加结构只能新增 0002_*.sql。
 */

/* ---------- 患者档案 ---------- */

CREATE TABLE subjects (
  profile_key   TEXT PRIMARY KEY,           -- demo 用 a/b；真实档案用 local-<时间戳>
  name          TEXT NOT NULL,
  meta          TEXT,                       -- 第二行说明（确诊时间 / 随访阶段，可为空）
  is_demo       INTEGER NOT NULL DEFAULT 0, -- 1 = 合成示例；新建档案恒为 0
  created_on    TEXT NOT NULL
);

/* 记录集合：一行 = 一个档案的完整记录数组（与原型 state.records 同形状）。
 * 为什么整包存：原型是记录的唯一渲染源，逐条拆表会逼前端维护两套模型；
 * 这里只负责"用户写的东西真的落盘"，派生值仍由前端读时计算。 */
CREATE TABLE subject_records (
  profile_key   TEXT PRIMARY KEY REFERENCES subjects(profile_key) ON DELETE CASCADE,
  records_json  TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL
);

/* ---------- 临床试验匹配用的基础档案 ----------
 * 只有用户在这里明确填写的字段参与匹配；NULL = 待确认，不按阴性/符合计。
 * 靶点/药物机制不进这张表（35 号 §七.2：药物靶点不是"我查出什么"）。
 */
CREATE TABLE trial_profile (
  profile_key         TEXT PRIMARY KEY REFERENCES subjects(profile_key) ON DELETE CASCADE,
  age                 INTEGER,
  sex                 TEXT,                 -- female / male / NULL
  diagnosis_confirmed INTEGER,              -- 1 / 0 / NULL
  organs_json         TEXT,                 -- JSON 数组：口腔/生殖器/皮肤/眼/关节/血管/神经/消化道
  meds_json           TEXT,                 -- JSON 数组：用户填写的当前/既往用药原文
  pregnant            TEXT,                 -- yes / no / NULL（未填即未知）
  note                TEXT,
  updated_at          TEXT NOT NULL
);

/* ---------- 临床试验收藏（saved_trial） ---------- */

CREATE TABLE saved_trial (
  profile_key   TEXT NOT NULL,
  record_id     TEXT NOT NULL,              -- NCT 号
  title         TEXT,
  study_type    TEXT,
  status        TEXT,
  phase         TEXT,
  source_url    TEXT,
  snapshot_date TEXT,
  saved_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_key, record_id)
);

/* ---------- 设置 ---------- */

CREATE TABLE app_setting (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT
);