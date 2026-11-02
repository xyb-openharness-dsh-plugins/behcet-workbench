# CTCAE v5.0（家族统一对照标准）

## 这是什么

`CTCAE_v5.0_Quick_Reference_5x7.pdf` 是美国国家癌症研究所（NCI）癌症治疗评估计划（CTEP）发布的
**Common Terminology Criteria for Adverse Events（不良事件通用术语标准）v5.0** 快速参考手册
（5×7 英寸小册版），出版日期 2017-11-27，U.S. Department of Health and Human Services。

- 官方页面：https://ctep.cancer.gov/protocoldevelopment/electronic_applications.htm
- 本文件下载源：https://dctd.cancer.gov/research/ctep-trials/for-sites/adverse-events/ctcae-v5-5x7.pdf
  （下载于 2026-10-20；ctep.cancer.gov 直链当时被防爬页拦，ClinicalTrials.gov 官方登记多处引用此 dctd 地址）
- 文件指纹：2,986,673 字节，MD5 `4e2f799b2a82b8488895ce61b247f29f`，PDF 1.6
- 首页水印：`Common Terminology Criteria for Adverse Events (CTCAE) Version 5.0, Published: November 27, 2017`

## 为什么放在脚手架里

规则见 [docs/23-METRIC-GRADING-AND-ALERTS.md](../../../docs/23-METRIC-GRADING-AND-ALERTS.md)。
一句话：**有国际分级标准的指标直接用标准阈值对照，不自创"轻/中/重"**。
标准原文放这里，是为了让每个工作台都引用**同一份**，而不是各自去网上找一版来路不明的 PDF。

## 使用原则

1. **只做对照，不做诊断**：把已记录的化验值对照阈值给出"1–4 级"标签；分级是客观区间对照，
   **不是**诊断、疗效或处理建议；是否处理由治疗团队判断。
2. **只对有绝对数值界限的指标做**：血液学四项（白细胞、中性粒细胞绝对值、血红蛋白、血小板）。
   ALT/AST/肌酐等"×ULN"型需要化验单参考范围上限，本地未结构化前**不启用，也不近似**。
3. **来源必须可见**：界面出现分级的地方都要能看到版本号与免责句（"对照不是诊断"）；
   用了成人通用下限的地方标"按通用下限"。
4. **换版 = 换文件 + 改常量 + 改阈值 + 升版本**：CTCAE 出新版（如 v6）时，替换本目录 PDF、
   更新项目里分级模块的元信息常量与阈值表、同步单测边界、按 VERSIONING 升 minor 版本并在
   CHANGELOG 列出阈值变化。

## 引用方式（推荐）

- 原文**只放一份**（项目根的 `assets/reference/ctcae/`），不要在 `public/` 再复制一份。
- 服务端给一个只读接口（如 `GET /api/reference/ctcae`），文件名取自代码里的元信息常量，
  并校验解析后仍在目标目录内——不要变成任意文件读。
- 前端用普通链接打开（`a[target=_blank]`），不内联 PDF 查看器。

## 版权说明

CTCAE 是 NCI/CTEP 的公开出版物。本仓库仅保留本地副本用于患者个人对照查看，
不随公开分发物再分发。项目若要公开发布 npm 包（`private: false`），
需先确认 `files` 里的 `assets/` 是否符合再分发政策。

## 代码对应

各工作台在自己的分级模块里抄录阈值（如乳腺癌工作台 `dsh/ctcae.js`），
并由单测逐个钉住边界。**阈值与本 PDF 冲突时，以 PDF 为准并修代码。**
