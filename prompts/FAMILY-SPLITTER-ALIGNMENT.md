# 家族统一：AI 面板分隔线（细线 + 悬停增亮 + 双向拖动）

> 基线实现与实机验收：`anca-vasculitis-workbench` v0.2.12（DSH Desktop customFrame 面板）。
> 本文是给执行 agent 的任务书，不是设计讨论稿。先核实，再补差；已符合基线的仓不要重写。

## 1. 已验收的行为基线

1. **位置**：分隔线夹在业务 iframe 与会话 `aside` 之间。DOM 顺序必须是
   `业务区 → splitter → aside`。排在 `aside` 之后会贴到面板最右缘——用户看得见的那条
   分界线既没有悬停高亮、也拖不动。
2. **粗细**：视觉上是 **1px 常规线条**，绝对定位在两者边界上（`position: absolute` +
   `right: <percent>%`），**不占布局宽度**。不要用 6px/10px 的实体条。
3. **热区**：拖动命中面积由 splitter 内部一个 **11px 宽的透明子元素**提供
   （`left: -5, width: 11`），线条变细不影响拖动。
4. **悬停**：线条换成本工作台同色系品牌色并向外发光（`boxShadow: 0 0 6px rgba(brand,.55)`），
   同时浮出 ⠿ 把手（14×22 小胶囊，`pointer-events: none`，不挤压内容）。拖动时光晕加强。
   颜色从 `SPLITTER_BRAND` 派生，**不写死蓝色**。
5. **拖动**：25%–45%，步进 2%，localStorage 持久化；键盘 ←/→/Home/End 可调。
6. **拖动遮罩**：拖动期间在 body 上铺一层透明遮罩（`position: absolute; top/right/bottom/left: 0;
   zIndex: 4; cursor: col-resize`）。否则指针掠过业务 iframe 时事件归子文档，
   `document` 上的 `pointermove` 收不到，拖动会断。
7. **指针捕获**：`pointerdown` 时 `setPointerCapture`，失败时降级由 `document` 监听兜住。

参考实现（照抄样式与结构即可）：

```js
const splitterStyle = {
  position: 'absolute', top: 0, bottom: 0, width: 1, marginRight: -0.5,
  zIndex: 2, background: '#E4DFEA', cursor: 'col-resize', touchAction: 'none',
  transition: 'background .15s ease, box-shadow .15s ease',
}
const SPLITTER_BRAND = '<本仓品牌色>'
const splitterRgba = (hex, alpha) => { /* #hex → rgba(r,g,b,alpha) */ }
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
```

渲染（关键三点：`right: percent%`、热区子元素、把手不占位）：

```js
!narrow && paneVisible && h('div', {
  role: 'separator', 'aria-orientation': 'vertical',
  'aria-label': '调整 AI 对话面板宽度',
  'aria-valuemin': Math.round(AGENT_MIN * 100),
  'aria-valuemax': Math.round(AGENT_MAX * 100),
  'aria-valuenow': percent, tabIndex: 0,
  style: {
    ...(dragging ? splitterDragStyle : hovering ? splitterHoverStyle : splitterStyle),
    right: `${percent}%`,
  },
  onPointerDown: onSplitterPointerDown,
  onPointerEnter: () => setHovering(true),
  onPointerLeave: () => setHovering(false),
  onKeyDown: onSplitterKeyDown,
},
  h('span', { style: splitterHitStyle, 'aria-hidden': 'true' }),
  (hovering || dragging) ? h('span', { style: splitterGripStyle, 'aria-hidden': 'true' }, '⠿') : null),
```

`splitterGripStyle`：

```js
{
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: 14, height: 22, borderRadius: 4, background: SPLITTER_BRAND,
  color: '#fff', fontSize: 11, lineHeight: '22px', letterSpacing: '-1px', textAlign: 'center',
  opacity: 0.95, pointerEvents: 'none', userSelect: 'none',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
}
```

## 2. 仓库分类（40 个，先跑核实再动手）

### A 类：现代家族（有 `src/client.js` + 构建脚本）

已修复并验证（只需核实粗细/热区是否仍是旧的 6px/10px 实体条）：

acromegaly、aml、anal-cancer、anca-vasculitis、attr、bladder、breast-cancer、cervical、cll、
endometrial、glioblastoma、gtn、kidney、lymphoma、melanoma、mesothelioma、narcolepsy、pbc、thyroid

需要从头实现或确认「确实没有 AI 面板」（`src/client.js` 里没有 `separator` / `aside`）：

cancer-psych-support、museum-route、pf-ild、thalassemia

- `thalassemia` 有一套 6px 的内联 splitter（在 `lib/client.js` 或源码内），按基线改造，不要新建第二套。
- `museum-route` 若不承载 DSH 会话面板，如实记为 N/A，不要凭空加面板。

### B 类：老式仓（只有 `lib/client.js`，无 `src/`，但已有 aside + separator）

cml、fshd、head-neck、liver-cancer、lung-cancer、neurofibromatosis、ovarian

直接在 `lib/client.js` 里做三处改动：移动到 `aside` 之前、改成 1px + 11px 热区、补拖动遮罩。
改之前先确认该文件是不是构建产物（头部有"本文件由…生成"注释就找生成脚本，找不到则视为手写源并同步更新仓内相关测试）。

### C 类：无 AI 面板（只需核实并记 N/A，不要新增功能）

ampullary、biliary-tract、colorectal、esophageal、gastric、gist、myeloma、neuroendocrine、
prostate、sarcoma

## 3. 执行步骤（每仓）

1. **核实**：读 `src/client.js` / `lib/client.js`，输出：
   - splitter 的 `aria-label`、相对 `h('aside', {` 的位置（之前/之后/无）
   - splitter 宽度（1px / 6px / 10px / 无）
   - 是否有热区子元素、`dragShieldStyle`、`SPLITTER_BRAND`、`hovering`、`setPointerCapture`
2. **补齐**缺口，只改分隔线相关代码，不动：
   - 面板参数（customFrame / 25%–45% / 0.35）
   - AI 打开/收起逻辑、会话节点常挂载策略
   - 任何业务视图函数
3. **构建**：`npm run build:client`；`pbc` 的脚本名是 `npm run build-client`（无冒号）。
   老式仓（B 类）没有构建脚本时，直接改 `lib/client.js` 并跑 `node --check`。
4. **测试与门禁**：`npm test`（`glioblastoma` 无 test 脚本，用 `npm run check`）；
   `npm run check` 必须 exit 0。
5. **版本漂移**：若 check 报版本字面量不一致，先跑 `npm run build:version`；有 `sync:public` 的跑它
   （aml、melanoma），有 `build:public` 的跑它（acromegaly、bladder）；剩余按报错给出的
   「文件 + 旧版本号」原地替换成 VERSION。README 截图版本一致性要求重跑 `npm run shots:readme`
   并删除 `docs/screenshots` 下旧版本图（仅 aml 可跑）。
6. **提交**：每仓一次提交，只暂存本次相关文件（`src/client.js`、`lib/client.js`、
   `test/*.test.mjs`、版本/公开产物）。`bladder` 工作树有更早的未完成改动，只提交客户端与版本文件。
7. **推送**：
   ```bash
   git -c credential.helper='!gh auth git-credential' push https://github.com/<org>/<repo> HEAD
   ```
   SSH 22 端口会超时；按 URL 推送后 `git status` 会显示 ahead，属正常。
8. **不要**改 DSH Desktop profile（`~/Library/Application Support/dsh-desktop/harness/profiles/web`）、
   不要跑 `pnpm install`、不要重启 Desktop——装机与实机确认由主线统一做。

## 4. 验证清单（结论要可复核）

- 静态：splitter 的 `aria-label` 索引 < `h('aside', {` 索引；`width: 1`；存在 `width: 11` 热区；
  存在 `dragShieldStyle` 渲染行；`SPLITTER_BRAND` / `splitterRgba` / `hovering` / `setPointerCapture` 齐全。
- `npm test` 0 fail；`npm run check` exit 0。
- 实机三看（装机后）：线条是细线不占位；悬停出现品牌色发光 + ⠿；按住左右都能连续拖，
  拖到业务 iframe 上方不掉。
- 实机前提：DSH Desktop 主进程启动时间必须晚于 tgz 的 mtime，否则加载的仍是旧客户端。

## 5. 已知遗留（不要当成本次新问题）

- `narcolepsy`：README 截图仍是 0.1.1，仓内无截图生成脚本。
- `bladder`：`scripts/build-public.mjs` 的「删掉原型横幅」定点替换命中 0 次（原型已改动）。
- A 类仓的 `public/`、`README`、`workbench.json` 版本号是手写副本，升版后容易漂移；
  `anca-vasculitis` 已把页头/页脚版本改为构建注入，其它仓尚未统一。

## 6. 汇报格式

每个仓一行：

```
仓名 · 分类(A/B/C) · 改动(移动/细线+热区/遮罩/测试/无) · test 结果 · check 退出码 · 是否推送
```

末尾单列：N/A 的仓与理由、未闭环项与原因、需要主线装机确认的仓。