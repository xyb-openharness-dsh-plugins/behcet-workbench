// 版本号的运行时副本（生成物，别手改）。
//
// 唯一来源是根目录 `VERSION`。`npm run build:version` 从它生成此文件，
// 并把 `lib/layout.js` 的布局快照注入 `lib/client.js`；`npm run check` 里带 `--check`
// 做一致性校验，所以改了 VERSION 忘了重新生成会直接失败。
//
// 审计口径（docs/22-PHASES-AND-GATES.md）：版本四处一致 = VERSION / package.json / 本文件 / 页面字面量。

export const version = '0.1.1'
