# 小贝宝 BeiPal 白塞病工作台

帮助白塞病成年患者及授权代记者整理从疑似到长期随访的资料。

这是接入骨架，尚未实现真实业务。初始化后先将 [项目设计提示词](docs/DESIGN-PROMPT.md) 交给当前Agent；它应展示实际路径并以已有用户/场景/流程素材对齐设计者、研究与取舍原则。癌种项目另有 [完整专用提示词](prompts/NEW-CANCER-WORKBENCH.md)。需求见 [BRIEF](docs/BRIEF.md)，规格见 [SPEC](docs/SPEC.md)，任务见 [TASKS](docs/TASKS.md)；先读 [AGENTS](AGENTS.md)。CLI输出交接与首问，实际对话由Agent接续。

## 疾病概要

以下是与[原型疾病概要](prototypes/v0.2/primer-data.js)同一份内容的正文（两处分别维护，尚无自动同步），依据[临床资料册](docs/CLINICAL-DATA-2026.md)。四段只整理公开信息与指南原文，属于「解释」；**不构成诊断、治疗选择或任何与你个人有关的判断**。本项目**患者访谈 0 次、临床审核 0 次**：以下文字由人工整理，尚未经临床专业人员审核。

### 定义

[国家卫生健康委《86 个罕见病病种诊疗指南（2025 年版）》第 9 章](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)：白塞病（Behçet’s disease，BD）又称贝赫切特综合征，是一种以血管炎为基本病理改变的慢性、复发性自身免疫/炎症性疾病。它主要引起反复发作的口腔溃疡、生殖器溃疡、葡萄膜炎和皮肤损害，也可以累及心脏及大血管、神经系统、胃肠道和关节；不同患者的受累部位和病程差别很大，近年不少文献把它称作白塞综合征（Behçet’s syndrome，BS）。原文列举的常见表型有皮肤黏膜型、关节型、血管型、胃肠型、眼型和中枢神经系统型；发病年龄「多为 15～50 岁，中位发病年龄 34 岁」。第 9 章同时写明「BD 无特异性生物标志物或病理组织学特征」，诊断主要依据临床症状、由医生综合判断；该章收录的 2014 年国际白塞病标准（ICBD）评分系统是临床分类工具，不是自测表。来源：[国家指南 PDF 第 9 章，PDF 54–60 页（印刷 50–56 页）](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)；[NHS 患者信息页，最后复核 2023-04-06、下次复核 2026-04-06](https://www.nhs.uk/conditions/behcets-disease/)，其诊断框架与第 9 章结构性不同，不拼接为自测。

### 医学资料规范和指南情况

| 机构 | 文件 | 版本 / 年份 | 原件 | 本台用途 |
|---|---|---|---|---|
| 国家卫生健康委办公厅 | 86 个罕见病病种诊疗指南（2025 年版）· 第 9 章 白塞病/贝赫切特综合征 | 2025 年版（国卫办医政函〔2025〕252 号，2025-06-17） | [原件已取得：官方 PDF，PDF 54–60 页](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf) | 定义、诊断框架与分器官治疗类别的引用依据 |
| NHS | Behçet’s disease（患者信息页） | 最后复核 2023-04-06 | [原件已取得：网页正文](https://www.nhs.uk/conditions/behcets-disease/) | 只作英语患者信息对照，诊断框架不与第 9 章合并 |
| EULAR | 2018 update of the EULAR recommendations for the management of Behçet’s syndrome | Ann Rheum Dis 2018;77(6):808–818 | 未取得原件，据二次来源国家指南第 9 章参考文献（全文需订阅） | 只记录题录与存在，不引用其中推荐 |
| EULAR | EULAR recommendations for the management of Behçet’s syndrome: 2025 update | 在线发表 2026-03-23；Ann Rheum Dis 2026;85(6):1010–1025 | 未取得原件，据二次来源 [PubMed 题录](https://pubmed.ncbi.nlm.nih.gov/41876291/)（Europe PMC 记录 inPMC=N） | 只记录题录与存在，不引用其中推荐 |
| 中华医学会风湿病学分会 | 白塞综合征诊疗规范 | 2021 年 | 未取得原件，据二次来源 [Europe PMC 题录 PMID 34551473](https://europepmc.org/article/MED/34551473) | 只记录该规范存在，本版暂不作引用依据 |

### 目前治疗全景概要

下面按国家指南第 9 章的原文只列出治疗的**类别**，不列具体药物、不给选择顺序、不写疗效与手术指征，也不判断哪一类适合谁。原文同时写明「BD 目前尚无公认的有效根治药物」，治疗目标是迅速抑制炎症、防止复发、防止不可逆的器官损伤、延缓疾病进展；具体用哪一类、怎么用，由医生按年龄、性别、器官受累类型及严重程度个体化决定，本台不写。

- **一般治疗（类别）**：日常口腔卫生；平时不宜进食过硬或温度过高的食物，避免进食刺激性食物。发生口腔或生殖器溃疡时做伤口护理，避免继发细菌感染。
- **局部治疗（类别）**：口腔、外阴溃疡使用局部（外用）药物减轻局部炎症；眼部可由眼科医生在眼局部给药，控制眼内炎症。
- **全身药物治疗（类别）**：按作用粗略分为几类——非甾体抗炎药、改善病情的抗炎与免疫调节药、糖皮质激素、生物制剂（含单抗类 TNFα 抑制剂）、α 干扰素等。医生按受累器官和病情轻重，决定用哪一类、用多久。同一类里具体选哪种药、剂量、疗程、何时加量减量或换药，都属于处方与随访判断，本台不写。
- **外科与介入（类别）**：少数严重器官损害（如消化道并发症、大血管病变、心脏瓣膜问题）可能由外科或介入方式处理；是否做、何时做由相关专科医生判断。

> 以上是文献与指南里列出的手段类别，按受累器官与病情轻重排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。

来源：[国家指南 PDF 第 9 章 治疗（只取类别框架），PDF 58–59 页（印刷 54–55 页）](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)。

### 发展趋势

只列本轮核实到的、已经发生且有日期或版本号的事实（不写对将来的判断）。

- **2018 年 · 指南版本更替**：EULAR 发布「2018 update of the EULAR recommendations for the management of Behçet’s syndrome」，刊于 Ann Rheum Dis 2018;77(6):808–818。原件未取得，据二次来源[国家指南 PDF](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)。
- **2021 年 · 指南版本更替**：中华医学会风湿病学分会《白塞综合征诊疗规范》发表并存目（Zhonghua Nei Ke Za Zhi 2021）。原件未取得，据 [Europe PMC 题录 PMID 34551473](https://europepmc.org/article/MED/34551473)。
- **2025-06-17 · 指南发布**：国家卫生健康委办公厅以国卫办医政函〔2025〕252 号印发《软骨发育不全等 86 个罕见病病种诊疗指南（2025 年版）》，白塞病/贝赫切特综合征为第 9 章；[原件已取得（官方 PDF）](https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf)。
- **2026-03-23 · 指南版本更替**：EULAR 2025 更新在线发表（Ann Rheum Dis 2026;85(6):1010–1025，DOI 10.1016/j.ard.2026.02.009）。原件未取得，据 [PubMed 题录与摘要 PMID 41876291](https://pubmed.ncbi.nlm.nih.gov/41876291/)：该更新由 5 条总则和 12 条建议组成，其中 1 条为新增、7 条修改内容、4 条仅改措辞；全文推荐细节未取得，本台不引用。

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
