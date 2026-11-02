/* 32 号 · 整页视图（Full-Page View）参考实现
 * 无依赖、file:// 可直接跑。规范见 docs/32-FULL-PAGE-VIEW.md。
 *
 * 最小用法：
 *   import { createPageView } from './page-view.js'
 *   const pv = createPageView({ crumbRoot: '主页' })
 *   pv.open({
 *     key: 'pathology',
 *     title: '病理报告',
 *     crumb: '病理报告',
 *     render: (body, api) => { body.innerHTML = '<p>…</p>' }
 *   })
 *   // 退一层：pv.back()   全关：pv.close()   Esc 与浏览器返回键已内置
 *
 * 深链：pv.define({ key, title, crumb, render }) 注册后，地址带 #page=key 刷新可直达。
 */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function createPageView(options = {}) {
  const crumbRoot = options.crumbRoot || '主页'
  const root = options.root || document.body
  const routes = new Map()
  const stack = []          // [{ key, title, crumb, render, contentEl, scrollTop, trigger }]
  let overlay = null
  let panel = null
  let bodyEl = null
  let titleEl = null
  let crumbEl = null
  let backBtn = null
  let lastFocus = null
  let lastPointerTarget = null
  let syncingHistory = false
  let savedScrollY = 0

  /* ---------- 背景滚动锁（A1 的真含义） ----------
   * 早先 A1 只断言「body 不溢出」，可实测：面板开着时 window.scrollBy(0,300)
   * 仍能把背景文档从 0 推到 300（2026-10-25 肉瘤项目实测）。浮层不透明，
   * 所以这事儿在屏幕上看不见，但触屏拖到面板底部会链式带动背景、键盘 PageDown
   * 也会滚它，属于「断言说的和代码做的不是一件事」。锁 + 关掉时还原。
   */
  function lockScroll() {
    if (typeof window === 'undefined') return
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0
    document.documentElement.classList.add('pv-lock')
  }
  function unlockScroll() {
    if (typeof window === 'undefined') return
    document.documentElement.classList.remove('pv-lock')
    // 先摘类再还原：overflow:hidden 期间 scrollY 已被夹到 0，顺序反了会还原不回去
    if (savedScrollY) { try { window.scrollTo(0, savedScrollY) } catch {} }
  }

  // 鼠标点击在部分浏览器里不会把焦点给按钮，只记 activeElement 会让 A4 形同虚设。
  // 所以在捕获阶段记一次 pointerdown 的落点，作为"触发者"的兜底。
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', e => { lastPointerTarget = e.target }, true)
  }

  function define(def) { routes.set(def.key, def); return api }
  function defineAll(list) { (list || []).forEach(define); return api }

  /* ---------- DOM 骨架（只建一次，多层复用同一个 panel） ---------- */
  function ensureShell() {
    if (overlay) return
    overlay = document.createElement('div')
    overlay.className = 'pv-overlay'
    overlay.hidden = true
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')

    panel = document.createElement('div')
    panel.className = 'pv-panel'
    panel.tabIndex = -1

    const head = document.createElement('div')
    head.className = 'pv-head'

    const actions = document.createElement('div')
    actions.className = 'pv-head-actions'
    backBtn = document.createElement('button')
    backBtn.type = 'button'
    backBtn.className = 'pv-btn'
    backBtn.innerHTML = '← 返回'
    backBtn.addEventListener('click', () => api.back())
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'pv-btn pv-btn-icon'
    closeBtn.innerHTML = '✕'
    closeBtn.setAttribute('aria-label', '关闭并回到' + crumbRoot)
    closeBtn.addEventListener('click', () => api.close())
    actions.append(backBtn, closeBtn)

    const headTitle = document.createElement('div')
    headTitle.className = 'pv-head-title'
    crumbEl = document.createElement('span')
    crumbEl.className = 'pv-crumb'
    titleEl = document.createElement('h2')
    titleEl.className = 'pv-title'
    headTitle.append(crumbEl, titleEl)

    head.append(actions, headTitle)
    bodyEl = document.createElement('div')
    bodyEl.className = 'pv-body'
    panel.append(head, bodyEl)
    overlay.append(panel)
    root.append(overlay)

    overlay.addEventListener('keydown', onKeydown)
  }

  /* ---------- 打开一层 ---------- */
  function open(keyOrDef, params) {
    const def = typeof keyOrDef === 'string' ? routes.get(keyOrDef) : keyOrDef
    if (!def || typeof def.render !== 'function') {
      console.warn('[page-view] 未注册的页面：', keyOrDef)
      return null
    }
    const top = stack[stack.length - 1]
    if (top && top.key === def.key) return top      // 连点不叠层

    ensureShell()
    if (!stack.length) { lastFocus = pickTrigger(); lockScroll() }

    const entry = {
      key: def.key,
      title: def.title || def.key,
      crumb: def.crumb || def.title || def.key,
      render: def.render,
      params: params || {},
      contentEl: document.createElement('div'),
      scrollTop: 0
    }
    stack.push(entry)

    // 每层独立内容节点，切层只换 DOM 引用，不重跑 render（保住表单/图表状态）
    bodyEl.replaceChildren(entry.contentEl)
    overlay.hidden = false
    paintHead()
    try {
      const node = def.render(entry.contentEl, api, entry.params)
      if (node && node.nodeType === 1) entry.contentEl.append(node)
    } catch (e) {
      entry.contentEl.innerHTML = '<p class="pv-note">这一页没能打开：' + String(e && e.message || e) + '</p>'
    }
    bodyEl.scrollTop = 0

    pushHistory(entry.key)
    requestAnimationFrame(() => {
      const first = panel.querySelector(FOCUSABLE)
      ;(first || panel).focus()
    })
    return entry
  }

  /** 触发者：优先当前焦点（键盘激活），否则用最近一次 pointerdown 的落点（鼠标激活）。 */
  function pickTrigger() {
    const active = document.activeElement
    if (active && active !== document.body && active !== document.documentElement) return active
    const p = lastPointerTarget
    if (p && p.closest) {
      const el = p.closest('button,a,[tabindex],[data-open]')
      if (el) return el
    }
    return active || null
  }

  /* ---------- 退一层 / 全关：以 history 为唯一真源 ----------
   * 不用 replaceState 假装退栈——那样 history 会多出一条"假的当前页"，
   * 浏览器返回键就会退到一个不存在的位置（2026-10-25 探针 A3 实测踩到）。
   */
  function back() {
    if (!stack.length) return
    const depth = stack.length
    if (historyUsable()) {
      try { history.back() } catch { applyDepth(depth - 1); return }
      // history 是异步的：250ms 内没等到 popstate 就自己应用，避免"点了没反应"
      setTimeout(() => { if (stack.length === depth) applyDepth(depth - 1) }, 250)
      return
    }
    applyDepth(depth - 1)
  }

  function close() {
    if (!stack.length) return
    const depth = stack.length
    if (historyUsable()) {
      try { history.go(-depth) } catch { applyDepth(0); return }
      setTimeout(() => { if (stack.length === depth) applyDepth(0) }, 250)
      return
    }
    applyDepth(0)
  }

  /** 把视图同步到指定栈深；0 = 回主页。popstate 与降级路径共用这一条。 */
  function applyDepth(depth) {
    const target = Math.max(0, Math.min(depth | 0, stack.length))
    while (stack.length > target) {
      const top = stack.pop()
      if (bodyEl) top.scrollTop = bodyEl.scrollTop   // 记住被退掉那层的位置
    }
    if (!stack.length) { teardown(); return }
    const prev = stack[stack.length - 1]
    overlay.hidden = false
    bodyEl.replaceChildren(prev.contentEl)
    paintHead()
    bodyEl.scrollTop = prev.scrollTop || 0
    requestAnimationFrame(() => {
      const first = panel.querySelector(FOCUSABLE)
      ;(first || panel).focus()
    })
  }

  function historyUsable() {
    return typeof history !== 'undefined' && typeof history.pushState === 'function'
  }

  function teardown() {
    if (!overlay) return
    overlay.hidden = true
    bodyEl.replaceChildren()
    unlockScroll()
    try { lastFocus && lastFocus.focus && lastFocus.focus() } catch {}
  }

  function paintHead() {
    const top = stack[stack.length - 1]
    titleEl.textContent = top.title || '未命名页'      // A9：不许出现空标题
    crumbEl.textContent = crumbRoot + ' › ' + (top.crumb || top.title)
    backBtn.hidden = false                            // A10：返回与关闭两个入口都在
    panel.setAttribute('aria-label', top.title || '详情')
  }

  /* ---------- 键盘：Esc 一层一退；Tab 在层内循环 ---------- */
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      api.back()                                       // A2：深 3 层也只退一层
      return
    }
    if (e.key !== 'Tab') return
    const list = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null)
    if (!list.length) return
    const first = list[0], last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  /* ---------- history：浏览器返回键 = back() ---------- */
  function pushHistory(key) {
    if (!historyUsable() || syncingHistory) return
    try { history.pushState({ pv: stack.length }, '', '#page=' + encodeURIComponent(key)) } catch {}
  }
  function onPopState(e) {
    const depth = e.state && typeof e.state.pv === 'number' ? e.state.pv : 0
    applyDepth(depth)
  }
  if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState)

  /* ---------- 深链：地址带 #page=key 直接可开（A7） ---------- */
  function openFromHash() {
    if (typeof location === 'undefined') return false
    const m = /(?:^#|&)page=([^&]+)/.exec(location.hash || '')
    if (!m) return false
    const key = decodeURIComponent(m[1])
    if (!routes.has(key)) {
      console.warn('[page-view] 地址里这一页不存在，已回主页：', key)
      return false
    }
    open(key)
    return true
  }

  const api = {
    define, defineAll, open, back, close, openFromHash,
    home: () => api.close(),
    get depth() { return stack.length },
    get current() { const t = stack[stack.length - 1]; return t ? t.key : null }
  }
  return api
}
