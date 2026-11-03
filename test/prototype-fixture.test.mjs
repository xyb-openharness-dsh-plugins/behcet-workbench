import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PATTERNS_DIR,
  PROTOTYPE_DIR,
  indexAssetSources,
  makePrototypeFixture,
  resolveIndexAsset,
} from './helpers/prototype-fixture.mjs';

test('fixture 复制 index.html 引用的全部本机脚本与样式', async t => {
  const html = await readFile(join(PROTOTYPE_DIR, 'index.html'), 'utf8');
  const sources = indexAssetSources(html);
  assert.ok(sources.includes('demo-data-b.js'), 'index.html 应加载第二套示例组');
  assert.ok(sources.includes('../../assets/patterns/disease-primer.js'), 'index.html 应加载疾病概要脚本');

  for (const src of sources) {
    await assert.doesNotReject(
      () => access(resolveIndexAsset(src)),
      `index.html 引用的本机资源不存在：${src}`,
    );
  }

  const fixture = await makePrototypeFixture(t, 'beipal-fixture-check-');
  for (const src of sources) {
    const relative = src.startsWith('../../assets/')
      ? join('assets', src.slice('../../assets/'.length))
      : join('prototypes/v0.2', src);
    await assert.doesNotReject(
      () => access(join(fixture.dir, relative)),
      `fixture 未复制 index.html 引用资源：${src}`,
    );
  }

  // 两套示例组和 primer 依赖都必须真实落地，不能靠 404 后静默降级。
  assert.equal(await fixture.exists('demo-data-b.js'), true);
  assert.equal(await fixture.exists('primer-data.js'), true);
  await assert.doesNotReject(() => access(join(fixture.dir, 'assets/patterns/disease-primer.css')));
  await assert.doesNotReject(() => access(join(fixture.dir, 'assets/patterns/disease-primer.js')));
  assert.match(fixture.url, /\/prototypes\/v0\.2\/index\.html$/);
  assert.ok(fixture.html.includes('../../assets/patterns/disease-primer.js'));
  assert.ok(PATTERNS_DIR.endsWith('/assets/patterns'));
});