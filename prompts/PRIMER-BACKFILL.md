# PRIMER-BACKFILL · 存量工作台补齐「疾病概要 36 号 v2」操作提示词

> 用途：对**已发布的工作台仓**（30+ 个）逐个补齐 36 号疾病概要与看板状态卡设计，含指南原件可点链接。
> 用法：把本文件全文贴给工作在该仓的 Agent，替换 `<病种>` 为该仓病种即可。

---

我在 <病种> 工作台仓执行 36 号疾病概要 v2 补齐。按以下步骤做，全部实测后汇报：

1. **对齐模式层（最新版）**：从 starter（xyb-workbench-starter）取最新 `assets/patterns/disease-primer.js/.css`（支持指南链接的版本），覆盖本仓 `prototypes/*/primer.js` 与 `primer.css`（保持文件名不变）；若本仓没有 primer 三件套，按 starter 36 号从零引入（数据文件 `primer-data.js` + 顶栏「?」按钮挂载）。

2. **补数据 url（§2.5 硬约束，2026-10-27 收紧）**：打开 `primer-data.js` 的 evidence（指南表）每一行：
   - `original: true` 的行**必须有 `url` + `kind`**。`kind` 词表：`pdf`（官方 PDF 直链）／`fulltext`（期刊全文页·DOI·PMC）／`registry`（登记库）／`dataset`（自采快照）／`hub`（学会栏目页，**不得配 original:true**）。
   - **链接必须是文件本身，不能是栏目页**：`guidelines-detail?id=x`、`esmo.org/.../anal-cancer`、`facs.org/quality-programs/...` 一律记 `hub`。
   - 各机构的链接形态与坑先读 [docs/38-GUIDELINE-SOURCES.md](../docs/38-GUIDELINE-SOURCES.md)：NCCN 只有**患者版**免费用（`/patients/guidelines/content/PDF/<slug>-patient.pdf`），临床版 `physician_gls/pdf/<slug>.pdf` 返回的是 HTML 登录页；CACA 多数病种有独立分册；CSCO 通常没有独立分册；ESMO 全文页对脚本 403。
   - `original: false` 的行**必须有 `secondaryUrl`**（权威二次来源）。
   - 找不到任何可达链接的行：`nolink: true` + `note` 说明（如"无官方免费全文"），**不得编 URL**。
   - 三步验证（缺一步不算）：① `curl -sI` 看 `content-type`（识破 HTML 冒充 PDF）② 真下载一次 `file` 认 PDF ③ 跑 `node scripts/check-primer-links.mjs --http`。

3. **看板状态卡（§2.6）**：看板首卡按四件结构自查：卡头（D+N/阶段 eyebrow）／大字天数（锚点日派生，不手填）／现状行（阶段原文+状态+下次日期与事项）／出口按钮排（主按钮进当前阶段核心页 + 副按钮「疾病概要：<病>是什么？」打开浮窗）。缺哪件补哪件；无锚点数据显示「待初始化」。

4. **浮窗内容结构自查（§2.1 四段）**：定义／医学资料规范和指南情况（含可点链接表）／目前治疗全景概要（固定出口句）／发展趋势（只写已发生事实+日期）。

5. **验证（全部实测）**：
   - `node <starter>/scripts/probe-disease-primer.mjs <本仓原型页>` 全过（starter 最新版探针含 **P9 排版对齐**）；**必须带 `--url <本仓原型页>`**，不带则默认打开 starter 的 `examples/disease-primer.html`，在本仓会整片报 FAIL（小萌宝 2026-10-27 实证）；
   - `node scripts/check-primer-links.mjs`（静态）+ `--http`（内容类型）全过；存量仓可先加 `--legacy` 只告警，本轮动到的页补齐 `kind` 后去掉；
   - **P9 排查提示（1.9.0 起）**：报「文本右极差 N px」= 正文块被 `max-width` 卡窄（历史值 `68ch`），删掉即可；
     报「左偏移 .dp-points li:18」= 列表缩进写在了 `ul` 上，应移到 `li`（见 36 号 §4.3）；
     报「面板不可见」= 探针在 P7 关闭面板后没复开，属探针自身问题，升级 starter 探针；
   - 截图浮窗四段+指南表，人工核对每条链接**点开可达**、缺链接行有红色标记；
   - `npm run check` 全绿；改包升版（patch 号），CHANGELOG 记「36 号 v2 补齐（指南可点+状态卡）」。

6. 完成后：装机副本刷新（profile pnpm add 新 tgz），真机打开「?」浮窗抽查两条链接。

红线：不编 URL、不把栏目页当原件、不把 NCCN 患者版说成临床版、不复制指南原文条款、不写判定；未取得的如实标注并写清原因。
