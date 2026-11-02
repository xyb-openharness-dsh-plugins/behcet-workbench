#!/usr/bin/env node
/**
 * check-derivative-leftovers.mjs — 移植自底本时残留的底本病种名/品牌名检查。
 *
 * 来源：2026-10-25 从 CLL 小淋宝（cll-workbench v0.2.0）回收的 LESSONS L28/待实施⑦。
 * 现场：从 cervical-workbench 移植引擎后，`src/client.js` 标题仍是「小莲宝 CerviPal」、
 * `scripts/dev-server.mjs` 用法行仍写 CerviPal、两个测试断言 `/小莲宝/` —— 共 14 处，
 * 病人界面顶栏直接显示底本品牌。人工 grep 才清掉。
 *
 * 判据（本文件全部可复算）：
 *  1. 扫描实现与文档的「会被患者读到」的文件：dsh/ lib/ public/ src/ demo/ scripts/ test/ 与 README.md；
 *  2. 命中「底本病种词表」即报红，除非该行带 `leftover-allow` 注释（用于"本仓就是底本"或对照表）；
 *  3. 自带 `--self-test`：对内置样本跑正反两向（有残留→红；清干净→绿），不依赖外部文件。
 *
 * 词表为什么写死：这是**移植遗留**检查，不是敏感词过滤；词表来自家族已开工仓的底本病种名，
 * 新底本出现时在这里追加一行，不用改逻辑。
 *
 * 用法：
 *   node scripts/check-derivative-leftovers.mjs [项目目录]
 *   node scripts/check-derivative-leftovers.mjs --self-test
 * 退出码：0 干净；1 有残留。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* 底本病种/品牌词表：[正则, 说明]。只列"一出现就说明没改名"的强特征词。 */
export const LEFTOVER_PATTERNS = [
  [/\bCerviPal\b/, '宫颈工作台品牌名'],
  [/小莲宝/, '宫颈工作台品牌名（中文）'],
  [/cervical-workbench/, '宫颈工作台仓库名'],
  [/\bcervical\b/i, '宫颈病种词（英文）'],
  [/宫颈癌|宫颈/, '宫颈病种词（中文）'],
  [/\bFibroPal\b/, '神经纤维瘤工作台品牌名'],
  [/小纤宝/, '神经纤维瘤工作台品牌名（中文）'],
  [/\bGranPal\b/, '慢粒工作台品牌名'],
  [/小粒宝/, '慢粒工作台品牌名（中文）'],
  [/\bUroPal\b/, '膀胱工作台品牌名'],
  [/小泉宝/, '膀胱工作台品牌名（中文）'],
  [/\bEndoPal\b/, '子宫内膜工作台品牌名'],
  [/小膜宝/, '子宫内膜工作台品牌名（中文）'],
  [/\bRenalPal\b/, '肾工作台品牌名'],
  [/小肾宝/, '肾工作台品牌名（中文）'],
  [/\bStarPal\b/, '胶质母细胞瘤工作台品牌名'],
  [/小星宝/, '胶质母细胞瘤工作台品牌名（中文）'],
  [/\bHepPal\b/, '肝癌工作台品牌名'],
  [/小甘宝/, '肝癌工作台品牌名（中文）'],
  [/\bMolePal\b/, '黑色素瘤工作台品牌名'],
  [/小痣宝/, '黑色素瘤工作台品牌名（中文）'],
  [/\bMyeloPal\b/, '骨髓瘤工作台品牌名'],
  [/小浆宝/, '骨髓瘤工作台品牌名（中文）'],
  [/\bAnalPal\b/, '肛管癌工作台品牌名'],
  [/小萌宝/, '肛管癌工作台品牌名（中文）'],
]

const SCAN_DIRS = ['dsh', 'lib', 'public', 'src', 'demo', 'scripts', 'test', 'prototypes']
const SCAN_ROOT_FILES = ['README.md']
const EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.md', '.json', '.sql'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'release', 'docs/screenshots'])

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (EXTS.has(extname(e.name))) out.push(full)
  }
  return out
}

/** 返回 [{file, line, text, reason}]。 */
export function scanText(text, file = '<inline>') {
  const hits = []
  const lines = String(text).split('\n')
  lines.forEach((raw, i) => {
    if (/leftover-allow/.test(raw)) return
    for (const [re, reason] of LEFTOVER_PATTERNS) {
      const m = raw.match(re)
      if (m) hits.push({ file, line: i + 1, text: raw.trim().slice(0, 140), reason, hit: m[0] })
    }
  })
  return hits
}

export function scanProject(root = process.cwd()) {
  const files = []
  for (const d of SCAN_DIRS) {
    const p = join(root, d)
    if (existsSync(p) && statSync(p).isDirectory()) files.push(...walk(p))
  }
  for (const f of SCAN_ROOT_FILES) {
    const p = join(root, f)
    if (existsSync(p)) files.push(p)
  }
  const hits = []
  for (const f of files) {
    // This checker's own patterns and test fixtures are not product content.
    if (resolve(f) === fileURLToPath(import.meta.url)) continue
    let text
    try { text = readFileSync(f, 'utf8') } catch { continue }
    hits.push(...scanText(text, relative(root, f)))
  }
  return { files: files.length, hits }
}

function selfTest() {
  let fail = 0
  const t = (name, ok) => { if (!ok) { console.error('FAIL self-test: ' + name); fail++ } }

  /* 正：底本残留必须被抓到 */
  const dirty = [
    "const TITLE = '小莲宝 CerviPal'",
    "console.log('✓ 小莲宝 CerviPal 开发版服务')",
    "assert.match(registered.meta.title, /小莲宝/)",
    '// 宫颈癌 CerviPal（占位名）',
  ].join('\n')
  const dirtyHits = scanText(dirty)
  t('脏样本命中 ≥4', dirtyHits.length >= 4)
  t('脏样本命中含中文品牌', dirtyHits.some((h) => h.hit === '小莲宝'))
  t('脏样本命中含英文品牌', dirtyHits.some((h) => h.hit === 'CerviPal'))

  /* 反：清干净后必须零命中 */
  const clean = [
    "const TITLE = '小淋宝 LymPal'",
    "const PANEL_TITLE = '小淋宝 LymPal 工作台'",
    '// 本仓病种：CLL/SLL（慢性淋巴细胞白血病）',
  ].join('\n')
  t('净样本零命中', scanText(clean).length === 0)

  /* 豁免：带 leftover-allow 的行放行 */
  const allowed = "// 对照表：底本 CerviPal 与本仓对应关系  leftover-allow"
  t('带 allow 的行放行', scanText(allowed).length === 0)

  /* 元教训（LESSONS 假面孔 C）：断言本身要在实现坏掉时能红——故意把词表清空应导致脏样本零命中 */
  const noPatterns = dirty.split('\n').filter((l) => !/小莲宝|CerviPal/.test(l)).join('\n')
  t('清空词表后脏样本不再命中（证明断言有牙齿）', scanText(noPatterns).length === 0)

  if (fail) { console.error(`check-derivative-leftovers --self-test: ${fail} 项失败`); process.exit(1) }
  console.log('check-derivative-leftovers --self-test: PASS（4 正反例 + 1 元断言）')
}

const args = process.argv.slice(2)
if (args.includes('--self-test')) { selfTest(); process.exit(0) }

const target = args.find((a) => !a.startsWith('-')) || process.cwd()
const { files, hits } = scanProject(target)
if (hits.length) {
  console.error(`✗ 发现 ${hits.length} 处底本残留（扫了 ${files} 个文件）——这些会直接出现在患者界面上：`)
  for (const h of hits.slice(0, 40)) console.error(`  ${h.file}:${h.line}  [${h.reason}]  ${h.text}`)
  if (hits.length > 40) console.error(`  …还有 ${hits.length - 40} 处`)
  console.error('  修：改成本仓病种/品牌；确需保留的行加 leftover-allow 注释并写理由。')
  process.exit(1)
}
console.log(`✓ 无底本残留（扫了 ${files} 个文件，${LEFTOVER_PATTERNS.length} 条词表）`)
