# 提交 DSH 工作台公共市场

我想把本项目提交 DSH Desktop 工作台市场。先读 docs/10-MARKET-PUBLISHING.md 和官方当前市场验收/开发规范及目录协议；先确认项目、公开授权范围、最终安装来源和版本，再完成适用检查。不要把本条通用提示当成授权已经明确或前提已经完成。

实机检查优先由我按 templates/MARKET-ACCEPTANCE.md 一次完成；我已对指定版本明确确认通过的范围请直接记录复用，截图已提供时整理使用，不重复电脑操作、截图和全量扫描。自动检查负责包/版本/hash/私密内容与 YAML；Computer Use 仅按需辅助，受阻后转手工，不循环尝试。

按已有来源选择源码/npm/Release，使用真实脚本与 CLI 帮助。按市场当前 catalog/README.md 只新增 data/workbenches/<owner>__<repo>.yml，中英简介和真实截图齐全；分类由我选择或确认，不继承其它项目的分类。不填写版本/npm名/校验值/作者ID，不改生成文件。

完成后向 dataelement/awesome-dsh-workbench 提交真实 PR，检查最新提交工作流确实执行。只有真实 PR URL 才叫已提交；合并后等目录/市场可见可安装才叫已上架。报告包检查、手工确认范围、平台、发布来源、PR URL、可见状态和仍未完成项；这是工作台市场投稿流程，Git 推送本身不代表投稿。
