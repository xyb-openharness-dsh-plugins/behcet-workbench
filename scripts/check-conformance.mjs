#!/usr/bin/env node
/**
 * 家族一致性检查（横向对照）。
 *
 * 与 check-workbench-package.mjs 的分工：
 *   - 那个管"这个 npm 包能不能装"（宿主合同）；
 *   - 这个管"这个项目还是不是家族里的一员"（版本、面板、检查链、文档、密钥卫生）。
 *
 * 原则：**只看代码与文件，不看文档自述**。README 里写"已接入面板拖动"不算数，
 * lib/layout.js 里没有 customFrame:true 就是没接。每条检查给出证据（文件 + 命中片段），
 * 便于人工复核而不是盲信脚本。
 *
 * 用法：node scripts/check-conformance.mjs <项目目录> [--json]
 * 退出码：0 无 fail；1 有 fail。
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const target = resolve(args.find((a) => !a.startsWith('--')) || '.')

const results = []
function record(id, level, message, evidence = '') {
  results.push({ id, level, message, evidence })
}
const ok = (id, message, evidence) => record(id, 'ok', message, evidence)
const fail = (id, message, evidence) => record(id, 'fail', message, evidence)
const warn = (id, message, evidence) => record(id, 'warn', message, evidence)

async function read(rel) {
  try { return await readFile(join(target, rel), 'utf8') } catch { return '' }
}
async function exists(rel) {
  try { await stat(join(target, rel)); return true } catch { return false }
}
async function listdir(rel) {
  try { return await readdir(join(target, rel), { withFileTypes: true }) } catch { return [] }
}

async function main() {
  /* ---------- 0. 基础 ---------- */
  let pkg = null
  try { pkg = JSON.parse(await read( 'package.json')) } catch { /* 下面报 */ }
  if (!pkg) {
    fail('pkg/readable', 'package.json 读不到或不是 JSON')
    return report(null)
  }
  const version = await read('VERSION').then((s) => s.trim())

  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version || '')) ok('pkg/version-semver', '版本是完整 semver', pkg.version)
  else fail('pkg/version-semver', 'package.json version 不是完整 semver', String(pkg.version))

  if (pkg.dsh?.client?.platform === 'web') ok('pkg/platform-web', 'dsh.client.platform = web')
  else fail('pkg/platform-web', 'dsh.client.platform 必须是 web', String(pkg.dsh?.client?.platform))

  if (pkg.dsh?.client?.inject?.includes('dsh-desktop-workbenches')) ok('pkg/inject', '已注入 dsh-desktop-workbenches')
  else fail('pkg/inject', '缺少 dsh.client.inject: dsh-desktop-workbenches')

  const entries = [pkg.main, pkg.exports?.['.'], pkg.exports?.['./client'], pkg.dsh?.bundle?.patch].filter((x) => typeof x === 'string')
  const missingInFiles = entries.filter((entry) => {
    const normalized = entry.replace(/^\.\//, '')
    return !(pkg.files || []).some((glob) => normalized === glob.replace(/^\.\//, '') || normalized.startsWith(glob.replace(/^\.\//, '').replace(/\/$/, '') + '/'))
  })
  if (entries.length && !missingInFiles.length) ok('pkg/files', '运行入口都在 files 白名单里', entries.join(', '))
  else fail('pkg/files', '有运行入口不在 files 白名单里', missingInFiles.join(', ') || '缺少 files 数组')

  /* ---------- 1. 版本四处一致 ---------- */
  if (version) ok('version/file', 'VERSION 存在', version)
  else fail('version/file', '缺少 VERSION 文件（唯一版本来源）')

  if (version && pkg.version === version) ok('version/pkg', 'package.json 与 VERSION 一致', version)
  else fail('version/pkg', 'package.json 与 VERSION 不一致', `pkg=${pkg.version} VERSION=${version || '（缺失）'}`)

  const libVersion = await read('lib/version.js')
  if (!libVersion) fail('version/lib', '缺少 lib/version.js（生成物，供客户端显示版本）')
  else {
    const got = libVersion.match(/export const version = '([^']+)'/)?.[1]
    if (got === version) ok('version/lib', 'lib/version.js 与 VERSION 一致', got)
    else fail('version/lib', 'lib/version.js 与 VERSION 不一致（或忘了重新生成）', `lib=${got} VERSION=${version}`)
  }

  const changelog = await read('CHANGELOG.md')
  if (!changelog) fail('version/changelog', '缺少 CHANGELOG.md')
  else if (version && changelog.includes(version)) ok('version/changelog', 'CHANGELOG 提到了当前版本', version)
  else warn('version/changelog', 'CHANGELOG 里找不到当前版本号（可能只是没写"包版本 x"）', version || '')

  const indexHtml = await read('public/index.html')
  if (indexHtml) {
    const literals = [...new Set([...indexHtml.matchAll(/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g)].map((m) => m[1]))]
    const bad = literals.filter((v) => v !== version)
    if (!bad.length) ok('version/页面', 'public/index.html 的版本字面量与 VERSION 一致', literals.join(', ') || '（无字面量）')
    else fail('version/页面', 'public/index.html 里有版本字面量与 VERSION 不一致', bad.join(', '))
  }

  /* ---------- 2. 面板与布局（家族硬约束） ---------- */
  const layout = await read('lib/layout.js')
  if (layout) ok('panel/单一来源', '面板参数集中在 lib/layout.js')
  else fail('panel/单一来源', '缺少 lib/layout.js（面板参数必须有唯一来源）')

  if (/customFrame\s*:\s*true/.test(layout)) ok('panel/customFrame', 'customFrame 已开启（宿主把会话节点交给插件排版）')
  else fail('panel/customFrame', 'lib/layout.js 里没有 customFrame: true（会退回标准分栏，顶栏无 AI 按钮、分栏不可拖）')

  // 上限 0.7 是**宿主硬约束**，不是风格偏好：desktopWorkbenches.register() 里
  // businessWidth > 0.7 直接 throw → 插件激活失败 → DSH Desktop 起不来。
  // 2026-10-25 head-neck-workbench 就栽在这（当时的闸门写到 0.75，比宿主还宽，等于放行）。
  const width = Number(layout.match(/businessWidth\s*:\s*([\d.]+)/)?.[1])
  if (Number.isFinite(width) && width > 0.55 && width <= 0.7) ok('panel/businessWidth', 'businessWidth 在合理区间', String(width))
  else if (layout) fail('panel/businessWidth', 'businessWidth 缺失或越界（应 0.55–0.7，硬上限来自宿主 register()；家族取值 0.6–0.68）', String(width || '未找到'))

  const paneBlock = layout.match(/AGENT_PANE\s*=\s*(?:Object\.freeze\()?\{([\s\S]*?)\}/)?.[1] || ''
  const paneMin = Number(paneBlock.match(/(?:^|\s)min\s*:\s*([\d.]+)/)?.[1])
  const paneMax = Number(paneBlock.match(/(?:^|\s)max\s*:\s*([\d.]+)/)?.[1])
  if (Number.isFinite(paneMin) && Number.isFinite(paneMax)) {
    // 两种写法都合法：百分比 25–45，或比例 0.25–0.45
    const ratio = paneMax <= 1
    const lo = ratio ? paneMin * 100 : paneMin
    const hi = ratio ? paneMax * 100 : paneMax
    if (lo >= 20 && hi <= 50 && lo < hi) ok('panel/会话区区间', '会话区可拖区间在 20%–50%（家族取值 25%–45%）', `${lo}%–${hi}%`)
    else fail('panel/会话区区间', '会话区区间越界（家族取值 25%–45%）', `${lo}%–${hi}%`)
  } else if (layout) warn('panel/会话区区间', '没解析到 AGENT_PANE 的 min/max，需人工确认')

  const client = await read(pkg.exports?.['./client'] || 'lib/client.js')
  if (!client) fail('panel/client', '缺客户端入口文件')
  else {
    // 避让量可能在客户端外壳里，也可能在业务页样式里（customFrame=false 时由页面自己避让）
    const shellCss = (await read('public/shell.css')) + (await read('public/style.css')) + indexHtml
    if (/--dsh-frame-leading-clearance/.test(client + shellCss)) ok('panel/避让窗口按钮', '使用了 --dsh-frame-leading-clearance')
    else fail('panel/避让窗口按钮', '客户端与页面样式都没有避让 macOS 窗口按钮（红绿灯会压住顶栏品牌区）')

    // 标准分栏下会话节点由宿主自己排，插件不接管——这两条不适用，不算问题
    const customFrame = /customFrame\s*:\s*true/.test(layout)
    if (!customFrame) {
      ok('panel/会话归属', '标准分栏：会话由宿主接管，不适用（前提是 layout.js 已如实记 customFrame:false）')
      ok('panel/会话区常挂载', '标准分栏：会话由宿主挂载，不适用')
    } else {
      const owns = /ownsSession\s*\(/.test(client)
      const current = /currentSession\s*\(/.test(client)
      if (owns && current) ok('panel/会话归属', '用 currentSession + ownsSession 判断会话归属')
      else warn('panel/会话归属', '未见 currentSession/ownsSession：若用 conversation prop 判「已有会话」会永远为真，ensureSession 不触发', `${current ? '' : 'currentSession 缺 '}${owns ? '' : 'ownsSession 缺'}`)

      // 判断「始终挂载」：会话节点被渲染出来，且用 display 控显隐
      const rendersConversation = /\bconversation\b/.test(client)
      const usesDisplayToggle = /display\s*:/.test(client) && /['"]none['"]/.test(client)
      if (rendersConversation && usesDisplayToggle) ok('panel/会话区常挂载', '会话区始终挂载、用 display 切显隐')
      else warn('panel/会话区常挂载', '未见「始终挂载 + display 切显隐」，需人工确认切换面板时是否丢输入框状态')
    }
  }

  /* ---------- 3. 检查链 ---------- */
  const checkScript = String(pkg.scripts?.check || '')
  if (checkScript) ok('check/入口', 'npm run check 存在')
  else fail('check/入口', 'package.json 没有 check 脚本')

  const coverage = [
    ['check/语法', /--check\s+\S+\.js|check-syntax/],
    ['check/单测', /--test|node --test/],
    ['check/版本一致', /check-version|build-version/],
    ['check/schema', /check-schema|freeze|contract/],
    ['check/文案红线', /check-wording|红线/],
  ]
  for (const [id, pattern] of coverage) {
    if (!checkScript) continue
    if (pattern.test(checkScript)) ok(id, '检查链包含该项')
    else fail(id, '检查链缺少这一项', checkScript.slice(0, 160))
  }

  if (existsSync(join(target, 'scripts/check-install.mjs'))) ok('check/装机自检', '带 scripts/check-install.mjs')
  else warn('check/装机自检', '没有装机自检脚本（装到 Desktop 后无法核对依赖与 bundles）')

  const tests = (await listdir('test')).filter((e) => e.isFile() && /\.(test|spec)\.mjs$/.test(e.name))
  if (tests.length) ok('check/用例', `test/ 下有 ${tests.length} 个用例文件`, tests.slice(0, 4).map((e) => e.name).join(', '))
  else fail('check/用例', 'test/ 下没有 *.test.mjs')

  /* ---------- 4. 文档与工程约定 ---------- */
  const docs = [
    ['docs/AGENTS', 'AGENTS.md'],
    ['docs/SPEC', 'docs/SPEC.md'],
    ['docs/DIFF-MATRIX', 'docs/DIFF-MATRIX.md'],
    ['docs/DEV-PLAN', 'docs/DEV-PLAN.md'],
    ['docs/SCHEMA', 'docs/SCHEMA.md'],
  ]
  for (const [id, path] of docs) {
    if (existsSync(join(target, path))) ok(id, `有 ${path}`)
    else fail(id, `缺 ${path}`)
  }
  const devReq = (await listdir('docs')).filter((e) => e.isFile() && /^DEV-REQUIREMENTS-.*\.md$/.test(e.name))
  if (devReq.length) ok('docs/强约束', '有强约束文档', devReq.map((e) => e.name).join(', '))
  else fail('docs/强约束', '缺 docs/DEV-REQUIREMENTS-<日期>.md（每条硬约束要能被命令或截图验证）')

  if (existsSync(join(target, 'schema/freeze-contract.md'))) ok('data/冻结合同', '有 schema/freeze-contract.md')
  else warn('data/冻结合同', '没有 freeze-contract.md：迁移"只增不改"缺少可核对的哈希')

  if (existsSync(join(target, 'prototypes/v0.2/index.html'))) ok('ui/原型基线', '有 prototypes/v0.2 基线')
  else warn('ui/原型基线', '没有 prototypes/v0.2：视觉验收缺少唯一基准')

  /* ---------- 4a. 随包界面（2026-10-27 补） ----------
     此前只剩两条弱规则：`public/index.html` 存在才查版本一致（不存在整段跳过）、
     `prototypes/v0.2` 缺失只是 warn。于是"dsh/lib 齐全、包里一个 HTML 都没有"的包能全绿：
     装机后看到的是客户端外壳自绘的骨架（小前宝 0.1.1 就是这么发出去的）。
     这里补三条只看文件的硬规则。 */
  {
    const shellClient = await read(pkg.exports?.['./client'] || 'lib/client.js')
    const shellDsh = await read(pkg.main || 'dsh/index.js')
    const uiEntry = (shellClient.match(/UI_ENTRY\s*=\s*['"`]([^'"`]+)/) || shellDsh.match(/UI_ENTRY\s*=\s*['"`]([^'"`]+)/) || [])[1]
    const hasPublic = existsSync(join(target, 'public/index.html'))
    const protoDirs = (await listdir('prototypes')).filter((e) => e.isDirectory() && existsSync(join(target, 'prototypes', e.name, 'index.html'))).map((e) => `prototypes/${e.name}`)
    const files = (pkg.files || []).map((g) => g.replace(/^\.\//, '').replace(/\/$/, ''))
    const shipped = (dir) => files.some((g) => dir === g || dir.startsWith(g + '/'))

    if (uiEntry && hasPublic && shipped('public')) {
      ok('ui/随包界面', 'public/index.html 存在、随包发出，外壳用 UI_ENTRY 装 iframe', `${uiEntry} → public/`)
    } else if (uiEntry && hasPublic && !shipped('public')) {
      fail('ui/随包发布', 'public/ 不在 package.json files 里：装机包里没有界面', `files=${JSON.stringify(pkg.files || [])}`)
    } else if (!uiEntry && hasPublic) {
      fail('ui/外壳入口', '有 public/index.html，但 lib/client.js 没有 UI_ENTRY：外壳没把界面装进面板')
    } else if (!uiEntry && !hasPublic) {
      fail('ui/外壳入口', protoDirs.length
        ? `界面只在 ${protoDirs.join(' / ')} 里，没提升到 public/，外壳也没有 UI_ENTRY`
        : '既没有 public/index.html，外壳也没有 iframe UI_ENTRY：装了只看到骨架')
    } else {
      ok('ui/随包界面', 'public/index.html 随包发出', uiEntry)
    }

    /* 外壳自绘业务卡片＝家族口径禁止的第二种界面（装配层应该只做入口 + iframe） */
    const drawn = /wb-status-(?:eyebrow|days|line)|data-status-days|接入骨架/.test(shellClient)
    if (drawn && !uiEntry) fail('ui/外壳自绘', 'lib/client.js 自己在画业务卡片，且没有 iframe UI_ENTRY：装配层不该当业务页')
    else if (drawn && uiEntry) warn('ui/外壳自绘', 'lib/client.js 里仍有自绘业务卡片（只应作为界面加载失败时的兜底，且要写清注释）')
  }

  /* ---------- 4b. 疾病概要（36 号） ---------- */
  // 只看文件与代码，不看文档自述：README 写"已加 ? 图标"不算数。
  {
    const readme = await read('README.md')
    const wantSecs = ['定义', '医学资料规范和指南情况', '目前治疗全景概要', '发展趋势']
    const hasHeader = /^##\s*疾病概要\s*$/m.test(readme)
    // 只在本节范围内看三级标题：逐行扫，遇到下一个 `## ` 就停。
    // 早先这里用 /^##\s*疾病概要([\s\S]*?)(?=^##\s|\Z)/m —— **JavaScript 没有 \Z**，
    // 它退化成字面量 "Z"，README 里一出现 "TMZ" 就在那个 Z 处截断，后两段被判缺段
    // （2026-10-25 GBM 实测踩到，误报 primer/README fail）。逐行扫没有这个坑。
    const bodySecs = []
    {
      const lines = readme.split('\n')
      const start = lines.findIndex((l) => /^##\s*疾病概要\s*$/.test(l))
      if (start >= 0) {
        for (let i = start + 1; i < lines.length; i++) {
          if (/^##\s/.test(lines[i])) break
          const m = lines[i].match(/^###\s*(.+?)\s*$/)
          if (m) bodySecs.push(m[1])
        }
      }
    }
    const missingRd = wantSecs.filter((w) => !bodySecs.some((t) => t.includes(w)))
    if (!hasHeader) fail('primer/README', 'README 缺 `## 疾病概要` 一节（位置：项目简介之后、开发顺序之前）')
    else if (missingRd.length) fail('primer/README', 'README 的疾病概要缺段（四段缺一不合格，没内容写「本台尚未整理」，不许删段）', missingRd.join('、'))
    else ok('primer/README', 'README 疾病概要四段齐全', bodySecs.join(' › '))

    // 数据文件：prototypes 下任一 primer-data.js
    const protoDirs = (await listdir('prototypes')).filter((e) => e.isDirectory()).map((e) => `prototypes/${e.name}`)
    let dataFile = ''
    let dataText = ''
    for (const d of protoDirs.reverse()) {
      if (await exists(`${d}/primer-data.js`)) { dataFile = `${d}/primer-data.js`; dataText = await read(dataFile); break }
    }
    if (!dataFile) fail('primer/数据', '找不到 prototypes/<vX>/primer-data.js（window.DISEASE_PRIMER）')
    else {
      const ids = ['definition', 'evidence', 'landscape', 'trend'].filter((k) => new RegExp(`id\\s*:\\s*['"]${k}['"]`).test(dataText))
      if (ids.length === 4) ok('primer/数据', 'primer-data.js 四段齐全', dataFile)
      else fail('primer/数据', 'primer-data.js 四段不齐（缺 ' + (['definition', 'evidence', 'landscape', 'trend'].filter((k) => !ids.includes(k)).join('、')) + '）', dataFile)

      // 趋势段禁止词：只扫 trend 那一段文本
      const trendBlock = (dataText.match(/id\s*:\s*['"]trend['"]([\s\S]*?)\n\s{4}\}/) || [])[1] || ''
      const banned = ['有望', '即将', '前景', '未来可期', '突破性', '颠覆', '革命性', '首选', '优于', '疗效更好', '建议使用', '强烈推荐', '治愈率', '生存期延长', '大幅提高', '迎来新选择']
      const hit = banned.filter((w) => trendBlock.includes(w))
      if (!trendBlock) warn('primer/趋势段', '没解析到 trend 段，禁止词需人工确认', dataFile)
      else if (hit.length) fail('primer/趋势段', '发展趋势写了判断/展望类词（只许写已发生的事实：版本更替、批件、登记数量、分类更新）', hit.join('、'))
      else ok('primer/趋势段', '趋势段无禁止词')
    }

    // 入口：原型 index.html 有 primer.js 或 data-primer-open
    let entryHit = ''
    for (const d of protoDirs.reverse()) {
      if (!(await exists(`${d}/index.html`))) continue
      const html = await read(`${d}/index.html`)
      if (/primer\.js/.test(html) || /data-primer-open/.test(html)) { entryHit = `${d}/index.html`; break }
    }
    if (entryHit) ok('primer/入口', '原型已接入「?」入口', entryHit)
    else fail('primer/入口', '原型没有 primer.js 或 data-primer-open：看板上点不开疾病概要')
  }

  /* ---------- 4c. 部署目标（37 号，最高优先级） ---------- */
  // 只看脚本与文件，不看 README 自述：文档写"只装 DSH Desktop"不算数，
  // 装机脚本里没有这条判断，实际装机照样会装到 ~/.dsh 或另一款 Harness 上。
  {
    const installScript = await read('scripts/check-install.mjs')
    if (!installScript) {
      fail('deploy/装机脚本', '缺少 scripts/check-install.mjs（随 init 下发；没它没人验"到底装到哪了"）')
    } else {
      const missing = []
      if (!/dsh-desktop[\s\S]{0,80}harness/.test(installScript)) missing.push('没认 DSH Desktop 的 harness 目录')
      if (!/dshdesktop\.com/.test(installScript)) missing.push('没装时没有下载地址 dshdesktop.com')
      if (!/\.dsh/.test(installScript)) missing.push('没有点名排除 ~/.dsh')
      if (!/DeepSeek Harness/.test(installScript)) missing.push('没有点名排除 DeepSeek Harness')
      if (missing.length) fail('deploy/装机脚本', '装机脚本没守住"只装本机 DSH Desktop"（规则见 starter docs/37-DEPLOY-TARGET.md）', missing.join('、'))
      else ok('deploy/装机脚本', '装机脚本认 DSH Desktop 为唯一目标，并排除 ~/.dsh 与 DeepSeek Harness')
    }

    const agentsMd = await read('AGENTS.md')
    if (!agentsMd) fail('deploy/AGENTS', '缺少 AGENTS.md（部署目标要求写在开头的最高优先级段）')
    else if (!/^##\s*部署目标/m.test(agentsMd)) fail('deploy/AGENTS', 'AGENTS.md 缺「## 部署目标」段（要求层，别只写在 docs 里）')
    else if (!/dshdesktop\.com/.test(agentsMd)) fail('deploy/AGENTS', 'AGENTS.md 的部署目标段没给下载地址 dshdesktop.com')
    else ok('deploy/AGENTS', 'AGENTS.md 保留「部署目标」段与下载地址')
  }

  /* ---------- 5. 密钥卫生 ---------- */
  const gitignore = await read('.gitignore')
  const mineru = await read('dsh/mineru.js')
  if (mineru) {
    // 地址常量可能集中在 settings.js，错误消息里用 ${MINERU_TOKEN_URL} 拼接也算
    const tokenUrlOwner = (await read('dsh/settings.js')) + mineru
    if (/mineru\.net\/apiManage\/token/.test(tokenUrlOwner)) ok('mineru/申请地址', '带申请 / 重置地址常量')
    else fail('mineru/申请地址', 'Token 故障没有给申请地址（患者不知道去哪换）')

    if (/\.secrets/.test(gitignore)) ok('mineru/忽略密钥', '.gitignore 含 .secrets')
    else fail('mineru/忽略密钥', '.gitignore 没有 .secrets（假 Token 会进仓库）')

    // 优先级只能从实现里看：解析 Token 的那个函数**体内**，读文件必须写在读 env 之前
    const settings = await read('dsh/settings.js')
    const owners = [
      { text: settings, name: 'readMineruToken' },
      { text: settings, name: 'resolveMineruToken' },
      { text: settings, name: 'resolveToken' },
      { text: mineru, name: 'resolveToken' },
      { text: mineru, name: 'resolveMineruToken' },
    ]
    // 找一个"同时出现读文件与读 env"的函数，这才是真正的优先级判定点
    let verdict = null
    for (const candidate of owners) {
      if (!candidate.text || !new RegExp(`function\\s+${candidate.name}\\b`).test(candidate.text)) continue
      const full = functionBody(candidate.text, candidate.name)
      const body = bodyAfterSignature(candidate.text, candidate.name)
      const signature = full.slice(0, full.length - body.length)
      const fileAt = body.search(/secretFile|readMineruToken|readSecretToken|readFileSync\s*\(\s*file/)
      // env 有两种写法：体内直接 process.env，或签名默认值 `x = process.env.MINERU_TOKEN` 后在体内用 x
      let envAt = body.search(/MINERU_TOKEN(?!_URL)/)
      if (envAt < 0) {
        const param = signature.match(/([A-Za-z_$][\w$]*)\s*=\s*process\.env\.MINERU_TOKEN/)
        if (param) envAt = body.search(new RegExp(`\\b${param[1]}\\b`))
      }
      if (fileAt >= 0 && envAt >= 0) { verdict = { name: candidate.name, fileAt, envAt }; break }
    }
    if (!verdict) warn('mineru/Token 优先级', '没找到同时读文件与读环境变量的函数，优先级需人工确认')
    else if (verdict.fileAt < verdict.envAt) ok('mineru/Token 优先级', `Token 解析（${verdict.name}）函数体内文件先于环境变量`, `file@${verdict.fileAt} env@${verdict.envAt}`)
    else fail('mineru/Token 优先级', 'Token 解析里环境变量写在文件之前（"换了新 Token 还是 401"就是这么来的）', `${verdict.name} file@${verdict.fileAt} env@${verdict.envAt}`)

    const writable = /saveMineruToken|writeSecretToken|saveToken/.test(settings || mineru)
    if (writable) ok('mineru/可写', '存在保存 Token 的实现（设置页可手工维护）')
    else warn('mineru/可写', '只有读取没有保存：设置页无法手工填 Token')
  }

  // 已提交的 Token：只扫代码与配置，跳过 node_modules 与夹具
  const { leaked, declared } = await scanForSecrets()
  if (leaked.length) fail('hygiene/无密钥', '发现疑似 Token 明文', leaked.join(', '))
  else if (declared.length) warn('hygiene/无密钥', '有文件按注释声明"随包公益/公开凭据"，需人工确认它确实可公开', declared.join(', '))
  else ok('hygiene/无密钥', '未发现疑似 Token 明文')

  return report(pkg)
}

/** 取某个函数体的近似区间：从函数声明到下一个顶层 export / 文件末尾。够用即可。 */
function functionBody(text, name) {
  const start = text.search(new RegExp(`function\\s+${name}\\b`))
  if (start < 0) return ''
  const rest = text.slice(start)
  const end = rest.slice(1).search(/\nexport\s+(?:async\s+)?(?:function|const|class)\s/)
  return end < 0 ? rest.slice(0, 4000) : rest.slice(0, end + 1)
}

/**
 * 只取**函数体**，不含签名。
 * 参数默认值里常写 `tokenFromEnv = process.env.MINERU_TOKEN`——那是"入参从哪来"，
 * 不是"代码先读哪个"。不切掉签名会把正确实现（文件优先）判成错误顺序（小胰宝 0.1.34 已踩）。
 */
function bodyAfterSignature(text, name) {
  const body = functionBody(text, name)
  if (!body) return ''
  const sigEnd = body.search(/\)\s*\{/)
  if (sigEnd < 0) return body
  return body.slice(body.indexOf('{', sigEnd))
}

async function scanForSecrets() {
  const leaked = [], declared = []
  const skip = new Set(['node_modules', '.git', 'release', 'dist', 'assets', 'reference', 'input', '_intake'])
  async function walk(dir) {
    for (const entry of await listdir(dir || '.')) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name
      if (skip.has(entry.name)) continue
      if (entry.isDirectory()) { if (!/^(prototypes|public|docs|test|dsh|lib|scripts|schema)$/.test(entry.name) && dir === '') continue; await walk(rel); continue }
      if (!/\.(js|mjs|cjs|json|html|md|yml|yaml)$/.test(entry.name)) continue
      if (entry.name === 'package-lock.json' || entry.name === 'demo-data.js') continue
      const text = await read(rel)
      // 逐行豁免：夹具里的假 Token 同行写 secret-allow（starter 既有约定）
      const lines = text.split('\n').filter((line) => /sk-[A-Za-z0-9]{20,}/.test(line) && !/secret-allow/.test(line))
      if (!lines.length) continue
      // 整文件豁免：文件头写明"随包公益 / 故意公开"。这类凭据公开是设计，不是泄漏，
      // 但仍进 warn——脚本判不了它是否真的可公开，必须由人确认（小胰宝 community-token.js 即此类）。
      const head = text.split('\n').slice(0, 10).join('\n')
      const declaredPublic = /secret-allow-file|intentionally\s+shipped|community[- ]funded|随包公益|公益\s*Token/i.test(head)
      ;(declaredPublic ? declared : leaked).push(rel)
      if (leaked.length > 5) return
    }
  }
  await walk('')
  return { leaked, declared }
}

function report(pkg) {
  const fails = results.filter((r) => r.level === 'fail')
  const warns = results.filter((r) => r.level === 'warn')
  const payload = {
    target: relative(process.cwd(), target) || '.',
    package: pkg?.name || '（未知）',
    version: pkg?.version || '（未知）',
    pass: fails.length === 0,
    summary: { checks: results.length, ok: results.filter((r) => r.level === 'ok').length, fail: fails.length, warn: warns.length },
    fails: fails.map(({ id, message, evidence }) => ({ id, message, evidence })),
    warns: warns.map(({ id, message, evidence }) => ({ id, message, evidence })),
  }
  if (jsonOnly) console.log(JSON.stringify(payload, null, 2))
  else {
    console.log(`\n${payload.package} ${payload.version} — ${payload.target}`)
    for (const item of fails) console.log(`  ✗ ${item.id}  ${item.message}${item.evidence ? `（${item.evidence}）` : ''}`)
    for (const item of warns) console.log(`  ! ${item.id}  ${item.message}${item.evidence ? `（${item.evidence}）` : ''}`)
    console.log(`\n  ${payload.summary.ok}/${payload.summary.checks} 通过 · ${fails.length} 失败 · ${warns.length} 待人工\n`)
  }
  if (fails.length) process.exitCode = 1
  return payload
}

await main()
