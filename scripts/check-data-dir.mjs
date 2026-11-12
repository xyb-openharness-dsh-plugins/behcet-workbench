#!/usr/bin/env node
/**
 * 资料目录闸门：确认「选择本机目录」是一个**真的能用的动作**，不是一个说明弹窗。
 *
 * 为什么单列（2026-11-12 两个仓同一天踩同一个坑）：
 *   开发版里根本没实现目录选择，弹窗正文写的是「本原型为示意，目录未真实挂载」。
 *   用户点开配置目录 → 只有一段话 → 数据其实没地方落。这类"假入口"能通过所有既有检查：
 *   语法、包清单、面板契约、文案红线全绿，因为它既不报错，也不违反任何字符串规则。
 *
 * 判据四条，缺一条就是红：
 *   ① 有真实选择动作：`pickDirectory`（宿主 uiWorkspace）/ `showDirectoryPicker` / `webkitdirectory`
 *   ② 有拒绝清单：主目录、桌面、下载根目录、tmp（口径见 docs/09 与 37 号）
 *   ③ `cordis.patch.yml` 有 `config.root: !!js dshHomePath(...)`，且 `dsh/index.js` 真的读 `config.root`
 *   ④ 未挂载时的提示必须**只在降级路径**出现：如果代码里只有那句「目录未真实挂载」而没有任何选择动作 → 红
 *
 * 用法：
 *   node scripts/check-data-dir.mjs [项目根]
 *   node scripts/check-data-dir.mjs --self-test      # 反例必须能红
 * 退出码：0 通过 / 1 失败 / 2 用法错误
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SELF_TEST = process.argv.includes('--self-test')
const root = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.')

const read = (p) => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*(\/\/|\*)/.test(l) ? '' : l)).join('\n')

export function check({ client, app, dsh, patch }) {
  const code = stripComments(`${client}\n${app}`)
  const fails = []
  const oks = []

  const pickerPatterns = [
    ['pickDirectory', /pickDirectory\s*\(/],
    ['showDirectoryPicker', /showDirectoryPicker\s*\(/],
    ['webkitdirectory', /webkitdirectory/],
    /* 服务端原生选择器也算真动作（breast 用 POST /api/fs/pick 由宿主弹出系统面板） */
    ['server picker', /\/api\/fs\/pick|fs\/pick|nativePicker|pick\/native/i],
  ]
  const hit = pickerPatterns.find(([, re]) => re.test(code))

  const reasons = [
    ['主目录', /homedir|os\.homedir|getHomeDir|\/Users\/|USERPROFILE|\$HOME/i],
    ['桌面', /[Dd]esktop|桌面/],
    ['下载根目录', /[Dd]ownloads?|下载/],
    ['tmp', /tmpdir|\/tmp\b/i],
  ].filter(([, re]) => re.test(code))
  const hasGuard = /(reject|forbid|refuse|invalid|guard|validate|isForbidden|denied|不允许|拒绝)/i.test(code)
  // 拒绝锚点：至少三种被点名的目录 + 一个判定函数/常量
  const guardOk = hasGuard && reasons.length >= 3

  const patchHasRoot = /root:\s*!!js\s*dshHomePath\(/.test(patch)
  /* dsh/ 下的任何一个文件读 config.root 都算（breast 在 dsh/host.js 里读）。
     调用方传进来的 dsh 是**整个 dsh 目录拼接**，这里不再只认 index.js。 */
  const dshReadsRoot = /config\??\.root|config\.root/.test(stripComments(dsh))

  const hasUnmountedNotice = /目录未真实挂载|未真实挂载/.test(code)

  if (hit) oks.push(`① 有真实选择动作：${hit[0]}`)
  else fails.push('① 没有真实选择动作（pickDirectory / showDirectoryPicker / webkitdirectory 都没有）——「选择目录」只是说明弹窗')

  if (guardOk) oks.push(`② 有拒绝清单（${reasons.map(([n]) => n).join('/')}）`)
  else fails.push(`② 拒绝清单不完整：命中 ${reasons.length} 项（主目录/桌面/下载根/tmp），且有判定函数的迹象=${hasGuard}`)

  if (patchHasRoot && dshReadsRoot) oks.push('③ cordis.patch.yml 有 config.root: dshHomePath(...)，dsh/index.js 读取 config.root')
  else fails.push(`③ 目录落点没接上：patch 有 dshHomePath=${patchHasRoot} · dsh 读 config.root=${dshReadsRoot}`)

  if (hasUnmountedNotice && !hit) fails.push('④ 只写了「目录未真实挂载」提示，没有任何选择动作——这正是"假入口"的形态')
  else if (hasUnmountedNotice) oks.push('④ 未挂载提示只作为降级文案出现（选择动作也在）')
  else oks.push('④ 未使用「未真实挂载」说法（有真实挂载路径时不需要）')

  return { pass: fails.length === 0, fails, oks }
}

const BAD = {
  client: 'function Panel(){ return h("button",{onClick:()=>openDialog("资料目录","<p>开发版中选择本机目录；口径：拒绝主目录、桌面、下载根目录、tmp。</p><p>本原型为示意，目录未真实挂载。</p>")},"配置目录") }',
  app: '',
  dsh: 'export function apply(ctx){ ctx.webServer.register({ handler(req,res){ res.end(JSON.stringify({ error: "root 未配置" })) } }) }',
  patch: 'config:\n  root: ""\n',
}
const GOOD = {
  client: `
    const REJECT = [/^\\/$/, /Desktop$/, /Downloads$/, /^\\/tmp/]
    function isForbiddenDir(dir) { return REJECT.some((re) => re.test(dir)) }
    async function chooseDir() {
      const dir = await bridge.uiWorkspace.pickDirectory()
      if (!dir || isForbiddenDir(dir)) { setNote('主目录/桌面/下载根目录/tmp 不作为资料目录'); return }
      await fetch(API + '/root', { method: 'POST', body: JSON.stringify({ dir }) })
    }`,
  app: "window.parent.postMessage({ type: 'x:dir', dir: window.__DIR__ }, location.origin)",
  dsh: "export function apply(ctx, config) { const root = config?.root; if (!root) return reject('root 未配置') }",
  patch: 'config:\n  root: !!js dshHomePath("x-workbench")\n',
}

if (SELF_TEST) {
  const bad = check(BAD)
  const good = check(GOOD)
  const ok = bad.pass === false && bad.fails.length >= 3 && good.pass === true
  console.log(JSON.stringify({ selfTest: ok ? 'PASS' : 'FAIL', badFails: bad.fails.length, goodPass: good.pass, bad }, null, 2))
  process.exit(ok ? 0 : 1)
}

if (!existsSync(join(root, 'lib/client.js')) && !existsSync(join(root, 'public/app.js'))) {
  console.error('✗ 用法：node scripts/check-data-dir.mjs <项目根>（找不到 lib/client.js 与 public/app.js）')
  process.exit(2)
}

const dshAll = (() => {
  try {
    const dir = join(root, 'dsh')
    return readdirSync(dir).filter((f) => /\.(m?js)$/.test(f)).map((f) => read(`dsh/${f}`)).join('\n')
  } catch { return read('dsh/index.js') }
})()
const result = check({ client: read('lib/client.js'), app: read('public/app.js'), dsh: dshAll, patch: read('cordis.patch.yml') })
for (const o of result.oks) console.log(`✓ ${o}`)
for (const f of result.fails) console.error(`✗ ${f}`)
console.log(result.pass ? '\n✓ 资料目录闸门通过' : '\n✗ 资料目录闸门未通过：按钮必须真的能选目录并落盘')
process.exit(result.pass ? 0 : 1)