window.__ModuleLoader__.load({
  id: "@xyb-community/behcet-workbench",
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const metadata = {"title":"小贝宝 BeiPal 白塞病工作台","description":"帮助白塞病成年患者及授权代记者整理从疑似到长期随访的资料。"}
    const theme = "/* Scope to business content; never style host navigation globally. */\n.wb-behcet {\n  --wb-paper: #f7faf8; --wb-surface: #ffffff; --wb-ink: #34413c;\n  --wb-muted: #596c62; --wb-line: #dce7df; --wb-mint: #e2f2ea;\n  --wb-mint-ink: #22664e; --wb-action: #b95023; --wb-action-ink: #ffffff;\n  --wb-pink: #f8e8eb; --wb-blue: #eaf1f6; --wb-yellow: #faf2d8;\n  --wb-radius: 18px; --wb-gap: 16px; --wb-group-gap: 24px;\n  color: var(--wb-ink); background: var(--wb-paper); font: 16px/1.65 -apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Microsoft YaHei\",sans-serif;\n  font-variant-numeric: tabular-nums; min-width: 0; min-height: 0; container-type: inline-size;\n}\n.wb-behcet[data-font=large] { font-size: 19px; }\n.wb-behcet * { box-sizing: border-box; }\n.wb-behcet button,.wb-behcet input,.wb-behcet select { font: inherit; }\n.wb-behcet button { min-height: 44px; cursor: pointer; }\n.wb-behcet :focus-visible { outline: 3px solid var(--wb-mint-ink); outline-offset: 3px; }\n.wb-behcet .wb-primary { background: var(--wb-action); color: var(--wb-action-ink); border: 0; border-radius: 999px; padding: 9px 20px; }\n.wb-behcet .wb-flower { display: inline-block; width: 24px; height: 24px; flex: 0 0 auto; margin-inline-end: 10px; animation: wb-flower-turn 12s linear infinite; }\n@keyframes wb-flower-turn { to { transform: rotate(360deg); } }\n@media (prefers-color-scheme: dark) {\n  .wb-behcet { --wb-paper:#17231f; --wb-surface:#20322a; --wb-ink:#edf5ef; --wb-muted:#c0d2c6; --wb-line:#496354; --wb-mint:#294f3f; --wb-mint-ink:#a0ddbd; --wb-action:#f3a578; --wb-action-ink:#39200e; --wb-pink:#45333a; --wb-blue:#283d4c; --wb-yellow:#473e25; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .wb-behcet .wb-flower { animation:none; }\n}\n"
    function Panel() {
      const [health, setHealth] = React.useState(null)
      const [error, setError] = React.useState('')
      const [large, setLarge] = React.useState(false)
      const [attempt, setAttempt] = React.useState(0)
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
      return h('main', { className: 'wb-behcet', 'data-font': large ? 'large' : 'standard', style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 20, overflow: 'auto' } },
        h('header', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', paddingInlineStart: 'var(--dsh-frame-leading-clearance, 0px)' } },
          h('strong', null, metadata.title),
          h('span', { 'aria-live': 'polite' }, health ? `v${health.version}` : '版本待连接'),
          h('button', { type: 'button', 'aria-pressed': large, onClick: () => setLarge(!large) }, large ? '标准字' : '大字')),
        h('style', null, theme),
        h('section', { style: { background: 'var(--wb-surface)', border: '1px solid var(--wb-line)', borderRadius: 'var(--wb-radius)', padding: 20 } },
          h('h1', { style: { fontSize: '1.6em', margin: '0 0 12px' } }, metadata.title),
          h('p', null, metadata.description),
          h('p', { role: 'status' }, error || (health ? '接入骨架：服务已连接，业务功能待按 spec 实现。' : '正在连接本机服务…')),
          h('button', { type: 'button', className: 'wb-primary', onClick: () => setAttempt((value) => value + 1) }, '重新检查连接')))
    }
    function apply(ctx) {
      ctx.effect(() => ctx.desktopWorkbenches.register({"title":"小贝宝 BeiPal 白塞病工作台","repository":"https://github.com/xyb-openharness-dsh-plugins/behcet-workbench","description":"帮助白塞病成年患者及授权代记者整理从疑似到长期随访的资料。","customFrame":true}, Panel))
    }
    return { apply, inject: ['desktopWorkbenches'] }
  }
})
