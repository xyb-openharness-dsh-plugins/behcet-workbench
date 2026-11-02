#!/usr/bin/env node
/**
 * 激活烟测：在 Node 里把插件真的「装一遍」，而不是 grep 常量。
 *
 * ## 为什么要有这个脚本
 * 2026-10-25 head-neck-workbench 0.1.0–0.1.2 装进 Desktop 后
 * `web boot: 1 entry did not activate`，整机起不来；
 * `check-host-contract.mjs` 用正则比对字面量，只能证明「常量写了什么」，
 * 证明不了 `apply()` 走完不抛错、`register()` 收下的描述符逐条合法。
 * 宿主的校验发生在渲染进程里，本地跑不到——所以这里把宿主那一层**用桩件复刻**：
 * 喂一个 `window.__ModuleLoader__`、一个 `ctx`，让 `apply()` 真的跑一遍，
 * `register()` 按宿主原文的 7 条规则逐条校验。桩件不是宿主，但校验规则是抄来的。
 *
 * 判据（任一不过即退出码 1）：
 *   1. `lib/client.js` 能在桩环境里求值，并抛出 `{apply, inject}`
 *   2. `inject` 含宿主必需的 `desktopWorkbenches`
 *   3. `apply()` 不抛错
 *   4. `register()` 被调用恰好一次，且描述符逐条通过宿主 7 条校验
 *   5. Panel 是函数（宿主 `typeof Component !== 'function'` 直接拒绝）
 *
 * 用法：node scripts/smoke-activate.mjs [包目录]，默认对**已安装的那个包**跑。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 默认项目根；可传参指向**已装进去的那一份** */
function candidates() {
  const home = process.env.HOME || ''
  const name = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).name || ''
  return [
    process.argv[2],
    name && join(home, 'Library/Application Support/dsh-desktop/harness/profiles/web/node_modules', name),
    join(HERE, '..'),
  ].filter(Boolean)
}

const problems = []
const notes = []

/* ---------------- 宿主 7 条校验（抄自 app.asar → dsh-desktop-workbenches/client.js 的 register） ---------------- */
const REPO_RE = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/i

function hostRegisterCheck(descriptor, Component) {
  const bad = []
  if (!descriptor || !descriptor.title || typeof Component !== 'function') {
    bad.push('Invalid workbench registration（缺 title 或 Component 不是函数）')
    return bad
  }
  if (typeof descriptor.repository !== 'string' || !REPO_RE.test(descriptor.repository)) {
    bad.push(`repository 不是合法的 GitHub 仓库地址：${JSON.stringify(descriptor.repository)}`)
  }
  if (descriptor.customFrame !== undefined && typeof descriptor.customFrame !== 'boolean') {
    bad.push('Invalid custom frame flag')
  }
  if (descriptor.headerLayout !== undefined && !['default', 'compact'].includes(descriptor.headerLayout)) {
    bad.push('Invalid workbench header layout')
  }
  const layout = descriptor.layout || {}
  if (layout.businessSide !== undefined && !['left', 'right'].includes(layout.businessSide)) {
    bad.push('Invalid workbench business side')
  }
  if (layout.businessWidth !== undefined &&
      (!Number.isFinite(layout.businessWidth) || layout.businessWidth < 0.25 || layout.businessWidth > 0.7)) {
    bad.push(`Workbench business width must be between 0.25 and 0.7（实际 ${layout.businessWidth}）`)
  }
  return bad
}

/* ---------------- 桩件 ---------------- */
function makeStubs() {
  const registered = []
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    Fragment: 'Fragment',
  }
  const ctx = {
    effect: (fn) => { try { fn() } catch (e) { problems.push(`ctx.effect 里的注册抛错：${e.message}`) } },
    on: () => {},
    logger: () => ({ info() {}, warn() {}, error() {} }),
    desktopWorkbenches: {
      register: (descriptor, Component) => {
        registered.push({ descriptor, Component })
        for (const b of hostRegisterCheck(descriptor, Component)) problems.push(`宿主会拒绝：${b}`)
      },
      currentSession: () => undefined,
      ownsSession: () => false,
      subscribe: () => () => {},
      ensureSession: async () => ({ id: 'stub' }),
    },
    sessions: { list: { getSnapshot: () => ({}) }, scope: () => ({ get: () => ({}) }) },
    connection: { requestRejection: () => undefined },
    webServer: { register: () => {} },
  }
  const win = {
    __ModuleLoader__: { load: (mod) => { win.__mod = mod } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    location: { origin: 'http://127.0.0.1:0', hostname: '127.0.0.1' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    console,
  }
  return { win, ctx, react, registered }
}

function main() {
  const root = candidates().find((p) => p && existsSync(join(p, 'lib/client.js')))
  if (!root) { console.error('找不到 lib/client.js，请传包目录'); process.exit(2) }
  const src = readFileSync(join(root, 'lib/client.js'), 'utf8')

  const { win, ctx, react, registered } = makeStubs()
  const sandbox = {
    window: win,
    document: { addEventListener() {}, removeEventListener() {}, createElement: () => ({}), body: {}, documentElement: {} },
    navigator: { userAgent: 'node' },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox

  try {
    runInContext(src, createContext(sandbox), { filename: 'lib/client.js' })
  } catch (error) {
    console.error(`✗ 求值 lib/client.js 失败：${error.message}`)
    process.exit(1)
  }

  const mod = win.__mod
  if (!mod) { console.error('✗ 没有调用 window.__ModuleLoader__.load()——宿主不会把它当插件'); process.exit(1) }
  notes.push(`模块 id：${mod.id}`)

  let exported
  try {
    exported = mod.factory((name) => {
      if (name === 'react') return react
      throw new Error(`烟测未提供模块：${name}`)
    })
  } catch (error) {
    console.error(`✗ factory() 抛错：${error.message}`)
    process.exit(1)
  }

  if (!exported || typeof exported.apply !== 'function') problems.push('没有导出 apply()')
  if (!Array.isArray(exported?.inject) || !exported.inject.includes('desktopWorkbenches')) {
    problems.push(`inject 缺 desktopWorkbenches：${JSON.stringify(exported?.inject)}`)
  }
  notes.push(`inject：${JSON.stringify(exported?.inject)}`)

  if (typeof exported?.apply === 'function') {
    try { exported.apply(ctx) } catch (error) { problems.push(`apply() 抛错（宿主就是死在这里）：${error.message}`) }
  }

  if (registered.length !== 1) problems.push(`register() 调用 ${registered.length} 次，应为 1 次`)
  if (registered[0]) {
    const { descriptor, Component } = registered[0]
    notes.push(`标题：${descriptor.title}`)
    notes.push(`customFrame：${descriptor.customFrame}｜businessSide：${descriptor.layout?.businessSide}｜businessWidth：${descriptor.layout?.businessWidth}`)
    if (typeof Component !== 'function') problems.push('Panel 不是函数，宿主会直接拒绝注册')
    // 会话区与业务区不能互相挤压：这两块之和超过 1 就会在真机上互相压
    const width = descriptor.layout?.businessWidth
    if (Number.isFinite(width) && width + 0.32 > 1) {
      problems.push(`businessWidth(${width}) + 会话默认占比(0.32) > 1，两区会互相挤压`)
    }
  }

  console.log(`激活烟测：${root}`)
  for (const n of notes) console.log(`  · ${n}`)
  if (problems.length) {
    console.log(`\n✗ FAIL —— ${problems.length} 处问题（宿主装进去会同样失败）：`)
    for (const p of problems) console.log(`  - ${p}`)
    process.exit(1)
  }
  console.log('\n✓ PASS —— apply() 走通、register() 描述符逐条通过宿主 7 条校验（桩件，非真宿主）')
}

main()
