# 从一个癌种名到可运行开发版：一次性交付提示词 v1.2（发起层见 prompts/CANCER-KICKOFF.md v2.0）

> 用法：把「你是…」到文件结尾整段复制给一个新会话，先填四个空：癌种中文名 / 癌种英文名 / 目标目录 / 样板基准。  
> 样板基准默认 `<癌种英文>-workbench v0.1.0`（当前可用样板：`colorectal-workbench`、`gastric-workbench`；数据/指南/分级三层可参照 `breast-cancer-workbench` v0.12.0）。  
> 本文件由 2026-10 食管癌（EsopPal）一轮 + 乳腺癌 v0.10–v0.12 三轮（G1 出处 / G2 节奏 / G3 分级）沉淀而成；顺序不是建议，是闸口。  
> **v1.2 新增**：阶段 1.5（指南与分级标准）、阶段 2.2（面板默认右侧 + 可拖 + 顶栏开关）、末节「假绿清单」。这三块是"做完看着像好了、其实没接上"的高发区。
> **v1.2 追加（GBM/MPM 两轮）**：§1.4 HVT X 层与窄宽（30 号）、§1.7 独立评审、§2.1 第 4 步 apiBase 定稿契约、§2.1 第 7 步宿主接线件。发起层任务定义/互动规则/汇报节奏见 `prompts/CANCER-KICKOFF.md`。

---

你是小 X 宝家族的患者工作台开发者。本次任务：为一个新癌种 **从 0 走到「dsh-desktop 发布实测通过」**。  
不是只出设计稿，也不是只写代码。四个填空：

- 癌种中文名＝【填癌种】，英文名＝【填英文，用于 `<癌种英文>-workbench`、`xyb-<癌种>.sqlite`、API 前缀】
- 目标目录＝【填 `~/Downloads/<癌种英文>-workbench`】
- 样板基准＝【`<癌种英文>-workbench v0.1.0`，默认 `gastric-workbench`】
- 资料目录＝【用户明确指定的路径；主目录 / 桌面 / 下载根目录 / tmp 一律拒绝，不替用户猜、不静默建目录】

**三条总原则**：① 原型是唯一视觉基准，开发版与它逐字符对齐；② 数据只有一个来源；  
③ 没实测就不写"通过"，没核实就写"未核实"。

---

## 阶段 0：用 starter init，先把"规矩"立起来

### 0.0 先找 dsh-desktop：宿主找错，后面全白做

**这是最高优先级的一步，排在 init 之前。** 目标只有一台：本机 **DSH Desktop**（`io.dsh.desktop`）。
Harness 在 app 自己的 userData 下——macOS `~/Library/Application Support/dsh-desktop/harness`、
Windows `%APPDATA%\dsh-desktop\harness`、Linux `${XDG_CONFIG_HOME:-~/.config}/dsh-desktop/harness`。

| 探测 | 怎么探（三平台同一命令） | 结论 |
| --- | --- | --- |
| 装没装 / 跑没跑过 | `node scripts/check-install.mjs`（看"判定基准"那一行） | 报"没找到 DSH Desktop" → **停下**；报"没有可用 Harness" → 让用户启动一次 |
| 装到哪了 | 同上，看 `dependencies` + `dsh.profile.bundles` | 未登记 / 只登记在别处 → 不算交付 |
| app 在非常规位置 | `--app <路径>` 或 `DSH_DESKTOP_APP=<路径>` | 显式指定，别改脚本常量 |

- **没装 Desktop**：当场停，把 <https://www.dshdesktop.com/> 给用户（对应平台的安装包），等他装好并**启动一次**再往下走。不要先开发再补装。
- **两个明确排除的目标**：① `~/.dsh/profiles/*`（`dsh` CLI 侧的 Harness，Desktop 不读；Windows 为 `%USERPROFILE%\.dsh`）；② `DeepSeek Harness`（`com.deepseek.dsh`，另一款 app，profile 不共享）。装上去不是"备选"，是"没装"。
- 规则全文见 starter `docs/37-DEPLOY-TARGET.md`；装机手法（包管理器、`DSH_HOME`、`bundles`、Windows/macOS 命令差异）见 `docs/06-VALIDATION-AND-RELEASE.md`。

### 0.1 初始化（不写业务代码）

1. 用社区脚手架初始化：`dsh-wb-cli`（`~/Downloads/xyb-workbench-starter`，`bin/dsh-wb-cli.mjs`）  
   执行 `init` 到目标目录，确认 `.dsh-wb-starter.json` 记下 starter 版本与 revision。
2. 初始化后立刻做三件事，再动业务：
   - 把 `prompts/` 里适用的提示词复制进项目 `prompts/`（至少 `START.md`、`DESIGNER-FIRST.md`、  
     `DSH-WORKBENCH-TOP-BAR.md`、`DSH-AGENT-PANE-INTEGRATION.md`、`ZERO-TO-DEV.md` 本身）；
   - 建标准文档体系（缺的补空壳，不许留"待补"到开发阶段）：  
     `docs/SPEC.md`（范围与不做）｜`docs/DEV-REQUIREMENTS-<日期>.md`（强约束，见 0.2）｜  
     `docs/DIFF-MATRIX.md`（与样板癌种逐项差异）｜`docs/PATIENT-FLOW.md`｜`docs/SCHEMA.md`｜  
     `docs/CLINICAL-DATA-<年>.md`｜`docs/DEV-PLAN.md`（里程碑只认这一份）｜  
     `docs/METRIC-GRADING.md`（本癌种启用哪几项分级、为什么）｜`docs/GUIDELINE-BRIDGE.md`（若接指南）｜  
     `README.md`、`CHANGELOG.md`、`VERSION`、`AGENTS.md`
   - 跑一次 `npm run check`（脚手架自带骨架应能过），把基线钉住。
3. **先给遗漏清单再执行**：列出需要澄清的点（受众、分期覆盖、是否含特殊亚型、是否要双营养入口…）。  
   除非缺的是"服务谁"，否则不要停下来等确认。

### 0.2 强约束文档（阶段 0 的交付物，不是可选项）

新建 `docs/DEV-REQUIREMENTS-<日期>.md`，体例照 `gastric-workbench/docs/DEV-REQUIREMENTS-2026-10-21.md`：

| 章节 | 必须写什么 |
| --- | --- |
| 一、范围 | 交付物 × 落点 × 怎么验，一行一条，可勾选 |
| 二、照抄样板的产品要求 | 顶栏三段式 + AI 五态、面板默认右侧且 25%–45% 可拖、一图秀、3D 卡；写"不许按比例缩减" |
| 三、硬约束 | 数据层 / 前端 / 工程 / **医学口径**四组，**每条带"错误来源"**（哪一轮、哪张截图、哪次 parity 红） |
| 四、本轮明确未做 | 不许在验收里算通过（如装机、市场投稿、真实病例） |
| 五、我替你定的默认值 | 默认执行、可回退，写清理由 |

硬约束至少覆盖这些（都是真踩过的）：

- **数据层**：复合主键表裸 `SELECT` 必须 `ORDER BY rowid`；手写倒序数组只 `ORDER BY ord` 不叠 `DESC`；  
  可选字段显式写 `null`（读模型按 `=== null` 分支）；`using` 是 SQLite 保留字 → 列名 `in_use`；  
  每一节 `{title, rows}` 都必须有对应 `*_title` 列；分类指标 `dec IS NULL` 且 `kind ∈ {grade,qual}`；  
  化验/体征 2–4 周一点延续到今天，影像/内镜按真实频率**不加密**。
- **形状**：`events`/`docs`/`candidates` 在快照里是**定长数组**；生成器 `assemble()` 里组装用的中间量  
  必须解构掉（多一个键，读模型 parity 就红）。
- **前端**：图标 key 走别名兜底；内联 svg 必须给宽高；页脚贴底（`min-height:calc(100vh - 32px)` + `flex:1`）；  
  `[hidden]{display:none!important}`；二级页签按 `state.sub` 分流且穷举测试；字号基线 12.5px（大字 15px）。
- **工程**：面板参数唯一来源 `lib/layout.js`；`apiBase` 不含 `/api`；演示数据只有一个来源；  
  迁移只增不改；所有 INSERT 写显式列名 + 显式问号数；`lib/version.js` 是生成物，不手改。
- **医学口径**（v1.2 新增，四条，详见阶段 1.5 与 starter `docs/23` / `docs/25`）：  
  ① 分级只用「对照」，不写"偏高/偏低/严重"，不推断因果、不给处置；  
  ② ×ULN 型必须用**这张化验单自带的参考上限**，缺了就返回 `needsUln`，**绝不拿成人通用上限凑倍数**；  
  ③ 指南只做「出处 + 节奏 + 并列口径」，处置推荐只折叠原文，不改写成产品语句；  
  ④ 未采用的原文分支（如 QTc 的"较基线 >60 ms"）要在注释里写明"未采用"及原因，不是漏做。

> 阶段 0 通过条件：这份文档里每一条都能被某条命令或某张截图验证。写不出验证方式的约束，删掉。

---

## 阶段 1（3.1）：调研 → 患者流程 → schema → 临床数据库 → HTML demo，交第一次确认

这一阶段的产物是**给用户拍板的两件东西**：可点的 HTML demo + 可查的临床 sqlite。业务代码不写。

### 1.1 调研与差异化（防"换名癌种"）

- 沿十条疾病轴推导患者高价值场景：确诊路径 / 分型分期 / 治疗路径与切换 / 症状与功能 /  
  营养与进食 / 心理与家庭 / 复查随访 / 第二原发与并发症 / 临床研究 / 费用与资源。  
  每条写成「触发 → 动作 → 产物」，落到场景/模块/字段/交互/验收五层；**提到一次 ≠ 覆盖**。
- 产出 `docs/DIFF-MATRIX.md`：与样板逐项对比，写清**刻意不同**的几处  
  （例：食管癌「吞咽与进食通路」+「营养支持」两页并存，与胃癌"不设营养支持页"刻意相反，不许统一掉）。
- 患者流程单独成文（`docs/PATIENT-FLOW.md`）：一次真实就诊 / 一次自查 / 一次复查，各画一条  
  「患者在什么时刻最难受 → 打开哪一页 → 得到什么产物」，页面树由这三条反推，不从医生流程照搬。

### 1.2 schema（先冻结，再写数据）

- `schema/0001_initial.sql`：档案级 + 指标 3 张 + 通用 8 张 + 本癌种专属 N 张；四契约必须落地：  
  ① 看法恒不为结论（无 `is_conclusion`）；② 四点位 1–4 点、缺健侧不生成差值（NULL ≠ 0）；  
  ③ 更正只新增版本（路径切换新增行不覆盖旧行）；④ 事实四层（文档/候选/记录/指标）不合并。
- **参考值要能落库**（v1.2）：化验记录必须有 `ref_low` / `ref_high` 两列（可空），否则 ×ULN 型分级永远缺上限。  
  写入时校验：非数字、上限小于下限都要报错；**空值先挡 `null/undefined/''` 再 `Number()`**——  
  `Number(null) === 0` 会让"没填上限"变成"上限是 0"，本项目在三个不同地方踩过这个坑。
- 冻结后立刻写 `schema/freeze-contract.md`（sha256 + 内容边界），此后改结构只能新增 `0002_*.sql`。  
  发布前发现漏列（如分节 `*_title`）也走 ALTER 追加，不改 0001。

### 1.3 临床试验数据库（多通道，不止 ClinicalTrials.gov）

唯一入口是 **unified-trial-mcp**（统一临床试验检索 MCP 服务，MIT）：  
`git@github.com:opencare-skillhub/unified-trial-search-mcp-service.git`。

1. **本地有就不重复下载**：`ls ~/Downloads/unified_search_trials`，有则 `git -C … pull --ff-only` 并核对版本；  
   没有就 `git clone` 到 `~/Downloads/unified_search_trials`，`npm install && npm run build`，`npm run doctor`。
2. **六个通道**：`ictrp`（WHO ICTRP，全球广度）、`ctv`（Veeva CTV / ClinicalTrials.gov 深度，本地索引）、  
   `chictr_online`（ChiCTR 实时）、ChiCTR 离线语料、`chinadrugtrials`（CDE，**含研究者 PI**）、小胰宝归档。  
   离线语料（`chictr_pancreatic` / `xyb_cde_pancreatic` / `ctv_index`）是 Release 资产，用 `bootstrap` 或  
   `fetch-corpus` 拉取，**sha256 必须与 `corpora/manifest.json` 一致**，并在文档里写数据截止日。
   > **已知覆盖限制（别忘，也别假装补上了）**：三个离线语料**目前只有胰腺癌**（ChiCTR 468 条 + 小胰宝归档 139 条）。  
   > 做其他癌种时只能走**在线通道**（`ictrp` / `ctv` / `chictr_online` / `chinadrugtrials`），离线通道对该癌种  
   > 属于"未配置/无覆盖"，必须在 `CLINICAL-DATA-<年>.md` 和 sqlite 的来源终态里如实声明，不能算作"已查过"。  
   > 需要离线补齐时，按 `docs/corpus-lifecycle.md` 的流程自建该癌种语料（下载→sha256→manifest→挂载），  
   > 语料本身单独发 Release，不塞进工作台仓库。
3. **用法**：MCP 客户端注册后用工具，别自己拼 URL ——  
   `search_trials`（keyword/keywords/condition/terms 至少一个）、`get_trial_detail`（`<sourceId>:<recordId>`）、  
   `get_record_evidence`（原始 HTML/JSON/Word）、`get_source_status`；维护类 `refresh_ictrp` / `sync_ctv_index` /  
   `sync_chinadrugtrials` 默认 dry-run，必须显式调用。
4. **采集口径写进脚本**：`scripts/fetch-<癌种>-trials-<年>.mjs`，支持 `--dry-run`，同口径重跑条数可复现；  
   多通道结果只在"确认同一登记身份"时合并，其余并排保留来源。
5. **诚实边界（不可让步）**：  
   - "0 条结果"必须带该来源自己的**覆盖声明**，绝不把"没查到"写成"不存在"；  
   - 逐来源终态要落库（就绪 / 超时 / 未配置 / 部分覆盖 / 截断），`coverage` 与 `completeness` 一起存；  
   - **登记 ≠ 有效 ≠ 安全 ≠ 可入组**；状态栏一律写"登记状态，未核实"；  
   - Cookie / 会话只放 `cookie.env`（0600），日志永不打印；调用方不许传 URL / 超时 / 路径。
6. 交付 `research/<癌种>-cancer/{manifest.json, trials-<年>.jsonl, <癌种>_cancer_trials_<年>.sqlite, README.md}` +  
   `docs/CLINICAL-DATA-<年>.md`（口径、通道覆盖、数据截止日、已知缺口）。  
   一致性断言：manifest 记录数 = jsonl 行数 = sqlite 行数；sha256 与实算一致；关键业务字段按 record_id 在 JSONL 与 SQLite 逐条一致（包括 sponsor/sponsors）。使用生成项目随附的只读 `node scripts/check-trial-snapshot.mjs .`；禁止以采集脚本重跑代替核验或覆盖已有快照。

   > **试验匹配（35 号）**：涉及"个人建档 → 检索/AI 匹配 → 呈现"功能时，按 docs/35-TRIAL-MATCHING.md（**v3**，参考实现小胆宝 match-0.1.0 与 lung-cancer client-trials）执行——粗筛符合度 pct（符合÷已对照、待确认=0 只偏低）+ 档位词「字段都对得上 / 部分对得上」+ 逐条证据链 + 三子页（匹配/检索/收藏）与右侧浮窗。三条落地硬约束：判据只取快照里真实存在的字段；**药物靶点不进分母**；**可对照项不足 2 条不给百分数**，病理未确认整页不排名。禁止 eligible/suitability 判读列与"适配度/入组概率"命名；断言器 templates/check-trial-matching.mjs（带 `--self-test`）进 check 链。

### 1.4 演示数据 + HTML demo（G2 闸口）

- **开工前置（IP1）**：先按 starter `docs/28-INTERACTION-PATH-DESIGN.md` 产出并签认交互路径文档（场景路径表 + CRUD 双通道矩阵）；  
  demo 的导航与入口文案按文档逐字实现，G2 走查（X1–X4）按文档逐条断言——无此文档不开 HTML。
- `demo/build-demo-data.mjs` 是**唯一数据源**，同时产出 `demo/demo-data.sqlite` 与  
  `prototypes/v0.2/demo-data.js`；被 import 时只返回 `buildDemoProfiles()` 纯数据，不碰磁盘。
- 2 套档案 × 6 个月窗口；换档案后的默认指标要与初始状态同构（例：两条数值线 + 一个分类序列）。
- 原型四件套 `prototypes/v0.2/{index.html, style.css, app.js, demo-data.js}`，`file://` 直接可开、无构建；  
  视觉只换 3 个品牌变量 + 品牌字 + 英文名，其余沿用家族骨架。
- 四个必查件：① 每个二级页签与内容一一对应（穷举 `(view, sub)`）；② 首页右上角 AI 对话能开 / 收起 / 调宽；  
  ③ 一图秀严格按原型（单调三次插值、末点 13px 避让、分类序列只画节点不连线；**左栏控制版式与全期归一化/图例区间/pin 读数见 ONE-CHART-SPEC 2026-10-25 增补**）；
  ③b 移植底本后**先跑 `node scripts/check-derivative-leftovers.mjs .`**：底本品牌名/病种名/接口前缀残留会直接出现在患者界面（CLL 实测 14+4 处）；
  ③c 五套测试按本项目 schema **整体重写**，不改底本常量（LESSONS L29）；
  ④ 3D 卡整卡 180°、背面是迷你折线、分类记录不翻不连线。
- **整页视图（32 号，2026-10-25 起）**：内容超过 1.5 屏或需要分区的交互（记录详情、报告原文、全屏图表、  
  日历、多字段编辑、逐题量表）**从主页点开就是一整页**，不做 480px 弹窗；弹窗只留确认与小选择。  
  用 `assets/patterns/page-view.js` + `page-view.css`，清单填 `docs/FULL-PAGE-VIEW.md`。  
  原型阶段就要满足：返回与关闭两个入口都在、关掉回主页原滚动位置、Esc 与浏览器返回键都只退一层、  
  `#page=` 可直达。A1–A10 断言见 32 号，`scripts/probe-page-view.mjs` 可作起点改造。
- **疾病概要（36 号，2026-10-25 起，每台必备）**：README 的 `## 疾病概要` 与看板顶栏「?」必须给同一份  
  疾病精炼概要，四段固定：定义 → 医学资料规范和指南情况 → 目前治疗全景概要 → 发展趋势。  
  数据放 `prototypes/v0.2/primer-data.js`（`window.DISEASE_PRIMER`），模块用 `assets/patterns/disease-primer.js`  
  + `disease-primer.css`，项目清单填 `docs/DISEASE-PRIMER.md`（模板 `templates/DISEASE-PRIMER.md`）。  
  **M1 起就要写这份清单**（四段与来源栏），**M4 原型上线前必须能点开**。三条红线：整体属第 ② 层、  
  趋势段只写已发生的事实（带日期/版本）、原件没拿到就写"未取得原件，据二次来源"。P1–P8 见 36 号，  
  `scripts/probe-disease-primer.mjs` 可直接用；`docs/36-DISEASE-PRIMER.md` 另有一套趋势段禁止词，  
  `check-conformance.mjs` 的 `primer/*` 会扫。
- 无头实测：页签穷举（**不能先抓完按钮再点**，`render()` 会重建 DOM）、`aria-selected` 与内容指纹、  
  `body.scrollWidth === innerWidth`、控制台 0 error、0 个 4xx。截图逐张目视过。
- **HVT X 层（28 号，GBM/MPM 两轮标准件）**：X1 每页签被场景路径覆盖（孤儿=0）；X2 场景路径从看板逐 key 走通；  
  X3 显式编辑入口 ≤1/页；X4 AI 产出候选核对闭环。**X 任一不过，G2 不签认**。
- **窄宽自适应（30 号，GBM v0.1.5 实机教训）**：原型第一版就执行六条硬规则，probe-responsive 多档宽度  
  （含 AI 面板展开态）竖排单字=0、横向溢出=0——"标签+值+注横排"是高发区。

### 1.5 指南与分级标准（G1 出处 → G2 节奏 → G3 分级，v1.2 新增）

> 通用规则全文见 starter `docs/25-GUIDELINE-BRIDGE.md`（四层刻度尺）与 `docs/23-METRIC-GRADING-AND-ALERTS.md`（分级与提醒）。  
> 这一节只写"本阶段要做到什么、怎么验"。**本癌种指南没拿到就先跳过 G1–G3，不要用通用共识凑。**

**先做四问筛**：有权威且带页码的中文指南吗？拿到的是原件还是二手摘编？里面有没有间隔或数值阈值？  
版权允许引用页码与 ≤200 字摘录吗？——四问全过才动手。

**G1 出处层（必做，成本最低、用户感知最强）**

- 原件入库 `guidebooks/` + `manifest.json`（org / version / published / pages / sha256 / 来源 / 是否 OCR / 允许用途）。  
  **原件不入包**：`guidebooks/` 不进 `package.json` 的 `files`，`npm pack` 要能证明它没进去。
- 结构化条目放 `assets/reference/guideline/refs.json`，**只有页码、表号、≤200 字摘录、notes**，不含正文。  
  **必须随包分发**——放 `guidebooks/derived/` 装机就会缺文件（包目录整份替换）。
- 界面固定两段式，中间不合成判断：`指南这里写的是：…（版本 · P208 表 9.5）` / `你的记录是：…`。  
  **不出现"所以/因此/你需要"**。卡片背面一行出处，页面给一个折叠表格。
- **登记三处必须一致**：`manifest.json` / `refs.json` / `cadence.json` 各带一份 document 元信息，  
  `id / version / published / sha256` 必须逐字相同，**加一条单测钉住**。（真实事故：三处日期与版本各写各的，界面显示了一个不存在的版本。）
- **`notes` 会原样显示给用户**，能力一变就要改。写"暂不启用"之前先确认代码确实没启用；  
  写"在哪一节"之前先回原文看过——曾把"肝损伤分型"那一节当成"分级表"，实际分级表在另一节且限定某类药。
- 说明条数超过 3 条就别挤成一段，改 `<details>` + `<ul>`，标题写"这几项指南怎么写（N 项）"。

**G2 节奏层（有价值就做，没间隔就别硬造）**

- 结构化 `assets/reference/guideline/cadence.json`：分档间隔 + 检查项清单（项目 / 适用人群 / 频率 / 页码）+ 药名匹配规则。
- 纯函数 `dsh/cadence.js`：`addMonths`（**月末夹取**，1/31 + 1 月 = 2 月末，不滑到 3/3）、`checkpoints`、  
  `treatmentTags`、`applicableChecks`、`buildFollowupPlan`。
- **节点 = 起点（手术日/确诊日）+ k×间隔**，不是"上次复查 + 间隔"——一次都没记过也要能算出两个节点。
- 三条边界写在文件头：① 只算参考节点不排计划；② **不发提醒不弹通知**，节点只能转成「想问医生的问题」或  
  「我自己的待办」，新建待办 `due=null`；③ 不做分期判断，分期没记录就只给通用节奏并写"未按分期调整"。
- **显示带宽必须标注来源**：`±30 天` 是工作台的显示带宽，**不是指南内容**；指南只写间隔。这句话要上界面。
- 药名匹配**宁缺勿猜**：只写"化疗"两个字匹配不到蒽环，界面写"没匹配到具体药名"，不假设。
- 匹配不了的条件（如"某转移灶 >4 枚"）列进"无法自动匹配"，**不要**默认判成"不适用"。

**G3 分级层（按 `docs/23` §2.1 做，两类指标两套处理）**

- 分级模块是纯函数（如 `dsh/ctcae.js`），阈值表是**代码里唯一一份**，注释写明"以 `assets/reference/ctcae/` 的 PDF 为准，冲突时改代码"；  
  每条阈值带页码（乳腺癌参照：ALT/AST/ALP P84、总胆红素 P85、肌酐 P86、QTc P87；换癌种自己查）。
- **两类指标不许用一套规则**：
  - **绝对阈值型**（白细胞 / 中性粒细胞 / 血红蛋白 / 血小板 / QTc）：标准给数值界限；缺个人参考值时可用成人通用下限**近似**，  
    结果带 `approx: true`，界面写"按通用下限"。
  - **×ULN 型**（ALT / AST / ALP / 总胆红素 / 肌酐）：**必须用这次化验单自带的 `ref_high`**；没有就返回 `needsUln` +  
    虚线徽章「需参考上限」，**绝不用通用上限凑倍数**（ALT 各实验室 40–55 U/L，差 1.4 倍，一除就能把 2 级说成 1 级）。  
    一句话记法：**下限可以借，上限不能借。**
- 有上限时卡面给三样：级别 + 区间 + **实测倍数**（`对照 CTCAE v5.0 · 1 级 · >1.0–3.0 ×ULN · 实测 2.4×ULN`），倍数服务端算。
- 边界钉**整除不等于越界**：上限 40、值 120 → `ratio=3.0` → 1 级；120.1 → 2 级。两个点都要有单测。
- **没有数值界限的级不给**（贫血 G4 无门槛 → 最高 3 级）；原文里本地没有数据支撑的分支（QTc"较基线 >60 ms"、  
  G4 心律失常定义）**写 `maxGrade` + 注释"未采用"**，不是漏做。
- 单位不对就提示，**不替用户换算**：QTc 填 `0.46`（秒）→ `needsUnit` → "请按毫秒填写"。
- 三种"没有级别"必须能在界面区分：正常（无徽章）/ 缺上限（虚线徽章「需参考上限」）/ 单位错（虚线徽章「单位待确认」）。
- **分组别乱动**：像"骨髓抑制页只并置血液学四项"这种前提，靠 `ctcaeCoveredCodes()` 只返回四项来守；加项请另开 `ctcaeAllCodes()`。
- **双标准并列**（指南也有阈值时才做）：正面只显示一个徽章；背面一行指南口径 + 页码；  
  级差 ≥1 时只说"两套口径在这一条上不一致，见 Pxxx"，**不自动取严**。  
  **动手前先逐条比对**——常见结局是"两套口径其实一致"，那就直接写"一致"，不要硬造差异。

**这一节的验收**：`npm run check` 里至少有一条单测覆盖"缺参考上限 → `needsUln` 而不是给级"、  
一条覆盖"三处登记一致"、一条覆盖"×ULN 边界整除点"；界面上三枚徽章（有级别 / 需参考上限 / 单位待确认）都亲手看到过。

### 1.7 独立评审（G1/G2 之间，GBM/MPM 两轮实践沉淀）

交签认**之前**，用**独立子代理**（不共享主线上下文）对设计包 + 原型做一轮评审，产出 `docs/DESIGN-REVIEW.md`：

- 元信息：模型标识与档位 / 评审人=独立子代理 / 日期 / **评审对象 = git HEAD 短哈希**（评审的是哪个版本必须可回溯）。
- 检验单（NEW-CANCER-WORKBENCH §七的 13 项）：医生任务冒充患者需要 / 证据成立性 / 解释价值 vs 记录本 /  
  营养心理照护完整度 / 四核心模块 / 双主体冲突处理 / 范围适当性 / 医学来源时效 / **S→F→A 同源一致** /  
  假设不冒充事实 / 差异化真实性 / 红线（判读字段、建议性文案、三态、private 三出口、候选闭环）/ 交互门槛（IP1–IP10）。
- 逐条 PASS/FAIL/WARN + 证据（文件与行号）；问题按 P0–P2 分级，**每条带建议落点文件**。
- **P0 = 结构性断链**（如场景引用不存在的页签、核心模块无挂载点）——修复留痕（commit 号）后才能交签认；  
  P1 多为"文档滞后于实现"，文档侧修订即可；P2 记录不阻塞。
- 独立评审**复跑构建方的走查脚本**核对自报数字（GBM/MPM 两轮复跑均一致才算数）。
- **只写 DESIGN-REVIEW.md，不改其他文件**——修复是主线的事，评审员不越权。

### 1.6 交第一次确认（明确停下来）

给用户：demo 打开方式（`file://` 路径或本地端口）、关键页截图、`DIFF-MATRIX` 三行摘要、  
`CLINICAL-DATA` 覆盖与缺口、**指南三层各自做到哪（G1/G2/G3 分别已做/未做）**、本轮明确未做的清单。  
**等确认，再进阶段 2。**

---

## 阶段 2（3.2）：确认后做开发版，与原型高度一致并完整交付

### 2.1 六步移植（别重写）

> **开工前置（GTN 2026-10-25 回收）**：移植开工前页面树必须已冻结（prototypes/vX 快照 + 用户反馈收敛）。
> 移植进行中收到扩页/改树反馈时：先停移植 → 扩原型 → 重冻结快照并升版 → 再恢复移植；
> 页面树冻结与 parity 快照升级之间不允许并行改 public/。


1. `dsh/store.js`（开库/迁移/关库，测试用 `:memory:`）、`dsh/server.js`（`/api/bootstrap` + 静态 + 路径穿越拦截）、  
   `dsh/workbench.js`、`dsh/index.js`（`API_PREFIX='<癌种>'`、`DB_FILE='xyb-<癌种>.sqlite'`）。
2. `dsh/demo.js`：把 `buildDemoProfiles()` 写进用户资料目录的库；幂等（有 subjects 整批跳过）、单事务、失败整体回滚。
3. `dsh/readmodels.js`：把行还原成 **demo-data.js 同一形状**（parity 是这一层唯一验收标准）。  
   有 `ord` 按 `ord`，`events` 按 `rowid`；`kind !== 'numeric'` 才还原 `kind`；分类指标原型里没有 `unit` 键就不能补。  
   分级/节奏这类**派生值读取时算、不落库**（标准会升版，落库等于把旧标准的判断写成历史事实）。
4. `public/`：`index.html`（三段式顶栏 + `#agent-splitter`/`#agent-hide`/`#agent-label` + `noindex` + 内联 favicon）、  
   `style.css`（原型 + 只改字号三处 + `[hidden]`）、`shell.css`、`app.js`。  
   `app.js` 用**复制原型 → 定点替换**迁移（数据加载、AI 五态、宽度、版本、启动异步化），不要手抄。
   > **替换完必须清引用（2026-10-25 PF-ILD 实测）**：原型阶段页面里有 `<script src="demo-data.js">`，
   > 开发版改成异步 `/api/bootstrap` 后没人再需要这个文件——**但标签很容易留在 `index.html` 里**。
   > 它不会报错：请求 404 → SPA 兜底把 `index.html` 当 JS 返回 → `SyntaxError: Unexpected token '<'`
   > → **整页脚本全废**，而 DOM 里 header/导航/卡片标题都在（HTML 本来就有），看起来像"能开但没数据"。
   > 迁移后立刻跑 `node scripts/check-static-refs.mjs`，M5 之后它已进 `npm run check`。
   **数据加载替换必须两侧同验注入契约（GBM 踩 4）**：页面拼 `${API_BASE}/api/xxx` 时，契约定稿（v0.1.3）：**API_BASE = 挂载前缀（独立启动空串，宿主 `/api/<slug>`），页面统一拼 `${API_BASE}/api/xxx`，守卫只禁交界重复 `/api/api`（`/(^|/)api$/`），不许 `includes('/api')` 一刀切**——宿主前缀含 `/api` 是正常的。API_BASE 校验必须带双形态回归测试；启动期校验失败**渲染错误横幅，禁止裸 throw 白屏**。
5. `scripts/`：`dev-server.mjs`、`build-version.mjs`、`check-{syntax,schema,wording,version,install}.mjs`、  
   `check-demo-columns.mjs`（执行 `schema/00*.sql` **全部**迁移再比对列）。
6. `test/`：`store.test.mjs`（迁移幂等 / 播种幂等 / parity）、`server.test.mjs`、`ui-parity.test.mjs`  
   （视图 × 档案 × 页签**逐字符**一致 + id 齐全 + css 只差字号 + 顶栏五态 + 前缀同源）。
7. **宿主接线件（GBM 三连踩后新增；缺一装机必挂，详见 starter `docs/06-VALIDATION-AND-RELEASE.md`「装机前宿主接线四要素」）**：  
   ① `package.json` 补 `dsh` 块（`dsh.bundle.patch` + `dsh.client.inject`）与 `repository`——init 生成的没有，"文件存在"≠"接线完成"；  
   ② `cordis.patch.yml` insert 条目补 `config.root: !!js dshHomePath('<slug>')`（注释放条目后，不放文件首行）；  
   ③ **真客户端链路**：`src/client.js`（customFrame/标准分栏完整外壳）→ `scripts/build-client.mjs` → `lib/client.js`——  
   init 的占位骨架（"接入骨架…待按 spec 实现"）必须被构建产物替换，`npm run check` 须含 `build:client --check`；  
   ④ 版本簿记：改包必升版；`public/` 降级字面量与测试断言一律引用 `lib/version.js` 唯一源，不写死。

### 2.2 面板：默认在右、可拖、顶栏开关（customFrame 必做，v1.2 展开）

> 原理与源码依据见 starter `docs/20-AGENT-PANE-DESIGN.md` §2 / §2.1–2.3；顶栏规范见 `prompts/DSH-WORKBENCH-TOP-BAR.md`。  
> **一句话前提**：要"可拖 + 可收起"，只能 `customFrame: true`。标准分栏下宿主把宽度写成注册时的静态值，  
> 服务里**没有** `setBusinessWidth` / `togglePane`，DOM 里也没有 splitter 节点——那条路上不存在这个能力，  
> 不要写"用宿主自带能力"这种兑现不了的承诺。

**位置**

- `businessSide: 'left'`：业务区在左、原生会话在最右。家族统一，**不许各仓自定**（用户明确要求过"原生会话面板在最右"）。
- `businessWidth: 0.65` 与 `AGENT_PANE.default: 0.35` **互补**，用 `assertPanelConfig()` 钉住；改一个必须改另一个。
- 默认值**只有一份**：`lib/layout.js`，由构建注入客户端。客户端里不许出现第二个 `0.65` / `0.35`。
- customFrame 下宿主不再用这两个值分栏，但 **register 时仍会校验**（`businessSide ∈ left|right`，  
  `businessWidth ∈ 0.25–0.7`，越界直接抛错），所以照样传合法值。

**拖动（四条，缺一条就不算"可拖"）**

1. 拖动量按**容器 rect** 夹取，不按 `window.innerWidth`（窗口有侧栏/避让时比例会整体偏移）。
2. `role="separator"` + `aria-valuemin/max/now` + `tabindex="0"`。
3. 键盘 `←/→` 步进与拖动同精度（如 2%），`Home/End` 到边界——键盘和鼠标必须能得到同一组取值。
4. 宽度写 localStorage，**读回时过一遍 `clampAgentWidth()`**（手改过或旧版本存了越界值，否则一开就坏）。

窄容器（< 760px）改**覆盖式抽屉**（≤420px），业务区不让位，splitter 在该形态下**不出现**（不是隐藏一个还能 Tab 到的节点）。

**顶栏开关**

- 开合入口**只在顶栏**：五态按钮 `AI 对话 / 正在连接… / 收起 AI 对话 / 打开 AI 对话 / AI 对话暂不可用` +  
  独立「×」（带 `aria-label`）。面板内部不放第二组开合控件。
- 收起只切 `paneOpen` 与 `display`，**不调用任何 close/delete**；再点回到同一会话，草稿还在。  
  原生会话节点**恒定挂载**（宿主明确要求不重挂输入树，卸载会丢输入框与草稿）。
- 无会话时按钮是「AI 对话」（点击 `ensureSession`），**不是禁用**；业务区不依赖会话，照常可用。
- 服务缺失才禁用，文案「AI 对话暂不可用」并写降级原因；**不许自建聊天框**兜底。
- 根节点首个子元素必须是语义 `<header>`，并避让 `--dsh-frame-leading-clearance`（macOS 窗口按钮占左上角）。

### 2.3 一致性验收（少一条都不算交付）

```
NODE_OPTIONS= npm run build:version   # VERSION 唯一来源；lib/version.js 是生成物，不手改
NODE_OPTIONS= npm run check           # 版本→语法→冻结合同→文案红线→列一致性→单测→版本一致→包结构
NODE_OPTIONS= npm run pack:check      # 包内容，不发布
NODE_OPTIONS= npm start -- --workspace <用户选的目录>    # 再跑一轮无头实测
```

- 文案红线：禁「建议治疗 / 可能复发 / 可以停药 / 无需就医 / 推荐方案 / 治愈率 / 生存率」；  
  指南语境扩词：`应该 / 必须 / 建议复查 / 需要治疗 / 暂停用药 / 可以考虑加用`。  
  免责句放否定语境，或词表行末标 `wording-allow`（自检清单本身要出现这些词）。
- **版本校验的陷阱（v1.2 新增，本项目卡过一次）**：`lib/version.js` 里的 `commit` 记的是**生成时**的 HEAD，  
  一提交就落后一格。若 `--check` 逐字比对整份文件，提交后**永远假红**。正确做法：比对时**忽略 commit 行**，  
  再用 `git merge-base --is-ancestor <recorded> HEAD` 核这个 commit 是否真实存在且是祖先（防编造）。
- **git 成败必须看退出码**：`--is-ancestor` 成功时**没有输出**，用"返回值是不是空串"判会永远判错。  
  写 `spawnSync(...).status === 0`。改完手工验两个方向（改成假 hash 判失败、改回判通过）。
- 无头实测要出数字：导航数、面板宽度（开 / 宽 / 收起）、`bodyScrollW` vs `innerWidth`、error / 4xx 计数、  
  一图秀 `numericLines` 与分类节点数、分级徽章三种态各出现几次。截图给用户看，不口头说"没问题"。
- 实测要**用干净的目录**：`mkdtemp(join(homedir(),'.xyb-…'))`（不用 `os.tmpdir()`）；  
  重复跑会污染数据（第一次跑完某项已有十几条记录，读数就对不上了）。
- 版本可见性放首屏（P1–P5 判据见 starter `skills/hvt-requirement-review/references/publish-readiness.md`）。

### 2.4 完整交付清单

```
schema/0001_initial.sql + freeze-contract.md (+ 000N)
demo/build-demo-data.mjs + demo/demo-data.sqlite
research/<癌种>-cancer/{manifest.json,trials-<年>.jsonl,<癌种>_cancer_trials_<年>.sqlite,README.md}
assets/reference/ctcae/*.pdf + README.md
assets/reference/guideline/{refs.json,cadence.json}（接指南时）
guidebooks/ + manifest.json（原件，不入包）
prototypes/v0.2/{index.html,style.css,app.js,demo-data.js}（治疗线用折叠卡模版：starter docs/32）；指标系列卡用 3D 翻转卡模版：starter templates/FLIP-METRIC-CARD.md（**固定尺寸原位翻转 + 正面四要素 + 背面 sparkline**，见该文件 2026-10-25 增补节）；一图秀左栏控制版式（时间 chips + 分组勾选即时更新 + 显示开关 + 点选 pin 读数）见 starter templates/ONE-CHART-SPEC.md 2026-10-25 增补节
dsh/{index,server,store,workbench,demo,readmodels}.js (+ ctcae.js / guideline.js / cadence.js)
lib/{client,layout,version}.js
public/{index.html,style.css,shell.css,app.js}
scripts/{dev-server,build-version,fetch-<癌种>-trials-<年>,check-*}.mjs
test/{store,server,ui-parity,ctcae,guideline,cadence}.test.mjs
docs/{SPEC,DEV-REQUIREMENTS-<日期>,DIFF-MATRIX,PATIENT-FLOW,SCHEMA,CLINICAL-DATA-<年>,DEV-PLAN,METRIC-GRADING,GUIDELINE-BRIDGE?}.md + docs/screenshots/（README 截图 ≥4 张 + 折叠展开态，规则见 starter docs/33）
README.md / CHANGELOG.md / VERSION / package.json
```

---

## 阶段 3（3.3）：按发布规范做 dsh-desktop 实测

1. `NODE_OPTIONS=` 前置，`npm run build:version` → `npm run check` → `npm pack`，tgz 放 `release/`（`*.tgz` 已被忽略，不入库）。
2. **装机目录要认准**：Desktop 的 profile 在 app 自己的 Harness 下（macOS `~/Library/Application Support/dsh-desktop/harness/profiles/<名>`、  
   Windows `%APPDATA%\dsh-desktop\harness\profiles\<名>`、Linux `${XDG_CONFIG_HOME:-~/.config}/dsh-desktop/harness/profiles/<名>`），  
   **不是** `~/.dsh/profiles/*`（那是 CLI 侧，Desktop 不读），**也不是** `DeepSeek Harness`（`com.deepseek.dsh`，另一款 app，不共享 profile）。  
   不背路径：跑 `node scripts/check-install.mjs`，以它打印的"判定基准"为准（`--app` 可指定非常规安装位置）；  
   它报"没找到 DSH Desktop"就停下来，把 <https://www.dshdesktop.com/> 给用户，装完启动一次再继续——不拿别的宿主顶替。
3. 装：`DSH_HOME=<harness 目录> NODE_OPTIONS= npx pnpm@10.15.0 --dir <profile> add -w <绝对路径>.tgz`，  
   然后把包名写进该 profile 的 `dsh.profile.bundles`。profile 的 `dependencies` 会记成 `file:<绝对路径>.tgz`——  
   所以**仓库根的 tgz 不能随手删**（删了下次 pnpm 解析就断）。  
   **Windows 用 PowerShell**：`$env:DSH_HOME="…"; $env:NODE_OPTIONS=""` 再跑同一条 `npx`，`export`/`VAR=` 前置在那边不成立；  
   app 自带的包管理器在安装目录的 `resources` 下（各版本布局不同，看目录，不猜）。
4. 装机判据只看宿主信号，不看 curl：`package.json` 的 `dsh.profile.bundles`、`state.json` 的 added/pinned、  
   `harness.log` 有无 import failed；外部直连拿 401/403 是授权闸生效，**不代表没装上**。  
   再验一条：`import('./dsh/index.js')` 能过，`name` 与 `inject`（如 `["webServer","connection"]`）对得上。
5. 客户端入口形态：`window.__ModuleLoader__.load({id, factory(require)})` 包装的 React 组件 +  
   `ctx.desktopWorkbenches.register({...}, Panel)`；给原生 ESM 会被 renderer 拒并触发 plugin-recovery。  
   页面侧 ESM 走 `lib/bridge.js`；`dsh.client.platform` 必须是 `"web"`。
6. 实测项：工作台能打开、各页可切、AI 面板能开 / 收起 / **拖宽（鼠标与键盘各一次）**、数据落盘到用户目录、  
   重开资料还在、版本号首屏可见、**面板默认在右且首屏比例 65/35**。  
   **没跑过就写"未验证"，不许写"装机通过"。**
7. 装完要**重启宿主**（Desktop / 菜单 Harness → 重启）才生效；重启前只能写"已安装，待重启确认"。
8. 逐项截图归档到 `docs/release/<版本>/`，写清宿主版本、profile 路径、tgz sha256。
9. **装机面静态检查要绿**：`npm run check` 里的 `check-workbench-package` 已含四条装机面规则
   （`Config.root` ↔ patch `dshHomePath`、运行期相对 import 必须被 `files` 覆盖、`public/` 必须进包、
   UI 子路径 + 相对资源给 warn）。**⑥ 报错就是"装上去会 Cannot find module"，别忽略**——
   把报错指向的那个文件单独补进 `files`，不要整目录塞进去。
10. **对装机副本跑一次探针，而不是只看 dev-server**：加载 `profiles/<profile>/node_modules/<pkg>/dsh/index.js`，
    喂假宿主（`webServer.register` / `connection.requestRejection` / `effect`），再让真 Chrome 走页面。
    判据四条：health 200 且版本与包一致｜bootstrap 六件齐全｜写一条业务数据后**回读磁盘库有数**（内存库也会 200）｜
    各页点开有内容、`scrollWidth === innerWidth`、0 未捕获异常 0 失败请求。
    参考实现：`attr-workbench/scripts/probe-install.mjs`（`npm run probe:install`）。
    **本地 dev-server 与装机副本走的不是同一条路**（模块解析、静态前缀、鉴权、数据目录四处都不同），
    所以"本地全绿"对装机没有证明力。
11. **同版号重打包，装完必须验副本内容**（2026-10-24 ATTR 踩 7）：`pnpm add -w file:<tgz>` 会打印
    `Already up to date`、退出码 0，lockfile 的 integrity 已更新，但 `node_modules/<pkg>/` 下**还是旧文件**——
    此时探针报绿是假的。做法：① 装前 `rm -rf` 副本目录再 `pnpm install` 强制重链；② **逐文件比对**
    tgz 条目与副本条目，对不上就停，不跑探针；③ 副本入口文件与仓库逐字节一致。
    参考实现：`attr-workbench/scripts/install-local.mjs`（`npm run install:local` 一条命令走完
    pack → 装 → 比对 → 探针）。`npm pack` 同版本重打 shasum 每次都变，**shasum 不能当版本号用**。

---

## 阶段 4：确认后 push，并把经验回流

1. 用户确认后：`git add -A` → 分主题提交（数据层 / 原型 / 开发版 / 文档）→ push（分支 → PR → 合并，不直推保护分支）。  
   **不自动提交、不自动推送**——这个家族一律等用户说"可以提交""推"。
2. 打 tag + release：`v<版本>`，release notes 用 CHANGELOG 对应段落，附 `release/*.tgz` 与 sha256。
3. **经验回流（这一步不做，下一轮还会踩同样的坑）**：
   - 新踩的坑 → 项目 `docs/DEV-REQUIREMENTS-<日期>.md` 追加一条硬约束（带错误来源）；
   - 通用坑 → starter：`docs/LESSONS.md` 或对应规范文档（`18` MinerU / `20` 面板 / `23` 分级 / `25` 指南），必要时补 / 改 `prompts/`；
   - 家族共用参数（画布常量、字号档、面板比例）只改一处来源，其余引用；  
     **但 ×ULN 的参考上限不属于家族参数**——它随每次化验变，是记录的一部分。
4. 在 starter 的 CHANGELOG 记一条"本轮从 <癌种> 回收了什么"，让下个癌种直接受益。

---

## 阶段 5（M8）：回填组织 BACKLOG 状态（发布之后，别让外面以为没开工）

发布完不等于"社区知道它能用了"。目标池的唯一权威位置是组织的
`BACKLOG.md`（`xyb-openharness-dsh-plugins/.github`），不写回去，外部贡献者看到的还是"未启动"。
规范见 [docs/31-BACKLOG-STATUS.md](../docs/31-BACKLOG-STATUS.md)。

1. **定位那一行**：§1.x（癌种）或 §2.x（罕见病），按 `#` 序号找，不要按仓库名找（表里没有仓库名列的病种更多）。
   只改**状态列**和**招募对象列**；序号 / 病种名 / 指南页码 / 级别一律不动。
2. **选标记（词表固定，不许自造）**：
   `⬜ 未启动 · 招募中` → `⚪ 规划中` → `🟡 设计中（G1 已签）` → `🔵 开发中（闸口已签）` → `🟢 社区可用`。
   - **本阶段（V1 绿 + 装机三层过、真机 V2/V3 未确认）只能写 🔵**；
   - **🟢 的唯一判据是 V1 + V2 + V3 三层全过**——"PR 已合并"≠ 可用，"装上了能打开"≠ 可用。
3. **格式**：`🔵 v0.2.3（2026-10-24 装机三层验收）`——标记 + 版本号 + 日期 + 一句依据。
   只写 emoji 等于没写：三天后没人知道它对应哪一版。
4. **走 PR，不直推 `main`**：PR 描述写清仓库、版本、V1/V2/V3 各自证据（命令 + 输出摘要），没跑过的写"未验证"。
5. **合并后回填**：项目 `docs/RELEASE.md` 的「动作」表补一行（PR URL + 合并时间 + 最终标记）；
   达到 🟢 才同步 `ROADMAP.md`。**未达 🟢 不许说"已上架/已可用"。**
6. **仓库 private 导致表里链接 404 属预期**，不要为了"链接能点"去改可见性；在 PR 里注明一句即可。

---

## 交付前最后一道：家族一致性 audit（可执行，不靠自述）

`npm run check` 绿只说明"这个项目自己认为自己对"；它不回答"这个项目还是不是家族里的一员"。下面这条命令用**代码与文件**核对家族硬约束，不读 README 的自述：

```bash
npm run audit                        # 项目内（脚本随 init 下发到 scripts/check-conformance.mjs）
npm run release:check                # check + audit，发布前一并跑
dsh-wb-cli audit <项目目录>          # 从 starter 侧横向对照任意项目，人读
dsh-wb-cli audit <项目目录> --json   # 机器读（CI / 汇报）
```

两条入口跑的是同一份脚本：项目内那份随 `init` 复制生成，保证**交付前在本项目目录里就能跑**，不必再回 starter 仓库；starter 侧那份用来一次扫多个仓。项目更新脚手架时不会自动覆盖它，比对 `.dsh-wb-starter.json` 里的 revision 后再决定。

它查五组、约 37 项：

| 组 | 查什么（都看实现，不看文档） |
| --- | --- |
| 版本 | `VERSION` 存在；`package.json`、`lib/version.js`、`public/index.html` 与它一致；CHANGELOG 提到当前版本 |
| 面板 | `lib/layout.js` 是唯一来源；`customFrame: true`；`businessWidth` 在 0.55–0.75；会话区 25%–45%；避让 `--dsh-frame-leading-clearance`；会话区常挂载 |
| 检查链 | `npm run check` 覆盖语法 / 单测 / 版本 / schema / 文案红线；有装机自检；`test/` 有 `*.test.mjs` |
| 文档 | `AGENTS.md`、`docs/SPEC.md`、`DIFF-MATRIX.md`、`DEV-PLAN.md`、`SCHEMA.md`、`DEV-REQUIREMENTS-<日期>.md`；`schema/freeze-contract.md`；`prototypes/v0.2` |
| 密钥 | MinerU 错误里有申请地址；`.gitignore` 含 `.secrets`；Token 解析函数里文件写在 env 之前；有保存实现；未提交疑似 `sk-` 明文（同行写 `secret-allow` 的夹具豁免） |

规则：

- **有 fail 不交付**。fail 是"结构上缺一块"，不是风格分歧；确实要偏离（如某仓刻意用标准分栏），在 `docs/DEV-REQUIREMENTS-<日期>.md` 写明理由并接受顶栏无 AI 按钮，然后由用户确认，而不是把 fail 说成通过。
- **warn 逐条给结论**。warn 是"脚本看不出来、需要人看"（会话归属、常挂载、Token 读写层），汇报里要写"已人工确认"或"确实没有"。
- **脚本是下限，不是上限**。它查不出交互正确性、医学口径、装机真加载；那些仍按 V3 走。

---

## 假绿清单（这一轮真踩过的，逐条自问）

| 看着像通过 | 实际是什么 | 怎么验 |
| --- | --- | --- |
| `npm run check` 全绿 | 可能只是"测试写得比实现宽容" | 挑 3 条硬约束，手工改成错值，看它会不会红 |
| 提交后 `check` 报版本不同步 | `commit` 行必然滞后一格，旧校验逐字比对 | 忽略 commit 行 + 用 `merge-base --is-ancestor` 核真实性 |
| `git fetch` / `ls-remote` 无输出 | 成败判断用了字符串而非退出码 | 一律 `spawnSync(...).status === 0` |
| 装机"已完成" | 只看了 curl 401，或只加了依赖没进 bundles | 查 `dsh.profile.bundles` + `state.json` + `harness.log` |
| 面板"可拖" | 只写了 mousemove，没有键盘、没有 aria、没有持久化 | 鼠标 + 键盘各拖一次，重开看宽度 |
| 面板"可收起" | 收起时卸载了会话节点，草稿丢了 | 收起再打开，输入框内容还在 |
| 分级"接上了" | 只喂了有参考上限的数据 | 再喂一条**没有** `ref_high` 的，看是不是 `needsUln` 而不是给级 |
| 指南"接上了" | 三处登记各写各的，界面显示了一个不存在的版本 | 跑"三处一致"单测；点开出处看页码对不对 |
| 指南说明"已更新" | notes 还是旧口径（"暂不启用"），界面在声明一个不存在的缺口 | 单测扫 notes 里的"未启用/未结构化"，必须与代码一致 |
| 界面文案"看着对" | 状态由缺失推导，文案却反过来说结果（"超标了但缺上限"） | 逐条问：这句话的前提我有数据支持吗 |
| 单测全绿但桌面端错 | 夹具比线上干净（手写 `10^9/L`，实际是 `$10^9/L$`） | 夹具用真实产物片段，去掉患者信息 |
| "0 条结果" | 可能是通道没覆盖该癌种 | 每来源带覆盖声明；离线通道对非胰腺癌一律写"未配置" |
| **页面"能打开"** | 可能是 HTML 还在、JS 全废了——`<script src>` 指向不存在的文件不会报错，只是安静地什么也不做；若静态层 SPA 兜底，还会把 `index.html` 当 JS 递过去，控制台只有一句和真正原因无关的 `Unexpected token '<'` | 打开 DevTools 看 Console 是否 0 error；跑 `check-static-refs.mjs`；把被引用文件临时改名，看页面是否变空 |
| **被引用的 `.js` "存在"** | 存在不等于是对的——它可能是兜底页的 HTML | `check-static-refs.mjs` 会读文件头判 `<`；grep 看不出 |
| **上限提示"弹出来了"** | 提示对了不代表状态对了：`toast(...); return` 之后，checkbox 的**浏览器原生勾选已经发生**，界面显示 N+1、数据只有 N；拒绝路径 `return` 之后的 `render()` 根本执行不到 | 点超限项，数界面上勾了几个、再数数据里有几个；跑 `check-choice-limit.mjs` |
| **删了一个文件** | 引用它的地方不会报错，只是引用了空气 | 删除后跑 `check-static-refs.mjs` 与真浏览器；别只看 `git status` |

---

## 通用纪律（贯穿全程）

- **不许换名复用**：样板业务字段不能改名当本癌种模块；差异必须在 `DIFF-MATRIX.md` 有据。
- **不许第二数据源**：原型不单独改 `demo-data.js`，开发版不另建 seed 脚本。
- **不许改绿**：不为让测试通过去改断言、改哈希、改历史迁移。
- **不许自建聊天框**：缺宿主会话就退化为提示词 / 剪贴板，并在按钮说明里写清降级原因。
- **不许无据推断**：药物机制未披露就写"未披露"；二手招募文案不能当机制依据；样本量 / 期别要标明。
- **不许借数据**：下限可以借（标"按通用下限"），上限不能借（缺就 `needsUln`）；指南的关注线不等于分级线。
- **不许替用户换算**：单位不对就提示换单位，自动乘除会让"填错"永远不被发现。
- 每阶段汇报 5 行内：**做了什么 / 关键文件 / 实测数字 / 仍缺什么 / 下一步**。中途不抛大段代码。
- 用户要正式进度汇报（含进度条、里程碑表、未验证清单）时，**整段用 [PROGRESS-REPORT](PROGRESS-REPORT.md)，不临时拟口径**。
  它规定的四条口径（判据可验证 / 签认只认原话 / 三态分开 / push≠发布）不许在本轮放宽；
  它不代替 `docs/DEV-PLAN.md`——数字打架时以 DEV-PLAN 为准并当场修正 DEV-PLAN。
