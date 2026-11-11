// 面板与布局参数的唯一来源。
//
// 为什么单独一个文件：客户端是单文件、由宿主加载，参数写进客户端就等于"散落在运行时里"，
// 改一次宽度要去几百行 JSX 里找。这里集中声明，由 `npm run build:version` 注入
// `lib/client.js` 的 `layout:begin / layout:end` 标记之间；客户端里不许再出现第二个 0.65。
//
// H15：面板参数唯一来源；客户端不得自带第二份默认值。

/** 工作台整体参数（注册给宿主的 customFrame 形状） */
export const PANEL = Object.freeze({
  /** 宿主把会话节点交给插件排版；false 会退回标准分栏，顶栏没有 AI 按钮、分栏不可拖 */
  customFrame: true,
  /** 业务区占比。家族取值 0.6–0.7，审计要求 0.55–0.75 */
  businessWidth: 0.65,
})

/** 右侧原生 Agent 面板可拖区间（比例，家族取值 25%–45%，默认 35%，步进 2%） */
export const AGENT_PANE = Object.freeze({
  min: 0.25,
  max: 0.45,
  default: 0.35,
  /** 键盘一次 2%，与拖动精度一致 */
  step: 0.02,
  /** 容器宽度低于此值时，面板改为覆盖式抽屉 */
  narrowBelowPx: 760,
  /** 覆盖式抽屉宽度上限（px） */
  drawerMaxPx: 420,
  /** 拖动时按容器 rect 夹取，不用窗口宽度 */
  clampTo: 'container',
})

/** 注入客户端时用的快照（只含客户端真正需要的字段） */
export const CLIENT_LAYOUT = Object.freeze({
  customFrame: PANEL.customFrame,
  businessWidth: PANEL.businessWidth,
  agentPane: {
    min: AGENT_PANE.min,
    max: AGENT_PANE.max,
    default: AGENT_PANE.default,
    step: AGENT_PANE.step,
    narrowBelowPx: AGENT_PANE.narrowBelowPx,
    drawerMaxPx: AGENT_PANE.drawerMaxPx,
  },
})
