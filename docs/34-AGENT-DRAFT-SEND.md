# 34 号 · AI 协助一键发送契约（agent-draft send）

> 来源：用户 2026-10-25 决策（肢端肥大症仓 0.2.1 首次落地）——「AI 协助：改为把内容发到 AI 对话窗口去，开启 AI 互动」。
> 本文是**开发版实际做法的正式契约**，替代旧口径「示例按钮只填不发」（IP8/IP9 原文按此修订：预写提示词+上下文从"待发送"变为"直接发送"）。init 后各仓按此实现，不再各写各的。

## 一、端到端链路（四段，缺一段就是"假接通"）

| 段 | 谁做 | 做法 |
| --- | --- | --- |
| 1 入口 | 业务页（public/app.js） | `<a href="<app>:agent-draft?prompt=…">` 协议链接；点击 `preventDefault` |
| 2 发送 | 业务页 | **嵌入式形态**（`window.parent !== window`）→ `window.parent.postMessage({ type: '<app>:agent-draft', prompt, send: true }, location.origin)`；**独立打开**（file://）→ 本地演示面板 + 文案说明未接通，不假装发送 |
| 2b 面板唯一性 | 业务页 | **演示面板只存在于独立打开形态**。嵌入式下原生会话是唯一 AI 面板：业务页自有的 AI 面板（顶栏 toggle/splitter/pane）必须整体隐藏，不允许『演示面板 + 原生会话』双面板并存（肢端肥大症 0.2.0–0.2.3 真机实漏：右侧出现『AI 协助·演示』残留）。实现：EMBEDDED 探测 → renderAgent 早退 + agent-toggle 动作嵌入式 no-op |
| 3 送达 | 壳层（src/client.js→lib） | `message` 监听：校验 `event.source === 自己 iframe 的 contentWindow` **且** `event.origin === location.origin`，prompt 截断（≤8000）；`rememberDraft({sessionId, prompt, send})` 持久队列 |
| 4 填发 | 壳层 | `conversation.input.for(actx)`：`setDraft(草稿)` → 若 `send===true`：复取 snapshot，**仅 `phase==='plain'` 且草稿非空**才 `input.submit?.()`（queue 模式） |

**原生 API 事实**（实测 dsh-client-ui-conversation）：`input` 动词表含 `setDraft(text)` 与 `submit()`（内部自带 plain/draft 守卫，外层仍要双守卫）。

## 二、守卫与降级（全部必测）

1. **双守卫**：自动发送前重取 snapshot，仅 plain 相 + 非空才 submit；异常捕获不外抛。
2. **降级链**：composer 未就绪 → 草稿入 pendingDraft（localStorage 持久），500ms 轮询 flush，就绪后**同样自动发送**；submit 失败 → 草稿保留，提示按回车发送。
3. **会话就绪前**：无归属会话 → `ensureSession` 调起后再走第 4 段；所有权校验（`ownedSession()`）不过不发送。
4. **草稿冲突**：现有草稿含引用/特殊输入 → 追加而非覆盖；拒发并提示先处理。

## 三、不变的红线（沿用 20 号/prompt，不因"自动发送"放松）

- 发送内容＝预写提示词 + **已确认**的病情上下文；private 默认不进上下文（三出口同源过滤）。
- AI 回复是**候选**：核对才入事实层，拒收零副作用；不得自动沉淀为事实。
- 不代替患者发言：按钮带入的是"请 AI 帮我…"类提示词，不是以患者口吻伪造的对话。
- 草稿不带本机资料目录路径（含用户名）。

## 四、断言（进检查链，防"两端各自实现了"假象）

`templates/check-agent-draft-bridge.mjs`（init 随包下发，进 `npm run check`）：

1. `public/app.js` 出现 `href^="<app>:agent-draft"` ⇒ 必须出现 `parent.postMessage` 且消息含 `send`（对穿断言：0.2.0 肢端肥大症两段各自实现、实际不通的真实坑）。
2. `lib/client.js` 必须监听同 `<app>:agent-draft` 类型且校验 `event.source`。
3. `lib/client.js` 自动发送必须带双守卫字符串证据（`phase === 'plain'` 与 `submit`）。
4. **面板唯一性（2b）**：`public/app.js` 含 `parent.postMessage`（支持嵌入式）且含 `agent-pane` ⇒ 必须含嵌入式门控证据（`EMBEDDED` 常量或 `window.parent !== window` 出现 ≥2 处：发送分支 + 面板门控）——防『演示面板漏进装机版』。

## 五、留痕要求

默认契约即"一键发送"。若某仓要回退"只填不发"（`send:false` 或不发标志），属产品决策变更：须 CHANGELOG + 项目 INTERACTION-DESIGN 修订段留用户授权依据，不许实现里悄悄改。
