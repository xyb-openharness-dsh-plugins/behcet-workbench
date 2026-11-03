// 浏览器 fixture 的唯一入口：完整复制原型目录与它依赖的 assets。
//
// index.html 通过 `../../assets/patterns/...` 引用 assets，所以临时目录里必须保持
// `prototypes/v0.2/index.html` 的相对位置，不能把 index.html 平铺到临时目录根下。
// 复制整目录而不是逐个列脚本，新增 demo-data-*.js 或 primer 资源时会自动带上，
// 避免测试在“缺脚本静默降级”的页面上仍然通过。
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const PROTOTYPE_DIR = join(ROOT, 'prototypes/v0.2');
export const PATTERNS_DIR = join(ROOT, 'assets/patterns');

// 与 index.html 里本机资源相同的相对路径解析规则。
export function resolveIndexAsset(src) {
  return resolve(PROTOTYPE_DIR, src);
}

export function indexAssetSources(html) {
  const sources = [];
  const re = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = re.exec(html))) {
    const src = match[1];
    if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('#')) sources.push(src);
  }
  return sources;
}

export async function makePrototypeFixture(t, prefix = 'beipal-prototype') {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const pageDir = join(dir, 'prototypes/v0.2');
  await mkdir(join(dir, 'prototypes'), { recursive: true });
  await mkdir(join(dir, 'assets'), { recursive: true });
  await cp(PROTOTYPE_DIR, pageDir, { recursive: true });
  await cp(PATTERNS_DIR, join(dir, 'assets/patterns'), { recursive: true });

  const indexPath = join(pageDir, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const url = pathToFileURL(indexPath).href;

  return {
    dir,
    pageDir,
    indexPath,
    dataPath: name => join(pageDir, name),
    url,
    html,
    readIndex: () => readFile(indexPath, 'utf8'),
    writeIndex: next => writeFile(indexPath, next),
    // 在 </body> 前注入探针；页面结构变化时明确报错，而不是静默不执行。
    injectProbe: async probe => {
      const current = await readFile(indexPath, 'utf8');
      if (!current.includes('</body>')) throw new Error('原型 index.html 缺少 </body>');
      await writeFile(indexPath, current.replace('</body>', probe + '</body>'));
    },
    // 供需要自定义指标/记录的测试覆盖数据文件；必须在页面启动前调用。
    writeData: (name, content) => writeFile(join(pageDir, name), content),
    exists: async name => {
      try { await access(join(pageDir, name)); return true; } catch { return false; }
    },
  };
}