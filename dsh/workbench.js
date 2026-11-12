/**
 * 领域服务：数据根 → 开库 → 播种 → 读模型 / 写入。
 *
 * 为什么单独一层：`dsh/index.js` 要 import Schemastery（宿主提供的 peer，本仓装不上），
 * 那一行会让整个入口不可单测。把可测逻辑放这里，入口只留 wiring。
 */
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openStore, closeStore, migrate } from './store.js'
import { seedDemoData, hasDemoData } from './demo.js'
import { DB_FILE } from '../lib/identity.js'
import { version } from '../lib/version.js'
import { createTrialService } from './trials.js'

const HERE = dirname(fileURLToPath(import.meta.url))

export class Workbench {
  /**
   * @param {object} options
   * @param {string} options.root 用户资料目录（必须由用户明确指定；调用方负责校验）
   * @param {boolean} [options.seedDemo] 首次打开是否写入演示档案（默认 true，仅空库生效）
   */
  constructor({ root, seedDemo = true } = {}) {
    if (typeof root !== 'string' || root.trim() === '') throw new Error('Workbench 需要 root（用户资料目录）')
    this.root = root
    this.dbFile = join(root, DB_FILE)
    this.db = null
    this.seedDemo = seedDemo
    this.trials = createTrialService({ packageDir: join(HERE, '..'), root })
  }

  /** 打开（幂等）。迁移与播种都在这里完成。 */
  open() {
    if (this.db) return this
    this.db = openStore(this.dbFile)
    this.migrations = migrate(this.db)
    /* 用户上次在面板里选过的资料目录优先于 cordis 的默认值（目录还在才生效）。
       少了这一步，「配置目录」选完重开 Desktop 又回到默认位置，等于没选。 */
    if (!this._rootApplied) {
      this._rootApplied = true
      try {
        const row = this.db.prepare("SELECT value FROM app_setting WHERE key='data_root'").get()
        if (row?.value && row.value !== this.root && existsSync(row.value)) {
          closeStore(this.db)
          this.root = row.value
          this.dbFile = join(this.root, DB_FILE)
          this.db = openStore(this.dbFile)
          this.migrations = migrate(this.db)
        }
      } catch { /* 旧库没有 app_setting 表也不该拦住打开 */ }
    }
    this.seeded = this.seedDemo ? seedDemoData(this.db) : { skipped: true, profiles: 0 }
    return this
  }

  get dataRoot() { return this.root }

  /**
   * 切换资料目录：先开新库成功再替换，失败回滚到原库（不能把用户的数据根弄丢）。
   * 目录合法性由调用方（服务端）校验；这里只保证「切不过去就退回去」。
   */
  setDataRoot(nextRoot) {
    this.open()
    const dir = String(nextRoot || '').trim()
    if (!dir || dir === this.root) return this.root
    const prevRoot = this.root
    const prevFile = this.dbFile
    closeStore(this.db)
    this.db = null
    try {
      this.dbFile = join(dir, DB_FILE)
      this.db = openStore(this.dbFile)
      this.migrations = migrate(this.db)
      this.root = dir
      this.db.prepare("INSERT INTO app_setting(key,value,updated_at) VALUES('data_root',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(dir)
      this.seeded = this.seedDemo ? seedDemoData(this.db) : { skipped: true, profiles: 0 }
      return this.root
    } catch (error) {
      this.root = prevRoot
      this.dbFile = prevFile
      try { this.db = openStore(this.dbFile) } catch { this.db = null }
      throw error
    }
  }

  /* ---------------- 患者档案 ---------------- */

  listProfiles() {
    this.open()
    return this.db.prepare('SELECT profile_key, name, meta, is_demo, created_on FROM subjects ORDER BY is_demo DESC, rowid').all()
      .map((r) => ({
        profileKey: r.profile_key,
        name: r.name,
        meta: r.meta || '',
        isDemo: Number(r.is_demo) === 1,
        createdOn: r.created_on,
      }))
  }

  /**
   * 新建患者档案（真实用户数据，不是 demo）。
   * profile_key 用 local-<时间戳>：不与 demo 的 a/b 撞键，也不依赖姓名（同名不同人是两个人）。
   */
  createSubject({ name, meta } = {}) {
    this.open()
    const cleanName = String(name || '').trim()
    if (!cleanName) throw new Error('请填写档案名（可以是昵称）')
    if (cleanName.length > 40) throw new Error('档案名太长（≤40 字）')
    const key = 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    this.db.prepare('INSERT INTO subjects (profile_key, name, meta, is_demo, created_on) VALUES (?,?,?,0,?)')
      .run(key, cleanName, String(meta || '').trim() || '我自己记录', new Date().toISOString().slice(0, 10))
    return { profileKey: key, name: cleanName }
  }

  deleteSubject(profileKey) {
    this.open()
    const key = String(profileKey || '')
    const row = this.db.prepare('SELECT profile_key, is_demo FROM subjects WHERE profile_key = ?').get(key)
    if (!row) throw new Error('档案不存在')
    if (Number(row.is_demo) === 1) throw new Error('演示档案不删除；只能删自己建的档案')
    this.db.prepare('DELETE FROM subjects WHERE profile_key = ?').run(key)
    return { deleted: key }
  }

  getRecords(profileKey) {
    this.open()
    const row = this.db.prepare('SELECT records_json FROM subject_records WHERE profile_key = ?').get(String(profileKey || ''))
    if (!row) return { records: [], updatedAt: null }
    let records = []
    try { records = JSON.parse(row.records_json) } catch { records = [] }
    return { records: Array.isArray(records) ? records : [], updatedAt: null }
  }

  /**
   * 整包保存记录。只接受数组；每条至少要有 id 与 kind（与原型记录形状一致）。
   * 不在这里做医学判读，也不生成派生值。
   */
  saveRecords(profileKey, records) {
    this.open()
    const key = String(profileKey || '')
    const row = this.db.prepare('SELECT profile_key FROM subjects WHERE profile_key = ?').get(key)
    if (!row) throw new Error('档案不存在')
    if (!Array.isArray(records)) throw new Error('records 必须是数组')
    if (records.length > 5000) throw new Error('记录过多（上限 5000 条）')
    const cleaned = records.map((r) => {
      if (!r || typeof r !== 'object') throw new Error('记录必须是对象')
      if (r.id === undefined || r.id === null || String(r.id) === '') throw new Error('记录缺少 id')
      if (!r.kind) throw new Error('记录缺少 kind')
      return r
    })
    const json = JSON.stringify(cleaned)
    if (Buffer.byteLength(json, 'utf8') > 8 * 1024 * 1024) throw new Error('记录体积过大（上限 8MB）')
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO subject_records(profile_key, records_json, updated_at) VALUES(?,?,?)
      ON CONFLICT(profile_key) DO UPDATE SET records_json=excluded.records_json, updated_at=excluded.updated_at`)
      .run(key, json, now)
    return { saved: cleaned.length, updatedAt: now }
  }

  /* ---------------- 试验匹配基础档案 ---------------- */

  getTrialProfile(profileKey) {
    this.open()
    const row = this.db.prepare('SELECT * FROM trial_profile WHERE profile_key = ?').get(String(profileKey || ''))
    if (!row) return null
    return {
      age: row.age,
      sex: row.sex,
      diagnosisConfirmed: row.diagnosis_confirmed === null ? null : Number(row.diagnosis_confirmed) === 1,
      organs: row.organs_json ? JSON.parse(row.organs_json) : [],
      meds: row.meds_json ? JSON.parse(row.meds_json) : [],
      pregnant: row.pregnant,
      note: row.note || '',
      updatedAt: row.updated_at,
    }
  }

  saveTrialProfile(profileKey, input = {}) {
    this.open()
    const key = String(profileKey || '')
    const row = this.db.prepare('SELECT profile_key FROM subjects WHERE profile_key = ?').get(key)
    if (!row) throw new Error('档案不存在')
    const age = input.age === '' || input.age === null || input.age === undefined ? null : Number(input.age)
    if (age !== null && (!Number.isFinite(age) || age < 0 || age > 120)) throw new Error('年龄需在 0–120 之间')
    const sex = ['female', 'male'].includes(input.sex) ? input.sex : null
    const diagnosisConfirmed = input.diagnosisConfirmed === true ? 1 : input.diagnosisConfirmed === false ? 0 : null
    const organs = Array.isArray(input.organs) ? input.organs.map(String).filter(Boolean).slice(0, 20) : []
    const meds = Array.isArray(input.meds) ? input.meds.map(String).filter(Boolean).slice(0, 50) : []
    const pregnant = ['yes', 'no'].includes(input.pregnant) ? input.pregnant : null
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO trial_profile(profile_key,age,sex,diagnosis_confirmed,organs_json,meds_json,pregnant,note,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(profile_key) DO UPDATE SET age=excluded.age, sex=excluded.sex, diagnosis_confirmed=excluded.diagnosis_confirmed,
        organs_json=excluded.organs_json, meds_json=excluded.meds_json, pregnant=excluded.pregnant, note=excluded.note, updated_at=excluded.updated_at`)
      .run(key, age, sex, diagnosisConfirmed, JSON.stringify(organs), JSON.stringify(meds), pregnant, String(input.note || '').slice(0, 500), now)
    return this.getTrialProfile(key)
  }

  /* ---------------- 试验收藏 ---------------- */

  savedTrials(profileKey) {
    this.open()
    return this.db.prepare('SELECT * FROM saved_trial WHERE profile_key = ? ORDER BY saved_at DESC, rowid DESC').all(String(profileKey || ''))
      .map(mapSaved)
  }

  saveTrial(profileKey, rec = {}) {
    this.open()
    const id = String(rec.recordId || '').trim()
    if (!id) throw new Error('缺少 recordId')
    this.db.prepare(`INSERT INTO saved_trial(profile_key,record_id,title,study_type,status,phase,source_url,snapshot_date)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(profile_key, record_id) DO UPDATE SET
        title=excluded.title, study_type=excluded.study_type, status=excluded.status, phase=excluded.phase,
        source_url=excluded.source_url, snapshot_date=excluded.snapshot_date, saved_at=datetime('now')`)
      .run(String(profileKey || ''), id, rec.title ?? null, rec.studyType ?? null, rec.status ?? null, rec.phase ?? null, rec.sourceUrl ?? null, rec.snapshotDate ?? null)
    return this.savedTrials(profileKey)
  }

  removeTrial(profileKey, recordId) {
    this.open()
    this.db.prepare('DELETE FROM saved_trial WHERE profile_key = ? AND record_id = ?').run(String(profileKey || ''), String(recordId || ''))
    return this.savedTrials(profileKey)
  }

  /* ---------------- 读模型 ---------------- */

  bootstrap() {
    this.open()
    const profiles = this.listProfiles()
    return {
      version,
      profiles,
      demo: profiles.filter((p) => p.isDemo),
      real: profiles.filter((p) => !p.isDemo),
      dataRoot: this.root,
      trialSnapshot: this.trials.summary(),
      today: new Date().toISOString().slice(0, 10),
    }
  }

  close() {
    if (this.db) { closeStore(this.db); this.db = null }
  }

  get stats() {
    if (!this.db) return null
    const subjects = this.db.prepare('SELECT COUNT(*) c FROM subjects').get().c
    const real = this.db.prepare('SELECT COUNT(*) c FROM subjects WHERE is_demo = 0').get().c
    const saved = this.db.prepare('SELECT COUNT(*) c FROM saved_trial').get().c
    const withRecords = this.db.prepare('SELECT COUNT(*) c FROM subject_records').get().c
    return { profiles: subjects, realProfiles: real, savedTrials: saved, profilesWithRecords: withRecords, hasDemo: hasDemoData(this.db) }
  }

  status() {
    return {
      version,
      root: this.root,
      dbFile: DB_FILE,
      capabilities: ['bootstrap', 'subjects', 'records', 'trial-profile', 'trials', 'saved-trials', 'data-root'],
      stats: this.stats,
      seeded: this.seeded ?? null,
      migrations: this.migrations ?? null,
    }
  }

  trialSearch(query) { return this.trials.search(query) }
  trialMatch(profileKey, query) { return this.trials.match(this.getTrialProfile(profileKey), query) }
}

function mapSaved(r) {
  return {
    recordId: r.record_id,
    title: r.title,
    studyType: r.study_type,
    status: r.status,
    phase: r.phase,
    sourceUrl: r.source_url,
    snapshotDate: r.snapshot_date,
    savedAt: r.saved_at,
  }
}