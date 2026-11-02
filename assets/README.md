# 社区开发 assets

- `brand/xyb-logo.png`：社区提供的 Logo 参考副本，hash/来源见 manifest。作为社区品牌参考提供；当前目录未查到独立素材许可，**不得把“本机存在”视为已取得公开再分发授权**。社区项目使用按权利人授权执行，其他品牌可替换；模板不自动展示该 Logo。
- `tokens.css` / `tokens.json`：本脚手架自写的社区主题建议，作用域 `.wb-root`，不修改宿主全局；语义值可随已确认原型调整。
- `icons/flower-5.svg` / `flower-7.svg` / `clover.svg`：本脚手架绘制的简单几何装饰。五/七色花自带慢旋转及减少动效支持；每页仅用于 1–3 处重要标题，嵌入业务页作为纯装饰时 aria-hidden。
- `patterns/page-view.js` / `page-view.css`：32 号整页视图的可运行实现（导航栈、Esc 一层一退、浏览器返回键、`#page=` 深链、焦点与滚动恢复）。只放结构与版式，颜色用 `--pv-*` 由项目覆盖；改它必须同时跑 `scripts/probe-page-view.mjs` 与 `--self-test`。
- `patterns/page-view.js` / `page-view.css`：32 号整页视图的可运行实现（导航栈、Esc 一层一退、浏览器返回键、`#page=` 深链、焦点与滚动恢复）。只放结构与版式，颜色用 `--pv-*` 由项目覆盖；改它必须同时跑 `scripts/probe-page-view.mjs` 与 `--self-test`。
- `patterns/disease-primer.js` / `disease-primer.css`：36 号疾病概要（「?」入口）的实现。经典脚本（IIFE，`file://` 下可直接 `<script src>`），自动把「?」插进 `.top-actions`，点开是整页视图，`open` 压一条 history、`close` 走 `history.back()`。数据来自 `window.DISEASE_PRIMER`（四段：定义 / 指南情况 / 治疗全景 / 趋势）。改它必须同时跑 `scripts/probe-disease-primer.mjs` 与 `--self-test`。
- `manifest.json`：记录来源、用途、体积、hash、许可状态。自定义图片、数据、字体都应追加。

不捆绑商业字体、云 API 凭据、MCP 服务私有配置、临床原始数据集或真实用户文件。第三方包/技能与数据集许可证各自核验，不因同属社区而省略。
