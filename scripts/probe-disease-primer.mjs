#!/usr/bin/env node
/**
 * 36 号 疾病概要（「?」入口）· P1–P9 验收探针
 *
 * 对象：examples/disease-primer.html（脚手架自带的参考实现）
 * 判据：docs/36-DISEASE-PRIMER.md §5，每条都要能 FAIL——只报绿不报红的闸门等于没有闸门。
 *
 * 用法：
 *   node scripts/probe-disease-primer.mjs
 *   node scripts/probe-disease-primer.mjs --url http://127.0.0.1:8124/...   # 指定页面
 *   node scripts/probe-disease-primer.mjs --self-test                       # 注入缺陷，闸门必须报 FAIL
 *
 * 依赖：puppeteer-core（家族 workspace 已装）+ 本机 Chrome。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const SELF_TEST = args.includes('--self-test')
const PORT = Number(argOf('--port') || 8124)

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' }

function serve() {
  return new Promise((res) => {
    const server = createServer(async (req, rsp) => {
      const path = decodeURIComponent((req.url || '/').split('?')[0])
      if (path === '/favicon.ico') { rsp.writeHead(204).end(); return }
      const file = join(ROOT, normalize(path).replace(/^([/\\])+/, ''))
      if (!file.startsWith(ROOT)) { rsp.writeHead(403).end(); return }
      try {
        const body = await readFile(file)
        rsp.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body)
      } catch { rsp.writeHead(404).end('not found') }
    })
    server.listen(PORT, '127.0.0.1', () => res(server))
  })
}

function findChrome() {
  const cands = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean)
  return cands.find((p) => existsSync(p)) || null
}

const results = []
const check = (id, name, ok, detail = '') => {
  results.push({ id, name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? '  — ' + detail : ''}`)
}

/* 趋势段禁止词（docs/36-DISEASE-PRIMER.md §2.3） */
const BANNED = ['有望', '即将', '前景', '未来可期', '突破性', '颠覆', '革命性', '首选', '优于', '疗效更好', '建议使用', '强烈推荐', '治愈率', '生存期延长', '大幅提高', '迎来新选择']

/* 缺陷注入分两处：
 *   ① 面板打开后注入「小弹窗 + 删掉返回入口」（打 P3 / P5）；
 *   ② P8 前注入趋势段禁止词（打 P8）。
 * 之所以不能一次性在 load 时注入：面板 DOM 是在第一次 open 时建的，提前删等于没删。 */
async function injectRuntimeDefects(page) {
  await page.addStyleTag({ content: '.dp-panel{inset:auto !important;width:520px !important;height:420px !important;left:20px !important;top:20px !important}' })
  await page.evaluate(() => { const b = document.querySelector('[data-dp="back"]'); if (b) b.remove() })
}

async function injectDataDefect(page) {
  await page.evaluate(() => {
    const d = window.DISEASE_PRIMER
    if (!d) return
    const t = d.sections.find((s) => s.id === 'trend')
    if (t) { t.points = (t.points || []).concat(['未来可期，有望迎来新的治疗选择。']) }
  })
}

async function main() {
  const chrome = findChrome()
  if (!chrome) { console.log('找不到 Chrome：设置 CHROME_PATH 后重试。跳过等于没有这条闸门。'); process.exit(2) }
  let puppeteer
  try {
    const require = createRequire('/Users/qinxiaoqiang/.workbuddy/binaries/node/workspace/')
    puppeteer = require('puppeteer-core')
  } catch {
    console.log('缺少 puppeteer-core（家族 workspace 未装，或本机路径不同）。跳过等于没有这条闸门。')
    process.exit(2)
  }

  const server = await serve()
  const base = argOf('--url') || `http://127.0.0.1:${PORT}/examples/disease-primer.html`
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--proxy-server=' + (process.env.http_proxy || 'http://127.0.0.1:7890')]
  })

  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.setViewport({ width: 1280, height: 860 })
    await page.goto(base, { waitUntil: 'networkidle0' })

    /* ---------- P1 触发按钮 ---------- */
    const trig = await page.evaluate(() => {
      const b = document.querySelector('[data-primer-open]')
      if (!b) return null
      const label = b.getAttribute('aria-label') || ''
      return { text: (b.textContent || '').trim(), label, visible: b.getBoundingClientRect().width > 0 }
    })
    check('P1', '顶栏存在可点的「?」，aria-label 说明四段内容', !!trig && trig.visible && /定义/.test(trig.label) && /趋势/.test(trig.label),
      trig ? `text="${trig.text}" label="${trig.label.slice(0, 40)}"` : '找不到 [data-primer-open]')

    /* 先把页面滚一段，供 P6 验证「关掉回原位」 */
    await page.evaluate(() => window.scrollTo(0, 260))
    const scrollBefore = await page.evaluate(() => window.scrollY | 0)

    /* ---------- 打开 ---------- */
    await page.evaluate((sel) => document.querySelector(sel)?.click(), '[data-primer-open]')
    await new Promise((r) => setTimeout(r, 260))
    if (SELF_TEST) await injectRuntimeDefects(page)

    const opened = await page.evaluate(() => {
      const el = document.querySelector('.dp-overlay')
      return { visible: !!el && !el.hidden, open: !!(window.DiseasePrimer && window.DiseasePrimer.isOpen()) }
    })

    /* ---------- P2 四段齐全且顺序正确 ---------- */
    const secs = await page.evaluate(() => {
      const el = document.querySelector('.dp-overlay:not([hidden])')
      if (!el) return null
      return [...el.querySelectorAll('.dp-section')].map((s) => ({ id: s.dataset.dpSection, title: s.querySelector('h3')?.textContent.trim() }))
    })
    const wantOrder = ['definition', 'evidence', 'landscape', 'trend']
    const gotOrder = (secs || []).map((s) => s.id)
    check('P2', '四段标题齐全且顺序正确', opened.visible && gotOrder.join(',') === wantOrder.join(','),
      gotOrder.length ? gotOrder.join(' › ') : '面板未打开')

    /* ---------- P3 是整页不是弹窗 ---------- */
    const box = await page.evaluate(() => {
      const el = document.querySelector('.dp-overlay:not([hidden]) .dp-panel')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }
    })
    check('P3', '面板铺满视口（宽高均 ≥ 视口的 90%）',
      !!box && box.w >= box.vw * 0.9 && box.h >= box.vh * 0.9,
      box ? `${box.w}×${box.h} / 视口 ${box.vw}×${box.vh}` : '量不到面板')

    /* ---------- P4 history 是唯一真源 ---------- */
    const lenWithPanel = await page.evaluate(() => history.length)
    await page.evaluate(() => history.back())
    await new Promise((r) => setTimeout(r, 320))
    const afterBack = await page.evaluate(() => ({
      open: !!(window.DiseasePrimer && window.DiseasePrimer.isOpen()),
      hidden: document.querySelector('.dp-overlay')?.hidden !== false,
      hash: location.hash
    }))
    check('P4', '打开压一条 history；history.back() 后面板收起',
      lenWithPanel >= 2 && !afterBack.open && afterBack.hidden,
      `history.length=${lenWithPanel} · 返回后 open=${afterBack.open} hash="${afterBack.hash}"`)

    /* ---------- P5 返回与关闭是两个独立入口 ---------- */
    await page.evaluate((sel) => document.querySelector(sel)?.click(), '[data-primer-open]')
    await new Promise((r) => setTimeout(r, 220))
    const entrances = await page.evaluate(() => {
      const el = document.querySelector('.dp-overlay:not([hidden])')
      if (!el) return null
      const b = el.querySelector('[data-dp="back"]'), c = el.querySelector('[data-dp="close"]')
      const vis = (n) => n && n.getBoundingClientRect().width > 0
      return { back: vis(b), close: vis(c), sameNode: b === c }
    })
    check('P5', '「返回」与「关闭」是两个独立可见入口',
      !!entrances && entrances.back && entrances.close && !entrances.sameNode,
      entrances ? `back=${entrances.back} close=${entrances.close} same=${entrances.sameNode}` : '面板未打开')

    /* ---------- P7 Esc 只退一层 ---------- */
    const urlBeforeEsc = page.url()
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 320))
    const afterEsc = await page.evaluate(() => ({
      open: !!(window.DiseasePrimer && window.DiseasePrimer.isOpen()),
      url: location.href,
      alive: !!document.body
    }))
    check('P7', 'Esc 收起概要且仍在本页（只退一层）',
      !afterEsc.open && afterEsc.alive && afterEsc.url.split('#')[0] === urlBeforeEsc.split('#')[0],
      `open=${afterEsc.open} url=${afterEsc.url.replace(/^https?:\/\/[^/]+/, '')}`)

    /* ---------- P6 焦点回触发者 + 滚动位置不变 ---------- */
    const restore = await page.evaluate((before) => {
      const active = document.activeElement
      return {
        onTrigger: !!(active && active.closest && active.closest('[data-primer-open]')),
        scrollY: Math.round(window.scrollY),
        before
      }
    }, scrollBefore)
    check('P6', '关闭后焦点回到触发按钮，滚动位置不变',
      restore.onTrigger && Math.abs(restore.scrollY - scrollBefore) <= 4,
      `focusOnTrigger=${restore.onTrigger} scrollY=${restore.before}→${restore.scrollY}`)

    /* ---------- P8 数据四段齐全 + 趋势段无禁止词 ---------- */
    if (SELF_TEST) await injectDataDefect(page)
    const dataCheck = await page.evaluate((banned) => {
      const d = window.DISEASE_PRIMER
      if (!d || !Array.isArray(d.sections)) return { ok: false, why: '缺少 window.DISEASE_PRIMER' }
      const ids = d.sections.map((s) => s.id)
      const want = ['definition', 'evidence', 'landscape', 'trend']
      const missing = want.filter((w) => !ids.includes(w))
      const trend = d.sections.find((s) => s.id === 'trend') || {}
      const text = [(trend.intro || ''), ...(trend.points || []), ...(trend.groups || []).flatMap((g) => g.points || [])].join(' ')
      const hit = banned.filter((w) => text.includes(w))
      const noSrc = d.sections.filter((s) => !(s.sources && s.sources.length)).map((s) => s.id)
      return { ok: !missing.length && !hit.length && !noSrc.length, missing, hit, noSrc }
    }, BANNED)
    check('P8', '数据四段齐全、每段有来源、趋势段无禁止词',
      dataCheck.ok,
      dataCheck.ok ? '' : `缺段=${(dataCheck.missing || []).join(',') || '无'} 禁止词=${(dataCheck.hit || []).join(',') || '无'} 缺来源=${(dataCheck.noSrc || []).join(',') || '无'}`)

    /* ---------- P9 排版对齐（36 号 §4.3）：正文/列表/表格/来源行右边界一致 ----------
       2026-10-27 用户实指：定义段换行点与下方表格不一致，看着像"边距没对齐"。
       根因是 .dp-lead/.dp-points li 带 max-width:68ch 而表格吃满容器——左对齐、右参差。
       判据（1440/900/390 三档）：四类元素与 .dp-inner 左边差 ≤1px，右边界极差 ≤2px。 */
    const measureAlign = () => page.evaluate(() => {
      const inner = document.querySelector('.dp-inner')
      if (!inner) return { ok: false, why: '找不到 .dp-inner' }
      const ir = inner.getBoundingClientRect()
      /* 前置断言：面板必须真的可见。P7 按过 Esc，若不复开则所有 rect 全 0，
         极差恒为 0 —— 这正是「探针全绿但没在测」的假通过形态（LESSONS 第 13 类）。 */
      if (ir.width < 100 || ir.height < 100) return { ok: false, why: `面板不可见（${Math.round(ir.width)}×${Math.round(ir.height)}），测量无效` }
      const base = ir.left
      const rows = []
      for (const q of ['.dp-lead', '.dp-points li', '.dp-table', '.dp-src']) {
        const el = document.querySelector(q)
        if (!el) continue
        const r = el.getBoundingClientRect()
        rows.push({ q, leftGap: +(r.left - base).toFixed(1), right: r.right })
      }
      /* 四类元素必须全部量到：少一个就说明这页结构与该规则不匹配，判失败而不是"勉强通过" */
      if (rows.length < 4) return { ok: false, why: `可比元素不足（${rows.length}/4：需要 .dp-lead/.dp-points li/.dp-table/.dp-src 都渲染）` }
      /* 文本类元素（正文/列表/来源行）右边界必须一致；
         表格允许在窄容器横向滚动（.dp-table min-width:640px + wrap overflow-x:auto），
         此时表格右边界超出容器是设计意图，只要求它从同一左基线开始且不被压缩换行。 */
      const text = rows.filter((r) => r.q !== '.dp-table')
      const rights = text.map((r) => r.right)
      const spread = +(Math.max(...rights) - Math.min(...rights)).toFixed(1)
      const leftBad = rows.filter((r) => Math.abs(r.leftGap) > 1).map((r) => `${r.q}:${r.leftGap}`)
      const tbl = document.querySelector('.dp-table')
      const wrap = document.querySelector('.dp-table-wrap')
      const tblOk = !tbl || !wrap || tbl.getBoundingClientRect().width <= wrap.clientWidth + 2
        || getComputedStyle(wrap).overflowX === 'auto'
      return { ok: leftBad.length === 0 && spread <= 2 && tblOk, spread, leftBad, tblOk, n: rows.length }
    })
    const alignFails = []
    /* P7 的 Esc 已关面板：先复开，否则量到隐藏元素（right 全 0 → 假通过） */
    const reopen = async () => {
      const open = await page.evaluate(() => {
        const el = document.getElementById('disease-primer') || document.querySelector('.dp-overlay')
        return !!(el && !el.hidden && el.getBoundingClientRect().width > 100)
      })
      if (!open) {
        await page.evaluate(() => {
          const t = document.querySelector('[data-primer-open]')
          if (window.DiseasePrimer && window.DiseasePrimer.open) window.DiseasePrimer.open(t)
          else if (t) t.click()
        })
        await new Promise((r) => setTimeout(r, 350))
      }
    }
    for (const w of [1280, 900, 390]) {
      await page.setViewport({ width: w, height: 860 })
      await reopen()
      await new Promise((r) => setTimeout(r, 200))
      const a = await measureAlign()
      if (!a.ok) alignFails.push(`${w}px: ${a.why || `文本右极差 ${a.spread}px 左偏移 ${(a.leftBad || []).join(',') || '无'}${a.tblOk === false ? ' 表格未横向滚动' : ''}`}`)
    }
    await page.setViewport({ width: 1280, height: 860 })
    check('P9', '排版对齐：正文/列表/表格/来源行同左基线、右边界极差 ≤2px（三档）',
      alignFails.length === 0,
      alignFails.length ? alignFails.join(' | ') : '1440/900/390 三档均对齐')

    /* ---------- E0 控制台无错误 ---------- */
    check('E0', '页面无 JS 报错、无 console error', errors.length === 0, errors.slice(0, 3).join(' | '))

    const fails = results.filter((r) => !r.ok)
    console.log(`\n  ${results.length - fails.length}/${results.length} 通过${fails.length ? ` · ${fails.length} 失败` : ''}${SELF_TEST ? '（自测：应至少 3 条 FAIL）' : ''}\n`)
    if (fails.length) process.exitCode = 1
    if (SELF_TEST) { console.log(fails.length >= 3 ? '自测通过：闸门确实会报红。\n' : '自测失败：注入缺陷后 FAIL 不足 3 条，闸门漏检。\n'); if (fails.length < 3) process.exitCode = 1 }
  } finally {
    await browser.close()
    server.close()
  }
}

await main()
