/**
 * 合成示例档案播种：只建两条 subjects 行，**不复制记录**。
 *
 * 为什么记录仍留在前端 demo-data.js：原型的两套合成档案（A 长病程 / B 短病程）是
 * 已评审的演示语料，服务端再存一份就会出现两个事实源。这里只登记"演示档案存在"，
 * 前端按 profile_key=a/b 时继续用自带合成记录；新建的真实档案才走 subject_records。
 */

const DEMO = [
  { key: 'a', name: '示例组 A · 长病程', meta: '合成示例 · 刷新后回到默认组' },
  { key: 'b', name: '示例组 B · 短病程', meta: '合成示例 · 与 A 相互独立' },
]

/** 幂等：已有 a/b 就不动；返回本轮新插入条数。 */
export function seedDemoData(db) {
  let inserted = 0
  const now = new Date().toISOString().slice(0, 10)
  for (const item of DEMO) {
    const exists = db.prepare('SELECT profile_key FROM subjects WHERE profile_key = ?').get(item.key)
    if (exists) continue
    db.prepare('INSERT INTO subjects (profile_key, name, meta, is_demo, created_on) VALUES (?,?,?,1,?)')
      .run(item.key, item.name, item.meta, now)
    inserted++
  }
  return { inserted, profiles: DEMO.length }
}

/** 库里有几条档案（含 demo）。 */
export function hasDemoData(db) {
  return db.prepare('SELECT COUNT(*) c FROM subjects').get().c > 0
}