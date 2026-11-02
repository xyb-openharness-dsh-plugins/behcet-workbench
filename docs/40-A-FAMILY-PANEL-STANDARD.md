# 40 · A 家族自建面板标准（customFrame）

> 沉淀来源：`anca-vasculitis-workbench` v0.2.12（基线）、`acromegaly-workbench` v0.2.4、`breast-cancer-workbench` v0.6.x。
> 本文是**可直接照做的实现规范**，不是设计讨论稿。凡与本文冲突的旧实现，按本文改；本文没写的，按项目原型与 `docs/20-AGENT-PANE-DESIGN.md` 判。

## 0. 适用与前置判定

只适用 **A 家族：`layout: { businessSide, businessWidth }` + `customFrame: true`**，且业务区是自建 `<iframe>`（`/api/<pkg>/ui/`）的工作台。宿主把原生会话节点作为 **`conversation` prop** 交给插件排版，因此顶栏、splitter、收起/重开、宽度记忆全部由本仓 `src/client.js` 实现。

不适用、不要生搬：

- **split 形态**（`customFrame: false`，宿主自己画分栏）：宿主没有 `setBusinessWidth`/`togglePane`，也拿不到 `conversation` prop，本文件的分隔线与收起逻辑无从落地。判定见 `docs/20-AGENT-PANE-DESIGN.md` §2。
- **B 类老仓**（只有 `lib/client.js`、无 `src/`）：行为照本文，但改的是手写源并直接 `node --check`，见 `prompts/FAMILY-SPLITTER-ALIGNMENT.md` §2。
- **不承载 DSH 会话的仓**（如 museum-route 的行程页）：记 N/A，不要凭空加面板。

前置三件必须先成立，否则后面的样式全是白搭：

1. 根节点首个子元素是语义 `<header>`；
2. 原生会话节点**恒定挂载**，只切 `display`；
3. 面板参数只有一份来源（`lib/layout.js`，构建注入），客户端不写第二份 `0.65`/`0.35`。

---

## 1. 结构：header → 业务 iframe → 1px splitter → aside

### 1.1 DOM 顺序（硬约束）

```
div(root, flex column)
├── header            首个子元素，语义 <header>，三段式
└── div(body, position:relative)
    ├── div(business)          flex:1，内含业务 <iframe>
    ├── div(separator)         1px 视觉线，绝对定位在业务区/会话边界
    ├── div(dragShield)        仅拖动期间渲染，zIndex 高于一切
    └── aside                  width = percent%，恒定挂载
```

**splitter 必须夹在业务区与 `aside` 之间。** 放到 `aside` 之后会贴到面板最右缘：用户看得见的那条真分界线上既没有悬停高亮，也拖不动（`prompts/FAMILY-SPLITTER-ALIGNMENT.md` §1 第 1 条）。

`dragShield` 的 DOM 位置在 `aside` 之前、splitter 之后即可，靠 `zIndex: 4` 盖住全部；渲染条件必须是 `dragging && !narrow`。

### 1.2 根与 body

```js
const rootStyle = {
  display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0,
  width: '100%', maxWidth: '100%', boxSizing: 'border-box',
  background: 'var(--page-bg)',
  fontFamily: '-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
}
const bodyStyle = { position: 'relative', display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }
const businessStyle = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }
const frameStyle = { flex: '1 1 auto', width: '100%', minHeight: 0, border: 0, display: 'block' }
```

`body` 必须是 `position: relative`：splitter 的 `right: percent%`、遮罩的 `inset: 0`、窄屏抽屉的 `position: absolute` 都以它为定位父级。

### 1.3 语义 header：三段式

| 区 | 放什么 | 不许放 | 为什么 |
| --- | --- | --- | --- |
| 左 | 品牌（emoji/logo + 名称）+ `vX.Y.Z` chip | 操作按钮、二级导航 | 左缘是 macOS 窗口按钮区（`--dsh-frame-leading-clearance`），放按钮会被挤、被误点 |
| 中 | **一句**状态说明（`flex: 1`，弱化） | 第二组按钮、教程段落、日志 | 吃满中间空白，让右侧按钮自然贴边 |
| 右 | 主操作（五态按钮）+ 必要时「×」收起 | 品牌、版本、设置齿轮 | `margin-left: auto` 一行钉住右缘，不依赖父容器宽度计算 |

```js
const headerStyle = {
  display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto', flexWrap: 'wrap',
  padding: '6px 12px',
  paddingInlineStart: 'var(--dsh-frame-leading-clearance, 12px)', // 必须用变量，不写死
  borderBottom: '1px solid var(--line)',
  background: 'var(--header-bg)',   // 中性极浅一档，不要品牌色铺满
  fontSize: 12,
}
const brandStyle = { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: 'var(--brand-deep)', whiteSpace: 'nowrap', fontSize: 12.5 }
const verStyle = { fontWeight: 500, fontSize: 11, color: 'var(--muted)', background: 'var(--chip-bg)', borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }
const hintStyle = { flex: 1, minWidth: 200, color: 'var(--muted-weak)', fontSize: 11.5 }
const headerActionsStyle = { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto' }
```

渲染骨架（`conversation` 由宿主传入）：

```js
h('header', { style: headerStyle },
  h('span', { style: brandStyle }, `${ICON} ${TITLE}`),
  h('span', { style: verStyle }, `v${VERSION}`),          // VERSION 由构建注入
  h('span', { style: hintStyle }, hintText),              // 一句话
  h('div', { style: headerActionsStyle },
    h('button', { type: 'button', style: buttonStyle, onClick: onAgentClick,
      disabled: connecting || !canOpenSession,
      'aria-label': `AI 对话：${agentLabel}` }, agentLabel),
    hasConversation && paneOpen && h('button', { type: 'button', style: ghostStyle,
      onClick: () => setPaneOpen(false), 'aria-label': '收起 AI 对话面板' }, '×'),
    note && h('span', { style: { color: 'var(--brand)', fontWeight: 600 } }, note),
  ),
)
```

说明文字只描述**当前可做的事与不会发生的事**（如"收起不会结束会话"），不写营销话术：

- 有会话：`右侧是 DSH 原生会话：可拖中间分隔边调整宽度（25%–45%），收起不会结束会话。`
- 无会话：`还没有会话。点右侧「AI 对话」调起原生会话，开场白只填进草稿，不自动发送。`

### 1.4 业务 iframe

```js
h('div', { style: businessStyle },
  h('iframe', {
    key: generation, ref: frameRef, src: UI_ENTRY,
    title: `${TITLE} · ${SUBTITLE}`,
    style: frameStyle,
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
    onLoad: () => { setBroken(false); clearTimeout(brokenTimer.current) },
  }),
)
```

- `src` 必须是 `/api/<pkg>/ui/`，与独立 dev-server 同一份前端；不要在壳层里再写一套业务 DOM。
- `key: generation` 只用于「重新加载」按钮；业务内导航不能触发 iframe 重挂（会丢筛选与滚动位置）。
- 8 秒兜底：挂载后起定时器，`onLoad` 必须清掉；否则页面加载完 8 秒后整个面板会被换成兜底页（真机踩过）。

### 1.5 aside

```js
const paneStyle = {
  display: 'flex', flexDirection: 'column', flex: '0 0 auto', minWidth: 0, minHeight: 0,
  borderLeft: '1px solid var(--line)', background: 'var(--pane-bg)', overflow: 'hidden',
}
h('aside', {
  style: { ...paneStyle,
    ...(narrow ? drawerStyle : null),
    width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`,
    display: paneVisible ? 'flex' : 'none' },
  'aria-label': 'AI 对话',
  'aria-hidden': paneVisible ? undefined : 'true',
}, conversation ?? h('div', { style: padStyle }, /* 空态三行，不假装已接通 */))
```

`paneVisible = paneOpen && (hasConversation || connecting)`。收起只改这一个布尔，**不卸载** `conversation`。

---

## 2. 会话合同

### 2.1 `conversation` prop 与「有没有会话」的判据

customFrame 下 `conversation` **恒非空**：宿主即使没有会话，也会交进来一个 `display:none` 的容器。拿 `Boolean(conversation)` 当"已有会话"，会出现三连坏：按钮永远是「收起 AI 对话」、`ensureSession` 永不触发、空白 aside 常驻（breast-cancer 2026-10-24 实机教训）。

正确判据：问服务，不问 prop。

```js
function currentSession() {
  const service = bridge?.desktopWorkbenches
  if (typeof service?.currentSession === 'function') return service.currentSession() || null
  const snapshot = bridge?.sessions?.list?.getSnapshot?.()
  return snapshot?.current || Object.keys(snapshot?.byId || {}).find((id) =>
    (snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) || null
}
function workbenchOwnsSession(sessionId) {
  if (!sessionId) return false
  const service = bridge?.desktopWorkbenches
  return typeof service?.ownsSession === 'function' ? service.ownsSession(sessionId) : false
}
function ownedSession() {
  const id = currentSession()
  return workbenchOwnsSession(id) ? id : null
}
```

- `hasConversation = Boolean(ownedSession())`，且必须随 `desktopWorkbenches.subscribe()` 重算（会话可能是左侧列表或页面按钮建的，不重算会一直停在首帧的 `false`）。
- 挂载后再补算一次：从左侧列表进来时已经有会话，不会触发 subscribe 回调。
- 所有权不通过 → **不发送、不猜会话**。

### 2.2 `ensureSession`：只在用户显式点击时调一次

```js
async function openAgent(prompt = null) {
  setNote('')
  if (!canOpenSession) { setNote('当前 Desktop 版本不支持从面板调起会话；请从左侧会话列表新建会话'); return }
  setConnecting(true)
  try {
    let dir = null
    try { const res = await fetch(`${API_PREFIX}/health`); dir = (await res.json())?.dir || null } catch { /* 拿不到目录也照样调起 */ }
    // 空 folder 会让 ensureSession 直接失败，比"没传"更糟：只在拿到真实目录时传。
    const id = await bridge.desktopWorkbenches.ensureSession(dir ? { folder: dir } : {})
    rememberDraft({ sessionId: id, prompt: prompt || onboardingPrompt(dir) })
    flushDraft()
    setPaneOpen(true)
    setNote('会话已就绪：草稿已填入右侧输入框，按回车发送')
  } catch (error) {
    setNote(`没能调起会话：${error?.message ?? error}`)
  } finally { setConnecting(false) }
}
```

四条不可让步：

1. 首次**显式**点击才创建；加载时不静默新建。
2. `connecting` 期间按钮 `disabled`，文案「正在连接…」，重复点击与慢返回不重复创建。
3. 失败保留工作台状态，`note` 写可读原因，用户可再点重试。
4. 能力缺失（`ensureSession` 不是函数）→ 按钮禁用 + 文案「AI 对话暂不可用」+ note 说明降级路径；**绝不自建聊天框兜底**。

### 2.3 `ensureSession` / `appendDraft`：只填草稿，不自动发送

原生输入面（实测 API）：

```js
const actx = bridge.sessions.scope(sessionId)
const conversation = actx?.get?.('conversation')
if (!conversation) throw new Error('对话输入不可用')
const input = conversation.input.for(actx)
```

`appendDraft(sessionId, prompt)` 的标准形状：

```js
function appendDraft(sessionId, prompt) {
  if (!sessionId || ownedSession() !== sessionId) throw new Error('会话已切换，请回到本工作台再操作')
  const scoped = bridge.sessions.scope?.(sessionId)
  const conversation = scoped?.get?.('conversation')
  if (!conversation) throw new Error('对话输入不可用')
  const input = conversation.input.for(scoped)
  const snapshot = input.state.getSnapshot()
  if (snapshot.occurrences?.length || (snapshot.phase && snapshot.phase !== 'plain')) {
    throw new Error('当前草稿含引用或正在提交，请先在原生会话里处理')
  }
  const current = snapshot.draft || ''
  input.setDraft(current.trim() ? `${current}\n\n${prompt}` : prompt)   // 追加，不覆盖
}
```

硬约束：

- **只 `setDraft`，不 `submit`。** 何时发送由用户按回车决定；工作台不替患者发言。
- 现有草稿非空时**追加**（`current + '\n\n' + prompt`），不覆盖、不合并附件；`phase` 非 `plain` 或有 `occurrences`（引用/特殊输入）时拒填并给 note，让用户先在原生界面处理。
- 送达队列：`pendingDraft = { sessionId, prompt }`，写 `localStorage`（键形如 `<scope>.initial-drafts.v1`），`setInterval(..., 500)` 里 `flushDraft()` 重试；composer 未就绪就留在队列，就绪后自动填入。隐私模式 `try/catch` 忽略。
- 页面 → 壳层的 `postMessage`：**同时**校验 `event.source === frameRef.current.contentWindow` 与 `event.origin === location.origin`，`prompt` 截断到 8000 字符，空串直接丢。只校验 origin 挡不住同源的其他窗口。
- 送达文案三态：已填入（`'已把这一页的内容填入会话草稿，按回车发送'`）、输入框未就绪（`'会话输入框还没就绪；草稿已暂存，就绪后自动填入'`）、正在调起会话。
- **唯一获准的例外**：若项目经用户显式授权"一键发送"，按 `docs/34-AGENT-DRAFT-SEND.md` 做（`send: true` + 双守卫 `phase === 'plain'` 与非空才 `submit`），并留痕：CHANGELOG + 交互设计修订段写清授权依据。**不许在实现里悄悄改**；本文基线始终是"只填不发"。

### 2.4 收起 / 重开

- 顶栏是**唯一入口**（五态按钮 + 独立「×」）。面板内部不再放第二组开合控件。
- 收起只切 `paneOpen` 与 `display`，不调用任何 close/delete 接口；再点「打开 AI 对话」回到同一会话，输入框草稿仍在。
- 五态文案固定，不自造词：

| 状态 | 文案 | 点击行为 |
| --- | --- | --- |
| 无会话 | `AI 对话` | `ensureSession({ folder })` |
| 连接中 | `正在连接…` | 禁用 |
| 已连接且展开 | `收起 AI 对话` | 只隐藏，不结束会话 |
| 已连接且收起 | `打开 AI 对话` | 重新显示同一会话 |
| 服务缺失 | `AI 对话暂不可用` | 禁用 + note 说明原因 |

- 工作台打开时 `paneOpen` 默认 `true`，但 `paneVisible` 仍由"有没有会话"决定：没有会话就不显示空白面板。

---

## 3. 分隔线：1px 视觉 + 11px 命中

### 3.1 几何

| 项 | 值 | 说明 |
| --- | --- | --- |
| 视觉线 | `width: 1`，`marginRight: -0.5` | 绝对定位在边界上，**不占布局宽度** |
| 定位 | `position: absolute; top: 0; bottom: 0; right: percent%` | 与 aside 宽度同源；两者不一致会出现缝 |
| 层级 | `zIndex: 2` | 低于拖动遮罩（4） |
| 热区 | 子元素 `left: -5, width: 11` | 11px 命中，线条本身不因"好拖"而变粗 |
| 光标 | `cursor: col-resize`；`touchAction: none` | 触控板/触屏都不触发页面滚动 |

```js
const splitterStyle = {
  position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
  zIndex: 2, background: 'var(--line)', cursor: 'col-resize', touchAction: 'none',
  transition: 'background .15s ease, box-shadow .15s ease',
}
const splitterHitStyle = { position: 'absolute', top: 0, bottom: 0, left: -5, width: 11, background: 'transparent', cursor: 'col-resize' }
```

### 3.2 悬停与拖动：品牌色发光

```js
const SPLITTER_BRAND = '#3E7C8F'   // 换成本仓品牌色，不许写死蓝色
const rgba = (hex, a) => { const n = parseInt(String(hex).replace('#',''), 16)
  return `rgba(${(n>>16)&255}, ${(n>>8)&255}, ${n&255}, ${a})` }
const splitterHoverStyle = { ...splitterStyle, background: SPLITTER_BRAND,
  boxShadow: `0 0 6px ${rgba(SPLITTER_BRAND, 0.55)}` }
const splitterDragStyle = { ...splitterHoverStyle,
  boxShadow: `0 0 10px ${rgba(SPLITTER_BRAND, 0.8)}` }
```

- 悬停 6px 光晕、拖动 10px 光晕；颜色从 `SPLITTER_BRAND` **派生**（`rgba()` 工具函数），不要在别处另写一个品牌色号。
- 需要浅一档的底色时用 `mix(hex, ratio)` 向白混合，不要引入第二个色号。

### 3.3 ⠿ 悬浮胶囊

```js
const splitterGripStyle = {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
  color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
  opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
}
```

只在 `hovering || dragging` 时渲染；`pointerEvents: 'none'` 保证它不抢命中、不挤压内容。

### 3.4 拖动：容器 rect、步进、持久化

```js
const percentOf = (event) => (rect.right - event.clientX) / rect.width   // 会话在右：越靠左越宽
const applyWidth = (next) => { const snapped = round4(snapWidth(next)); setWidth(snapped); saveWidth(snapped) }
const snapWidth = (v) => clampWidth(Math.round(v / AGENT_STEP) * AGENT_STEP)
```

- **按 `shellRef`（body）的 `getBoundingClientRect()` 夹取**，不用 `window.innerWidth`：窗口有 macOS 侧栏/窗口按钮避让时，比例换算会整体偏移，拖到边界卡住或跳一格。
- 区间 `25%–45%`、默认 `35%`、步进 `2%`；`AGENT_MIN/MAX/DEFAULT/STEP` 全部来自 `lib/layout.js` 的 `AGENT_PANE`，由构建注入，不在客户端写数值。
- `round4` 保留 4 位小数；`localStorage` 键 `<scope>.agent-pane.v1`，读回时**必须过一遍 `clampWidth()`**（手改或旧版越界会打开即坏布局）。隐私模式写入失败静默忽略。
- 常数表：

| 常量 | 值 |
| --- | --- |
| `AGENT_DEFAULT` | 0.35 |
| `AGENT_MIN` / `AGENT_MAX` | 0.25 / 0.45 |
| `AGENT_STEP` | 0.02 |
| `NARROW_BELOW` | 760（按**容器**宽度） |
| `DRAWER_MAX` | 420 |

### 3.5 键盘与 ARIA

```js
h('div', {
  role: 'separator', 'aria-orientation': 'vertical', 'aria-label': '调整 AI 对话面板宽度',
  'aria-valuemin': Math.round(AGENT_MIN * 100),
  'aria-valuemax': Math.round(AGENT_MAX * 100),
  'aria-valuenow': percent, tabIndex: 0,
  style: { ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle), right: `${percent}%` },
  onPointerDown, onPointerEnter: () => setHovering(true), onPointerLeave: () => setHovering(false), onKeyDown,
},
  h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
  (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null)
```

- `←` = 加宽（会话在右），`→` = 收窄，步进与鼠标同为 `AGENT_STEP`；`Home` → `AGENT_MAX`，`End` → `AGENT_MIN`。键盘与鼠标必须落在同一组取值上。
- 焦点态给 `splitterFocusStyle`（品牌色 + `0 0 0 1px rgba(brand,.5)`），否则 Tab 到它看不出焦点。
- 窄屏或面板不可见时**不渲染**这个节点（而不是 `visibility: hidden` 留一个还能 Tab 到的空壳）。

### 3.6 拖动遮罩与指针捕获

```js
const dragShieldStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 4,
  cursor: 'col-resize', background: 'transparent', touchAction: 'none' }
// 渲染：dragging && !narrow && h('div', { 'aria-hidden': 'true', style: dragShieldStyle })
```

**遮罩不是装饰。** 指针一旦掠到业务 iframe 上，指针事件就归子文档，`document` 上的 `pointermove` 收不到，拖动会在 iframe 边缘断开并卡住。遮罩让整个面板都成为本窗口的命中区。

```js
const onSplitterPointerDown = (event) => {
  event.preventDefault()
  try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 旧宿主无捕获：document 监听仍可拖动 */ }
  dragHostRef.current = shellRef.current
  setDragging(true)
}
React.useEffect(() => {
  if (!dragging) return undefined
  const onMove = (e) => { const host = dragHostRef.current; if (!host) return
    const rect = host.getBoundingClientRect(); if (!rect.width) return; applyWidth(percentOf(e)) }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', stopDrag)
  document.addEventListener('pointercancel', stopDrag)
  return () => { /* 三个都摘掉 */ }
}, [dragging, applyWidth, stopDrag])
```

指针捕获是**加速项**，`document` 监听是**兜底项**：捕获失败也必须能拖。

### 3.7 窄屏：覆盖式抽屉

```js
const drawerStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 3,
  boxShadow: '-8px 0 24px rgba(0,0,0,.16)' }
// aside: width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent}%`
```

- 断点 `760px` 用 **`ResizeObserver` 观察容器宽度**，不用 `window.innerWidth`，也不只看媒体查询——宿主主区宽度不等于窗口宽度。
- 抽屉形态下业务区不让位、splitter 不渲染、遮罩不渲染；面板盖在业务区右侧，仍可收起。
- `< 760px` 是"容器宽度"，不是设备类型。

---

## 4. 主题令牌与尺寸

### 4.1 字号层级（面板壳层）

| 角色 | 字号 / 字重 | 备注 |
| --- | --- | --- |
| 品牌名 | 12.5px / 700 | 不加字距 |
| 版本 chip | 11px / 500 | 中性灰底，不跟品牌主色（元信息） |
| 状态说明 | 11.5px / 400 | `min-width: 200px`，防压成竖排 |
| 主按钮 | 继承 12px / 600 | 白字 |
| 面板空态正文 | 12.5px / 400 / 行高 1.75 | 只解释"为什么会空、能做什么" |

大字模式（`--tz` 倍率）下壳层字号要乘系数（`calc(12.5px * var(--tz))`），但版本 chip 与说明文字**不得放大超过一档**；元信息不抢空间。

### 4.2 间距

| 位置 | 值 |
| --- | --- |
| header 内边距 | `6px 12px` |
| header 元素间距 | `gap: 10px` |
| 按钮组内 | `gap: 6px` |
| 品牌与版本之间 | 可收紧到 `7px`（本家族取 7） |
| 面板空态 | `padding: 20px`，`gap: 8px` |

### 4.3 按钮与胶囊

| 元素 | 值 |
| --- | --- |
| 主按钮 | `padding: 5px 14px`，`border-radius: 999px`，品牌色底 + 白字 |
| 幽灵按钮（×） | 透明底 + 1px 中性边框，品牌色字 |
| 版本 chip | `padding: 1px 8px`，`radius: 999px` |
| ⠿ 胶囊 | `14 × 22`，`radius: 4`，`font-size: 11` |
| splitter 热区 | 宽 `11`，线条 `1` |

操作区在触屏/大屏场景下仍需满足 ≥44px 的可点区域时，用**透明外扩**补，不要把按钮本身撑大（会顶破 header 高度）。

### 4.4 颜色：不写死蓝色，用本仓品牌色

| 角色 | 取法 |
| --- | --- |
| 面板/header 背景 | 中性浅灰，或品牌色相 ≤5% 的极浅一档 |
| header 下边框 / splitter 常规色 | 比背景深一档的中性浅线（`--line`） |
| 品牌名 | `--brand-deep`（非纯黑） |
| 版本 chip | 中性灰底 + 中性灰字 |
| 主按钮 | 品牌主色降饱和（约 70–80%），机身唯一强色块 |
| splitter 悬停/拖动 | `SPLITTER_BRAND` = 本仓品牌色，`rgba()` 派生光晕 |
| ⠿ 胶囊 | 同 `SPLITTER_BRAND` |

- **反例（真机被否）**：整条明显粉底 + 高饱和主按钮——"色带太抢"，业务区退到后面。
- 深浅主题都要给值：深色下 header 用比页面背景略亮的中性色，主按钮提亮一档。没做深色就**明确写"当前不支持深色"**，不要留一个半套。
- 令牌落地位置：`public/style.css` 的 `:root` 自定义属性，壳层用 `var(--…)`；`SPLITTER_BRAND` 若必须在 JS 里用（`rgba()` 计算），**只允许出现一次**，并与 CSS 里的 `--brand` 同值。
- 图表字号下限：SVG 内文字 **不小于 10px**，末点数值标签取 11px；轴刻度/日期不得低于 10px（1440 窗口 × 65% 业务区实测可读线）。缩到 9px 以下等于没有标签。

---

## 5. 验收清单

### 5.1 静态断言（可复核，进 `npm run check` 或单独脚本）

在 `src/client.js`（或构建后的 `lib/client.js`）上跑：

```bash
# ① 顺序：splitter 出现在 aside 之前（用 aria-label / role 定位，别用变量名猜）
node -e "const s=require('fs').readFileSync('src/client.js','utf8');
const a=s.indexOf(\"role: 'separator'\");const b=s.indexOf(\"h('aside',\");
if(a<0||b<0||a>b){console.error('顺序错: separator',a,'aside',b);process.exit(1)}
console.log('顺序 OK',a,b)"

# ② 视觉 1px + 热区 11px
grep -q "width: 1, marginRight: -0.5" src/client.js && grep -q "left: -5, width: 11" src/client.js

# ③ 遮罩存在且受 dragging 控制
grep -q "dragShieldStyle" src/client.js && grep -q "dragging && !narrow" src/client.js

# ④ 品牌色派生 + 悬停/拖动光晕
grep -q "SPLITTER_BRAND" src/client.js && grep -q "0 0 6px" src/client.js && grep -q "0 0 10px" src/client.js

# ⑤ 参数区间/默认/步进齐全
grep -q "AGENT_MIN" src/client.js && grep -q "AGENT_MAX" src/client.js && grep -q "AGENT_STEP" src/client.js

# ⑥ 指针捕获与容器 rect
grep -q "setPointerCapture" src/client.js && grep -q "getBoundingClientRect" src/client.js
grep -q "window.innerWidth" src/client.js && echo "警告：拖动用了 window.innerWidth"
```

参数侧（`lib/layout.js`）：`assertPanelConfig()` 必须通过——`businessSide ∈ left|right`、`businessWidth ∈ 0.25–0.7` 且不等于 0.7、`customFrame === true`、`min < def < max`、`max ≤ 0.45`。

### 5.2 smoke 渲染

- `npm test` 0 fail（A 类仓的 `check` 已含 `node --test test/*.test.mjs`）。
- `npm run check` exit 0，且链上包含：`build-client.mjs --check`（注入占位符未漏）、`check-host-contract.mjs`、`smoke-activate.mjs`、`check-version-literal.mjs`。
- `build-client.mjs --check` 要能证明"占位符全部被替换"：`lib/client.js` 里不应残留 `__AGENT_MIN__` 之类的字面量。

### 5.3 真机三看（装机后，人工）

1. **线是细线**：业务区与会话之间只有 1px 分界，不占宽度、不压业务内容。
2. **悬停**：线变品牌色并向两侧发光（6px），出现 ⠿ 胶囊；拖动时光晕加强到 10px。
3. **拖动**：按住左右都能连续拖，指针掠过业务 iframe 上方不中断、不跳；`←`/`→` 步进 2%，`Home`/`End` 到 45%/25%；重开工作台恢复上次宽度。

外加一条状态验收：收起 → 再打开，**回到同一会话且输入框草稿仍在**；无会话时业务区照常可用。

### 5.4 装机前版本一致性

四处必须同值，任何一处漂移都算未通过：

| 处 | 检查 |
| --- | --- |
| `VERSION`（仓库根） | 唯一手写源 |
| `package.json` → `version` | `node -p "require('./package.json').version"` |
| `lib/version.js` → `version` / `displayVersion` | 由 `scripts/build-version.mjs` 生成，不手改 |
| `public/index.html` 显现字面量（或 `__VERSION_DISPLAY__` 占位符） | `node scripts/check-version-literal.mjs` |

配套三条：

- 升版顺序：改 `VERSION` → `npm run build:version` →（有 `sync:public`/`build:public` 的跑它）→ `npm run build:client` → `npm run check`。
- 壳层顶栏的 `v${VERSION}` 由 `build-client.mjs` 注入 `__VERSION__`，**客户端不写第二份**；业务页页头/页脚若也有版本号，与壳层同源。
- README / `docs/screenshots` 的截图版本：升版后重跑 `npm run shots:readme`，删除旧版本图；无脚本的仓在 README 里标注截图版本，并保证不谎报。
- 装机时序：DSH Desktop 主进程启动时间必须晚于 tgz 的 mtime，否则加载的仍是旧客户端（看起来"改了没生效"）。

### 5.5 交付判据

- [ ] 静态断言 ①–⑥ 全绿；
- [ ] `npm test` 0 fail、`npm run check` exit 0；
- [ ] 真机三看通过，收起/重开同一会话；
- [ ] 版本四处一致，README 截图无旧版；
- [ ] 未安装 Desktop 时，结论写"V2 未验证"，不写"已完成"。

---

## 6. 常见坑（按发生频率排序）

| # | 坑 | 现象 | 正确做法 |
| --- | --- | --- | --- |
| 1 | **splitter 排在 `aside` 之后** | 分界线贴到面板最右缘，看得见的那条线没有悬停高亮、拖不动 | DOM 顺序 `business → splitter → shield → aside`；用 `indexOf` 断言兜住 |
| 2 | **乐观 6px/10px 实体条** | 线"看起来明显"，但它占布局宽度：业务区被白压 5–9px，`right: percent%` 与 aside 宽度对不上出现错位 | 视觉 1px 绝对定位 + 11px 透明子元素热区；宽度只由 `percent%` 决定 |
| 3 | **无拖动遮罩** | 指针移到业务 iframe 上就断拖，松手后还停不下来/卡住 | `dragging && !narrow` 渲染 `inset: 0, zIndex: 4` 的透明遮罩 |
| 4 | **版本字面量漂移** | 页面显示旧版、`check-version-literal` 红、用户拿旧版本号提问 | 版本唯一写 `VERSION`，`build:version` + 构建注入；页面用占位符或同值字面量 |
| 5 | **README 截图版本过期** | 文档写着 v0.1.1，装的是 v0.2.x | 升版重跑 `shots:readme` 并删旧图；无脚本就标注截图版本 |
| 6 | **用 `Boolean(conversation)` 判"有会话"** | 按钮永远「收起 AI 对话」、`ensureSession` 永不触发、空白 aside 常驻 | `currentSession()` + `ownsSession()` + subscribe 重算 |
| 7 | **收起时卸载 `conversation`** | 再打开草稿没了、输入框状态丢失 | 恒定挂载，只切 `display`/`paneOpen` |
| 8 | **拖动按 `window.innerWidth` 算** | 有侧栏/窗口按钮避让时比例整体偏移，拖到边界跳一格 | 用 body 的 `getBoundingClientRect()` |
| 9 | **`ensureSession({ folder: null })`** | 点击"没反应"（宿主直接失败） | 只在拿到真实目录时传 `folder`，否则传 `{}` |
| 10 | **窄屏仍渲染 splitter** | 覆盖抽屉形态下还能 Tab 到一条看不见的分隔线 | 窄屏不渲染 splitter / 遮罩，用 `ResizeObserver` 判容器宽 |
| 11 | **颜色写死蓝色** | 与仓库品牌色不符，换品牌要改多处 | `SPLITTER_BRAND` 单点 + `rgba()` 派生；其余走 `var(--…)` |
| 12 | **`right` 与 aside 宽度不同源** | 分隔线与面板边缘差 1–2px，出现双线或缝 | 两者都由同一个 `percent` 渲染 |
| 13 | **8 秒兜底定时器没清** | 页面加载完 8 秒后整个面板被兜底页替换，正在用的弹窗消失 | `onLoad` 里 `clearTimeout` |
| 14 | **`postMessage` 只校验 origin** | 同源的其他窗口也能把内容塞进会话 | 同时校验 `event.source === iframe.contentWindow` |

---

## 7. 与其他文档的关系

| 主题 | 文档 |
| --- | --- |
| 形态判定、split vs customFrame、宽度来源唯一 | `docs/20-AGENT-PANE-DESIGN.md` §2 |
| 顶栏结构、尺寸表、换色规则、反例 | `prompts/DSH-WORKBENCH-TOP-BAR.md` |
| 交互合同全文（入口、草稿冲突、私密边界） | `prompts/DSH-AGENT-PANE-INTEGRATION.md` |
| 分隔线逐仓改造任务书、A/B/C 分类 | `prompts/FAMILY-SPLITTER-ALIGNMENT.md` |
| 一键发送（唯一获准的"发送"变体）与断言 | `docs/34-AGENT-DRAFT-SEND.md` |
| 页面版本字面量闸门 | `docs/35-PAGE-VERSION-LITERAL.md` |
| 业务区窄宽规则（iframe 视口 = 业务面板宽度） | `docs/30-RESPONSIVE-RULES.md` |
| 宿主合同（`register` 参数、服务名、鉴权） | `docs/02-DSH-CONTRACT.md` |
| 令牌、渐进披露、字号与可读性 | `docs/03-DESIGN-SYSTEM.md` |

**照抄落点**（A 类仓）：`src/client.js` 的样式常量与 `Panel`、`scripts/build-client.mjs` 的 `AGENT_*` 注入、`lib/layout.js` 的 `PANEL`/`AGENT_PANE`、`test/` 里的面板/版本断言。改完只提交这些文件，不动业务视图函数与面板参数。