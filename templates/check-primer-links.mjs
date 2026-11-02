#!/usr/bin/env node
/**
 * 36 号 §2.5 链接断言（通用版 · 自动识别活动原型）
 *
 * 2026-10-27 升级（starter 1.10.0-rc.2）：上一版只验「有没有 https 链接」，
 * 于是四行「未取得原件，据二次来源」各挂一个学会首页也能 17/17 全绿——闸门绿了，内容不合格。
 * 本版加三件事：
 *   ① 原件必须声明 `kind`（pdf / fulltext / registry / dataset），hub（栏目页）不得配 original:true；
 *   ② 静态形状校验：kind=pdf 的链接必须真像 PDF；
 *   ③ `--http` 实测内容类型：pdf 拿到 text/html = 典型的「登录页/反爬页冒充 PDF」，直接判 FAIL。
 *
 * 用法：
 *   node scripts/check-primer-links.mjs                    # 静态断言（默认，不联网）
 *   node scripts/check-primer-links.mjs --http             # 追加联网实测（含 content-type）
 *   node scripts/check-primer-links.mjs --legacy           # 存量项目：缺 kind 只告警不判失败
 *   node scripts/check-primer-links.mjs --self-test        # 反向对照：每条规则必须能报 FAIL
 *
 * 退出码：0 全过（可有 WARN）；1 有 FAIL；2 环境/输入问题。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const HTTP = args.includes('--http')
const LEGACY = args.includes('--legacy')
const SELF_TEST = args.includes('--self-test')
const TIMEOUT = Number(argOf('--timeout') || 20000)

/* 原件类型：只有前四类能算「原件」，hub 是栏目页 */
const KINDS = new Set(['pdf', 'fulltext', 'registry', 'dataset'])
const ALL_KINDS = new Set([...KINDS, 'hub'])

function pickData() {
  const explicit = argOf('--data')
  if (explicit) return resolve(ROOT, explicit)
  const pd = join(ROOT, 'prototypes')
  if (!existsSync(pd)) return null
  const dirs = readdirSync(pd).filter(d => existsSync(join(pd, d, 'primer-data.js')))
  dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return dirs.length ? join(pd, dirs[dirs.length - 1], 'primer-data.js') : null
}

const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u)
const isBare = (u) => { try { const p = new URL(u); return (p.pathname === '/' || p.pathname === '') && !p.search && !p.hash } catch { return true } }
const looksPdf = (u) => /\.pdf(\?|#|$)/i.test(String(u || ''))

function checkUrl(u, kind) {
  if (!isHttps(u)) return '必须是 https:// 链接'
  if (isBare(u)) return '不能只给域名首页'
  if (kind === 'pdf' && !looksPdf(u)) return `kind=pdf 但链接不像 PDF（形如 https://…/xxx.pdf）`
  return null
}

/* 规则引擎：给定一份 primer 数据，返回 oks / fails / warns。self-test 复用同一套。 */
function evaluate(primer, { legacy = false } = {}) {
  const oks = [], fails = [], warns = []
  let checked = 0

  const judgeKind = (at, kind, original) => {
    checked++
    if (kind == null || kind === '') {
      if (original) (legacy ? warns : fails).push(`L7 ${at} 原件未声明 kind（pdf / fulltext / registry / dataset），无法判断链接是不是文件本身`)
      return false
    }
    if (!ALL_KINDS.has(kind)) { fails.push(`L7 ${at} kind=「${kind}」不在词表（pdf / fulltext / registry / dataset / hub）`); return false }
    if (original && kind === 'hub') { fails.push(`L9 ${at} kind=hub（栏目页）却标了 original:true——栏目页不是原件`); return false }
    if (original && KINDS.has(kind)) oks.push(`L7 ${at} kind=${kind}`)
    return true
  }

  for (const sec of primer.sections || []) {
    for (const [i, s] of (sec.sources || []).entries()) {
      const at = `${sec.id}.sources[${i}]（${s.org || '?'}）`
      if (s.nolink) {
        checked++
        s.note ? oks.push(`L4 ${at} nolink 有说明`) : fails.push(`L4 ${at} nolink 缺 note`)
        continue
      }
      const need = s.original === true ? 'url' : s.original === false ? 'secondaryUrl' : null
      if (!need) continue
      checked++
      if (s.original === true) {
        judgeKind(at, s.kind, true)
        const err = checkUrl(s.url, s.kind)
        err ? fails.push(`L1 ${at} ${err}`) : oks.push(`L1 ${at} ✓`)
      } else {
        const err = checkUrl(s.secondaryUrl, null)
        err ? fails.push(`L2 ${at} ${err}`) : oks.push(`L2 ${at} 二次来源 ✓`)
      }
    }

    const head = sec.table?.head || []
    const col = head.findIndex(x => /原件/.test(x))
    if (col < 0) continue
    for (const [i, row] of (sec.table?.rows || []).entries()) {
      const at = `${sec.id}.table[${i}]`
      const cell = row[col]
      checked++
      if (!cell || typeof cell !== 'object' || Array.isArray(cell)) {
        fails.push(`L3 ${at} 原件列是纯文字「${String(cell).slice(0, 24)}」`)
        continue
      }
      if (cell.nolink) {
        cell.note ? oks.push(`L4 ${at} nolink 有说明`) : fails.push(`L4 ${at} nolink 缺 note`)
        continue
      }
      judgeKind(at, cell.kind, true)
      const err = checkUrl(cell.url, cell.kind)
      err ? fails.push(`L3 ${at} 原件列 ${err}`) : oks.push(`L3 ${at} ✓`)
    }
  }
  return { oks, fails, warns, checked }
}

/* ---------- 联网实测：内容类型才是「是不是文件本身」的唯一硬证据 ---------- */
async function probeHttp(primer, res) {
  const targets = []
  for (const sec of primer.sections || []) {
    for (const [i, s] of (sec.sources || []).entries()) {
      const u = s.original === true ? s.url : s.secondaryUrl
      if (u && isHttps(u)) targets.push({ at: `${sec.id}.sources[${i}]`, url: u, kind: s.kind })
    }
    const head = sec.table?.head || []
    const col = head.findIndex(x => /原件/.test(x))
    if (col < 0) continue
    for (const [i, row] of (sec.table?.rows || []).entries()) {
      const c = row[col]
      if (c && typeof c === 'object' && c.url && isHttps(c.url)) targets.push({ at: `${sec.id}.table[${i}]`, url: c.url, kind: c.kind })
    }
  }
  const seen = new Map()
  for (const t of targets) if (!seen.has(t.url)) seen.set(t.url, t)

  for (const [url, t] of seen) {
    let r
    try {
      const ctl = AbortSignal.timeout(TIMEOUT)
      r = await fetch(url, { redirect: 'follow', signal: ctl, headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } })
    } catch (e) {
      res.warns.push(`L11 ${t.at} 网络不可达（${String(e.message).slice(0, 60)}）——不算通过，需人工点开`)
      continue
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    const cd = (r.headers.get('content-disposition') || '').toLowerCase()
    const st = r.status
    if (st === 404 || st === 410) { res.fails.push(`L11 ${t.at} HTTP ${st} — 死链`); continue }
    if (st === 403 || st === 429 || st >= 500) { res.warns.push(`L11 ${t.at} HTTP ${st} — 反爬/服务端拦脚本，浏览器或可开，需人工确认`); continue }
    if (st >= 400) { res.fails.push(`L11 ${t.at} HTTP ${st}`); continue }
    if (t.kind === 'pdf' && !ct.includes('application/pdf') && !cd.includes('.pdf')) {
      res.fails.push(`L10 ${t.at} kind=pdf 但拿到 ${ct || '未知类型'}${ct.includes('text/html') ? ' — 大概率是登录页/反爬页冒充 PDF' : ''}`)
      continue
    }
    res.oks.push(`L10 ${t.at} HTTP ${st}${t.kind === 'pdf' ? ' · application/pdf' : ''}`)
  }
}

/* ---------- 反向对照：每条规则都必须能 FAIL，只报绿的闸门等于没有闸门 ---------- */
const FIXTURES = [
  { name: '纯文字原件列', data: { sections: [{ id: 'e', table: { head: ['机构', '原件'], rows: [['X', '未取得原件，据二次来源']] } }] }, expect: 'L3' },
  { name: '栏目页充当原件', data: { sections: [{ id: 'e', sources: [{ org: 'X', original: true, kind: 'hub', url: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1414' }] }] }, expect: 'L9' },
  { name: '原件未声明 kind', data: { sections: [{ id: 'e', sources: [{ org: 'X', original: true, url: 'https://www.nccn.org/patients/guidelines/content/PDF/anal-patient.pdf' }] }] }, expect: 'L7' },
  { name: 'kind=pdf 但链接不是 pdf', data: { sections: [{ id: 'e', sources: [{ org: 'X', original: true, kind: 'pdf', url: 'https://www.nccn.org/professionals/physician_gls/pdf/anal' }] }] }, expect: 'L1' },
  { name: 'http 而非 https', data: { sections: [{ id: 'e', sources: [{ org: 'X', original: false, secondaryUrl: 'http://example.com/a' }] }] }, expect: 'L2' },
  { name: '只给域名首页', data: { sections: [{ id: 'e', sources: [{ org: 'X', original: true, kind: 'fulltext', url: 'https://www.esmo.org/' }] }] }, expect: 'L1' },
  { name: 'nolink 缺 note', data: { sections: [{ id: 'e', sources: [{ org: 'X', original: true, nolink: true }] }] }, expect: 'L4' }
]

function selfTest() {
  let bad = 0
  for (const f of FIXTURES) {
    const r = evaluate(f.data, { legacy: false })
    const hit = r.fails.some(x => x.startsWith(f.expect))
    console.log(`${hit ? 'PASS' : 'FAIL'}  self-test · ${f.name} → 期望 ${f.expect}`)
    if (!hit) { bad++; console.log(`      实得：${r.fails.join(' | ') || '（无 FAIL）'}`) }
  }
  /* 正向对照：一份合规数据必须全过，否则闸门只会乱报红 */
  const good = { sections: [{ id: 'e', sources: [{ org: 'NCCN', original: true, kind: 'pdf', url: 'https://www.nccn.org/patients/guidelines/content/PDF/anal-patient.pdf' }] }] }
  const gr = evaluate(good, { legacy: false })
  const okClean = gr.fails.length === 0
  console.log(`${okClean ? 'PASS' : 'FAIL'}  self-test · 合规数据全过`)
  if (!okClean) { bad++; console.log(`      误报：${gr.fails.join(' | ')}`) }
  console.log(`\n${bad ? '✗' : '✓'} self-test：${FIXTURES.length + 1} 条，${FIXTURES.length + 1 - bad} 通过`)
  process.exit(bad ? 1 : 0)
}

async function main() {
  if (SELF_TEST) return selfTest()

  const DATA = pickData()
  if (!DATA) {
    /* 新项目在写出 primer-data.js 之前必然没有这个文件：跳过而不是报错，
       否则 check 从第一天就是红的（starter 约定：check 从第一天就该是绿的）。 */
    console.log('SKIP  未找到 prototypes/*/primer-data.js（尚未引入 36 号疾病概要）')
    process.exit(0)
  }
  const sandbox = {}
  try { new Function('window', readFileSync(DATA, 'utf8'))(sandbox.window = {}) } catch (e) { console.error(`✗ primer-data.js 求值失败：${e.message}`); process.exit(2) }
  const primer = sandbox.window.DISEASE_PRIMER
  if (!primer) { console.error('✗ 没有设置 window.DISEASE_PRIMER'); process.exit(2) }

  const res = evaluate(primer, { legacy: LEGACY })
  if (HTTP) await probeHttp(primer, res)

  for (const o of res.oks) console.log(`PASS  ${o}`)
  for (const w of res.warns) console.log(`WARN  ${w}`)
  for (const f of res.fails) console.log(`FAIL  ${f}`)
  const tail = res.warns.length ? `，${res.warns.length} 待人工确认` : ''
  console.log(`\n${res.fails.length ? '✗' : '✓'} 链接断言：${res.checked} 项结构 + ${HTTP ? '联网实测' : '未联网'}，${res.oks.length} 通过，${res.fails.length} 失败${tail}`)
  if (LEGACY) console.log('  注意：--legacy 模式下「缺 kind」只告警；新项目与本轮动到的页必须补齐 kind。')
  process.exit(res.fails.length ? 1 : 0)
}

main()