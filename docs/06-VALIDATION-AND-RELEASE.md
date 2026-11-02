# 检查、安装和发布

## 0. 部署目标只有一台（2026-10-26，最高优先级）

**规则看 [37-DEPLOY-TARGET.md](37-DEPLOY-TARGET.md)，本页只讲手法。** 三句话：

1. 唯一目标 = 本机 **DSH Desktop**（`io.dsh.desktop`）自己的 `harness/profiles/<宿主实际加载的那个>`，
   在 app 的 Electron userData 下（macOS `~/Library/Application Support/dsh-desktop/harness`、
   Windows `%APPDATA%\dsh-desktop\harness`、Linux `${XDG_CONFIG_HOME:-~/.config}/dsh-desktop/harness`）；
2. **排除** `~/.dsh/profiles/*`（`dsh` CLI 侧；Windows 为 `%USERPROFILE%\.dsh`）与 **DeepSeek Harness**（`com.deepseek.dsh`，另一款 app）——装上去是"没装"，不是"备选"；
3. **没装 Desktop** → 停下，给 <https://www.dshdesktop.com/>，装完启动一次再继续；不要先开发再补装，也不要拿 dev server 顶替。

机器判据一条命令（三平台通用）：`node scripts/check-install.mjs`（随 `init` 下发，只读；
`--app <路径>` 指定非常规安装位置，`DSH_DESKTOP_APP=none` 可反向对照"没装"分支）。

## 分层验证与节奏

| 改动 | 最小合理检查 | 不能替代 |
| --- | --- | --- |
| 文案/样式/翻面 | 语法、相关页面真实渲染、窄容器与大字 | 全站功能验收 |
| 共享组件 | 多实例/键盘/reduce motion/异常值 | 真实 Desktop 容器 |
| 完整 Tab | 相关 Store/API、组件行为、输入到回顾 | 其它 Tab 未做完项 |
| 数据迁移/主体切换 | 旧库迁移、事务、隔离、跨页一致性 | 单一 happy path |
| 解析/导出 | 真实合成文件、失败路径、内容格式、结果登记 | 请求返回 200 |
| 包/宿主接入 | 实际 tgz 清单、安装/profile、重启后界面 | 源码预览页 |

每页批次结束验该页，每 2–3 个关联页回归，里程碑跑全套。单元测试不镜像实现；字符串包含标题/transform 只能做烟雾检查，不证明图表/翻转正常。初期最先验证“目标宿主真的能加载”和一条真实数据链路，不等七页都写完才试装。

## 打包前

1. 记录 commit/工作区、版本、Node、OS/架构和 Desktop 版本。版本来自 package 元数据/健康接口，UI 不复制写死常量。
2. 按仓库锁文件选择 npm/pnpm，不混用重建锁；跑相关检查，再 pack。若宿主仓库存在 `scripts/check-workbench-package.mjs`，按它的帮助再执行官方检查。本脚手架同名工具是社区静态检查器，不冒充官方。
3. 查看 `npm pack --dry-run` 与实际 tgz 清单，包中必须有 patch、server/client 和运行 assets/迁移。检查无真实数据、密钥、临时文件与虚假已构建入口。
4. 记录 tarball 的 SHA-256；本地包也递增版本，不重复同版号试图绕缓存。

## 安装到正确 Desktop

发布目标必须由用户和项目明确。若目标为 **DSH Desktop app**，不可把 `dsh web`、通用 `--profile web`、全局 CLI 安装或“官方版”视为等价目标。先从正在运行/待验收的 Desktop app 核对版本、RC 标记、安装入口和活动 profile/generation；包 peer 范围须含目标 RC，构建/Node runtime/包管理器要与实际安装环境一致。若应用版本信息暂时不可见，记录“未核实”，先查 app 的关于/插件管理或受支持诊断入口，不推测版本。不要为了发现版本改写活动 profile。

**本机更新必须交付到已安装版本，而不止推送代码。** 用户要求“更新到 Desktop”“部署新版”“让我在本机看到修改”时，Agent应连续完成构建版本化安装包、通过目标宿主支持的入口更新、核对实际安装版本，并由用户或Agent打开确认。只有用户明确要求Git推送时，交付范围才止于Git。

**明确区分 DSH Desktop app 与通用 DSH CLI profile。** `dsh plugin --profile desktop add` 成功、`~/.dsh/profiles/desktop` 中依赖/bundle 已登记，只证明通用 CLI profile 被修改；不能推断它是 `/Applications/DSH Desktop.app` 使用的内部 profile，也不能把重启后仍未出现的工作台归因于缓存。要交付到 Desktop app，先从该 app 当版开发指南、已安装工作台管理页或受支持的诊断/CLI 确认本地 `.tgz` 安装入口和目标内部 profile/generation。安装后核验 app 自己的 workbench 注册状态、已安装列表与切换器条目，再重启验证加载；不得直接改 app 的状态 JSON、lockfile、活动链接或插件投影来绕过安装器。若找不到 app 明确支持的入口，保留 tarball 与 hash，报告“CLI profile 已安装、Desktop app 未安装”，不得声称已部署。

macOS 上若当前 Desktop 随附的 CLI 明确支持本地 tarball，且该 app 的 `.desktop-bin/pnpm` 是其 profile package runner，先从 app 帮助确认 profile 名，再显式设置 app 自己的 DSH_HOME 与 runner。示意：

```bash
export DSH_HOME='<DSH Desktop app 的 Harness 数据目录>'
export PATH="$DSH_HOME/.desktop-bin:$PATH"
dsh plugin --profile '<app 内部 profile>' add -w --save-exact 'file:/absolute/path/workbench-version.tgz'
```

此处 app 内部 profile 即使叫 `web`，也必须确认 `DSH_HOME` 指向 DSH Desktop app 的 Harness；不要运行 `dsh web`，也不要省略 DSH_HOME。安装后核对 app profile 的 `package.json` dependency 与 `dsh.profile.bundles`、node_modules 版本、`desktop-workbenches/state.json` 注册及 tarball hash；在另一 profile 核实没有意外安装。CLI 的 `--dump-config` 若无法加载 app 提供的私有 bundle，不应作为错误 profile 的证据，也不代表 Desktop UI 已加载。

**Windows（未在真机实测，按 PowerShell 写；命令形态不对等于白折腾）：** Harness 在 `%APPDATA%\dsh-desktop\harness`，
`export`/`VAR=` 前置在这里都不成立，要写成：

```powershell
$env:DSH_HOME = "$env:APPDATA\dsh-desktop\harness"
$env:NODE_OPTIONS = ""
npx --yes pnpm@10.15.0 --dir "$env:DSH_HOME\profiles\<profile>" add -w ".\release\<包名>-<版本>.tgz"
```

随后同样把包名写进该 profile 的 `dsh.profile.bundles` 再重启 Harness。**实现 e2e 时优先用 app 内受支持的安装入口**；
找不到入口就保留 tarball 与 hash 并写"Desktop 未安装"，不要靠手改状态 JSON 绕过。路径一律先跑
`node scripts/check-install.mjs`（打印它认的 app / Harness / profile），别从本文抄死路径。

**本机实证（2026-10-18，breast-cancer-workbench 首装踩坑实录，同日两轮修正）——装错 profile 是最容易犯的错：**

- **DSH Desktop app 实际读的 profile 是 `~/Library/Application Support/dsh-desktop/harness/profiles/web`**（name 叫 "dsh-profile-web"，pnpm 10.34.5，带 generationProjection）。**两个都不对**：`~/.dsh/profiles/web`（全局 CLI 用）和 `~/.dsh/profiles/desktop`（CLI 的另一个 profile，名字带 desktop 但 Desktop 不读它）——两次都装错过，重启后列表里没有就是没装对地方。
- 判定法（唯一可靠）：看 `harness/profiles/web/package.json` 里已正常显示的工作台的 `file:` tgz 登记，照抄同款装法；`harness/` 下每个工作台还有同名数据目录可交叉印证。不要凭 profile 目录名猜。
- 安装约定 = 机器既有：该 profile `package.json` 加 `file:` tgz 依赖 + `dsh.profile.bundles` 数组登记包名（两处都改，缺一不可）；改完校验 JSON 合法性。
- **用 profile 自己声明的 pnpm**：在 `harness/profiles/web` 里 `corepack pnpm add -w <tgz>` 自动遵循 `packageManager` 字段（10.34.5）。装完 `grep -c <新代码特征>` 核对安装副本真的是新版。
- **pnpm 同版本号不替换内容**：改包重装若版本号没变，`added 0`，装进去的还是旧文件。改包后要么升版本号，要么 `pnpm remove -w <pkg> && pnpm add -w <tgz>`。
- 本机 WorkBuddy 环境的 `NODE_OPTIONS` 注入 shim 会拦 pnpm 的 symlink 写入（`ERR_PNPM_CODEBUDDY_BROKER_DENY`）：`NODE_OPTIONS= corepack pnpm …` 且需关 bash 沙箱。
- CLI 短启验证 profile 时，错误列表里**没有自己包的名字**才算通过；存量包报错（版本倾斜、凭据格式）先对照实验（摘掉自己的包再启一次）排除，不要顺手改用户凭据文件。
- cordis 对宿主 `apply` 的返回值严格检查：**必须非 async、返回 undefined**，实例走模块级单例 + 导出 getter 给测试；async resolve 普通对象直接 `Invalid effect`。

若 CUA 看不到 Desktop 窗口，先用 app 自身受支持方式打开/检查；macOS 上可只读核验 `Contents/MacOS/<CFBundleExecutable>` 是否存在，并运行 `codesign --verify --deep --strict '<目标 Desktop.app>'`。如 Launch Services 返回启动错误或签名无效，记录原始结果和 app 版本，暂停宿主 UI 验收并交由 app 维护方恢复。不要通过改二进制、移除 quarantine、重签、重装覆盖或直接编辑 app bundle 来绕过；也不要把该宿主故障误判为工作台加载失败或工作台兼容证据。

正常更新按最短路径执行：

1. 按项目真实脚本构建并打包，生成带版本的安装包，运行本次改动需要的检查。
2. 使用已核验的目标Desktop安装入口/Profile更新；保留必要回滚材料和用户数据。
3. 读取安装后的版本，打开确认界面版本及本次修改；已有用户手工确认直接记录复用。
4. 报告“已安装/已加载”的实际状态；不能操作宿主时保留包，准确说明尚缺的安装步骤。

**只有安装后仍是旧版或出现加载异常，才启动完整排查链。** 依次核对源码版本、构建产物、tarball、实际Profile、安装副本和运行界面，定位第一个不一致点；按需比较hash与入口。正常更新不每次全量扫描或重复实机验收。重启只重新加载已安装内容，不自动安装Git里的新版本。

先从应用“关于”和安装入口确认版本、平台、架构，再查看当前可用 CLI 的 `plugin add --help`。只采用明确支持本地 tgz 的入口，不猜一条通用命令。

项目实际案例曾在确认的 web profile 中用 Desktop 自带 pnpm 安装包：

```bash
# 这是历史修复例子，只有目标版本明确采用同样 workspace/profile 布局时才用。
cd '<经核验的目标 profile>'
node '<Desktop 内置 pnpm.cjs>' add -w --save-exact 'file:/absolute/path/package-version.tgz'
```

`-w` 只适用 pnpm workspace 根目录。不要在业务仓库执行并把依赖装进错地方；系统 pnpm store 格式与内置 pnpm 也可能不一致。不要把本人的 macOS Library 路径写进通用安装脚本；新版本可能采用 isolated generation，须遵从当版安装器，不手工编辑活动链接、锁文件或插件树。

peer warning 不是加载结论；查宿主实际提供服务与日志。不能为消 warning 随手塞入第二份 Cordis/React/runtime。

## 装机前宿主接线四要素（2026-10-24，GBM 工作台三连踩回收）

**一句话：`npm run check` 全绿 + dev-server 实测全 200，不等于装进 Desktop 能用。** 三类缺陷全部藏在"只有宿主语境才走到"的接线面上，dev 语境的检查链一个都罩不住。装机前逐项过（**对照 tgz 内容查，不查源码仓**），缺一就是"服务 404 / 版本对不上 / 只见骨架不见界面"三种报错之一：

| # | 要素 | 缺失现象 | 怎么查（装机副本上） |
| --- | --- | --- | --- |
| 1 | `package.json` 的 `dsh` 块：`dsh.bundle.patch` + `dsh.client.inject: ["dsh-desktop-workbenches"]` | 服务插件不进插件树 → 前端"服务连接失败 404" | 读 tgz 内 package.json，与任一已正常显示的兄弟仓逐键对照 |
| 2 | `cordis.patch.yml` insert 条目带 `config.root: !!js dshHomePath('<slug>')`（name 必须是 npm 包名；**注释不能放文件首行**——社区静态检查器以文件首字符判定 insert 数组，注释写在条目之后） | 插件起不来 / 拿不到用户数据目录 | 读 tgz 内 cordis.patch.yml；装后数据目录应出现在 `harness/<slug>/` |
| 3 | **真客户端**：`lib/client.js` 必须是 `scripts/build-client.mjs` 从 `src/client.js` 生成的完整外壳，不是 init 生成的占位骨架 | 界面只见"接入骨架：服务已连接，业务功能待按 spec 实现"，而 `public/` 路由实测全 200 | tgz 内 `grep -c "接入骨架" lib/client.js` 必须 **0**；必须含 `__ModuleLoader__` 与 iframe/`UI_ENTRY`；行数量级对照兄弟仓（宫颈 488 行 vs 占位约 40 行） |
| 4 | 版本簿记：**改包必升版**（`VERSION` → `package.json` → `public/` 降级字面量 → `lib/version.js` 十处同源）；同版号重打包 pnpm 不替换内容 | "tar 包版本号不对"、装进去的还是旧文件 | tgz 文件名版本与内容 `lib/version.js` 一致；`grep -c <新代码特征>` 验证真是新版 |

四要素验收时点在 pack 之后、装 profile 之前；装后第五步才是"重启 Desktop → 工作台能加载"。这四项目前靠人工对照（检查器增强列入待实施，见 LESSONS 2026-10-24）；补齐前，本节与 `prompts/ZERO-TO-DEV.md` §2.1 是装机的强制 checklist。

**第 6 类：首用会话授权（MPM 2026-10-24 真机发现）**——新装工作台未建会话时，宿主 connection 鉴权闸拒页面 API 请求（页面降级"离线演示数据"）+ 会话容器未激活（右侧空白、按钮看似失效）。**这不是缺陷**：装机验收 V3 的第一动作是**在 Desktop 左侧新建会话再回工作台看连接状态**；产品侧对策：离线兜底文案带"新建会话"引导 + 会话区垫底引导层（0.1.3 已实装）。装机探针（`probe:install`，attr fork）可本地复现服务层全链，把"代码缺陷"与"宿主状态"两类问题分开——第 6 类在探针里不复现即为目标状态。

**第 5 类失败发生在运行时，四要素查不到**：宿主注入契约（apiBase 等）——页面在 dev（空基址）全绿，宿主把挂载前缀灌进来才炸（GBM 踩 4：server 把含 `/api` 的 basePath 直接注入，页面 F3 守卫 throw → 白屏）。对策（v0.1.3 定稿契约）：**API_BASE = 挂载前缀（可空），页面统一拼 `/api/xxx`，守卫只禁交界重复 `/api/api`**——契约进 14 号数据合同并带双形态回归测试（空串 + 宿主前缀都被接受）；顶层校验失败渲染错误横幅不白屏；probe 增加"宿主注入形态"冒烟（LESSONS 2026-10-24 待实施④）。

## 装机面第 5、6 类失败：包里少了东西 / 静态资源被兜底（2026-10-24 ATTR 双踩回收）

四要素查的是"接线写没写"，这两类查的是"**发出去的东西全不全、路径推导对不对**"。共同点依旧是：dev-server 全绿、单测全绿、`npm pack` 成功。

| # | 失败 | 现象 | 根因 | 修法 |
| --- | --- | --- | --- | --- |
| 5 | 装机副本 import 失败 | 宿主日志 `Cannot find module '<pkg>/demo/build-demo-data.mjs'`，工作台整个起不来 | `dsh/demo.js` 引 `../demo/build-demo-data.mjs`，而 `package.json` 的 `files` 白名单没有 `demo/`。开发版能跑是因为仓库里有那个目录 | 把该文件单独加进 `files`（不要整个目录——ATTR 的 `demo/` 里还有个 188 kB 演示库） |
| 6 | 业务区全白，控制台只有 `Unexpected token '<'` | iframe 指向 `/api/<slug>/ui/index.html`，页面里 `<script src="app.js">` 是**相对路径** → 浏览器请求 `/api/<slug>/ui/app.js` → 剥掉挂载前缀后是 `/ui/app.js` → 静态层找不到文件就**兜底回 index.html** → HTML 被当 JS 解析 | 静态服务只认 `public/` 根下的路径，而页面实际在 UI 子路径下 | 静态段先把 UI 前缀剥掉再解析（`if (path === '/ui' || path.startsWith('/ui/')) path = path.slice(3)`）；**dev-server 挂在根上，本地永远看不到这个故障** |

**为什么必须在装机副本上验，而不是在源码仓跑 dev-server**：

| 差异点 | 开发版 | 装机副本 |
| --- | --- | --- |
| 模块路径 | 仓库内相对路径，`demo/` 一定在 | `node_modules` 里只有 `files` 白名单解出来的东西 |
| 静态资源 | dev-server 挂根，`/app.js` | 宿主挂 `/api/<slug>`，页面在 `/api/<slug>/ui/`，相对路径变 `/api/<slug>/ui/app.js` |
| 鉴权 | 无 | 先过宿主 `connection.requestRejection` |
| 数据目录 | 命令行 `--workspace` | `cordis.patch.yml` 的 `dshHomePath` |

**能静态查的四条（`scripts/check-workbench-package.mjs` 已实装，随 `init` 下发）**：

| 规则 | 查什么 | 抓的是哪一类 |
| --- | --- | --- |
| ⑤ | `Config` 声明了 `root`，`cordis.patch.yml` 就必须有 `config.root: !!js dshHomePath(...)` | 装机能开、重启回内存库 |
| ⑥ | 运行期相对 `import`/`require` 的落点必须在 `files` 白名单里 | 第 5 类（包里少模块） |
| ⑦ | 有 `public/` 就必须被 `files` 覆盖 | 业务区空白 |
| ⑧ | UI 挂子路径 + 页面用相对资源 → **warn** | 第 6 类（静态只能提示，真验靠探针） |

⑤ 只对"自己声明了 root"的包生效：有的仓故意用 `dbPath` 指向仓内演示库（肝癌），不该被这条点名——**禁止把个案推广为规则**（见 LESSONS 同名小节）。回归见 `test/checker-install-surface.test.mjs`（必须报 / 必须不报各半）。

### 随 init 下发的六个检查器（`npm run check` 链）

静态闸门分两层：**装机面**（能否装进去、装进去跑不跑得起来）与**开发版内部一致性**（页面引用的东西在不在、状态与数据一不一致）。
前四个装机面检查器早已有；后两个是 2026-10-25 PF-ILD 实测回收——都是"check 全绿、真浏览器打开才发现坏了"的形态。

| 检查器 | 查什么 | 抓的是哪一类 | 来源病种 |
| --- | --- | --- | --- |
| `check-workbench-package.mjs` | `dsh` 块、`files` 白名单、patch/config 对穿（规则⑤–⑧） | 装机 404 / 只见骨架 | 早期多仓 |
| `check-host-contract.mjs` | 复刻宿主 `register()` 的 7 条校验（含 `businessWidth` 硬上限） | 本地全绿、装进去激活失败 | GBM |
| `smoke-activate.mjs` | 桩件真跑一遍 `apply()` | 静态查"写了什么"，它查"跑起来会不会炸" | GBM |
| `check-version-literal.mjs` | 页面版本/日期字面量与 `VERSION` 一致（或零字面量走占位符） | 版本号三处打架 | cervical + PF-ILD |
| **`check-static-refs.mjs`** | `<script src>` / `<link href>` / `<img src>` 的**本地相对路径必须真实存在**；被引用的 `.js` 内容不得以 `<` 开头 | **SPA 兜底把 404 的 JS 变成 HTML → 整页脚本全废**（"看起来能开"） | ATTR 第 6 类 + **PF-ILD 第二次** |
| **`check-choice-limit.mjs`** | 「数量上限」分支体内必须有状态回滚或重渲染 | **toast 说超了、checkbox 已勾上**（界面 N+1 / 数据 N） | PF-ILD 首次（设计层早有，检查层缺） |

两个新检查器的判据都写了反例测试（`test/check-static-refs.test.mjs`、`test/check-choice-limit.test.mjs`），
因为**检查器自己先写错过一次**：`check-choice-limit.mjs` 第一版把调用方末尾的 `render()` 算进了拒绝分支窗口，
反例判成通过。没有反例测试，检查器就是新的错觉来源。

### 条件触发检查器（34/35/38 号契约，随 init 下发）

除上面六个常开检查器外，还有几个**按功能触发**的契约断言器——实现了对应功能的仓必须过，未实现则自动跳过（不误报）：

| 检查器 | 触发条件 | 查什么 | 抓的是哪一类 | 来源 |
| --- | --- | --- | --- | --- |
| `check-agent-draft-bridge.mjs`（34 号） | `public/app.js` 出现 `agent-draft` 协议链接 / `lib/client.js` 存在 | A1 页面→壳层 postMessage 对穿（含 `send:true`）；A2 壳层监听+`event.source` 双校验；A3 自动发送双守卫（plain 相+submit）；A4 **面板唯一性**——门控必须出现在**面板显隐函数体内**（不是只查常量存在） | **两端各自实现、链路实际不通**（0.2.0 AI 按钮连不到原生会话）；**演示面板漏进装机版**（0.2.0–0.2.3 真机实漏"AI 协助·演示"残留）；**常量有但显隐没门控**（AML 0.2.0：`setAgent()` 无条件显示，装机后双面板） | 肢端肥大症 0.2.0–0.2.4；AML 0.2.0 |
| `check-trial-matching.mjs`（35 号） | `dsh/src/public/`**`lib`** 出现 `trialMatch` 类符号（明确匹配模块）；`--self-test` 10 条反向对照 | T1 第三态（"无法自动匹配"/"条目无法结构化"，或"待确认"+"需核"）；T2 禁 suitability/适配度/入组概率 命名、禁 `match_score`、禁 eligible **判读列**（只认结构定义形态，注释里出现英文不算）；T2b **有百分数才查**档位词 + "不是入组资格"；T2d 判据 `cat` 里不得出现"靶点"；T3 "未核实"或"以官方…为准" + 快照语境 | **匹配结果替医生下判定**；缺证据链的裸指数；**把药物靶点当患者条件**（会让所有靶向试验对所有人"符合"） | 35 号 v3（参考实现：biliary-tract match-0.1.0、lung-cancer client-trials） |
| `check-medical-threshold.mjs`（38 号） | 项目里有"按阈值把记录分流到不同处置"的功能（发热 / 低血糖 / 出血分级 / 肾功能分期 / 剂量调整线） | 把判定函数从源码抽出、在 Node 里**真实执行**，跑边界值/时长/无效值 ≥6 条用例 + **1 条元断言**（把旧的错误写法写回来，必须被抓住） | **文案里定义写对、代码判错**——最典型是 `v >= 38.3 \|\| v >= 38.0` 等价于 `v >= 38.0`，时长条件被吞掉，单次 38.1℃ 也弹急症；探针全绿因为它只验"弹了没" | AML 小橙宝 v0.2.0 M2 评审（2026-10-26） |

接入方式：项目 `package.json` 的 `check` 链追加 `node scripts/check-*.mjs .`（模板在 starter `templates/`，init 下发）；判据变更先改 34/35/38 号、再改检查器，与 IP 层同纪律。

**静态查不到的部分，靠一次装机副本探针**：加载 `profiles/<profile>/node_modules/<pkg>/dsh/index.js`（宿主注入的 peer 用最小 shim 顶替），喂假宿主（`webServer.register` / `connection.requestRejection` / `effect`），再让真 Chrome 走一遍页面。判据至少四条：`health` 200 且版本与包一致、`bootstrap` 六件齐全、写一条业务数据后**回读磁盘库有数**（内存库也会 200）、12 页逐个点开有内容且 `scrollWidth === innerWidth`、0 未捕获异常 0 失败请求。参考实现：`attr-workbench/scripts/probe-install.mjs`。

## 装机面第 7 类失败：装进去的还是旧包（2026-10-24 实测）

前面六类都能靠"看包内容"发现，这一类**看包也看不出来**——包是新的，装进 profile 的是旧的。

| 项 | 内容 |
| --- | --- |
| 现象 | `pnpm add -w file:<tgz>` 打印 **`Already up to date`**，退出码 0，没有任何警告；`profiles/<p>/package.json` 版本号对、`pnpm-lock.yaml` 里的 `integrity` **也已经是新包的**，但 `node_modules/<pkg>/` 下那坨文件还是上一轮的 |
| 根因 | `file:` 依赖按路径解析，同版本号重打包时 pnpm 认为"这个 spec 已经装过"，不重链。lockfile 的 integrity 会跟着新包更新，于是**簿记是新的、内容是旧的** |
| 为什么危险 | ① 探针跑的是旧代码，**报绿是假的**；② 两次版本号可能一模一样（ATTR 的 0.2.1→0.2.3 中间重打过多次同号包），从 `package.json` 分辨不出来；③ 症状是"我明明修了，怎么还是白屏"，会把人引回去重查已经修好的代码 |

**对策（三步，缺一不可）**：

1. 装之前删掉 `node_modules/<pkg>/`（`rm -rf`），再跑 `pnpm install` 强制重链——只 `add` 不删，等于没装；
2. **逐文件比对** tgz 里的条目与副本里的条目（数量 + 相对路径逐个对），对不上就当失败退出，**不要往下跑探针**；
3. 冒烟一句：副本的入口文件（`dsh/index.js`、`dsh/server.js`）存在且与仓库逐字节一致。

参考实现：`attr-workbench/scripts/install-local.mjs`（`npm run install:local`：pack → add → 删副本重链 → 逐文件比对 → 探针；`--dry-run` 只打包）。**这条静态查不出来**（要查得真去装一次），所以只能写进流程，不能写进检查器。

顺带一条：`npm pack` 同版本重打会得到不同 shasum（文件时间戳参与归档），**别拿 shasum 当版本号用**，版本看 `package.json`，内容看第 2 步的逐文件比对。

## 用户侧入口与三层验收（2026-10-21 实测，Desktop 0.12.0）

**不要把「`dsh web` 起网页版 → 浏览器 Settings → Plugins 开关插件」写成 Desktop 的用法。** 那是 CLI / Web 载体：它读的是 `~/.dsh` 那份 Harness，与 Desktop app 自己的 Harness 不是同一个安装位置，装上去 Desktop 不加载。给 Desktop 装的包只能在 Desktop 里验。

用户在 app 内的正规路径：

1. **设置 → 通用**，打开「启用工作台功能」（关掉后所有工作台都不加载，已有会话与数据不受影响）。
2. 左侧 **工作台市场** 搜索并安装；或按当版提供的本地 `.tgz` 入口安装（有没有这个入口要在「工作台市场／已安装」里实地确认，没有就走命令行，不硬找）。
3. 出现「工作台安装变更需要重启 Harness 后生效」时点 **立即重启**；没有提示时用菜单 **Harness → 重启 Harness**。
4. 市场切到 **已安装** 核对条目，再从左侧固定入口打开业务面板。

验收分三层，缺一层不算"装机通过"：

| 层 | 证据 | 只能证明 |
| --- | --- | --- |
| 配置层 | `dump-config` 里出现本包插件层 | patch 生效 |
| 列表层 | 市场「已安装」出现条目 / `desktop-workbenches/market-installs.json` 有记录 | 包被识别、注册成功 |
| 界面层 | 左侧入口打开，核心流程能点通 | **唯一算"装机通过"的证据** |

只拿到前两层时写"配置已加载、UI 未验证"，不写"装机通过"。

机器可复核：新项目模板自带 `scripts/check-install.mjs`（只读），它自动探测 Desktop Harness（app 自带 → `DSH_HOME` → `~/.dsh`），打印判定依据与"市场安装 / 手工 native 安装"的区别。换机器、换 Desktop 版本或用户改过 Harness 位置时先跑它看基准目录，不要照抄命令里的路径。

## 重启与真实验收

Agent 在目标 Desktop 内时，安装后不自动重启或杀进程，让用户完整退出重开；返回后检查列表、左侧入口、版本号、业务页面和会话。外部 Agent 可按已授权且受支持的流程完成重启。

首次接入/上架里程碑记录：目标profile/安装方式、包hash/版本、已安装列表、入口、选主体后页面、原生Agent、主要Tab/子页及适用业务链；按官方第8节逐项记录，不适用写原因。日常增量更新复用已有清单，只确认实际安装版本及本次改动影响的分支；宿主/平台变化或新故障再补对应项目。截图不展示真实凭据；用户已提供与版本对应的合规截图时直接复用。

## 发布与回滚

本地安装、Git push、GitHub Release、npm 发布、市场 PR、市场上架分别记录；互不等同。用户说“推送 Git”只授权当前相关提交推送，不自动上市场。确认 README、变更记录、license/作者/鸣谢、运行依赖、未支持项和 Demo 清理策略。

回滚先保留当前包和用户资料，再核验旧代码是否支持已升级数据库。切回旧 tgz 不等于数据库可降级；不兼容时用已验证备份/迁移路径，不删数据。市场以当期官方验收流程为准，本脚手架不自动投稿。

推荐报告格式：修改文件/包版本；代码检查；包检查；安装与实际加载；业务自测；外部依赖；未验证项；下一步。

## 选择上架时的额外闸门

官方市场规范 O03（2026-09-29 快照）要求：作者公开 GitHub 仓库和有效许可证；一个仓库根目录一个工作台；真实可用代码而非本骨架占位；打包不超过 8 MiB；包不含数据库、客户数据、有效凭据、本机绝对路径或无权公开素材。模板的 private/UNLICENSED 和未确认 Logo 授权需在正式公开前处理。临床离线数据库不要照本地私用方案直接随市场包发布。

npm→GitHub Release→源码的来源选择由市场合同决定，锁定版本/commit；失败不应自动换来源。源码路径也要带已构建客户端，市场不代执行 build。收录条目中英文简介、分类、作者自己仓库的 1–5 张真实最终版本截图（每张不超过 2 MiB）都需真实。新条目不写 register id/workbenchId；metadata/version 以当期目录 schema 为准。

投稿 PR 必须给出实际 URL；合并且公开 catalog 可见才能说已上架。完整条款见 [官方市场快照](../reference/official/market-acceptance-2026-09-29.md)，发布前再次核对官网。

## 工作台市场投稿操作指南

明确要进入 DSH Desktop 工作台市场时，按 [市场发布流程](10-MARKET-PUBLISHING.md) 执行：官方依据、来源选择、人工验收单、YAML、gh命令、最新PR检查与上架判断集中在该文档。指定版本的手工确认直接复用；Computer Use仅按需补充。代码推送、包发布与市场收录分别记录。
