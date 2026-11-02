# 模版：3D 翻转指标系列卡（从 neurofibromatosis-workbench v0.1 回收）

## 何时用
指标天然分系列（疼痛/生命体征/生长/瘤体测量/听力…）、每系列要"一眼看到当前值 + 点开看最近记录与来源"的患者工作台。与 32 号折叠卡并列；窄形态卡片单列，宽形态 auto-fill minmax(190px,1fr)。

## 结构
- 卡墙按 `group_title` 分组渲染（有序：读模型 ORDER BY rowid）。
- 卡片 `role="button" tabindex="0" aria-pressed`，点击/Enter 翻转（rotateY 180°，backface-visibility: hidden，正反两面各一 .face）。
- 正面：系列名 + 当前值（.at(-1)）+ 单位 + 迷你 sparkline（可选）。
- 背面：最近 3 条记录（日期+值）+ 来源语境栏（source_title/source_version，未核实显式「未核实」）。
- `@media (prefers-reduced-motion: reduce)` 关闭 transition，直接切换。

## 红线
- 只渲染 kind='numeric' 的数值；分类/等值字段不进卡片趋势位。
- 背面来源栏必填（语境栏规则）；无记录如实显示"（无记录）"，不外推。
- 演示数据唯一源：卡片全部读 demo-data/读模型，不在视图层硬编码。

## 验收
- 收/翻两态截图；键盘 Enter 可翻；reduce-motion 下无动画；23/24/27 号指标卡口径对照。

## 2026-10-25 增补（从 CLL 小淋宝 v0.2.0 回收：用户逐条指定的版式）

用户在看到初版后给出的版式要求，已固化为本节判据（CLL 实现即参照，截图见该仓 docs/screenshots/proto-labs*.png）：

| 要素 | 规范 | 判据 |
| --- | --- | --- |
| 尺寸 | **固定高度**（如 204px），网格 `auto-fill minmax(186px,1fr)`；翻面不改变占位 | 翻转前后 `getBoundingClientRect().height` 相等 |
| 正面四要素 | ①分类色点（按系列）②当前值+单位 ③**较前次箭头**（↑/↓/→ + 差值 + 百分比 + 前次日期 MM-DD）④记录数 | DOM 中四者各一处；无前次时显式「暂无可比较的前次」 |
| 背面 | **sparkline**：末值标签 + 首末日期；下方给全期 min–max 与单位；来源（以报告单实验室区间为准） | 背面 `svg.chart.spark` 存在，含 2 个日期文本与 1 个末值文本 |
| 翻面提示 | 右上角小字「翻面 ›」，不压内容 | 不与 mcount/mname 重叠 |
| 长文本 | 尾部来源用 `text-overflow:ellipsis` 单行截断，不换行挤爆卡高 | 卡片高度恒定 |
| 状态存 key | 翻面状态 `Set<code>` 存内存/持久层，不读 DOM（27 号） | 重绘后翻面态保留 |

反例（本轮实测踩到）：把「翻面看趋势」提示绝对定位在左下角 → 与底部来源行重叠；前次日期用完整 `YYYY-MM-DD`
→ 在 186px 卡宽折两行把卡撑破。两条都必须在验收时看图确认。
