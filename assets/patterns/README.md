# patterns · 可运行的设计实现

放"能直接 import 进项目"的参考实现，不放 spec 正文（spec 在 `docs/`）。

| 文件 | 对应规范 | 用途 |
| --- | --- | --- |
| `page-view.js` | [32 号整页视图](../../docs/32-FULL-PAGE-VIEW.md) | 整页视图导航栈：压栈/退一层/关闭、Esc 一层一退、浏览器返回键等价 `back()`、`#page=` 深链、焦点与滚动位置恢复 |
| `page-view.css` | 同上 | 结构样式：一层遮罩、`clamp` 内边距、56px sticky 顶栏、1180px 内容宽、窄屏整屏、减少动效 |

演示：`examples/page-view.html`（三层，需走本地端口，因为是 ESM）、`examples/page-view-standalone.html`（单文件内联版，**双击就能开**）。

**`file://` 必须内联**：原型要双击可开，就不能 `import`——把 `page-view.js` 的 `export ` 去掉、包 IIFE 挂 `window.createPageView`，CSS 塞进 `<style>`；单文件演示就是这么做出来的。验收：`node scripts/probe-page-view.mjs`（A1–A10，13 条断言；`--self-test` 做反向对照）。

## 用的时候要改什么

1. **颜色**：`page-view.css` 顶部全是 `var(--pv-*)`，按项目令牌覆盖（`--pv-accent` 主色、`--pv-page` 纸色、`--pv-ink` 深墨）。CSS 里不写死任何癌种色。
2. **字号**：一律 `calc(NNpx * var(--pv-tz))`，`--pv-tz` 回退到项目的 `--tz`；不新增第四档。
3. **不要改结构**：`.pv-overlay → .pv-panel → (.pv-head, .pv-body > .pv-inner)` 这套外壳是 A1–A10 的判据对象，各项目另起一套会让探针失效。
4. **不要在这份实现里加业务逻辑**：只放导航与版式。页面内容由项目的 `render(body, api)` 提供。

## 改这里的纪律

改 `page-view.js` 的任何一条导航行为，必须同时跑：

```
node scripts/probe-page-view.mjs            # 必须 13/13 PASS
node scripts/probe-page-view.mjs --self-test # 必须报 FAIL，否则闸门失效
```

只跑第一个会出问题：断言写得不对时它是**一直绿**的，反向对照才证明它抓得住缺陷。
