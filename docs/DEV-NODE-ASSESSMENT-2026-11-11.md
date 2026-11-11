# 开发节点评估（2026-11-11）

本仓不在「已交付」状态。下面是逐项实测结论与补齐顺序，供排期用。

## 一、实测结论（三态分开）

| 层 | 状态 | 证据 |
| --- | --- | --- |
| 交互原型 | **已完成（含疾病概要 primer）** | `prototypes/v0.2/index.html`（174 KB，单文件内联 app）+ `demo-data.js` / `demo-data-b.js`（双档案）/ `metric-model.js` / `pathway-model.js` / `primer-data.js`；primer 走 `assets/patterns/disease-primer.{js,css}` |
| 装机业务界面 `public/` | **未实现** | 目录不存在 |
| 静态 UI 路由 | **未实现** | `dsh/index.js` 只注册了 `/api/behcet/health` |
| 面板外壳 `lib/client.js` | **骨架** | 4.6 KB，只渲染「服务已连接，业务功能待按 spec 实现」 |
| 原生 AI 对话面板 | **未实现** | 无 `newSession` / `subscribe` / `conversation` 挂载点（grep 全为 0） |
| 实机验证 | **未验证** | 未装机 |

一句话：**原型阶段做完了，开发版一行都还没移植。**

## 二、补齐顺序（按依赖排，不跳步）

1. **M5 移植**：建 `scripts/build-public.mjs`，把 `prototypes/v0.2/` 生成到 `public/`；primer 两个共享件要一并落到 `public/patterns/` 并把 `../../assets/patterns/` 改成 `./patterns/`（否则装机后顶栏「?」404）。先只替换 title 里的版本字面量，不动视图逻辑。
2. **静态路由**：`dsh/static.js`（`resolveStatic` 拒绝 `..`/绝对路径/符号链接逃逸）+ 在 `dsh/index.js` 注册 `/api/behcet/ui` 前缀路由；`package.json` 的 `files` 补 `public`。
3. **面板外壳**：换成家族 A 形态（自建顶栏 + 业务 iframe + 1px 可拖分隔线 + 右侧原生会话常挂载 + 窄屏抽屉 + 宽度本地记忆），参数放 `lib/layout.js`，由 `build-version` 注入客户端。
4. **会话契约 9 条**：`ownsSession(currentSession())` 判会话、无会话点按钮 `newSession(defaultWorkspace()?.workspaceId)`、取消不留空会话、失败报原因、订阅重渲染、草稿只填入不发送。
5. **闸门**：`check-agent-pane-contract.mjs` + `build-public --check` + `build-version --check` + 单测入 `npm run check`；本仓也**没有**文案红线检查器，需按本癌种口径先清文案再接入。
6. **装机与实机走查**：pack → pnpm add 到 Desktop profile → 重开 Desktop → 逐条点（面板出现/切会话刷新/取消目录/断服务报错/草稿不自动发/拖分隔线）。

## 三、已知坑（别踩第二次）

- 原型是单文件内联 app，`primer.js/primer.css` 来自仓级 `assets/patterns/`，**移植时最容易漏的就是这两个文件**；漏了的表现是页面正常但「?」点了没反应，且 `probe-disease-primer` 若不加 `--url` 会跑去测 starter 的 examples 页，报绿骗人（starter 已把它改成默认退出 2）。
- 本仓 `dsh/index.js` 走 prefix 注册，路径**不带尾斜杠**；带斜杠会让 `/ui` 本身 404。

## 四、2026-11-11 补齐进度（本轮已做 / 仍缺）

已做：M5 移植（`build-public`，含 primer 两件共享件与路径改写）、静态 UI 路由、面板外壳、会话契约 9 条、`build-version` 注入、结构检查七件全绿、本机 stub 宿主实测 UI 与 primer 均 200、越权路径 404。

仍缺（按依赖顺序，就是这 45 条红测试背后的业务面）：
1. **日期精度**：未知精度必须保持 unknown，更正历史 / 导出 / 时间线都不许补日期；
2. **来源与墓碑**：候选采纳 → 更正 → 移除原件后，历史仍需携带原件指针或墓碑；移除原件只清洗全等自动来源，手工来源逐字保留；
3. **双档案**：缺 B 档时降级为单套且不误称两套；切换失败回滚并提示；切换成功回首页顶部并把焦点交给主内容；两套示例组切换时临时状态隔离、私密治疗不进一图秀；
4. **消化道页**：同日症状与检查并列、按日期精度分组、空来源、窄屏纵向堆叠无整页横向滚动；
5. **医嘱**：可新增/回看/更正，未知保持未知，独立于用药，私密默认过滤；
6. **发作记录**：可新增未知结束、更正回看、遵守私密出口。

复现：`node --test test/*.test.mjs`（45 not ok）。这些不修，`npm run check` 与 `dsh-wb-cli audit` 都不会绿。
