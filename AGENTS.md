# 社区 Workbench 开发灵魂

目标：用已确认需求和高精度原型交付真正能使用的工作台，减少原型丢功能、数据重复、装错版本和“测试过但用户不能用”的返工。

**项目闭环必读：** [docs/17-CLOSED-LOOP-PROJECT-FLOW.md](docs/17-CLOSED-LOOP-PROJECT-FLOW.md)。按“需求调研→需求确认→HTML原型自检→开发者确认→需要时研究/筛选数据→系统开发（parity >98%）→测试修复→DSH Desktop RC/发包环境核验→发布→人工反馈→复盘沉淀”推进。各阶段未达进入条件时继续当前阶段；用户已确认的事项继承，不重复确认。

## 适用范围：先区分本地使用与社区贡献

仅在本机制作和使用时，遵循 [本地工作台开发完整指令](prompts/LOCAL-WORKBENCH-DEVELOPMENT.md)，无需认领、上传、投稿或发布身份。可使用自己的开发流程；下文社区原型签认、文档套装、发布等阶段不作为本地开发前置条件。DSH 不控制开发过程，包格式、运行和自测遵循线上最新规范。布局由业务任务决定，常驻会话区不是默认产品设计；下文社区家族面板要求只用于相应社区项目。

## 部署目标：只认本机 DSH Desktop（最高优先级，2026-10-26）

**先把宿主找对，再谈写代码。** 宿主找错不会报错，只会安静地没效果：页面能开、`npm run check` 全绿、tgz 也打出来了，用户在 Desktop 列表里就是看不到这台工作台。规则全文见 [docs/37-DEPLOY-TARGET.md](docs/37-DEPLOY-TARGET.md)。

需求明确后、进入安装准备时先核验目标（只读，不写盘；**macOS / Windows / Linux 同一条命令**）：

```bash
node scripts/check-install.mjs    # 打印它认了哪个 app、哪个 Harness、哪个 profile，以及本包登记状态
```

- **唯一合法目标**：**DSH Desktop**（`io.dsh.desktop`）自己的 `harness/profiles/<宿主实际加载的那个>`。位置在 app 的 Electron userData 下（macOS `~/Library/Application Support/dsh-desktop/harness`、Windows `%APPDATA%\dsh-desktop\harness`、Linux `${XDG_CONFIG_HOME:-~/.config}/dsh-desktop/harness`）——**别背路径**，以脚本打印的"判定基准"一行为准。profile 名以宿主 argv/config 为准，**不按目录名猜**——`~/.dsh/profiles/web` 同名但完全不是同一个地方。
- **两个明确排除、装了也不算交付的目标**：① `~/.dsh/profiles/*`（`dsh` CLI 侧的 Harness，Desktop 不读；Windows 为 `%USERPROFILE%\.dsh`）；② `DeepSeek Harness`（`com.deepseek.dsh`）自己的 profile（另一款 app，不共享 profile）。app 装在非常规位置用 `--app <路径>` 指定，不改脚本常量。
- **没装 DSH Desktop**：当场停下，把 <https://www.dshdesktop.com/> 给用户（对应平台的安装包），装完**启动一次**（首次启动才生成 Harness 与 `state.json`）再继续。不许拿 dev server、`~/.dsh`、DeepSeek Harness 顶替，也不许把这一步写成“已验证”。
- **交付措辞**：`check` 绿 / tgz 打出来 / 代码 push **都不等于装上**。只有目标 profile 的 `dependencies` 有本包、`dsh.profile.bundles` 有本包名、重启后列表能打开，才算装机；没跑过就写“未验证”。

## 每次开始

1. 先读 README、当前任务/交接、相关 spec；检查 `git status --short`。保留已有未提交修改。
2. 先复用对话已明确的需求，每次只问一个必要问题，不用固定问卷。名称未知先问“这个工作台想叫什么名字？”，允许暂定名；名称本身不等于业务需求确认。按已有上下文补问必要的使用者、功能或场景；核心流程不清楚时提出最小流程建议供确认。业务目标和最小范围足够明确且经确认即可开始，不要求填全模板；此前仅只读检查，不从目录名、示例或代码推断意图，不创建业务代码、界面、包文件，不构建、打包或安装。
3. 每次新建或更新先读取 [DSH 线上最新工作台开发规范](https://dshdesktop.com/workbench/docs/development.md)，按当次包格式、API、运行和自测要求执行。[reference/official/development-2026-10-09.md](reference/official/development-2026-10-09.md) 仅离线备用；无法读取线上版本时明确告知未核对最新规范，不能声称已核对。社区风格与流程见 docs；上级和用户明确要求优先。发现合同与目标 Desktop 不符时记录版本与能力，不猜 API。
4. 使用主题索引按需阅读；不要重复全读日志、原型压缩脚本、数据库或输出密钥。命令输出默认截断 4000 字节；构建/测试管道启用 pipefail，日志取末尾。

## 互动设计

init后先读取并向用户展示 `docs/DESIGN-PROMPT.md` 的实际路径，以现有用户/场景/流程素材构建设计者：代表谁、怎样调研、如何取舍。新项目首条回复必须同时展示 `prompts/DSH-AGENT-PANE-INTEGRATION.md` 的实际路径；若有原生 Agent 面板需求，按该文档先做右侧面板集成对话与 UI parity 审核，再进入对应设计/实现阶段。不要先默认左侧/中间对话符合要求。维护 DESIGNER-BRIEF、DESIGN-SESSION 和 DESIGN-REVIEW。每轮聚焦首个未决关键问题，不重复已知答案；对齐提示词后再做研究、场景选择和SPEC。已有项目继承已确认阶段；用户要求讨论后修改时，先讨论范围/价值变更再改规格。详见 docs/13-DESIGNER-FIRST.md。癌种任务按需读取 prompts/NEW-CANCER-WORKBENCH.md，患者/家属需求优先，指南约束医学解释，不把医生流程直接当患者功能；泛用业务不强制医疗化。

模板就绪后，通过对话完善 BRIEF/SPEC/UI/SCHEMA；每轮聚焦一个决策，不把建议或空白模板当已确认。新 UI 优先使用实际可用的专用设计技能，共创可交互原型并实际预览，交开发者确认后实施对应模块。持久化按业务比较 JSON/SQLite/可选记忆方案，事实与缓存/摘要分清，记录来源、失效、纠正与离线降级。见 docs/07-INTERACTIVE-DESIGN.md；技能不构成运行依赖。

## 需求审核（G1，癌种项目）

单癌种工作台先过 HVT 审核再进原型：沿十条疾病轴推导"只有本癌种才成立"的患者高价值场景，写成触发→动作→产物，逐条查场景/模块/字段/交互/验收五层是否落地。**提到一次不等于覆盖**；通用能力不能用来证明本癌种需求扎实。B 级（有场景无落地）未清零不签字、不写业务代码。方法与脚本见 `skills/hvt-requirement-review/`，报告用 `templates/HVT-REVIEW.md`，说明见 [docs/15-HVT-REVIEW.md](docs/15-HVT-REVIEW.md)。

五层之外查**发布可见性 P**：版本号必须在 HTML 原型首页与装机后的应用首页首屏可见，且与 `package.json`、tag、市场条目一致。只在 README、CHANGELOG 或"关于"弹窗深层出现不算；未接入 DSH 时 P2 写"未验证"，不写通过。判据见 `skills/hvt-requirement-review/references/publish-readiness.md`。

## 一图秀（多指标时间轴）

多指标趋势页按 [docs/16-ONE-CHART-SPEC.md](docs/16-ONE-CHART-SPEC.md) 做，项目口径填在 `docs/ONE-CHART-SPEC.md`（来自 `templates/ONE-CHART-SPEC.md`）。三条不可让步：每条线按**该指标全期** min/max 归一化并写明不可比；单点不连线、空窗口给空态；治疗条与数据区分层。移动端网格轨道一律 `minmax(0,1fr)`，图表的横向滚动只能发生在图表容器内。指标卡翻转为固定高度 + `preserve-3d`，不是展开插入内容。C1–C12 断言属 G2 签认范围，不做"开发自测"了事。

设计或改造一图秀时，同时读取 [prompts/TIMELINE-MOTION-AND-EVENTS.md](prompts/TIMELINE-MOTION-AND-EVENTS.md)，把动画重播、独立事件泳道、事件标签与节点同ID联动、日期映射、减少动效终态纳入原型和 parity 审核。提示词参数是复刻目标，不是已完成证据；先用HTML呈现并记录确认范围，再同步正式工作台。品牌与医学场景按项目适配。

## 整页视图（内容多的东西不塞弹窗）

从主页点开的内容，**预计超过 1.5 屏或需要内部分区就开一整页**，不要做 480px 弹窗。按 [docs/32-FULL-PAGE-VIEW.md](docs/32-FULL-PAGE-VIEW.md) 做，用 `assets/patterns/page-view.js` + `page-view.css`，项目清单填 `docs/FULL-PAGE-VIEW.md`（模板 `templates/FULL-PAGE-VIEW.md`）。三条不可让步：①**返回与关闭是两个入口**，只给 ✕ 不合格；②**关掉后主页停在原来的滚动位置、焦点回到触发元素**；③**Esc 与浏览器返回键都只退一层**，深 3 层不许一按全关。history 是导航栈的唯一真源——禁止用 `replaceState` 假装退栈（会多出一条假位置，返回键直接错位）。原型要双击 `index.html` 就能开 → **`file://` 下不能 `import` ES module**，把实现内联成单文件（去掉 `export `、包 IIFE 挂 `window.createPageView`），做法见 `examples/page-view-standalone.html`。A1–A10 用 `node scripts/probe-page-view.mjs` 验（家族骨架自带演示与探针）；改导航行为必须同时跑 `--self-test` 反向对照，只跑正测的闸门等于没有闸门。既有项目不回溯改造，下一轮动到该页时升级。

## 疾病概要（每台必备的「?」入口）

每台都必须在 **README 的 `## 疾病概要`** 与 **看板顶栏的「?」按钮** 提供同一份疾病精炼概要，四段固定、顺序不变：**定义 → 医学资料规范和指南情况 → 目前治疗全景概要 → 发展趋势**。按 [docs/36-DISEASE-PRIMER.md](docs/36-DISEASE-PRIMER.md) 做，用 `assets/patterns/disease-primer.js` + `disease-primer.css`，数据放 `prototypes/<vX>/primer-data.js`（`window.DISEASE_PRIMER`），项目清单填 `docs/DISEASE-PRIMER.md`（模板 `templates/DISEASE-PRIMER.md`）。三条不可让步：①概要整体属**第 ② 层（解释）**，第 ③ 层判断一句都不生成，"选哪个方案"固定出口是"这一句需要问你的医生"；②**「发展趋势」只写已发生的事实**（指南版本更替、监管批件、在研登记数量与阶段分布、分类体系更新、指南结构变化），带日期或版本号，展望/推荐/优劣类词一律不写；③**没拿到原件就写"未取得原件，据二次来源"**，页码不明写"页码待核"，不许假装看过；④**拿到的那条链接必须是文件本身**——`original: true` 必须声明 `kind`（pdf/fulltext/registry/dataset），学会栏目页/指南详情页/商品页记 `hub` 且不得当原件；各机构链接形态与踩坑见 [docs/38-GUIDELINE-SOURCES.md](docs/38-GUIDELINE-SOURCES.md)，闸门 `node scripts/check-primer-links.mjs`（另跑一次 `--http` 验 content-type，PDF 拿到 text/html 即假直链）。形态是**整页视图**不是弹窗（四段必然超 1.5 屏）；`open` 压一条 history、`close` 走 `history.back()`，与其他浮层同一套导航规则。P1–P8 用 `node scripts/probe-disease-primer.mjs` 验，改模块必须同时跑 `--self-test`。老项目先补 README 段落（不影响原型稳定性），原型按"下一轮动到就补"处理。

## 指标趋势 Tab 与 3D 卡片

有检验趋势/指标卡时，先读 [docs/24-METRIC-TREND-TAB-DESIGN.md](docs/24-METRIC-TREND-TAB-DESIGN.md)，填 `docs/METRIC-TREND-SPEC.md`（模板在 `templates/METRIC-TREND-SPEC.md`），复用提示词 `prompts/METRIC-TREND-TAB.md`。按病情整理五Tab建立来源→核对→档案→分类指标→汇总；疾病特有入口映射保留。卡片按类别分组，两列/窄容器单列；正面最近值/单位/可比差值/次数/日期/来源，背面固定高度3D rotateY趋势，不上下展开。方法/单位/机构变化拆可比组，数据点打开来源不冒泡，隐藏面inert；同一目录供指标页与一图秀共用。MT01–MT15在HTML中实际验证与确认，再接生产业务。大病例必须验证曲线不被事件撑出首屏。

## 指标分析与卡片提醒

有检验指标和身体感受的页面按 [docs/23-METRIC-GRADING-AND-ALERTS.md](docs/23-METRIC-GRADING-AND-ALERTS.md) 做。四条不可让步：①指标卡**按类别分组**，组顺序与一图秀同一来源，两页组名/顺序/项数必须一致；②指标若有国际分级标准（现为 CTCAE v5.0）**直接用标准阈值对照**，不自创"轻/中/重"，且只启用标准里有绝对数值界限的项（"×ULN"型在拿到结构化参考范围上限前不启用也不近似）；③分级是**对照**不是诊断——徽章写"对照 CTCAE v<版本> · N 级"，必须显示区间、来源与免责，用了通用下限要标出来；④首页/看板提醒只把"表达面（感受）"与"指标面"**两列并置**，不写因果、不写处置；提醒是否出现由读模型算 `paired`/`labsOnly`，只有一侧不弹提醒。标准原文放 `assets/reference/<standard>/` 随包分发一份，服务端只读接口按元信息常量给文件名并校验目录边界，界面给普通链接。分级结果是派生值：读取时算、不落库。

## HTML确认与数据合同（实施前）

必须先交付可打开、可点击的HTML工作台，展示路径和操作路线，用户明确确认对应版本/模块后才实现生产业务。记录HTML版本/hash、预览、反馈、确认范围到docs/PROTOTYPE-REVIEW.md/PARITY；静态截图或文字SPEC不代替交互确认。模拟数据/壳/MockAdapter不等于业务接通。模型以稳定领域/证据/主体/版本关系为核心，UI和流程为可变读模型/命令用例，不按Tab建事实表或直接存整页state。SCHEMA/API候选可并行设计，HTML确认后再复核落实生产schema/迁移。详见docs/14-HTML-AND-DATA-CONTRACT.md。

## 开发原则

- 高精度原型是布局、内容、二级导航、交互和动效的默认实现合同。先建功能树和 parity 表，不擅自删内容、合并子页。偏离必须写原因、替代方案与验收。
- 先选择业务整页 customFrame 或标准分栏；按业务容器宽度响应式。保留宿主公共导航、设置、模式与原生会话，不复制聊天。业务页无会话时也可用。
- 数据实体和关系不跟随 Tab 布局；统一事实源、版本化读模型、递增迁移。识别候选/Agent 建议经过用户确认才成为事实。新增一般指标走定义目录与观察记录，真实语义/约束变化才迁移。
- 页面动作必须形成输入→操作→结果→回顾闭环。搜索可看详情、收藏、询问；导出必须得到格式真实的文件。未接通能力明确禁用并解释。
- 长内容弹窗采用固定外壳：标题和关闭按钮始终可见，只有内容区滚动；多选工具与主要确认操作按需固定。窄窗口、大字和键盘操作下仍可退出，不让整张弹窗或背景页面代替内容滚动。
- UI采用渐进披露：主任务/关键状态常显，低频配置与申请说明折叠，教学放💡帮助；阻断错误和必要确认不可隐藏。辅助信息可找到但不抢主体，细则见docs/03-DESIGN-SYSTEM.md。
- 外部信息按来源、时效、适用条件和核实状态管理；获取成功/Agent生成/用户采纳不等于事实已核实，未知或过期不伪装成当前确定结论。见docs/05-AGENT-AND-RESOURCES.md。
- 有地点/周边/地图需求时按docs/12-AMAP-POI.md复用可选高德能力，核验Key类型/API版本、坐标/查询范围和候选匹配；凭据留本机，POI详情不自动等于当前业务事实。无POI需求不强加地图依赖。
- 有 PDF 报告导入与指标抽取需求时按 docs/18-MINERU-PARSING.md 复用云端解析：解析由用户显式触发并告知原件出本机；Token 只进本地密钥文件（默认落用户目录，环境变量仅兜底、且排在其后）且日志只出掩码，设置页必须能手工填并如实回显来源与路径；抽取只抄写不判断（词边界、不等式保留、单位认不出留空，单位先剥 LaTeX 外壳）；**表格先转竖线表再按位置对齐，数目不一致整行放弃**；解析结果永远只是候选，逐项确认才进事实层。无报告导入需求不强加解析依赖。
- 新项目交付前必须跑 `dsh-wb-cli audit <项目目录>`（家族一致性：版本四处一致、`lib/layout.js` 是面板唯一来源且 `customFrame: true`、检查链覆盖语法/单测/版本/schema/红线、文档套装齐、密钥卫生）。**fail 不交付**；确需偏离写在 `DEV-REQUIREMENTS-<日期>.md` 并由用户确认，warn 逐条回「已人工确认/确实没有」。脚本只查结构，不替代 V2 装机与 V3 业务验证。
- 先共享组件，再按完整 Tab/业务单元成组实现与检查；不每改一个样式都跑全套，也不全站写完才第一次验证。
- 风格使用 assets 的语义 token；UI 技能辅助设计，不能改写已确认原型。品牌装饰每页 1–3 处，五色花放重要标题前，遵循减少动效设置。
- 模拟数据明确标记；测试覆盖零条、单条、多条、缺字段与错误状态。业务数据放用户确认目录，卸载不删除。云能力告知实际发送路径；模板不携带有效凭据。
- 宿主服务报错不等于会话不归属；注册成功不等于渲染成功。props.service 与 ctx 上下文代理可能不同。接入失败先取客户端真实异常；同一假设两轮无效就复核证据，参考 docs/LESSONS.md。
- 原生 Agent 适配集中在一处：正确会话 owner、用户选择的工作区、保留草稿、显式发送、异步选择竞态与结果回存都需验收。未公开的接口不通过猜名调用。
- DSH原生 Agent 对话默认设计在工作台右侧，业务工作台保持中间主区域。必须有顶栏入口、可拖动宽度、独立隐藏/重开、显式创建/复用归属会话、草稿冲突保护和窄屏收起；详细交互与验收合同见 `prompts/DSH-AGENT-PANE-INTEGRATION.md`。除用户明确改变外，不用“左侧对话+右侧业务”覆盖这一要求。
- 写 customFrame 工作台的自建顶栏时，读取 `prompts/DSH-WORKBENCH-TOP-BAR.md`：三段式（左=品牌+版本号 chip，中=一句状态说明，右=主操作按钮组紧贴右缘），色带必须克制、版本号由构建注入且与业务页同源。它是 2026-10-19 真机三轮反馈后的定稿结构，不要回到"按钮放左边、版本号只藏在业务页"的旧版。
- A 家族 customFrame 面板（语义 header → 业务 iframe → 1px splitter → 常挂载 aside）的结构、会话合同、1px+11px 分隔线、令牌与验收清单按 `docs/40-A-FAMILY-PANEL-STANDARD.md` 落地；分隔线必须夹在业务区与 `aside` 之间，拖动必须有遮罩，颜色走本仓品牌色。
- 有本地资料与原生会话协作时，顶部共用“资料目录/会话绑定”两种独立状态；真实就绪和当前项目 owner/映射确认后才绿，切换时使旧快照失效。见 docs/09-WORKBENCH-STATUS.md；保存或草稿成功不代替连接状态。

## 完成与交接

根据改动运行必要检查。安装实际tgz并核对目标Profile和版本；发布时记录包hash，安装异常再比对副本。首次接入或上架里程碑覆盖已安装列表、入口与业务清单；日常更新复用已有证据，只确认本次影响。区分代码检查、安装完成、界面加载、业务可用、外部服务成功，不互相替代。

本机更新必须交付到已安装版本，而不止推送代码。正常更新连续完成构建/打包→受支持入口安装→实际安装版本与本次修改确认；旧版仍加载时才查完整构建/包/Profile链，不在每次更新重复全量排查。仅要求Git推送时按Git范围交付。

若 Agent 正运行于目标 DSH Desktop 内，不自行关闭或重启该应用/Harness，不用进程探测绕过；让用户完整退出重开，回来后再验收。未观察到的状态写“未验证”。

每个里程碑更新 TASKS / PARITY / ACCEPTANCE 和交接；踩坑追加 docs/LESSONS.md。不未经授权推送、公开发布或投稿。源码/包回滚与数据库兼容分开判断，不以清库恢复版本。

工作台市场投稿另读 docs/10-MARKET-PUBLISHING.md。init会复制该指南、生成 docs/RELEASE.md 发布记录并回传路径；CLI只提供文档入口，不自动推送、安装、创建Release或投稿。实机交互优先用 templates/MARKET-ACCEPTANCE.md 让开发者一次完成；复用指定版本已有手工确认与截图，不反复 Computer Use 或全量扫描。包/版本/来源与YAML自动检查，用户确认如实署名；只有取得真实市场PR URL才能说已提交。

## CLI 分发补充

Git 同步只更新脚手架克隆，不覆盖业务项目。init 保留需求确认与无覆盖行为；通过 npm link 激活。修改 CLI/初始化器后执行 npm run check 与 npm test；sync 必须 ff-only，脏树/分叉/无 upstream 不自动处理。不要因初始化成功声称 Desktop 已安装。见 docs/CLI-GIT.md。

UI 风格决策可结合 docs/08-TASTE-SEED.md 的 Taste Seed 来源，按需读取并将主辅风格转成具体 token；配合实际可用的 frontend 技能，预览后由开发者确认。实际读取/部署状态如实记录，保留原型合同和可读性优先级。

## 强制：HTML先行与可演进数据模型

- 正式业务开发前，先交付可在浏览器直接打开的HTML交互工作台原型（可附本地CSS/JS），实际预览，由用户确认具体版本/hash及功能范围后才开发对应模块。文档、静态截图、生成成功或自动检查不能替代交互原型和用户确认；已有明确确认按范围继承。接入骨架和模拟原型不算业务完成。
- 数据模型必须支持前端和业务流程变化：领域事实/关系与页面布局、流程实例、读模型分离；稳定ID、来源/revision、可追踪修订、版本化API/读模型、向后兼容和增量迁移。先用改导航、加字段、跳过/重开步骤等变化走查，再定存储；不按每个Tab建事实副本，不用无限JSON代替约束。
- 完整约定见[HTML原型与数据演进关口](docs/14-HTML-AND-DATA-CONTRACT.md)。模板和癌种提示词同样遵守；HTML模拟数据不携带真实病历或凭据。
