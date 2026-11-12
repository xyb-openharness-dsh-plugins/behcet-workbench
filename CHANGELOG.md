# 变更记录

只增不删；每条写清"改了什么 + 为什么 + 用户可见结果"。版本号与 VERSION、package.json 三处必须一致。

## 0.2.1 — 2026-11-13

三缺口批量补齐（本仓只剩 C 的 UI 入口）：

- **A 资料目录 / B 临床线**：复核已完整（面板 `pickDirectory` + `/api/root`；试验四段在 0.2.0 已接），未改。
- **C 新建患者（补齐 UI）**：`host-bridge.js` 早就实现了 `POST /subjects`、切换、删除与 `is_demo` 保护，但**页面上没有任何入口**——「切换合成示例组」弹窗只列两套合成档案。
  现在该弹窗新增「我的档案（存本机数据库）」区：列出自建档案（点即切换）+「＋ 新建我的档案」（走已有 `data-profile-new` 表单→落库→自动切过去）；bridge 只暴露一个 `window.__BEIPAL_HB__` 只读引用，不复制状态。
- 校验：三闸门全绿；`npm run check` 仍红在 **45 条既存领域测试**（日期精度未知保持 / 来源墓碑 / 双档案降级 / 消化道并列 / 医嘱独立 / 发作私密），与本轮改动无关（改动前后同为 45）。这批是 M3/M4 的业务事实层欠账，见 `docs/DEV-NODE-ASSESSMENT-2026-11-11.md` §四。

## 0.2.0 — 2026-11-12

从「只能看合成示例」补到**能建自己的档案、记录真落库、临床试验可检索可评分**。

- **修复空白页（0.1.1 装机后无法使用）**：`dsh/index.js` 用 `URL.pathname` 取 `public/`，装机路径含空格（`.../Application Support/...`）时得到 `Application%20Support`，`realpathSync` ENOENT → 所有 `/api/behcet/ui/*` 500 → iframe 空白。改用 `fileURLToPath`，并给 `static.js` 的根解析加降级。日志证据见 `harness.log` 的 `resolveStatic ... static.js:35`。
- **患者档案（真实用户数据）**：新增 `schema/0001_initial.sql`（subjects / subject_records / trial_profile / saved_trial / app_setting）+ `dsh/store.js` + `dsh/workbench.js`，用 Node 内建 `node:sqlite` 落盘。顶栏新增「档案」切换与「＋ 新建患者」；新建后从空记录开始，记录变更防抖整包保存，失败如实提示且不刷新丢数据；删除只允许删自己建的档案。demo A/B 用 `is_demo=1` 保留为合成示例，永不覆盖用户档案。
- **资料目录（真入口）**：外壳顶栏「配置目录」调用宿主 `uiWorkspace.pickDirectory()`；服务端 `POST /api/behcet/api/root` 二次校验并切换 sqlite 根，切换失败回滚原库。口径：拒绝主目录本身、桌面、下载根目录、tmp 与 `/`；《本原型为示意，目录未真实挂载》只保留在没有选择能力的降级路径。业务页「资料目录与云解析」也加了同一入口（iframe 经 postMessage 交给外壳）。
- **临床试验（35 号四段链路）**：新增 `research/behcet/` 真实快照（ClinicalTrials.gov API v2，2026-11-11 采集 33 条，16 条干预性 / 17 条观察登记，33 条都有入排原文；`product-manifest.json` 明写单来源、未核实、非完整）。`dsh/trials.js` 输出三态证据链（✓/✕/?）、四档分层、百分数只在可对照项 ≥2 时给、待确认不填阴/阳；药物靶点不进分母，排除句含限定语时只标"需核对原文"不自动反转。业务页新增「临床研究」三步 Tab：基础档案 → 匹配检查 → 结果分析（大号百分数 + `n/m 项对得上 · k 项待确认` + 收藏）。
- **API**：`/bootstrap`、`/subjects`（GET/POST/DELETE）、`/subjects/:key/records`（GET/PUT）、`/trial-profile`、`/trials`、`/trials/match`、`/saved-trials`、`/root`；全部走宿主 connection 认证，错误返回 JSON 不白屏。
- **闸门**：并入 starter 的 `check-patient-create` / `check-data-dir` / `check-trial-chain` 三件（分别覆盖"只能看 demo""假目录入口""裁剪靠推断"三类复发错误），都进 `npm run check`。
- **实测**：本机 stub 宿主 + 系统 Chrome（Playwright）跑通 新建患者 → 记一条发作 → 刷新后仍在 → 临床研究三步 Tab → 33 张评分卡；API 层验证目录拒绝清单与切换回滚。`node --test test/*.test.mjs` 仍为 **45 条 not ok**（与 0.1.1 相同，属 M3/M4 业务面：日期精度、来源墓碑、双档案、消化道、医嘱、发作记录），本次未新增失败。
- **未验证**：Desktop 实机点按（面板出现、原生目录选择器、取消是否留空会话）需装机后人工走查；harness 需重启加载新包。

## 0.1.1 — 2026-11-11

从「只有注册骨架 + /health」补到可装机运行的工作台外壳。

- 新：`scripts/build-public.mjs` 把 `prototypes/v0.2`（5 件脚本 + index.html）生成到 `public/`，并**把仓级 `assets/patterns/disease-primer.{css,js}` 一并落到 `public/patterns/`，把 `../../assets/patterns/` 改写成 `./patterns/`**——漏这一步的表现是页面正常、顶栏「?」点了没反应（相对路径在装机后 404）。版本字面量只改 title 一处，用锚点正则。
- 新：`dsh/static.js`（`resolveStatic` 拒绝 `..`/绝对路径/符号链接逃逸）+ `dsh/index.js` 注册 `/api/behcet/ui` 前缀路由；`files` 白名单补 `public`。
- 新：`lib/client.js` 换成家族 A 形态外壳（自建顶栏 + 业务 iframe + 1px 可拖分隔线 + 右侧原生会话常挂载 + 窄屏抽屉 + 宽度本地记忆）；`lib/layout.js` 为面板参数唯一来源，由 `build-version` 注入并生成 `lib/version.js`。
- 新：会话契约 9 条落地——`ownsSession(currentSession())` 判会话、无会话点按钮 `newSession(defaultWorkspace()?.workspaceId)`、取消目录不留空会话、创建失败报原因、订阅重渲染、草稿只填入不发送。
- 实测证据（本机 stub 宿主起服务，非 Desktop）：`/ui/` 200 text/html、`/ui/patterns/disease-primer.js` 200、`/ui/patterns/disease-primer.css` 200、`/ui/primer-data.js` 200、`/ui/../../package.json` 404；index.html 含 `data-primer-open` 且引用已改写为 `./patterns/`。
- **仍未通过（既存，非本次引入）**：`node --test test/*.test.mjs` 有 **45 条 not ok**（改动前后同为 45）——集中在日期精度 unknown 保持、来源指针与墓碑、双档案切换与回滚、消化道同日并列、医嘱独立于用药、私密出口过滤。这些是业务事实层与交互行为，属 M3/M4 待实现部分；结构检查（包清单/宿主契约/面板契约/探针覆盖/版本字面量/静态引用/primer 链接）**全部通过**。
- 未验证：实机点击（面板是否出现、取消目录是否留空会话、双档案切换）需装机后人工走查。

## 0.1.0 — 2026-11-02

- 由社区脚手架 dsh-wb-cli@1.10.0-rc.3 (32b9937) 初始化，仅有注册骨架与健康接口，无业务功能。
