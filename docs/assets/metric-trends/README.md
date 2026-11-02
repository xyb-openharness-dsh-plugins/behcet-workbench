开发者于2026-10-20提供的两个合成演示界面截图，作为分类卡片的信息层级参考。不代表本项目运行结果或医学数据；复用时更换项目品牌与目录。

## 为什么这些图放在 docs/ 而不是 assets/

它们是**给开发者看的设计参考**（别的癌种的信息层级示意），没有任何运行时代码引用。
放在 `assets/` 下会被项目的 `package.json` 的 `files: ["assets", …]` 打进发布包——
每个工作台因此白带 1.1MB，而且患者机器上会躺着一张乳腺癌记录截图，与本品无关。

2026-10-25 从 `assets/reference/metric-trends/` 移到 `docs/assets/metric-trends/`：
`docs/` 不随包，引用路径（`docs/24-METRIC-TREND-TAB-DESIGN.md`）也还成立。
判据：**assets/ 下只放运行时要用的东西**；只在文档里出现的图，放 docs/。
