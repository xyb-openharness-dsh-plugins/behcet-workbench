#!/usr/bin/env node
/**
 * 版本与布局的生成 / 校验（一物两用）。
 *
 *   node scripts/build-version.mjs            # 生成 lib/version.js + 注入客户端布局块
 *   node scripts/build-version.mjs --check     # 只校验，不一致 exit 1（接在 npm run check 里）
 *
 * 为什么要它：版本号在四处出现（VERSION / package.json / lib/version.js / 页面字面量），
 * 手改必漏一处。布局参数同理——客户端是单文件，参数写进去就成了第二份默认值（H15）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const checkOnly = process.argv.includes('--check');

const VERSION = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const versionFile = path.join(root, 'lib/version.js');
const clientFile = path.join(root, 'lib/client.js');
const layoutFile = path.join(root, 'lib/layout.js');

const versionSrc = `// 版本号的运行时副本（生成物，别手改）。
//
// 唯一来源是根目录 \`VERSION\`。\`npm run build:version\` 从它生成此文件，
// 并把 \`lib/layout.js\` 的布局快照注入 \`lib/client.js\`；\`npm run check\` 里带 \`--check\`
// 做一致性校验，所以改了 VERSION 忘了重新生成会直接失败。
//
// 审计口径（docs/22-PHASES-AND-GATES.md）：版本四处一致 = VERSION / package.json / 本文件 / 页面字面量。

export const version = '${VERSION}'
`;

const { CLIENT_LAYOUT } = await import(pathToFileURL(layoutFile).href);
const injected = `    /* layout:begin（由 scripts/build-version.mjs 从 lib/layout.js 注入，勿手改） */
    const layout = ${JSON.stringify(CLIENT_LAYOUT)}
    /* layout:end */`;

const problems = [];

/* ---------- 版本 ---------- */
const currentVersionSrc = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8') : '';
const gotVersion = currentVersionSrc.match(/export const version = '([^']+)'/)?.[1];
if (gotVersion !== VERSION) problems.push(`lib/version.js = ${gotVersion || '（缺失）'}，VERSION = ${VERSION}`);
if (pkg.version !== VERSION) problems.push(`package.json = ${pkg.version}，VERSION = ${VERSION}`);

/* ---------- 布局 ---------- */
const clientSrc = fs.readFileSync(clientFile, 'utf8');
const blockRe = /[ \t]*\/\* layout:begin[\s\S]*?\/\* layout:end \*\//;
if (!blockRe.test(clientSrc)) problems.push('lib/client.js 里没有 layout:begin / layout:end 标记块');
else {
  const block = clientSrc.match(blockRe)[0];
  const got = block.match(/const layout = (\{[^\n]*\})/)?.[1]; // 注入的是一行 JSON，按行取可避免被内层 } 截断
  let ok = false;
  try { ok = got && JSON.stringify(JSON.parse(got)) === JSON.stringify(CLIENT_LAYOUT) } catch { ok = false }
  if (!ok) problems.push('lib/client.js 的布局块与 lib/layout.js 不一致（改了 layout.js 忘了重新生成）');
}

if (checkOnly) {
  if (problems.length) {
    console.error('版本/布局校验失败：');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('\n跑 `npm run build:version` 重新生成，再提交。');
    process.exit(1);
  }
  console.log(`版本/布局一致：v${VERSION}（VERSION / package.json / lib/version.js / 客户端注入块）`);
  process.exit(0);
}

fs.writeFileSync(versionFile, versionSrc);
fs.writeFileSync(clientFile, clientSrc.replace(blockRe, injected));
console.log(`已生成：lib/version.js（v${VERSION}）· 已注入 lib/client.js 的布局块`);
console.log(`布局参数：${JSON.stringify(CLIENT_LAYOUT)}`);
