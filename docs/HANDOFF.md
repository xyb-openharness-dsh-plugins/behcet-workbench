# 工作交接 · 2026-10-17

## 当前状态

- 仓库：`xyb-workbench-starter`；分支：`main`；HEAD：`43b03ba`（本地仍有大量未提交修改）。README 与 package.json 标注版本 `1.3.2`，待发布；尚未提交或推送。
- 工作区已有多组此前修改，交接时不要重置、覆盖或假设所有差异都属于本次工作。
- `git diff --check` 已通过；本次未运行测试、构建、npm 发布、Git 推送或市场投稿。

## 本次补充

- `docs/10-MARKET-PUBLISHING.md`：补充本地安装包、Desktop Profile/实际加载状态、GitHub Release/npm、Awesome Workbench PR 的发布次序和状态边界。
- `templates/SPEC.md`、`templates/TASKS.md`、`templates/ACCEPTANCE.md`、`templates/RELEASE.md`：将发布来源、授权、安装与市场验收纳入项目设计/任务/验收/发布清单。
- `scripts/init.mjs`、`cli/main.mjs` 及 CLI/README/AGENTS 文档：init 生成 `docs/RELEASE.md` 并指向市场发布指南；CLI 只准备清单和指导，不自动推送、安装或投稿。
- SPEC 当前有 14 个一级要素，达到至少 10 项要求；“HTML 原型先行”与“HTML 确认/数据演进”内容有重叠，后续可合并，避免两处重复维护。

## 已确认偏好

- Git 推送、GitHub Release/npm 发布、市场 PR 是彼此独立的动作，不能互相代替。
- 市场投稿流程依官方规范和项目真实脚本执行；复用仍有效的人工验收，不为形式重复使用 Computer 验证。
- 本机更新的交付目标是已安装版本；推送代码或重启本身不代表 Desktop 已加载新版。

## 下一步

1. 审阅并整理 `templates/SPEC.md` 的重叠章节，保持生成 SPEC 的核心要素完整且单一来源。
2. 运行 `npm run check` 与 `npm test`，修复失败后检查 `git diff --check`。
3. 对照 init 生成文件确认发布/市场清单可用；检查工作区差异，保留并区分既有修改。
4. 用户确认后再提交、推送或发布；当前没有已创建的发布或市场 PR 记录。
