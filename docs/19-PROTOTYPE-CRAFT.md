# 精细化原型工艺：要素、动效、互动与细节（可复刻指南）

复刻对象：小粉宝乳腺癌工作台交互原型 v0.3.0（34 个视图，`npm run check` 级签认快照）。本文把它的**工艺层**拆成可执行规则——设计令牌骨架、版式骨架、组件要素、动效系统、交互细节、复刻验收。与 [16-ONE-CHART-SPEC](16-ONE-CHART-SPEC.md)（一图秀合同层）互补：那边管"数据怎么画才对"，这边管"界面为什么有质感"。

**颜色不锁定**：令牌只有结构是合同，色值按癌种替换（第 9 节给出四个癌种的覆盖示例）。参考实现路径只在社区仓库 `xfb-workbench/prototypes/v0.3/`（style.css 428 行 / app.js 单文件），本页所有规则都能在那里找到原句。

配套可直接交给开发模型的完整提示词：[一图秀动画、事件节点与标签](../prompts/TIMELINE-MOTION-AND-EVENTS.md)。覆盖重播保留状态、统一描边动画、独立事件泳道、同日避让、节点与标签同ID联动、来源详情、候选隔离及减少动效终态；与16号数据合同一起使用。初始化项目时自动携带，具体色值与治疗场景按项目替换。

**构建输入（先于一切工艺）**：动手写 HTML 前必须已有**已签认的交互路径文档**（[28-INTERACTION-PATH-DESIGN](28-INTERACTION-PATH-DESIGN.md)）——场景路径表定导航与入口文案（每个一期场景一条"看板入口→步骤→产物→回首页"），CRUD 双通道矩阵定每页编辑入口与表单收敛（AI 协助默认、手工可及收敛、删除=更正）。本文负责"页面怎么做像"，28 号负责"做哪些路、入口长什么样"；路径未签认，工艺再好也是返工。

## 1. 设计令牌：只定结构，不定颜色

`:root` 令牌分五组，换癌种只动其中三组：

| 组    | 变量（breast 参考值）                                                                                                | 换肤规则                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 中性层  | `--paper:#fbf8f9`（页底）、`--surface:#fff`（卡面）、`--ink/--ink-2/--muted`（三级文字）                                      | 保持"纸感微暖底 + 纯白卡"结构；色相往品牌色方向偏 3–5 度                              |
| 品牌三档 | `--pink-soft:#fff0f5`（块面）/`--pink:#ffa1bd`（装饰）/`--pink-deep:#983654`（文字级品牌色，必须过对比度）                           | **soft 档永远浅到能当背景、deep 档深到能当正文色**，中间档只做点缀（圆点、光标、hover）          |
| 行动色  | `--action:#a8410a`（橙）+ `--action-hover`                                                                       | **与品牌色刻意分离**：粉品牌 + 橙主按钮，按钮因此一眼可辨。新癌种行动色取品牌色的互补方向（冷品牌配暖行动，反之亦然） |
| 语义色  | `--ok/--warn/--warn-bg` + pill 五色（green/pink/yellow/rose/grey）                                                | pill 是"浅底深字"对，不是纯色块；语义色不与品牌色混用                                 |
| 结构   | `--line/--line-strong`、`--radius:16px`/`--radius-sm:10px`、`--shadow`（两层极淡）、`--font:15px`（`body.large` 时 17px） | 线色 = 品牌色掺灰；阴影永远 `rgba(品牌深色, .04~.07)` 两层，**不用黑**               |

全局硬规则：`font-variant-numeric:tabular-nums` 加在 body 与一切数字上（数值列不跳宽）；`min-height:44px` 触达底线；`:focus-visible` 3px 品牌深色 outline + 2px offset；正文行高 1.68；`h1` 用 `clamp(26px,2.3vw,33px)` 负字距。

## 2. 版式骨架

```
.workspace{display:grid;grid-template-columns:236px minmax(0,1fr)}
#main{max-width:1400px;margin:0 auto;padding:26px 30px 44px}
```

- 顶栏 `position:sticky;top:0` + `backdrop-filter:blur(8px)` + 半透明白底（rgba .86）——滚过内容有毛玻璃感但字仍清楚。
- 侧栏底部 `margin-top:auto` 挂"家族口号 + 帮助入口"，导航满而不挤。
- **所有多列网格一律 `minmax(0,1fr)`**，不允许裸 `1fr`（裸 1fr 会被长表格撑破，这是页面级横向溢出为 0 的根因）。
- 断点三级各司其职：**1180px** 双栏变单栏、sticky 侧栏转静态三列网格；**900px** 侧栏横排成可滚动导航（隐藏 profile/口号/计数徽标，**保留文字标签**）、顶栏允许换行、图表容器开启横向滚动并显示 `.scroll-hint`；**600px** 表格单元格允许换行、版本 chip 让位给页脚（给功能按钮腾位）。每条收窄都要写注释说明"为什么可以让位/不能让位"。

## 3. 组件要素（CSS 要点直录）

| 组件        | 要素                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页头        | `.eyebrow`（11px/字距1.4/全大写品牌深色）→ `h1` → 一句 62ch 上限的说明；右侧 `.actions` 按钮组                                                                                  |
| 卡片        | 白底 1px 线 16px 圆角 20px 内边距；`.card-head` 标题 + 右侧小字；`.card.accent` 用 160deg 双色浅渐变做"重点卡"                                                                    |
| pill      | 五色语义标签，`border-radius:20px`、11px 字、浅底深字；状态一律有 pill，不靠颜色单通道                                                                                              |
| 空态        | 虚线边框 + 居中 + 明确下一步（"扩大时间范围，或在左侧加选一个指标"）——**空态必须教用户怎么走**                                                                                                  |
| notice    | 四种：默认灰 / pink 提示 / warn 黄 / plain 米；免责与说明的固定载体                                                                                                          |
| hero      | 135deg 浅渐变 + 20px 圆角 + 右侧圆形吉祥物（白圈 5px 边 + 大阴影）；<900px 吉祥物隐藏不占位                                                                                          |
| 任务入口      | 网格 28px 图标 + 标题 + 副文案 + 箭头；hover `translateY(-2px)` + 阴影 + 描边加深                                                                                         |
| chips     | `aria-pressed` 开关组：选中**反转为深底白字**（breast 用 `#3b2f36` 墨色，不用品牌色，避免和大选中）                                                                                    |
| rail 侧栏   | `position:sticky;top:76px`；`details.pick` 折叠选择器（`summary::after` 用 ▸/▾ 字符）；`.metric-list` 限高 300px + **底部 mask-image 渐隐**提示可滚                           |
| 表格        | 表头 11px 灰不加粗线、行间线浅到 `#f5ebef`、数字列 `td.num` tabular-nums；`.table-wrap{overflow-x:auto}` 只在容器内滚                                                           |
| subnav    | 下边框 tab：选中 = 文字变品牌深色 + 2px 下划线，无背景块                                                                                                                     |
| dialog    | `width:min(660px,100vw-32px)`；**外壳固定**：head/body/foot 三段，只有 body 滚（`max-height:calc(100vh-250px)`）；`::backdrop` 加 `blur(2px)`；关闭按钮是 38px 圆形 icon-button |
| toast     | 底部居中，`translate(-50%,14px)→0` + opacity 过渡，`role="status" aria-live="polite"`                                                                           |
| private 卡 | 淡紫底淡紫边（与品牌色区分的"另一系"），标题 12.5px 深紫——私密内容视觉上就与其他卡不同                                                                                                       |
| ver-chip  | 顶栏常驻版本号胶囊，tabular-nums 防宽度跳动，点开"关于"                                                                                                                     |

## 4. 动效系统（时长、缓动、降级三件套）

| 动效       | 参数                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面进入     | `pageIn .34s cubic-bezier(.2,.7,.3,1)`：opacity 0→1 + `translateY(7px)→0`，每次 hash 切页都重放                                                                                                                                                      |
| 折线绘制     | **`pathLength="1"`** 归一 + `stroke-dasharray:1;stroke-dashoffset:1` + `animation:draw .85s cubic-bezier(.3,.7,.3,1) forwards`。曲线长短不同也统一 0.85s 画完，不用按长度算时长                                                                                    |
| 数据点      | `pop .28s` scale .4→1；sparkline 逐点 `animation-delay:${i*45}ms` 波次进场                                                                                                                                                                         |
| 指标卡翻转    | **真 3D**：`.mcard{perspective:1200px}` + `-inner{transform-style:preserve-3d;transition:transform .62s cubic-bezier(.2,.72,.2,1)}` + 两面 `backface-visibility:hidden`、背面预置 `rotateY(180deg)`；**固定高度 194px**——不是展开插入内容；`will-change:transform` |
| hover 微浮 | 卡片 `translateY(-2px)` + 阴影 + 描边加深，`.18s`；按钮底色/描边 `.16s`                                                                                                                                                                                     |
| 进度条      | `width .6s ease`（载入后从 0 长到位）                                                                                                                                                                                                                |
| tooltip  | opacity `.12s`，`translate(-50%,-118%)` 悬在点上方                                                                                                                                                                                                |
| **减少动效** | `@media(prefers-reduced-motion:reduce)`：所有动画/过渡压到 `.01ms`，**折线单独恢复终态**（`stroke-dasharray:none;stroke-dashoffset:0`）——不能让用户看到空白图                                                                                                             |

缓动只用三个：进出场 `cubic-bezier(.2,.7,.3,1)`、线条 `cubic-bezier(.3,.7,.3,1)`、翻转 `cubic-bezier(.2,.72,.2,1)`。不引入动画库。

## 5. 交互细节（JS 层，全部可复刻）

1. **事件委托**：`document.addEventListener('click')` 一次挂全局，`closest('[data-action]')` 查 `actions` 分发表；chips 类用 `data-range/data-toggle/data-stage` 第二分发。零框架。
2. **tooltip 找最近点**：`pointermove` 上把 `event.clientX` 减 `svg.getBoundingClientRect()` 左缘，乘 `rect.width/viewBox宽` 换回图坐标，遍历 `.pt` 取欧氏最近——悬停附近就有反应，不必精确压点；离开 SVG 立即收起。
3. **点选 pin**：点击数据点 → 图下方 `.pin` 卡展示「数值 + 日期 + 来源 + 免责 + 查看原文 ↗ + 收起」，点本身加 `.active`（r 4→6.6）。悬停快速预览（title + tooltip），点击留下明细——两层深度。
4. **末点标签避让**：末点 x 距右缘 <46px 时 `text-anchor` 从 start 翻成 end 并左移 8px；delta 标签按序列 index `si%2` 上下交错。**标签永远不允许出画布**。
5. **月刻度自适应**：刻度 >7 个自动隔一取一；两端 6px 内不画。
6. **数量上限不硬拒**：指标最多 4 个，超出时**回弹 checkbox 并 toast 解释**（"最多同时看 4 个指标；先取消一个再加"），不静默失败。
   > **实现层铁律（2026-10-25 PF-ILD 实测补充）**：回弹必须是**拒绝分支体内的显式动作**——
   > `el.checked = false` 或该分支内调用 `render()`，**不能指望调用方后续的 `render()` 兜底**。
   > PF-ILD 的真实缺陷：`if (超限) { toast(...); return }` 之后调用方末尾有 `render()`，
   > 读起来"好像会重绘"，但**拒绝路径上那行根本执行不到**，于是 toast 说超了、
   > checkbox 已经勾上、界面显示 5 项而数据只有 4 项。
   > 检查器：`scripts/check-choice-limit.mjs`（随 init 下发，进 `npm run check`）静态拦截
   > "上限分支无回滚、也无分支内重渲染"的形态。
7. **zoom 从右端裁**：时间窗 `domain()` 恒以数据末端为准，slider 40–100% 只动左边界——用户永远看得到"最新"。
8. **局部重绘**：搜索框 input 只重绘表格 innerHTML；zoom 只重绘图表区；不整页 flash。
9. **表单即时差值**：臂围左/右输入时同 row 的差值格即时算（`input` 委托 + `closest('#arm-form')`），不点按钮。
10. **解析三态**：`parsing → loaded/error`，`setTimeout` 模拟期间按钮锁 `state.parsing`，重复导入 toast "已载入，没有重复新增"——界面层就把 A2 合同演出来。
11. **解析表单**：勾选同意才能提交；Token 格式错给 `401：…` 前缀的可读错误；**只回显掩码** `sk-····后4位`。
12. **AI 会话演示**：创建会话弹窗写明"未发送任何内容/不会自动发送"，草稿标"待你发送"，原型里注明"真实版本走宿主接口"——演示也不伪装已接通。
13. **切档案**：完成动作后 toast 说明发生了什么 + 什么没变（"指标序列仍为 DEMO-1 的模拟数据"）。
14. **二级页签必须分流渲染（2026-10-19 肠癌返工教训）**：`SUBPAGES[view]` 里声明的每个页签，视图函数必须按 `state.sub[view]` 返回**各自不同的内容**——只声明页签、视图函数永远渲染整页，用户就会看到"点哪个 tab 内容都一样/重复"。三条硬规则：① 每个 tab 的正文只出现该 tab 的内容，不重复渲染其他 tab 的章节；② 某档案没有该 tab 数据时给**专属空态**（说明为什么没有、下一步去哪），不是整页同一个空态复用四次；③ 内容与页签同名：tab 标题「周期与用药」→ 正文第一屏就是周期表，不允许 tab 叫 A、内容是 B。

## 6. a11y 与语义（工艺的一部分，不是附加）

- `<a class="skip">` 跳转主内容；切页后 `$('#main').focus({preventScroll:true})` 并回顶。
- 导航 `aria-current="page"` + 左侧 3px 色条；chips `aria-pressed`；subnav `aria-selected`；翻卡是 `<button aria-pressed>` 且 **aria-label 随状态换文案**（"点击翻转查看…"↔"点击返回摘要"）；两面内容 `aria-hidden`，语义只在按钮上。
- 图表 `role="img"` + 一句话 `aria-label` 说清"每条线按自身范围绘制"；每个数据点内嵌 `<title>`。
- 图标统一 `<svg fill="none" stroke="currentColor" stroke-width="1.6">` 单 path，`aria-hidden="true"`——颜色随文字走，换肤零成本。

## 7. 图表泳道与标注（与 16 号合同衔接处）

- 治疗条画在数据区上方独立泳道：手术 = 菱形锚点 + 竖虚线贯穿（`stroke-dasharray:3 6, opacity .45`）；化疗/放疗 = 圆角细条（高 6px，`opacity:.28`）+ 泳道错行（每条 15px），标签在条上方——**永不压曲线**。
- 轴底部常驻一行 10px 水印："↑ 每条线按该指标全部记录范围缩放，不代表不同指标数值可比"——归一化声明长在图里，不是页脚小字。
- 图例带"全期 lo–hi"区间；变化 ≥20% 才出 delta 标签（康复测量用绝对差，不用百分比——见 16 号 R 规则）。
- 单点不连线（`pts.length>1` 才有 path），指标卡背面同规则给空态文案"只有 1 次记录，暂不连线"。

## 8. 复刻验收清单

- [ ] 令牌五组齐全；换肤只改第 1 节三组变量即可整站换色。
- [ ] 多列网格全部 `minmax(0,1fr)`；五档宽度页面级横向溢出为 0。
- [ ] 数字全部 tabular-nums；触达 ≥44px；focus-visible 可见。
- [ ] 六个动效（页入/画线/点波次/翻卡/微浮/tooltip）+ reduced-motion 降级齐全，翻卡是固定高度 3D 而非展开。
- [ ] 空态有下一步、上限回弹有解释、解析三态、AI 演示不伪装接通。
- [ ] **二级页签逐一验证**：渲染矩阵 = 每个视图 × 每个 sub 页签 × 每个档案；断言各 tab 内容互不相同、含该 tab 关键词、HTML 标签配平。自动化 harness（DOM shim + new Function 注入）见 LESSONS 2026-10-19 条目。
- [ ] 图表：泳道不压线、水印声明、末点标签不出画布、单点不连线。
- [ ] 私密卡视觉另系；版本号首屏可见（P1–P5）。

## 9. 新癌种换肤示例（结构不动，只覆盖变量）

```css
/* 结直肠癌 Colopal（占位名）*/
:root{--paper:#f7f9fb;--ink:#22303c;--line:#dbe4ec;
  --brand-soft:#e8f0f7;--brand:#5b93c4;--brand-deep:#1B4F8A;
  --action:#b05a10;--action-hover:#93480a}
/* 食管癌 EsopPal（占位名）*/
:root{--paper:#faf9fc;--ink:#2e2a3a;--line:#e2ddef;
  --brand-soft:#efecf8;--brand:#9aa0d0;--brand-deep:#565bb0;
  --action:#a8410a;--action-hover:#8d3508}
/* 宫颈癌 CerviPal（占位名）*/
:root{--paper:#f6faf9;--ink:#22332f;--line:#d8e8e4;
  --brand-soft:#e4f3f0;--brand:#57c2b4;--brand-deep:#0e7a6d;
  --action:#b05a10;--action-hover:#93480a}
```

规则：`--brand-soft` 做块面底、`--brand-deep` 做文字与选中态、`--brand` 只做圆点/光标/装饰；主行动色保持暖色系与冷品牌形成对比（胃癌有正式 logo 时先从 logo 取主色再套同一结构）。渐变卡、阴影色、pill 对应色全部由这几个变量派生，不出现第四处硬编码色值。
