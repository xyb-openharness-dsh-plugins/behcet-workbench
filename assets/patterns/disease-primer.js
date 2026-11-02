/* 36 号 · 疾病概要（「?」入口）参考实现
 * 无依赖、经典脚本（IIFE），file:// 下可直接 <script src> 加载（ES module 会被 CORS 拦）。
 * 形态：整页视图（32 号），不是弹窗——四段内容必然超过 1.5 屏。
 * history 是导航栈唯一真源：open = pushState，close = history.back()。
 *
 * 用法：
 *   <script src="primer-data.js"></script>   // window.DISEASE_PRIMER
 *   <script src="primer.js"></script>        // 本文件，自动挂载
 *   window.DiseasePrimer.mount()             // 顶栏是 JS 渲染时手工再调一次
 *
 * 规范见 docs/36-DISEASE-PRIMER.md；验收见 scripts/probe-disease-primer.mjs。
 */
(function (global) {
  'use strict'

  var PANEL_ID = 'disease-primer'
  var HASH = '#disease-primer'
  var state = { open: false, trigger: null, scrollY: 0, lastPointer: null, el: null }

  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function data() { return global.DISEASE_PRIMER || null }

  /* ---------- 触发按钮 ---------- */
  function findTrigger() { return document.querySelector('[data-primer-open]') }

  function mount() {
    var d = data()
    if (!d) return null
    var btn = findTrigger()
    if (btn) {
      /* 接管已存在的按钮：补齐 a11y 属性。
         2026-10-25 head-neck 实测：手写的 <button data-primer-open>?</button> 只有可见的 "?"，
         读屏软件读出来就是一个问号。接管时必须把 label 补上，而不是假定作者写全了。 */
      if (!btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')) {
        btn.setAttribute('aria-label', '疾病概要：定义、医学资料与指南情况、治疗全景、发展趋势')
      }
      if (!btn.getAttribute('aria-haspopup')) btn.setAttribute('aria-haspopup', 'dialog')
      if (!btn.getAttribute('aria-controls')) btn.setAttribute('aria-controls', PANEL_ID)
      btn.setAttribute('aria-expanded', state.open ? 'true' : 'false')
      return btn
    }
    btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dp-trigger'
    btn.setAttribute('data-primer-open', '')
    btn.setAttribute('aria-haspopup', 'dialog')
    btn.setAttribute('aria-controls', PANEL_ID)
    btn.setAttribute('aria-expanded', 'false')
    btn.setAttribute('aria-label', '疾病概要：定义、医学资料与指南情况、治疗全景、发展趋势')
    btn.setAttribute('title', '疾病概要：定义 · 指南 · 治疗全景 · 趋势')
    btn.textContent = '?'
    var host = document.querySelector('.top-actions') || document.querySelector('.topbar') || document.querySelector('header')
    if (host) host.appendChild(btn)
    else { btn.classList.add('dp-trigger-float'); document.body.appendChild(btn) }
    return btn
  }

  /* ---------- 渲染 ---------- */
  var safeHref = function (u) {
    if (!u || typeof u !== 'string') return ''
    var t = u.trim()
    return /^https:\/\//i.test(t) ? t : ''
  }
  /* 2026-10-27：原件列必须是可点链接（36 号 §2.5）——"已取得"三个字不带链接=违规。
     s.url=原件链接（官方 PDF/DOI/PMC/官网页）；s.secondaryUrl=未取得原件时的二次来源链接。 */
  function sourceLine(s) {
    if (!s) return ''
    var bits = [s.org, s.doc].filter(Boolean).join(' · ')
    var tail = []
    if (s.version) tail.push(s.version)
    var url = safeHref(s.url), sec = safeHref(s.secondaryUrl)
    if (s.nolink) { /* 说明行/无对应文件：§2.5 不适用（须显式标注 nolink:true 并在 note 说明） */ }
    else if (s.original) {
      tail.push(url
        ? '原件<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="dp-link">已取得 · 打开/下载 ↗</a>'
        : '原件已取得<span class="dp-miss">（缺链接，违反 36 号 §2.5）</span>')
    } else if (!s.nolink) {
      tail.push(sec
        ? '<a href="' + sec + '" target="_blank" rel="noopener noreferrer" class="dp-link">未取得原件，据二次来源 ↗</a>'
        : '未取得原件，据二次来源<span class="dp-miss">（缺二次链接，违反 36 号 §2.5）</span>')
    }
    if (s.page) tail.push('页码 ' + s.page)
    if (s.note) tail.push(s.note)
    return bits + (tail.length ? '（' + tail.join(' · ') + '）' : '')
  }

  function tableHtml(t) {
    if (!t || !t.rows || !t.rows.length) return ''
    var cell = function (c) {
      /* §2.5：单元格支持 {text, url} 对象 → 渲染可点链接；字符串照旧转义 */
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        var u = safeHref(c.url)
        var t = esc(c.text != null ? c.text : '')
        return u ? '<a class="dp-link" href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + ' ↗</a>' : t + (c.url ? '<span class="dp-miss">（缺 https 链接，违反 36 号 §2.5）</span>' : '')
      }
      return esc(c)
    }
    return '<div class="dp-table-wrap"><table class="dp-table"><thead><tr>' +
      t.head.map(function (h) { return '<th>' + esc(h) + '</th>' }).join('') +
      '</tr></thead><tbody>' +
      t.rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + cell(c) + '</td>' }).join('') + '</tr>'
      }).join('') +
      '</tbody></table></div>'
  }

  function pointsHtml(list) {
    if (!list || !list.length) return ''
    return '<ul class="dp-points">' + list.map(function (p) { return '<li>' + esc(p) + '</li>' }).join('') + '</ul>'
  }

  function groupsHtml(list) {
    if (!list || !list.length) return ''
    return list.map(function (g) {
      return '<div class="dp-group"><h4>' + esc(g.label) + '</h4>' + pointsHtml(g.points) + '</div>'
    }).join('')
  }

  function sectionHtml(s, i) {
    var body = ''
    if (s.intro) body += '<p class="dp-lead">' + esc(s.intro) + '</p>'
    body += groupsHtml(s.groups)
    body += pointsHtml(s.points)
    body += tableHtml(s.table)
    if (!body) body = '<p class="dp-lead dp-empty">本台尚未整理这一段。</p>'
    var src = (s.sources && s.sources.length)
      ? '<p class="dp-src"><b>来源</b>' + s.sources.map(sourceLine).join(' ｜ ') + '</p>'
      : '<p class="dp-src dp-src-missing"><b>来源</b>未标注 —— 这一段还不能用。</p>'
    return '<section class="dp-section" data-dp-section="' + esc(s.id) + '" aria-labelledby="dp-h-' + i + '">' +
      '<h3 id="dp-h-' + i + '">' + esc(s.title || '') + '</h3>' + body + src + '</section>'
  }

  function build() {
    if (state.el) return state.el
    var d = data() || {}
    var sections = Array.isArray(d.sections) ? d.sections : []
    var el = document.createElement('div')
    el.className = 'dp-overlay'
    el.id = PANEL_ID
    el.hidden = true
    el.innerHTML =
      '<div class="dp-panel" role="dialog" aria-modal="true" aria-labelledby="dp-title" tabindex="-1">' +
        '<div class="dp-head">' +
          '<button class="dp-btn dp-back" type="button" data-dp="back" aria-label="返回工作台">← <span>返回</span></button>' +
          '<div class="dp-head-title">' +
            '<span class="dp-crumb">' + esc(d.brand || '') + ' › 疾病概要</span>' +
            '<h2 class="dp-title" id="dp-title">' + esc(d.name || '疾病概要') + (d.en ? ' <span class="dp-en">' + esc(d.en) + '</span>' : '') + '</h2>' +
          '</div>' +
          '<button class="dp-btn dp-close" type="button" data-dp="close" aria-label="关闭疾病概要">✕</button>' +
        '</div>' +
        '<div class="dp-body" tabindex="0">' +
          '<div class="dp-inner">' +
            '<p class="dp-note">这是公开信息的整理，属于<b>解释</b>：说明这个病是什么、依据哪些文件、指南里列了哪些手段、这些年发生了什么变化。它不是对你个人情况的判断，也不构成任何建议。</p>' +
            sections.map(sectionHtml).join('') +
            '<p class="dp-foot">最后更新 ' + esc(d.updated || '未标注') + ' · 内容只做事实与原文整理 · 任何与你有关的判断，这一句需要问你的医生。</p>' +
          '</div>' +
        '</div>' +
      '</div>'
    document.body.appendChild(el)
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-dp]')
      if (t) { close(); return }
      if (e.target === el) close()
    })
    state.el = el
    return el
  }

  /* ---------- 打开 / 关闭 ---------- */
  function ourState() {
    try { return !!(global.history && global.history.state && global.history.state.dp) } catch (_) { return false }
  }

  function open(trigger) {
    if (state.open) return
    if (!data()) { console.warn('[disease-primer] 缺少 window.DISEASE_PRIMER，无法打开'); return }
    var el = build()
    /* 触发者兜底：鼠标点击在多数浏览器不给按钮焦点 */
    var t = trigger || document.activeElement
    if (!t || t === document.body || t === document.documentElement) t = null
    if (!t && state.lastPointer && state.lastPointer.closest) t = state.lastPointer.closest('[data-primer-open],button,a')
    state.trigger = t || findTrigger()
    state.scrollY = global.scrollY || document.documentElement.scrollTop || 0
    state.open = true
    el.hidden = false
    document.documentElement.classList.add('dp-lock')
    if (state.trigger) state.trigger.setAttribute('aria-expanded', 'true')
    try { global.history.pushState({ dp: 1 }, '', HASH) } catch (_) { /* file:// 下可能受限，退化为无 history */ }
    var panel = el.querySelector('.dp-panel')
    if (panel) panel.focus()
  }

  function applyClose() {
    if (!state.open) return
    state.open = false
    if (state.el) state.el.hidden = true
    document.documentElement.classList.remove('dp-lock')
    if (state.trigger) {
      state.trigger.setAttribute('aria-expanded', 'false')
      try { state.trigger.focus({ preventScroll: true }) } catch (_) { try { state.trigger.focus() } catch (__) {} }
    }
    if (state.scrollY) { try { global.scrollTo(0, state.scrollY) } catch (_) {} }
    state.trigger = null
  }

  function close() {
    if (!state.open) return
    var canHistory = false
    try { canHistory = !!(global.history && global.history.back) && ourState() } catch (_) { canHistory = false }
    if (canHistory) {
      try {
        global.history.back()
        /* 兜底：250ms 内没收到 popstate，就直接关，避免"点了没反应" */
        global.setTimeout(function () { if (state.open) applyClose() }, 250)
        return
      } catch (_) { /* 落到下面 */ }
    }
    applyClose()
  }

  function back() { close() } // 单层：返回与关闭落到同一动作，但仍是两个独立入口（32 号要求）

  /* ---------- 事件 ---------- */
  function onPop() { if (state.open) applyClose() }

  function onKey(e) {
    if (!state.open) return
    if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-primer-open]') : null
    if (!t) return
    e.preventDefault()
    open(t)
  }

  function boot() {
    if (document.documentElement.getAttribute('data-dp-bound') === '1') return
    document.documentElement.setAttribute('data-dp-bound', '1')
    document.addEventListener('pointerdown', function (e) { state.lastPointer = e.target }, true)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    global.addEventListener('popstate', onPop)
    mount()
    /* 顶栏可能是 JS 后渲染的：补一次挂载 */
    global.setTimeout(function () { if (!findTrigger()) mount() }, 400)
    global.setTimeout(function () { if (!findTrigger()) mount() }, 1200)
    /* 深链：#disease-primer */
    if (location.hash === HASH) { try { open(findTrigger()) } catch (_) {} }
  }

  global.DiseasePrimer = {
    mount: mount,
    open: open,
    close: close,
    back: back,
    isOpen: function () { return state.open },
    data: data,
    /* 探针用：不碰 history 的强制关闭，避免反复测历史栈时栈被搅乱 */
    _forceClose: applyClose
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})(typeof window !== 'undefined' ? window : this)
