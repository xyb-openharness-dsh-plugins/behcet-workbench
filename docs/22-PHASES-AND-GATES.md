# 三阶段 × 三闸口：开发流程速查（必记的最简心智模型）

本文是 [17-CLOSED-LOOP-PROJECT-FLOW](17-CLOSED-LOOP-PROJECT-FLOW.md)（10 阶段完整版）的**压缩视图**：回答"整个项目按什么顺序推进、哪些点必须停下来等用户签认"。两者冲突时以 17 号为准。来源：小飞侠 FSHD 工作台 2026-10-18 流程对齐讨论。

## 一张图

```
Phase1  调研设计与执行 → 场景排序确认(留痕) → SPEC+文档套装(+交互路径文档) → schema草案 → HTML demo
Gate    G1 业务流程签认 → G2 HTML签认 → G3 数据模型签认（此后才建库）
Phase2  正式迁移+冻结 + 模拟数据(demo manifest) + 检查链(npm run check)
Phase3  首版开发 → npm run check 全绿(V1) → 打包装机 Desktop(V2) → 业务验证(V3)
        → 用户反馈 → 差异进台账 → 修复循环 → 达到原型效果
M8      回填组织 BACKLOG 状态（🔵→🟢 只在三层全过后），同步 ROADMAP
```

## Phase × 闸口 × 10 阶段映射

| 用户阶段 | 包含 17 号阶段 | 硬规则 |
| --- | --- | --- |
| **Phase1 设计** | 1 需求调研（[21-RESEARCH-PLAYBOOK](21-RESEARCH-PLAYBOOK.md)）→ 2 需求确认 → 3 HTML 原型 | schema 在本阶段**只是草案**（如 `schema/draft/`），不冻结、不执行；HTML 只是草案之一；交付物含**交互路径文档**（[28 号](28-INTERACTION-PATH-DESIGN.md)，场景路径 + CRUD 双通道，与场景清单同批签认）——**无此文档不开 HTML** |
| **G1 闸口** | 2 的出口 | 业务流程与功能签认：确认人/原话要点/日期留痕（DESIGN-SESSION）；HVT B 级未清零不签字 |
| **G2 闸口** | 4 HTML 确认 | **HTML 是确认闸口**：确认具体版本+范围后才开发对应业务；未确认模块不写代码；确认后旧版冻结保留；签认含 P1 发布可见性与 **X1–X4 交互路径一致性**走查（对照已签认交互路径文档，[15 号](15-HVT-REVIEW.md)） |
| **G3 闸口** | 5 数据集前的数据契约确认 | 数据模型与数据流签认；**未过不建表、不写迁移** |
| **Phase2 数据** | 5 临床/业务数据集 | 正式迁移+冻结 sha256；此后**改结构只能新增迁移**；模拟数据走 demo manifest（清理只删登记的一套） |
| **Phase3 开发与验收** | 6 系统开发 → 7 测试 → 8 发布前核验 → 9 人工验收 → 10 反馈闭环 | 三层验证缺一不可：**V1 包级**（`npm run check`：版本/红线/密钥/单测）→ **V2 装机**（正确 Desktop profile 真加载）→ **V3 业务**（实机核心流程） |
| 反馈循环 | 10 | 差异进 DESIGN-SESSION 台账 + PARITY 表逐条闭环；一致性 >98%；AI 面板过实机验收（宿主模拟不算） |
| **M8 回填** | 10 之后的收尾 | 组织 `BACKLOG.md` 那一行的状态列与招募列（[31 号](31-BACKLOG-STATUS.md)）：只改状态与招募，序号/病种/页码/级别不动；状态列必须带版本号与日期；**🟢 只认 V1+V2+V3 三层全过**，PR 合并 ≠ 可用 |

## 最容易踩的 6 个坑

1. **把"确认"分散在聊天里** → 必须三闸口显式签认、顺序不可跳、逐个留痕；截图与脚本检查不算签认。
2. **把 HTML 当普通设计产物** → 它是 G2 权限闸口，通过前不展开业务实现。
3. **schema 一步到位** → 草案（Phase1）→ 签认（G3）→ 正式+冻结（Phase2），三步走；冻结后只加不改。
4. **"npm 通过"=完成** → 只是 V1；V2 装机与 V3 业务验证未做不得写"已验证"（版本号三处同源，改版本先改 `VERSION`；"PR 合并"≠"上架"）。发布完还有一格：**组织 BACKLOG 那行没人改，外面就一直当没开工**（M8 / [31 号](31-BACKLOG-STATUS.md)）。
5. **没有交互路径文档就写 HTML** → 导航与入口文案由实现者想象、CRUD 平铺成表单；先按 [28 号](28-INTERACTION-PATH-DESIGN.md)签场景路径 + CRUD 双通道再开工，G2 走查按它逐条断言。
6. **进度靠"我觉得差不多了"** → 汇报必须按 [PROGRESS-REPORT](../prompts/PROGRESS-REPORT.md) 的四条口径（判据可验证 / 签认只认原话 / 三态分开 / push≠发布），里程碑状态照抄 `docs/DEV-PLAN.md` 的判据列，不临场改写。

## 要一份进度汇报时

用户说「看进度 / 到哪了 / 汇报 / 更新进度条」时，整段套用 **[prompts/PROGRESS-REPORT.md](../prompts/PROGRESS-REPORT.md)**：先读 VERSION / DEV-PLAN / SIGNOFF / RELEASE / CHANGELOG / git log，再按 A–G 结构输出（一句话现状 → 进度条 → 里程碑表 → 用户能感知的事 → 踩过的坑 → 下一步三步 → 未验证清单）。它管的是**怎么讲给非工程读者**，判据与状态的唯一来源仍是 `docs/DEV-PLAN.md`。

## 家族一致性 audit（V1 之后的第二道静态闸）

`npm run check` 管"项目自己说自己对"，`dsh-wb-cli check` 管"这个包能不能装"，两者都不回答"这个项目还是不是家族里的一员"。2026-10-24 补了一条可执行检查：

```bash
dsh-wb-cli audit <项目目录> [--json]
```

五组约 37 项，**只看代码与文件，不看文档自述**：版本四处一致（`VERSION` / `package.json` / `lib/version.js` / 页面字面量）｜面板（`lib/layout.js` 唯一来源、`customFrame: true`、`businessWidth` 0.55–0.75、会话区 25%–45%、避让红绿灯、会话区常挂载）｜检查链（语法/单测/版本/schema/文案红线/装机自检）｜文档（SPEC、DIFF-MATRIX、DEV-PLAN、SCHEMA、强约束、冻结合同、原型基线）｜密钥（MinerU 申请地址、`.gitignore` 的 `.secrets`、Token 文件优先、有保存实现、无 `sk-` 明文）。

判定：**fail 不交付**；要偏离就在 `DEV-REQUIREMENTS-<日期>.md` 写明理由并让用户确认。warn 必须逐条给"已人工确认 / 确实没有"。它仍是下限——查不出交互正确性、医学口径与装机真加载，那三层照旧走 V2 / V3。

来源：2026-10-24 对四个新开发项目（胶质瘤、食管、膀胱、肝癌）做横向对照，四台的缺口集中在同几处（缺 `lib/layout.js`、缺版本生成物、`check` 只做语法），说明"文档写了"和"项目做了"之间需要一条命令来卡。

**它随项目一起生成，不是只在 starter 里手跑。** `init` 会把 `scripts/check-conformance.mjs` 复制进新项目，`package.json` 得到两个条目：

```bash
npm run check          # 第一天必绿：语法 + 装包合同
npm run audit          # 交付闸口：家族一致性，有 fail 退出码 1
npm run release:check  # check && audit，发布前一次跑完
```

刻意**不把 audit 并进 `check`**：实测裸生成项目 audit 是 17/30（11 fail：`version/lib`、`panel/单一来源`、`customFrame`、检查链四项、`test/` 无用例、DIFF-MATRIX、DEV-PLAN、强约束）。若并进 `check`，新项目第一天就红，红久了就没人看了。分工是"check 保证装得上、audit 保证还算家族成员、release:check 是最小发布门槛"，交付前必须逐条清到 0 fail、warn 逐条给结论。

第二批实测（2026-10-24 同日，含老仓）：小胰宝 `xyb-workbench` 0.1.34 是 18/34，12 fail 集中在**文档套装与版本生成物**（`VERSION`/`lib/version.js`/`lib/layout.js` 都没有，`docs/SPEC`、`DIFF-MATRIX`、`DEV-PLAN`、`SCHEMA`、强约束全缺，`check` 缺版本一致与文案红线），另 4 条 warn（CHANGELOG 未写当前版本、无装机自检、无 `prototypes/v0.2`、随包公益 Token 待人工确认）。它反过来说明一件事：**功能做得最全的仓，家族结构反而最松**——因为它是从零长出来的，不是从模板长出来的。



