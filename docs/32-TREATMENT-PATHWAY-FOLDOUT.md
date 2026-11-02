# 治疗路径折叠卡：默认概要、按需展开细节（家族模版）

> 来源：小痣宝（MEL）真机反馈（2026-10-25），用户原话：「默认用概要，简洁-清晰……这个就比较适合后续医生随需了解细节，点开折叠内容就可以，保持现有 #treatment/pathway 这个很棒。」
> 参考实现：melanoma-workbench v0.3.1 `pageTreatPathway()` + `style.css` `.phase-fold` 段。

## 1. 它回答谁的问题
- 患者/家属日常：只看「走到哪一步、下一步是什么」——默认只显**阶段名 + 日期 + 一句话概要**。
- 医生随需了解细节：点开该阶段即见五块结构化细节，不用翻五个页面。
- 打印/导出：打印时全部展开（`@media print`），一页拿到完整病程。

## 2. 硬结构（五块，缺一块不算落地）
每阶段一张折叠卡，`<summary>` 只放概要，展开区固定五块**按此顺序**：

| # | 块 | 必含内容 | 数据来源示例 |
| --- | --- | --- | --- |
| 1 | 方案 | 药名/剂量/周期/起止/计划 vs 实际 | systemic_tx / surgery_record |
| 2 | 指标和趋势 | 阶段内关键指标（值+日期+参考语境），趋势一句话 | metric_point / lab_result |
| 3 | 影像发现 | 阶段内影像结论**原文**（不判读） | imaging_followup |
| 4 | 副作用总结 | AE/irAE 摘要（等级原文+处理原文，不归因） | irae_event / adverse_event |
| 5 | 心理/营养措施和效果 | 支持措施 + **效果记录（患者原话，不评疗效）** | viewpoint / nutrition_log |

规则：每块 `summary` + `items([标签,内容])`；无内容写「无 + 说明」，**省略块=违规**；「效果」只含引号内原话；影像/副作用禁判读/归因。

## 3. 实现契约
1. 原生 `<details>/<summary>`：零 JS、键盘可用；默认全部收起。
2. summary：`● 阶段名 · 日期 · 一句话概要 · 展开细节 ▸`（`::after` ▸/▾，不用 emoji）。
3. 展开区 `grid repeat(2,minmax(0,1fr))`；≤900px 单列（30 号规则：块内纵向、minmax(0,1fr)）。
4. **打印展开必须用 `beforeprint` JS，不能只靠 CSS**（2026-10-25 实测修正：Chrome `printToPDF` 下 `@media print{.phase-detail{display:grid!important}}` **无效**——`<details>` 收起内容仍被 content-visibility 隐藏，PDF 只有 summary）：
   ```js
   (function printExpandFoldouts(){
     let prior=null;
     window.addEventListener('beforeprint',()=>{const f=[...document.querySelectorAll('details.phase-fold')];prior=f.map(d=>d.open);f.forEach(d=>{d.open=true;});});
     window.addEventListener('afterprint',()=>{if(!prior)return;document.querySelectorAll('details.phase-fold').forEach((d,i)=>{d.open=Boolean(prior[i]);});prior=null;});
   })();
   ```
   CSS 只保留 `@media print{summary::after,.ph-hint{display:none}.phase-fold{break-inside:avoid}}`。**验收必须用 printToPDF 实测正文存在，不能只断言 CSS 规则存在**。
5. 折叠卡下方保留「计划 vs 实际」表与口径说明。

## 4. 数据形状（demo 与开发版同源）
```js
pathway: [{ d, phase, text,  // 概要三件
  detail: { regimen:{summary,items}, metrics:{summary,items}, imaging:{summary,items},
            ae:{summary,items}, support:{summary,items} } }]
```
demo 构建器唯一源；readmodels 还原同形状（parity）。私密内容进 support 时只写「记录存在+已过滤」，不带数值（三出口）。

## 5. 验收（进 check 链）
卡数=阶段数；默认 `[open]`=0；每卡展开 `section.pd-block`=5 且顺序固定；`@media print` 规则源码存在；四档宽度无溢出、summary 不竖排单字；影像/副作用无判读词；效果只含原话。

## 6. 迁移提示
旧「平坦时间线+一句话」→ 折叠卡是**页面内结构升级**：不改阶段顺序/日期、不加页面、不改路由。顺序：改原型 → 同步 public（ui-parity 逐字符）→ 升版。
