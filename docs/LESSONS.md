## 2026-10-25 · 从慢性淋巴细胞白血病小淋宝 LymPal（cll-workbench v0.2.0）回收

### L28 · 移植底本的检查器会把**底本病种名**当成本项目的期望值

`scripts/check-host-contract.mjs` 从「底本 + 布局」拼出的字符串里正则找 `customFrame`。
底本头部注释里写着「面板 customFrame=true · 业务 left 0.65」，而本项目的真实值是
`const CUSTOM_FRAME = String(PANEL.customFrame === true)`（生成物里的常量引用）。三轮修法都不对：

1. 先报 `true · 业务 left 0.65`（注释被当值）→ 只剥 `//`/`/*` 行头，**没剥块注释续行 ` * `**；
2. 再报 `'true' === 'true'`（常量赋值式被当值）→ 把正则收窄成 `customFrame:\s*` 对象属性形态；
3. 最终仍报 `CUSTOM_FRAME`（属性值本身是常量）→ 还要**解析常量定义**取字面量。

**规则（可做成断言）**：检查器读生成物时，**先剥注释再匹配**，且属性值允许「常量名」——
需回查 `const NAME = 'true'|'false'` 的定义。判据：把底本原样换成新病种，检查器应直接绿；
若不绿，问题在检查器不在项目。

### L29 · 五套测试是按底本**业务形状**写的，换病种必须整体重写而不是改常量

底本的 `store/server/import-export/demo-parity/ui-parity` 断言的是 `metric_points`、`documents`、
`candidate_fields`、私密分节 `vagina/sexual`。直接 `sed` 换病种名 → 31/42 红（不是环境问题，是形状不符）。
CLL 的 19 表与 cervical 的 18 分节没有任何一列同名。

**规则**：移植第一步先跑一遍底本测试，把红项按「形状不符 / 环境不符」分类；形状不符的一律
**按本项目 schema 重写**（本仓重写后 41/41）。改常量能让它变绿的那种改法是假绿。

### L30 · 「数据只有一个来源」要在**两处**同时钉住：生成器与原型

原型（视觉基准）与 demo 生成器（入库基准）各有一份血象序列时，日期与点数会悄悄分叉
（原型 10 点 2024-11 起 / 生成器 9 点 2024-03 起）。**正确方向是生成器服从原型**——
原型是签认过的视觉基准，生成器跟它对齐后，parity 测试才有意义。

**可断言**：`test/demo-parity` 里逐点 `deepStrictEqual(原型点位, 生成器点位)`，
而不只比点数或末值。只比末值时两条不同序列也可能通过。

### L31 · 装机目标 profile 不能凭 `~/.dsh` 推断

本机同时存在两套：`~/.dsh/profiles/desktop`（通用 CLI）与
`~/Library/Application Support/dsh-desktop/harness/profiles/web`（DSH Desktop app 实际使用）。
按 06 号做「装到 ~/.dsh」会**装成功但 Desktop 永远看不到**，而 `verify-desktop-load` 会如实报
「装机目录 未安装」。

**规则（可做成断言）**：装机前先读 `desktop-workbenches/state.json` 的 `added` 数组——
里面出现的 workbench 说明宿主认这个 profile；再用 `~/Library/Logs/DSH Desktop/harness.log`
里出现的 `profiles/<名字>/node_modules` 路径交叉确认。两处一致才动手装。

### 待实施⑦（下轮进检查器）

- `check-workbench-package`：移植自底本时，若 `package.json` 的 `files` 未包含运行时会读的目录
  （`schema`/`public`/`demo`），报红（与 NF 回流待实施⑤之②合并实现）。
- 新增 `check-derivative-leftovers`：扫 `dsh/ lib/ public/ src/ test/ scripts/` 里出现
  **底本病种名/底本品牌名**（如 `cervical`/`CerviPal`/`小莲宝`/`宫颈`）即报红。
  本轮实测残留 14 处（`src/client.js` 标题、`dev-server.mjs` 用法行、两个测试的 brand 断言），
  人工 `grep` 才清掉；这类残留会直接出现在患者界面上。

## 2026-10-25 · **假面孔 C：被空值骗过的真**

慢性粒细胞白血病工作台（小粒宝）第四轮独立评审抓到的，比前两副面孔更隐蔽——**它不是假失败也不是假通过，是一条"证据看起来完备"的假通过**。

```js
// 断言：关掉"治疗条"后曲线不变（16 号 R3 硬要求）
const before = path.getAttribute('d');
toggleTreatment();
const after = path.getAttribute('d');
assert(before === after);   // 恒成立——因为 before 和 after 都是空字符串
```

真实情况：绘图函数的调用方传 `[x, y]` 数组，函数只认 `{x, y}` 对象，`filter` 把点全丢了 → `d=""`。
**图上一根线都没有画出来**，而这条断言绿了整整一轮，自检里还写着「实测 True」。

同一轮第二例：图例写「全期口径」，基线实际取的是**窗口内**首点。切 6 个月窗口后基线从 42.6% 变 8.4%，
但"图例文字没变"这条也绿——因为没人核过基线的**来源**。

**修法与验收合同**：

1. **断言"不变"之前，先断言"有东西"**。顺序不能反：
   `assert(d.length > 0)` → `assert(bbox.width > 0 && bbox.height > 0)` → 再比 `before === after`。
2. **"不变"要比较所有会变的量**，不只最显眼的那个。本项目只比 `d`，漏了每个点的 `cy`——
   而缺陷恰好只动 `cy`（治疗条压缩了绘图区高度）。逐项列全：路径、坐标、bbox、容器高度。
3. **凡声称"口径 X"，断言必须核口径的来源**。写"全期口径"就要断言基线等于全期首点，
   而不是断言"这段文字没改过"。
4. **空窗口用例触发不了时记 SKIP，不记 PASS**。触发不了却记 PASS 等于假装验过。

**元教训（可直接做成断言）**：一条断言如果**在实现完全坏掉时也能通过**，它就不是断言，是装饰。
写完立刻想一遍"我把核心逻辑删掉，这条还绿吗"——本项目那两条都会绿。

## 2026-10-25 · 从神经纤维瘤病 v0.1.3 回收：profile 目录会被应用迁移

**【2026-10-26 修正：上一版这条把方向写反了】** 工作台 bundle 永远装 **DSH Desktop.app** 的
profile：`~/Library/Application Support/dsh-desktop/harness/profiles/web`（本地惯例：tgz 拷进该目录、
依赖写 `file:<tgz 文件名>`、bundles 数组登记、`CI=true corepack pnpm install --no-frozen-lockfile`）。
**不能**因为 `pgrep -fl dsh-desktop-host` 看见 DeepSeek Harness（Agent 宿主）的 argv 指向
`~/.dsh-classic/profiles/desktop` 就往那里装——Agent 宿主加载工作台 bundle 会把宿主搞崩
（NF 0.1.2–0.1.4 三轮装错位置，用户反馈"安装位置错误，导致 dsh 崩溃"后纠正）。
两个 app 的分辨判据见 1.5.7 节；激活的硬证据：DSH Desktop 的 web profile 数据目录里出现
`schema_migrations` 有记录的 sqlite（真目录模式不灌演示数据，表计数 0 是正确行为）。

## 2026-10-25 · 从神经纤维瘤病小纤宝 FibroPal（neurofibromatosis-workbench v0.1.2）回收

- **L26/L27 见上表**（真机 boot 的 ctx.config 未注入；files 漏 schema/）。**待实施⑤（下轮进检查器）**：`check-workbench-package` 增加——① `dsh/*.js` 出现 `ctx.config` 且对应 `apply(ctx` 无第二参 → 报错；② 存在 `dsh/store.js`（读 `../schema`）而 package.json files 缺 `schema` → 报错。
- **可复用结构（templates 挂钩）**：`templates/FLIP-METRIC-CARD.md`——分系列有序指标卡墙 + 正面当前值/背面最近记录与来源的 3D 翻转卡（含 reduce-motion 降级与键盘 Enter 支持），与 32 号折叠卡并列的第二个"原型即模版"结构；`prompts/ZERO-TO-DEV.md` 已在功能线清单挂引用。
- **流程规则**：自动领取前必须按 issues 搜索确认无人正在做（本轮 PF-ILD/地贫/儿童急淋均已被认领，BACKLOG 未认领池 ≠ issues 现实）；判读词黑名单在 NF 语境追加"恶变/癌变风险提示、遗传概率建议"两类（仅静态来源引用豁免）。
- **待实施⑥（既有失败，2026-10-25 实测）**：starter `npm test` 中 "ships the desktop-load verifier" 在本机失败——`verify-desktop-load.mjs` 在找不到 DSH Desktop harness 目录时直接抛「找不到…harness 目录」，没走到「界面加载核验」可读结论分支（test/starter.test.mjs:59 期望 `/界面加载核验/`）。该失败早于本次 NF 回流（stash 验证过），按不修绿纪律只登记不擅改。

## 2026-10-26 · 从急性髓系白血病（aml-workbench v0.3.0）回收

1. **判定对 ≠ 提示可见**。`classifyTemp` 的边界逻辑 11 例全过，纯函数断言 9/9 绿；
   但 UI 层 `onSave(vals); closeModal()` 把刚弹出的急症框当成录入框一起关掉了——
   家属录 38.5℃ **什么提示都看不到**，体温静默入库。5 个 check 全绿，红线已破。
   **切法（两条）**：
   - 表单保存回调要能"接管弹窗"：`const handled = onSave(vals); if (handled !== true) closeModal()`
     ——凡是 onSave 里会再开弹窗/对话框的，必须走这条；
   - 断言器必须有一层**源码级守卫**：grep 出「先关后弹」的调用顺序 + `dataset.emergency` 标记 +
     cancel/遮罩拦截。纯函数断言永远看不见 UI 编排。
2. **"不可忽略"必须写进事件拦截，不能只写文案**。急症框文案写着"不可忽略关闭"，
   但 `<dialog>` 默认 Esc 可关、遮罩 click 可关——全文件 `addEventListener('cancel')` 只有 0 处。
   **切法**：不可忽略对话框 = `dataset.emergency='1'` + `cancel` preventDefault + 遮罩点击忽略 +
   唯一出口按钮 + closeModal 时清标记（否则下一次普通弹窗也被锁）。
3. **"写进去"和"看得见"是两件事**。`mem().temps.push(...)` 写了，但 `grep mem().temps`
   三处全是写、无一处渲染——家人代记的体温曲线只能存不能看。**切法**：每个新写入点都必须
   配一条"写入后渲染出现"的断言（录 1 条 → 图上/列表里 +1）；这类缺失静态检查抓不到，
   要靠"写入点 → 读取点"双向 grep 核对。
4. **README 截图会静默腐烂**。同一目录存在 `-0.2.0`（新，1000px）与 `-v0.2.0`（旧，940px）
   两套，README 引用的是旧的，其中一张还是根本不存在的文件名（破图）。**切法**：
   截图产物入库前做三项断言——① 引用路径全部存在；② 全目录 md5 无重复；
   ③ 文件名版本 == VERSION；并删除旧命名的一套（两套并存必然引错）。
5. **SVG 标签要避让，位置由上一条决定**。hourLane 事件标签（12:40 / 13:10）、
   一图秀输注泳道（红细胞×1 / 血小板×1）都直接 `x+6` 绘制，实测包围盒相交叠印成黑块。
   **切法**：同泳道内按 x 排序，相邻 < 阈值则交替上下两行（配引导线）；
   一图秀末点标签的 `cursor` 避让模式可直接复用。
6. **schema 断言器要自校验哈希**。`check-schema.mjs` 不只查"有无判读列"，
   还比对 `freeze-contract.md` 里记录的 sha256 与当前文件——否则"冻结"只是口头约定，
   谁改一行 ALTER 都能悄悄过。反例测试：改一个空格即报"冻结被破坏"。

## 2026-10-26 · 从神经纤维瘤病 0.1.5 回收：激活失败的两个判据坑

- **L28 · mkdirSync(recursive) 返回值不可当路径**：`mkdirSync(dir, { recursive: true })` 在目标目录**已存在**时返回 `undefined`；把它传给 `join()`/`readFile` 等 → `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string`。表现极阴：**首次安装能跑（目录被创建），之后每次重启必挂**，工作台从列表里消失。修复：mkdir 与拼路径分离（`mkdirSync(dir,{recursive:true}); join(dir,'db.sqlite')`），开库失败降级 503 + health `degraded`，不裸 throw；回归测试要"同一 root 连开两次"。
- **L29 · "装上了没有"的判据次序**：`Harness is ready` ≠ 每个 bundle 都激活；数据目录/工作台清单有痕迹 ≠ 界面看得见。正确顺序：① 看本次运行段（最后一条 `Harness process exited` 之后）有没有 `<plugin-id>` 的 error 行；② 看 profile 里 node_modules 链接与 bundles 登记；③ 最后才是人眼确认界面。

## 2026-10-26 · 从神经纤维瘤病 0.1.5 二次回收：Desktop 会自动禁用崩溃过的插件

- **L30 · 激活崩溃 → 自动禁用，之后"修好了也不出现"**：DSH Desktop 在一次 bundle 激活失败后，会往 profile
  `cordis.patch.yml` 追加 `- id: <plugin-id>\n  disabled: true`，并留 `cordis.patch.yml.pre-disable-<id>-<时间>` 备份
  （package.json 也有 `.pre-…-disable-…` 备份）。此后即使升级到修好的版本，条目仍被禁用，宿主启动段"干净无错"
  （因为根本没加载），列表里永远不出现。**排查"工作台不出现"的完整顺序**：
  ① `grep "id: <plugin-id>" -A2 profile/cordis.patch.yml` 看有无 `disabled: true`（有就删掉该条，删前备份）；
  ② 看 harness.log 本次运行段有没有 `<plugin-id>` 的 error 行；
  ③ 核 node_modules 版本与 package.json bundles 登记；
  ④ 最后人眼确认。

## 2026-10-26 · 从神经纤维瘤病 0.1.6 回收：ctx.effect 不是「注册清理函数」

- **L31 · `ctx.effect(fn)` 会立即执行 fn，fn 的返回值才是 disposer**。写成
  `ctx.effect(() => { close(db) })` 等于在 apply 阶段立刻关库；之后任何查询抛
  `Error: database is not open`，若 handler 是 async 且未被收口，就变成
  `unhandled rejection` → DSH Desktop 打 `dsh: fatal load failure` → 进入 plugin recovery
  并**自动写 `disabled: true`**（症状：工作台从列表消失，且启动段看起来"没有插件错误"）。
  正确写法：`ctx.effect(() => () => { try { close(db) } catch {} })`；路由守卫必须收口
  async rejection（`const out = handler(req,res); if (out?.then) out.catch(fail)`），
  否则"禁裸 throw"只覆盖了同步路径。回归测试两条：setup 阶段不得 close；async rejection 必须被捕获。

## 2026-10-26 · 从神经纤维瘤病 0.1.11 回收：「装上了但不出现」的三层判据

工作台在 DSH Desktop 里消失，可能是三层各自独立的问题，必须按顺序查完：

- **L32 · 市场层禁用最隐蔽**：profile 下 `.dsh-market/state.json` 的 `disabled` 数组会整包禁用插件；
  日志只有 `toggle: <pkg>: no loader entry matched`。此时 cordis.patch.yml 干净、包与 bundles 都在、
  代码也修好了，但 loader 根本不挂载 → 启动段"无错误"、界面永远不出现。
  核对：`cat <profile>/.dsh-market/state.json`，把本包从 disabled 移除（关应用后改，或走市场 UI 启用）。
- **L33 · 客户端 register 引用未定义变量**：描述符里写了只存在于组件内部的 state（如 healthVersion），
  register 每次抛错；症状同"没注册"。smoke-activate 能抓到，但它默认测 **profile 里已安装的拷贝**——
  改仓库后要先重装（或显式传目录）再跑 smoke，否则测的是旧包（本轮即因此漏报两小时）。
- 三层排查顺序：① `.dsh-market/state.json` disabled → ② profile `cordis.patch.yml` 的 `disabled: true` →
  ③ 本次运行段 `<plugin-id>` error / `no loader entry matched` → ④ node_modules 版本 + bundles → ⑤ 人眼。
## 2026-10-26 补 · 从急性髓系白血病 0.3.2 回收（真机加载不起来）

7. **`ctx.<any> = …` 必须先 provide，否则整个插件不激活**。小橙宝把诊断信息挂到
   `ctx.amlWorkbench`，`inject` 里没有、`provide` 也没声明；本地 `smoke:activate`
   **全绿**（桩件不校验 provide），装进 Desktop 后宿主日志只有一行
   `cannot set property "amlWorkbench" without provide`，界面上就是"加载不起来"。
   **切法（两条，都已落地）**：
   - 诊断信息别挂 ctx：走 `bootstrap` 响应的 `source` 字段、事件回调或 return 值；
   - 静态断言 `templates/check-ctx-provide.mjs`：扫 `ctx.<key> =` 是否都在
     `export const provide` 里（框架键白名单），正负例各一条。
8. **"桩件通过"是装机面最危险的假绿**。这条与 0.2.4 的"截图文案"、GBM 的"register 七条"
   同类：凡是**只有真宿主才走到**的校验，必须在开发期静态化或用真宿主探针，
   不能拿桩件全绿当装机通过。判据：桩件只验"我调用了什么 API"，不验"宿主允许什么"。

## 2026-10-27 · 从神经纤维瘤病 0.1.14 回收：degraded 字段早就说了实话，别只看 200

- **L36 · npm `files` 与运行时读路径的第二变体**：L27 是 schema/，这次是 **demo 唯一源文件**
  （`prototypes/v0.1/demo-data.js`）。凡代码里 `new URL('../…', import.meta.url)` 读的文件都要进 files；
  装机后EN OENT 会让 openStore **降级**（degraded=true + STORE_UNAVAILABLE），界面全空但不报错、
  health 仍 200——极易被当成"装好了只是没数据"。对策：health 的 `degraded`/`storeError` 字段
  是一等信号，装机验证先 `curl /health` 看这两个字段；check 断言"运行时读的每个相对路径都进 files"。
- **L37 · 真机空库注入演示数据是 M5 家族惯例**：空库（subjects=0）时 seedDemo（demo_meta 标记
  `demo=true`），客户端顶栏/看板明示「演示数据，与原型同一份 demo-data 唯一源」；已有真实数据
  （subjects>0）绝不注入。这样 M5 真机界面与原型逐像素同源，v0.2 写入闭环再引入真实数据。

## 2026-10-26 · 从多发性骨髓瘤小浆宝 MyeloPal 回收：临床快照要逐字段比对 JSONL 与 SQLite

症状：manifest 与 JSONL/SQLite 均显示 257 条、摘要 hash 均匹配，SQLite `integrity_check=ok`，但 49 条 CTV 记录的 sponsor 在 JSONL 有值、SQLite 为 NULL。只验总数和文件摘要无法发现映射遗漏。

**L40 · 临床快照核验必须把主键映射字段逐行对齐**：按 `record_id` 比较 JSONL 与 SQLite 所有共享业务字段（含 JSON 序列化列），并同时核对 manifest 计数/hash、SQLite integrity、重复主键和 source_statuses 数量/重复项。检查器只读打开数据库；不得通过重采或重建快照来代替复核。

- 新增 `templates/check-trial-snapshot.mjs`，初始化后下发为 `scripts/check-trial-snapshot.mjs`；新项目 `check` 链对无快照项目显式 SKIP，已有临床快照逐字段核对。
- 回归夹具分别验证完整映射通过、JSONL sponsor 丢失映射时报错、无快照只有 `--if-present` 可跳过。
- 本次原项目数据保留未改；检查发现 M4 未通过， sponsor 缺失仍待单独获授权修复或新版本采集。

## 2026-10-27 · 从神经纤维瘤病 0.1.16 回收：Desktop 侧 UI 的正解是「原型即 iframe」

- **L38 · 手写第二套 React 界面必被用户打回**：Desktop 模式下家族标准是 customFrame 客户端 +
  服务端 `/api/<slug>/ui/` 静态承载**已签认原型**（index/style/app/demo-data 进 files），
  客户端只做：顶栏（AI 对话按钮/版本/说明）、iframe 业务区、原生会话挂载、splitter 25–45%、
  收起不卸载。照抄同 profile 兄弟包（如 narcolepsy）的 client.js 做字符串级移植最快，
  主题色/文案/消息类型（如 `nf:agent-draft`）替换干净即可；iframe 内用
  `window.parent.postMessage({type:'<pkg>:agent-draft', prompt})` 把草稿交给原生会话。
- **L39 · 批量替换必须 assert**：python/脚本对源码做字符串替换时，替换目标不存在会让修复
  静默失效（本轮 imports 替换漏掉 → ReferenceError → 条目 did not activate → 路由 404）。
  规矩：每个 replace 后 assert 变化确实发生；装机验证用带鉴权 curl 对比 401（存在）/404（未挂载）——
  全站 auth 中间件下 401 恰恰证明路由已注册。

## 2026-10-27 · 从乳腺癌 / 食管癌 / 甲状腺的 36 号回补回收：开发版接入四问

- **L40 · 顶栏「?」必须手写，自动挂载会被看板按钮抢走**：`disease-primer.js` 的 `mount()` 逻辑是
  「DOM 里已有 `[data-primer-open]` 就接管它，没有才插一颗」。而 §2.6 状态卡的出口按钮排里本来就有一颗同名文字按钮，
  业务 `app.js` 又先于模块的 `DOMContentLoaded` 把看板渲染完 —— 结果自动挂载接管的是**状态卡里那一颗**，顶栏永远空着。
  更坏的是 **P1 照样 PASS**（`querySelector('[data-primer-open]')` 拿到的正是状态卡按钮，text / aria-label 都对），
  只有打开页面肉眼看顶栏才发现少东西。规矩：顶栏触发钮一律手写在 `.top-actions` / `.tb-actions` 里，
  让它成为 DOM 里第一个触发钮；状态卡那颗继续用文字，两处入口并存是 §2.6 允许的。
  **交付前必须看一张首屏截图**确认顶栏右侧真有「?」，只跑 P1 会漏。
- **L41 · 开发版的 `index.html` 要与原型逐字符一致，别自作聪明补 aria**：多数仓的检查链里有一条
  ui-parity 断言「index.html 与原型只允许差 title / 版本号 / favicon / noindex」。给触发钮补
  `class="dp-trigger"` + `aria-controls` + `aria-expanded`、或换一版更长的 `aria-label`，都会判红 ——
  因为 `mount()` 接管时自己会补齐这些属性，页面不该写。要真需要改骨架，就同步改原型，两边一起动。
- **L42 · §2.6 状态卡与业务首卡冲突时，定「通用骨架首卡在上、业务首卡在下」**：食管癌 `SPEC.md` 原写
  「吞咽卡为首卡」，体检 / 看板类项目容易都有一张「这就是我这病最要紧的那件事」的业务卡。两卡回答的不是同一个问题
  （位置感：我在第几天、下一步谁排的 vs 业务重点：今天能吃什么），并列会打架，串行才成立。
  改 SPEC 时把理由写进去，避免下一个人又改回去。状态卡出口按钮排的**主按钮进当前阶段核心页、副按钮开疾病概要**。
- **L43 · primer 模式件版本漂移别批量覆盖**：25 个仓里 23 个的 `primer.js` 比 starter 落后，但差距往往就是
  `s.entry`（官方入口页）那 10 行，而这些仓既没有同源检查闸、数据里也没用到 `entry` —— 批量覆盖只是制造 churn。
  正确顺序：先 grep 该仓 `scripts/build-primer-data.mjs` 有没有把「模式件与源一致」写进 `npm run check`；
  有闸的仓才必须同步（否则 check 恒红），没闸的仓等它下次动 primer 时顺手带上。

## 2026-10-27 · 从小肺宝临床试验模块（0.1.2-rc.19）回收：分数怎么才不骗人

用户对 G2 demo 的原话是「好多了，按照这个开发」，交付后又补了一句「临床查询做的特别好」。
真正值钱的不是夸，是这中间实测暴露的四个缺陷——它们都**不报错、不崩、看起来很正常**，只是悄悄把结论说错。

- **L44 · 跨侧比较的字符串必须来自同一份词表**：档案侧写 `'晚期转移'`、登记侧写 `'晚期/转移'`，
  于是 `facts.scope === '晚期转移'` 恒为 false，每一类都落到「待确认」。症状极具欺骗性：分数偏低、
  待确认项多到像用户资料不全，但代码一个字都没报错。规矩：跨侧比较不许两边各写一份中文字面量，
  提到常量表（或先 `normalize` 再比）；写完立刻用「两边答案都已知」的样本跑一遍，确认能出 `met` 而不是清一色 `unknown`。
- **L45 · 反向条件不显式反转，就把阳性档案判成「对得上」**：登记标题写 `EGFR Wildtype`，原实现只要见到 `EGFR`
  就给 `met`，`EGFR L858R` 被判「位点对得上」——方向正好反了，而这类误判最容易被当成「匹配上了」。
  规矩：抽条件前先判极性，`wildtype｜野生型｜未突变｜阴性｜negative` 出现时，语义是「不得有该变异」。
  可断言的测试：同一份阳性档案，对「EGFR 突变入组」与「EGFR 野生型入组」两条登记，必须一案 `met` 一案 `unmet`。
- **L46 · 「一条判据对上」不能变成 100%**：快照读不出疾病范围时分母只剩病理一条，`1/1 = 100%`，用户看到的是
  「完全符合」。三条守则：`crit.length < 2` 不给百分数（只给「需补充信息」）；病理未确认时整页不排名；
  读不出的字段记「待确认」，不要为了凑分母把「不适用」算成「符合」。检查法：只有病理记录的档案
  + 标题读不出场景的登记，断言页面**不出现任何百分数**。
- **L47 · 断言整棵虚拟 DOM 的文本会连 `<style>` 一起匹配**：`textOfTree(tree)` 把样式文本也拼了进来，
  CSS 里有 `width:100%`，于是 `assert.doesNotMatch(text, /\d+%/)` 永远失败，而页面其实没有百分数。
  反方向同样成立：`assert.match` 可能因为 CSS 里恰好有同名字符串而**假通过**。规矩：比对页面文案前先按类名过滤节点
  （`flatten(tree).filter(n => /wb-trial-card/.test(n.props?.className))`），或让 `textOfTree` 跳过 `style` / `script`。
- **L48 · 假 React 测试不执行 effect：写在 effect 里的逻辑等于零覆盖**：自建假 React 只跑 render，
  `useEffect` 只登记不执行。好处是 effect 里可引用后面才 `const` 定义的函数（真实执行在 render 之后，TDZ 已过），
  坏处是 effect 里的判定（请求去重 key、`Esc` 关浮窗、焦点回收）一条都没被测到。规矩：把 effect 的业务判定抽成
  纯函数（`trialRequestKey(caseFile, hist)`）单独测，effect 只留接线。另：hook 顺序按索引钉死，插一个新 `useState`
  会让后面全部平移——改完先 `grep -c "React.useState"` 数实际个数，再同步 `HOOK` 映射与 `hookCount`。
- **L49 · 原型增量生成脚本必须断言「唯一命中」并核对 base64 段数**：从冻结基线生成新原型靠字符串替换，
  某段出现两次就会换错位置；整段水印 `data:image/png;base64` 会在大段替换中被连带删掉 296 KB。
  规矩：每个 replace 后 `assert s.count(old) == 1`，改完核对 `data:image` 出现次数不变、文件大小变化量在预期内；
  **生成脚本本身要入仓**——本轮它差点漏提交，就因为没人看未跟踪文件列表。
- **L50 · 发布资产回验用 `gh release download`，不要 `curl` 直连**：`curl -sL .../releases/download/...`
  在本机代理环境下拿到的是 9 字节 `Not Found`，sha256 自然不符，会被误判成「资产损坏」。
  规矩：`gh release download <tag> -D <tmp>` 再 `shasum -a 256`，与本地包逐字节比。
