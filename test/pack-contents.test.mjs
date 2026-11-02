#!/usr/bin/env node
/**
 * 真打一次包，断言 tgz 里到底有什么。
 *
 * ## 为什么要有这条测试
 * `check-workbench-package` 的规则⑥查 import 落点、⑦查 `public/`、⑨查运行时拼出来的目录，
 * 都是**看源码树**。源码树里那些目录永远在，所以本地跑得通**完全不能说明**装进去跑得通。
 * 只有以 `npm pack` 的真实清单为对象断言，才知道用户装到的是什么。
 *
 * 这一类故障的症状是「装了能开、进去是空的」：服务照常启动、`/health` 照常 200、界面照常打开，
 * 只是所有列表空着，看起来像「还没有数据」。静默空库比白屏难查十倍。
 *
 * ## 判据是自适应的
 * 没有 `public/` 的项目不会被要求发 `public/index.html`；没有迁移目录的项目不会被要求发 SQL。
 * 所以新项目从第一天就是绿的，随着项目长出这些目录，测试自动开始保护它们。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** `npm pack --dry-run --json` 的清单：不落盘、不留临时 tgz。 */
function packEntries() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'], // stderr 是 npm 的 warning，别污染 JSON
  })
  return (JSON.parse(out)[0]?.files ?? []).map((f) => f.path)
}

const entries = packEntries()
const has = (path) => entries.includes(path)

test('tgz 里必须有 cordis.patch.yml（否则宿主不会加载本插件）', () => {
  assert.ok(has('cordis.patch.yml'), `缺 cordis.patch.yml；实际条目：${entries.join(', ')}`)
})

test('有 public/ 就必须随包发出（漏了它装机后业务区空白）', () => {
  if (!existsSync(join(root, 'public'))) return // 还没做 UI 的项目不适用
  assert.ok(has('public/index.html'), `缺 public/index.html；实际条目：${entries.join(', ')}`)
})

test('有 schema/migrations/ 就必须随包发出（漏了它装进去是空库）', () => {
  const dir = join(root, 'schema', 'migrations')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return
  const migrations = entries.filter((p) => /^schema\/migrations\/.+\.sql$/.test(p))
  assert.ok(
    migrations.length > 0,
    `schema/migrations 下有 SQL 但一个都没打进包，装进去会静默空库；实际条目：${entries.join(', ')}`,
  )
})

test('files 白名单里声明的每个路径都真实存在于仓库', () => {
  const pkg = JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], { cwd: root, encoding: 'utf8' }))
  for (const entry of pkg.files ?? []) {
    if (entry.includes('*')) continue // 通配符交给 npm 自己展开
    assert.ok(existsSync(join(root, entry)), `files 里写了不存在的路径：${entry}`)
  }
})
