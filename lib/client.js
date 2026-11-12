window.__ModuleLoader__.load({
  id: "@xyb-community/behcet-workbench",
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const metadata = {"title":"小贝宝 BeiPal · 白塞病工作台","description":"帮助白塞病成年患者及授权代记者整理从疑似到长期随访的资料。"}
    /* layout:begin（由 scripts/build-version.mjs 从 lib/layout.js 注入，勿手改） */
    const layout = {"customFrame":true,"businessWidth":0.65,"agentPane":{"min":0.25,"max":0.45,"default":0.35,"step":0.02,"narrowBelowPx":760,"drawerMaxPx":420}}
    /* layout:end */
    const theme = "/* Scope to business content; never style host navigation globally. */\n.wb-behcet {\n  --wb-paper: #f7faf8; --wb-surface: #ffffff; --wb-ink: #34413c;\n  --wb-muted: #596c62; --wb-line: #dce7df; --wb-mint: #e2f2ea;\n  --wb-mint-ink: #22664e; --wb-action: #b95023; --wb-action-ink: #ffffff;\n  --wb-pink: #f8e8eb; --wb-blue: #eaf1f6; --wb-yellow: #faf2d8;\n  --wb-radius: 18px; --wb-gap: 16px; --wb-group-gap: 24px;\n  color: var(--wb-ink); background: var(--wb-paper); font: 16px/1.65 -apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Microsoft YaHei\",sans-serif;\n  font-variant-numeric: tabular-nums; min-width: 0; min-height: 0; container-type: inline-size;\n}\n.wb-behcet[data-font=large] { font-size: 19px; }\n.wb-behcet * { box-sizing: border-box; }\n.wb-behcet button,.wb-behcet input,.wb-behcet select { font: inherit; }\n.wb-behcet button { min-height: 44px; cursor: pointer; }\n.wb-behcet :focus-visible { outline: 3px solid var(--wb-mint-ink); outline-offset: 3px; }\n.wb-behcet .wb-primary { background: var(--wb-action); color: var(--wb-action-ink); border: 0; border-radius: 999px; padding: 9px 20px; }\n.wb-behcet .wb-flower { display: inline-block; width: 24px; height: 24px; flex: 0 0 auto; margin-inline-end: 10px; animation: wb-flower-turn 12s linear infinite; }\n@keyframes wb-flower-turn { to { transform: rotate(360deg); } }\n@media (prefers-color-scheme: dark) {\n  .wb-behcet { --wb-paper:#17231f; --wb-surface:#20322a; --wb-ink:#edf5ef; --wb-muted:#c0d2c6; --wb-line:#496354; --wb-mint:#294f3f; --wb-mint-ink:#a0ddbd; --wb-action:#f3a578; --wb-action-ink:#39200e; --wb-pink:#45333a; --wb-blue:#283d4c; --wb-yellow:#473e25; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .wb-behcet .wb-flower { animation:none; }\n}\n"

    /* 面板参数全部来自注入的 lib/layout.js 快照（H15：客户端不写第二份默认值） */
    const AGENT_MIN = layout.agentPane.min
    const AGENT_MAX = layout.agentPane.max
    const AGENT_DEFAULT = layout.agentPane.default
    const AGENT_STEP = layout.agentPane.step
    const NARROW_BELOW = layout.agentPane.narrowBelowPx
    const DRAWER_MAX = layout.agentPane.drawerMaxPx
    const WIDTH_KEY = 'behcet.panelWidth'
    /* 业务界面入口：与 dsh/index.js 的 UI_PREFIX + '/' 对齐（注册路径本身不带尾斜杠，见那边注释） */
    const UI_ENTRY = '/api/behcet/ui/'

    const clampRatio = (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return AGENT_DEFAULT
      return Math.max(AGENT_MIN, Math.min(AGENT_MAX, n))
    }

    /* 资料目录口径（与服务端 dsh/server.js 同一条规则）：主目录本身 / 桌面 /
       下载根目录 / tmp 一律不当资料目录；源码目录也不是资料目录。
       拒绝必须给人话理由——静默接受比报错更危险（用户以为数据在那儿，其实不在）。 */
    const HOME_EXACT = /^(\/Users\/[^/]+|\/home\/[^/]+|\/root|[A-Za-z]:\\Users\\[^\\]+)$/i
    const FORBIDDEN_DIR = /((Desktop|桌面)$|(Downloads?|下载(夹)?)$|^(\/tmp|\/private\/tmp|\/var\/folders\/|\/private\/var\/folders\/))/i
    const isForbiddenDir = (dir) => HOME_EXACT.test(String(dir || '').replace(/\/+$/, '')) || FORBIDDEN_DIR.test(String(dir || '').replace(/\/+$/, ''))
    const DATA_ROOT_URL = '/api/behcet/api/root'
    const loadWidth = () => {
      try { return clampRatio(localStorage.getItem(WIDTH_KEY)) } catch { return AGENT_DEFAULT }
    }
    const saveWidth = (value) => {
      try { localStorage.setItem(WIDTH_KEY, String(value)) } catch { /* 隐私模式下写不进去，不挡使用 */ }
    }

    /* 分隔线品牌色（与顶栏主按钮同色）；悬停/拖动时由该色派生光晕 */
    const SPLITTER_BRAND = '#22664e'
    const splitterRgba = (hex, alpha) => {
      const raw = hex.replace('#', '')
      const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
      const n = parseInt(full, 16)
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
    }

    /* ---------------- 会话判定（官方 dsh-site-selection 同款） ---------------- */
    let bridge = null
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
      if (typeof service?.ownsSession === 'function') return service.ownsSession(sessionId)
      return false
    }
    function ownedSession() {
      const id = currentSession()
      return workbenchOwnsSession(id) ? id : null
    }

    function Panel({ conversation }) {
      const [health, setHealth] = React.useState(null)
      const [error, setError] = React.useState('')
      const [large, setLarge] = React.useState(false)
      const [attempt, setAttempt] = React.useState(0)
      const [percent, setPercent] = React.useState(loadWidth)
      const [paneOpen, setPaneOpen] = React.useState(true)
      const [narrow, setNarrow] = React.useState(false)
      const [dragging, setDragging] = React.useState(false)
      const [hovering, setHovering] = React.useState(false)
      const [note, setNote] = React.useState('')
      /* 业务界面在 public/（由 scripts/build-public.mjs 从 prototypes/v0.2 产出）；
         探不到界面才退回占位骨架 —— 否则面板会是一片空白。 */
      const [uiBroken, setUiBroken] = React.useState(false)
      const [dataDir, setDataDir] = React.useState('')
      const [dirNote, setDirNote] = React.useState('')

      const shellRef = React.useRef(null)
      const frameRef = React.useRef(null)
      const creatingRef = React.useRef(false) // 防连点：不能并发创建出两条会话

      /* 会话判定**不看 conversation prop**：customFrame 下宿主即使没有会话也会传一个隐藏容器，
         Boolean(conversation) 恒为真 → 点「AI 对话」既不创建也不展开，表现为"点了没反应"。
         改用宿主归属判定（ownsSession + currentSession），与官方 dsh-site-selection 一致。 */
      const [paneTick, setPaneTick] = React.useState(0)
      void paneTick // 读一次：否则 setPaneTick 不会触发重渲染
      const activeSession = ownedSession()
      const hasConversation = Boolean(activeSession) // pane-contract-allow
      const canCreateSession = typeof bridge?.desktopWorkbenches?.newSession === 'function'

      /* 会话新建 / 切换 / 归属变化 → bump tick 重渲染，按钮状态与面板跟着换 */
      React.useEffect(() => {
        const unsubscribe = bridge?.desktopWorkbenches?.subscribe?.(() => setPaneTick((value) => value + 1))
        return () => { try { unsubscribe?.() } catch { /* 已卸载 */ } }
      }, [])

      /* 显式创建归属会话：只在用户点「AI 对话」时调一次，不自动发送任何内容。 */
      const createOwnedSession = React.useCallback(async () => {
        const service = bridge?.desktopWorkbenches
        if (typeof service?.newSession !== 'function') {
          setNote('宿主没有提供新建会话的能力；业务区照常可用，重启 DSH Desktop 后可再试。')
          return null
        }
        if (creatingRef.current) return null
        creatingRef.current = true
        try {
          let workspaceId
          try { workspaceId = service.defaultWorkspace?.()?.workspaceId } catch { workspaceId = undefined }
          const id = await service.newSession(workspaceId)
          if (!id) {
            setNote('已取消资料目录选择，没有创建会话。可以再次点击「AI 对话」重试。')
            return null
          }
          setNote('')
          return id
        } catch (failure) {
          setNote(`没能创建会话：${failure?.message ?? failure}。可以再次点击「AI 对话」重试。`)
          return null
        } finally {
          creatingRef.current = false
        }
      }, [])

      React.useEffect(() => {
        const controller = new AbortController()
        fetch(UI_ENTRY, { method: 'HEAD', signal: controller.signal, credentials: 'same-origin' })
          .then((response) => {
            if (!response.ok) setUiBroken(true)
            else {
              /* 宿主的 SPA 兜底会把未知路径回成 text/html；那不是界面，别把 HTML 当页面塞进 iframe */
              const type = String(response.headers.get('content-type') || '')
              if (type && !type.includes('text/html')) setUiBroken(true)
            }
          })
          .catch(() => setUiBroken(true))
        return () => controller.abort()
      }, [attempt])

      React.useEffect(() => {
        const controller = new AbortController()
        setHealth(null); setError('')
        fetch('/api/behcet/health', { signal: controller.signal, credentials: 'same-origin' })
          .then(async (response) => {
            if (!response.ok) throw new Error(`服务连接失败 (${response.status})`)
            const result = await response.json()
            if (!controller.signal.aborted) setHealth(result)
          })
          .catch((failure) => { if (!controller.signal.aborted) setError(failure.message) })
        return () => controller.abort()
      }, [attempt])

      /* 当前资料目录：开面板读一次；切换后立即回显。读不到就不显示，别编一个路径。 */
      React.useEffect(() => {
        let alive = true
        fetch(DATA_ROOT_URL, { credentials: 'same-origin' })
          .then((rsp) => (rsp.ok ? rsp.json() : null))
          .then((info) => { if (alive && info && info.dir) setDataDir(info.dir) })
          .catch(() => { /* 未连接就不显示 */ })
        return () => { alive = false }
      }, [attempt])

      /* 「配置目录」= 真入口：宿主选择器 → 口径校验 → 落盘 → 回显。
         「本原型为示意，目录未真实挂载」只允许出现在宿主没有选择能力的降级路径。 */
      const pickDataDir = React.useCallback(async () => {
        const ui = bridge && bridge.uiWorkspace
        if (!ui || typeof ui.pickDirectory !== 'function') {
          const error = '本原型为示意，目录未真实挂载：当前 Desktop 没有提供目录选择能力，数据仍写在默认位置。'
          setDirNote(error)
          return { ok: false, error }
        }
        let dir = ''
        try { dir = await ui.pickDirectory() } catch (failure) {
          const error = '没能打开目录选择器：' + ((failure && failure.message) || failure)
          setDirNote(error)
          return { ok: false, error }
        }
        if (!dir) {
          const error = '已取消选择目录；当前资料目录没有更改。'
          setDirNote(error)
          return { ok: false, error }
        }
        if (isForbiddenDir(dir)) {
          const error = '这个位置不能当资料目录（主目录本身 / 桌面 / 下载根目录 / tmp）。请在里面新建一个专用文件夹再选。'
          setDirNote(error)
          return { ok: false, error }
        }
        try {
          const rsp = await fetch(DATA_ROOT_URL, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dir }),
          })
          const body = await rsp.json().catch(() => ({}))
          if (!rsp.ok) {
            const error = body.error || '目录切换失败'
            setDirNote(error)
            return { ok: false, error }
          }
          const finalDir = body.dir || dir
          setDataDir(finalDir)
          setDirNote('资料目录已切换到：' + finalDir + '（旧目录数据不会自动搬迁）')
          /* 业务区必须跟着换库：否则它还在用旧档案键写新库，保存会报"档案不存在"。 */
          try {
            frameRef.current?.contentWindow?.postMessage({ type: 'behcet:root-changed', dir: finalDir }, window.location.origin)
          } catch { /* iframe 已卸载 */ }
          return { ok: true, dir: finalDir }
        } catch (failure) {
          const error = '目录切换失败：' + ((failure && failure.message) || failure)
          setDirNote(error)
          return { ok: false, error }
        }
      }, [])

      /* 业务 iframe 的「选择本机目录」通过 postMessage 交给外壳：iframe 拿不到宿主能力。 */
      React.useEffect(() => {
        const onMessage = (event) => {
          if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
          if (event.origin !== window.location.origin) return
          const data = event.data || {}
          if (data.type !== 'behcet:pick-directory') return
          pickDataDir().then((result) => {
            try {
              frameRef.current.contentWindow.postMessage({ type: 'behcet:directory-result', ...result }, window.location.origin)
            } catch { /* iframe 已卸载 */ }
          })
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
      }, [pickDataDir])
      React.useEffect(() => {
        const host = shellRef.current
        if (!host || typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect?.width ?? 0
          setNarrow(w > 0 && w < NARROW_BELOW)
        })
        observer.observe(host)
        return () => observer.disconnect()
      }, [])

      React.useEffect(() => { saveWidth(percent) }, [percent])

      /* ---------------- splitter：拖动 ---------------- */
      const onSplitterPointerDown = (ev) => {
        const host = shellRef.current
        if (!host) return
        ev.preventDefault()
        setDragging(true)
        /* 捕获失败不是错误：下面的 document 监听同样能收 move/up */
        try { ev.currentTarget.setPointerCapture?.(ev.pointerId) } catch { /* 降级到 document 监听 */ }
        const rect = host.getBoundingClientRect()
        const move = (e) => {
          /* 按容器 rect 夹取，不按 window.innerWidth */
          const ratio = 1 - (e.clientX - rect.left) / rect.width
          setPercent(clampRatio(ratio))
        }
        const up = () => {
          setDragging(false)
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', up)
          document.removeEventListener('pointercancel', up)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', up)
        document.addEventListener('pointercancel', up)
      }

      const onSplitterKeyDown = (ev) => {
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); setPercent((v) => clampRatio(v + AGENT_STEP)) }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); setPercent((v) => clampRatio(v - AGENT_STEP)) }
        else if (ev.key === 'Home') { ev.preventDefault(); setPercent(AGENT_MAX) }
        else if (ev.key === 'End') { ev.preventDefault(); setPercent(AGENT_MIN) }
      }

      const agentLabel = hasConversation
        ? (paneOpen ? '收起 AI 对话' : '打开 AI 对话')
        : (canCreateSession ? 'AI 对话' : 'AI 对话暂不可用')
      const hintText = hasConversation
        ? (paneOpen
          ? '右侧是 DSH 原生会话：拖动中间分隔边调整宽度（25%–45%），收起不会结束会话。'
          : '会话已收起：点「打开 AI 对话」回到同一会话，草稿还在。')
        : canCreateSession
          ? '还没有会话：点「AI 对话」会按当前工作区新建一个，资料目录由宿主弹出选择。'
          : '宿主没有提供新建会话能力：业务区照常可用，AI 对话暂不可用。'
      const versionLabel = health ? `v${health.version}` : '版本待连接'
      const statusText = error || (health ? '本机服务已连接 · 记录不是诊断，判断归主诊团队' : '正在连接本机服务…')
      const noteText = note || (!canCreateSession && !hasConversation
        ? 'AI 对话入口暂不可用：宿主没有提供 native 会话能力；业务区与连接检查不受影响。'
        : '')

      const headerStyle = {
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '0 0 auto',
        padding: '6px 12px', paddingInlineStart: 'calc(12px + var(--dsh-frame-leading-clearance, 0px))',
        borderBottom: '1px solid var(--wb-line, #dce7df)', background: 'var(--wb-surface, #fff)',
        font: '13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
      }
      const brandStyle = { fontSize: 12.5, fontWeight: 700, color: '#22664e' }
      const versionStyle = {
        fontSize: 11, fontWeight: 500, borderRadius: 999, padding: '1px 8px',
        background: '#eef2ef', color: '#596c62',
      }
      const hintStyle = { flex: 1, minWidth: 200, color: '#596c62', fontSize: 11.5 }
      const actionsStyle = { display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto', marginLeft: 'auto' }
      const ghostButtonStyle = {
        minHeight: 28, padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
        border: '1px solid #dce7df', background: '#fff', color: '#34413c',
      }
      const agentButtonStyle = {
        minHeight: 28, padding: '4px 14px', borderRadius: 999, fontWeight: 600,
        border: `1px solid ${hasConversation || canCreateSession ? SPLITTER_BRAND : '#dce7df'}`,
        background: hasConversation || canCreateSession ? SPLITTER_BRAND : '#f1f4f2',
        color: hasConversation || canCreateSession ? '#fff' : '#8a9a91',
        cursor: hasConversation || canCreateSession ? 'pointer' : 'not-allowed',
      }
      const bodyStyle = { position: 'relative', flex: 1, display: 'flex', minHeight: 0 }
      const businessStyle = { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }
      const paneStyle = {
        position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0,
        borderInlineStart: '1px solid var(--wb-line, #dce7df)', background: 'var(--wb-surface, #fff)',
        overflow: 'hidden',
      }
      const drawerStyle = {
        position: 'absolute', insetBlock: 0, insetInlineEnd: 0, zIndex: 30,
        boxShadow: '-8px 0 24px rgba(0,0,0,.18)',
      }
      /* 1px 视觉细线，绝对定位在业务区与会话区边界上（不占布局宽度）；热区由内部 11px 透明子元素提供 */
      const splitterStyle = {
        position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
        zIndex: 2, background: '#dce7df', cursor: 'col-resize', touchAction: 'none',
        transition: 'background .15s ease, box-shadow .15s ease',
      }
      const splitterHoverStyle = {
        ...splitterStyle, background: SPLITTER_BRAND,
        boxShadow: `0 0 6px ${splitterRgba(SPLITTER_BRAND, 0.55)}`,
      }
      const splitterDragStyle = {
        ...splitterHoverStyle,
        boxShadow: `0 0 10px ${splitterRgba(SPLITTER_BRAND, 0.8)}`,
      }
      const splitterHitStyle = {
        position: 'absolute', top: 0, bottom: 0, left: -5, width: 11,
        background: 'transparent', cursor: 'col-resize',
      }
      const splitterGripStyle = {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
        color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
        opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
      }
      const dragShieldStyle = {
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        zIndex: 4, cursor: 'col-resize',
      }

      /* 业务区：public/ 的界面经 iframe 装进来；探不到才退回占位骨架 */
      const frameStyle = { flex: 1, width: '100%', minHeight: 0, border: 0, display: 'block', background: '#fff' }
      const business = uiBroken
        ? h('main', { className: 'wb-behcet', 'data-font': large ? 'large' : 'standard', style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 20, overflow: 'auto' } },
          h('style', null, theme),
          h('section', { style: { background: 'var(--wb-surface)', border: '1px solid var(--wb-line)', borderRadius: 'var(--wb-radius)', padding: 20 } },
            h('h1', { style: { fontSize: '1.6em', margin: '0 0 12px' } }, metadata.title),
            h('p', null, metadata.description),
            h('p', { role: 'status' }, statusText),
            h('button', { type: 'button', className: 'wb-primary', onClick: () => setAttempt((value) => value + 1) }, '重新检查连接')))
        : h('iframe', {
            key: attempt,
            ref: frameRef,
            src: UI_ENTRY,
            title: '小贝宝 BeiPal · 白塞病工作台',
            style: frameStyle,
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
            onLoad: () => setNote(''),
          })

      return h('div', {
        ref: shellRef,
        style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--wb-paper, #f7faf8)' },
      },
        /* 根节点首个子元素：语义 header（customFrame 合同硬约束） */
        h('header', { style: headerStyle },
          h('strong', { style: brandStyle }, metadata.title),
          h('span', { style: versionStyle }, versionLabel),
          h('span', { style: hintStyle }, hintText),
          h('div', { style: actionsStyle },
            h('button', {
              type: 'button',
              onClick: () => { void pickDataDir() },
              style: ghostButtonStyle,
              'aria-label': dataDir ? `配置目录：当前 ${dataDir}` : '配置资料目录',
              title: dataDir ? `当前资料目录：${dataDir}` : '选择本机资料目录',
            }, dataDir ? '配置目录 · 已设' : '配置目录'),
            uiBroken ? h('button', {
              type: 'button',
              'aria-pressed': large,
              onClick: () => setLarge((value) => !value),
              style: ghostButtonStyle,
            }, large ? '标准字' : '大字') : null,
            h('button', {
              type: 'button',
              'aria-label': `AI 对话：${agentLabel}`,
              'aria-controls': 'behcet-agent-pane',
              'aria-expanded': hasConversation ? paneOpen : false,
              /* 无会话时按钮不能禁用：禁用会让"点它创建会话"这条路永远走不到。
                 只有宿主连 newSession 都没有时才禁用，并在提示里写清降级原因。 */
              disabled: !hasConversation && !canCreateSession,
              onClick: () => {
                if (hasConversation) { setPaneOpen((value) => !value); return }
                if (!canCreateSession) return
                createOwnedSession().then((id) => { if (id) setPaneOpen(true) })
              },
              style: agentButtonStyle,
            }, agentLabel))),

        noteText ? h('p', {
          role: 'status',
          style: { margin: 0, padding: '6px 12px', background: '#faf2d8', color: '#5a4a1a', fontSize: 12.5 },
        }, noteText) : null,

        dirNote ? h('p', {
          role: 'status',
          style: { margin: 0, padding: '6px 12px', background: '#eef6f1', color: '#22664e', fontSize: 12.5 },
        }, dirNote) : null,

        h('div', { style: bodyStyle },
          /* 业务区：iframe（public/）或占位骨架；splitter 与 aside 顺序不变 */
          h('div', { style: businessStyle }, business),
          /* splitter 必须在 aside 之前：排在后面会贴到面板最右缘 */
          !narrow && paneOpen && h('div', {
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': '调整 AI 对话面板宽度',
            'aria-valuemin': Math.round(AGENT_MIN * 100),
            'aria-valuemax': Math.round(AGENT_MAX * 100),
            'aria-valuenow': Math.round(percent * 100),
            tabIndex: 0,
            style: {
              ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle),
              right: `${percent * 100}%`,
            },
            onPointerDown: onSplitterPointerDown,
            onPointerEnter: () => setHovering(true),
            onPointerLeave: () => setHovering(false),
            onKeyDown: onSplitterKeyDown,
          },
            h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
            (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
          /* 原生会话始终挂载：隐藏走 display，不卸载——卸载会丢输入框与草稿 */
          h('aside', {
            id: 'behcet-agent-pane',
            'aria-label': 'AI 对话',
            'aria-hidden': paneOpen ? undefined : 'true',
            style: {
              ...paneStyle,
              ...(narrow ? drawerStyle : null),
              width: narrow ? `min(92%, ${DRAWER_MAX}px)` : `${percent * 100}%`,
              display: paneOpen ? 'flex' : 'none',
            },
          }, conversation ?? h('div', { style: { padding: 20, display: 'flex', flexDirection: 'column', gap: 8, font: '14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif', color: '#596c62' } },
            h('b', null, 'AI 对话还没开始'),
            h('span', null, '宿主的 DSH 原生会话节点会固定出现在这一侧。'),
            h('span', null, '没有会话也不影响业务区：连接检查与占位内容照常可用。'))),
          /* 拖动期间铺透明遮罩：指针掠过业务区时事件仍归文档，拖动不断 */
          dragging ? h('div', { style: dragShieldStyle, 'aria-hidden': 'true' }) : null))
    }

    function apply(ctx) {
      bridge = ctx // 会话判定/创建都走宿主上下文代理，不在 Panel 里另取
      /* businessWidth 必须放在 layout 里：宿主只读 descriptor.layout.businessWidth，
         顶层写 businessWidth 会被忽略并退回默认 0.36（家族基线是 0.65）。 */
      ctx.effect(() => ctx.desktopWorkbenches.register({"title":"小贝宝 BeiPal · 白塞病工作台","repository":"https://github.com/xyb-openharness-dsh-plugins/behcet-workbench","description":"帮助白塞病成年患者及授权代记者整理从疑似到长期随访的资料。","customFrame":layout.customFrame,"layout":{"businessWidth":layout.businessWidth}}, Panel))
    }
    return { apply, inject: ['desktopWorkbenches', 'uiWorkspace'] }
  }
})