# 治疗路径折叠卡（项目落地模版）

> 规范：starter docs/32-TREATMENT-PATHWAY-FOLDOUT.md。复制到项目 docs/TREATMENT-PATHWAY.md 逐项填实。

## 阶段清单
| 阶段 | 日期 | 概要（一句话） | 五块齐全 |
| --- | --- | --- | --- |
|  |  |  | ☐方案 ☐指标 ☐影像 ☐副作用 ☐支持 |

## 五块数据落点
| 块 | 数据表/字段 | 本阶段来源 |
| --- | --- | --- |
| 方案 | | |
| 指标和趋势 | | |
| 影像发现 | imaging_followup.excerpt（原文） | |
| 副作用总结 | irae_event / adverse_event（等级+处理原文） | |
| 心理/营养措施和效果 | viewpoint（private 过滤）/ nutrition_log | |

## 验收勾选
- [ ] 卡数=阶段数、默认全收起、展开 5 块固定顺序
- [ ] `@media print` 展开规则存在且实测
- [ ] 四档宽度无溢出；summary 不竖排单字
- [ ] 影像/副作用无判读词；效果只含原话
- [ ] public 与原型逐字符一致；版本已递增
