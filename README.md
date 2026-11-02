# 小贝宝 BeiPal 白塞病工作台

帮助白塞病成年患者及授权代记者整理从疑似到长期随访的资料。

这是接入骨架，尚未实现真实业务。初始化后先将 [项目设计提示词](docs/DESIGN-PROMPT.md) 交给当前Agent；它应展示实际路径并以已有用户/场景/流程素材对齐设计者、研究与取舍原则。癌种项目另有 [完整专用提示词](prompts/NEW-CANCER-WORKBENCH.md)。需求见 [BRIEF](docs/BRIEF.md)，规格见 [SPEC](docs/SPEC.md)，任务见 [TASKS](docs/TASKS.md)；先读 [AGENTS](AGENTS.md)。CLI输出交接与首问，实际对话由Agent接续。

## 疾病概要

以下文字与[原型疾病概要](prototypes/v0.2/primer-data.js)分别维护，均依据[临床资料册](docs/CLINICAL-DATA-2026.md)，尚无自动同步；本项目患者访谈 0 次、临床审核 0 次。

### 定义

国家指南第 9 章以「白塞病/贝赫切特综合征」为题，覆盖黏膜和皮肤、眼、血管、神经与消化系统。图 9-1 写 ICBD 2013，正文与表 9-1 写 2014，差异原因未核。NHS 与国家指南的诊断框架结构性不同，不拼接为自测。来源：[国家指南 PDF（pdf），第 9 章 PDF 54–60 页、印刷 50–56 页](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)；[NHS 原页（fulltext），最后复核 2023-04-06](https://www.nhs.uk/conditions/behcets-disease/)。

### 医学资料规范和指南情况

国家指南 2025 年版覆盖检查和分器官治疗。EULAR 2018 建议未取得原件，据二次来源[国家指南（pdf）](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)；EULAR 2025 更新未取得原件，据二次来源 [RheumNow（fulltext）](https://rheumnow.com/news/eular-2025-update-behcets-syndrome)。[PubMed 题录（registry）](https://pubmed.ncbi.nlm.nih.gov/41876291/)记录 DOI 10.1016/j.ard.2026.02.009，不是全文。

### 目前治疗全景概要

国家指南第 9 章覆盖黏膜和皮肤、眼、血管、神经与消化系统的分器官治疗；此处只说明资料覆盖范围。来源：[国家指南（pdf）](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)。

### 发展趋势

2018 年 · EULAR 2018 版建议发表于 Ann Rheum Dis 2018;77:808–818，未取得原件，据二次来源[国家指南（pdf）](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)；2025 年 · 国家指南 2025 年版发布，第 9 章为白塞病/贝赫切特综合征；2026-03-23 · EULAR 2025 更新版在线发表，未取得原件，据二次来源 [RheumNow（fulltext）](https://rheumnow.com/news/eular-2025-update-behcets-syndrome)，另有 [PubMed 题录（registry）](https://pubmed.ncbi.nlm.nih.gov/41876291/)。

## 开发顺序

先共创SPEC和候选数据关系，再交付HTML交互工作台；由用户确认对应版本/模块后，复核SCHEMA/API并实现生产功能。确认记录见docs/PROTOTYPE-REVIEW.md；模型不依赖前端Tab/流程。模板骨架不是业务已确认。

## 当前能力

- 一个 DSH 工作台注册、认证的健康接口、版本展示与标准/大字切换。
- 已明确选择布局：business-first。business-first 使用 customFrame；模板不创建会话或复制聊天。需要 AI 协助时按官方合同接入原生 conversation 和会话管理。
- 无业务数据库、无演示患者、无真实密钥；所有业务页按确认 spec 逐项实现。

## 开发与本地验收

需要 Node.js 22+、Git、包管理器和可用 DSH Desktop；采用 SQLite 时另核验 node:sqlite 版本条件。宿主 peers 的范围仅是模板基线，请与目标 Desktop 实际依赖核对。

```bash
npm install
npm run check
npm run pack:check
npm pack
```

`npm run check` 只检查部分静态包合同和桩件激活；不能证明可以安装或在 Desktop 中加载。`npm run audit` 管"还是不是家族里的一员"：版本三处一致、`lib/layout.js` 面板参数单一来源、检查链完整、文档与密钥卫生，**只看代码与文件，不看文档自述**。新项目刚生成时 audit 必然有 fail，那是待办清单；交付/发布前必须清零，存在 fail 不得发布（`npm run release:check` 一次跑完两者）。

跑的时间点：**每次改完**跑 `check`；**G2 原型确认后、写业务代码前**先跑一次 `audit`（这时缺的多是 `lib/layout.js`、`VERSION` 这类结构，越早补越便宜）；**交付/装机前**必须跑 `release:check`；**发布或投稿前**把 `npm run audit --json` 的 `xx/xx 通过 · N 失败 · M 待人工` 抄进 `docs/RELEASE.md` 的「家族一致性」一行。`✗` 是结构缺口（补齐，或在 `docs/DEV-REQUIREMENTS-<日期>.md` 写明偏离理由并由用户确认），`!` 是需人工判断的项（逐条给「已人工确认 / 确实没有」）。

`npm install` 可能按 npm 策略解析 peer；勿为消警告重复打包宿主 runtime。客户端本身是单文件；引入 TS/组件库后需添加构建步骤并保留单文件导出。

本地安装入口以当前 Desktop/CLI 帮助为准。安装后按 [docs/06-VALIDATION-AND-RELEASE.md](docs/06-VALIDATION-AND-RELEASE.md) 与官方自测完成真实 UI 验收，并填写 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。静态检查不代表已加载。

Logo 来源与使用限制见 assets/README.md。许可证、作者、仓库/发布策略由本项目维护者确认后填写；模板默认为 private/UNLICENSED。

感谢小x宝社区、DataElement 社区，以及 sam / hhx / 繁华的 ❤️ 贡献。

初始化来源记录见 `.dsh-wb-starter.json`。更新社区脚手架不会覆盖本项目；需要升级时先用相同确认配置在临时目录生成，再审阅差异。CLI 用法见 [docs/CLI-GIT.md](docs/CLI-GIT.md)。

## HTML先行与数据演进

业务开发前先交付HTML交互工作台原型、实际预览并由用户确认版本/hash和范围。数据设计先区分领域事实、流程状态和页面读模型，走查前端/流程变化、兼容与迁移；原型对象不直接作为表。见[规范](docs/14-HTML-AND-DATA-CONTRACT.md)。
