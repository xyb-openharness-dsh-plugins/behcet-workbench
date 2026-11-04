#!/usr/bin/env node
/**
 * scripts/check-clinical-snapshot-commit.mjs 的正反例。
 *
 * 重点不是“能报几个”，而是边界：
 *   - 普通文献、BibTeX、package.json 作者邮箱、通用 contacts JSON 不能误报；
 *   - 私有目录、SQLite 及旁路文件、CTG 原始页结构、CTG 联系人字段必须报；
 *   - 输出只能出现路径和规则，测试夹具里的哨兵不能出现在 stdout/stderr；
 *   - HEAD 已跟踪的敏感 blob 不会因为工作区删除或 staged 删除而消失；
 *   - 未跟踪工作区文件不扫，非 Git 目录明确失败。
 *
 * 每个用例使用独立临时仓库，不碰真实工作树的 `_private/` 或索引。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const checker = join(repoRoot, 'scripts', 'check-clinical-snapshot-commit.mjs')

const SENTINEL = Object.freeze({
  privateBody: 'SENTINEL_PRIVATE_BODY_7f3a',
  email: 'sentinel.contact.7f3a@example.invalid',
  name: 'Sentinel Contact 7f3a',
  phone: '+1-555-0100-7f3a',
  authorEmail: 'author.only.7f3a@university.invalid',
  nctId: 'NCT01234567',
})

async function makeRepo(t, label) {
  const dir = await mkdtemp(join(tmpdir(), `clinical-snapshot-${label}-`))
  const configDir = await mkdtemp(join(tmpdir(), `clinical-snapshot-${label}-config-`))
  const gitConfig = join(configDir, 'gitconfig')
  await writeFile(gitConfig, '')

  const env = {
    ...process.env,
    HOME: configDir,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  }

  const git = (...args) => {
    const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env })
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
    return result.stdout
  }

  git('init', '-q')
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
    await rm(configDir, { recursive: true, force: true })
  })
  return { dir, git, env }
}

async function writeRepoFile(repo, path, content) {
  const target = join(repo.dir, ...path.split('/'))
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

function stageAll(repo) {
  repo.git('add', '-A')
}

function commitAll(repo, message) {
  stageAll(repo)
  repo.git('commit', '-qm', message)
}

function runChecker(repo, args = []) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: repo.env,
  })
}

/** 断言检查器输出没有夹具内容，也没有会被误当成“泄露内容”的结构字段名。 */
function assertNoLeak(result) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  for (const value of Object.values(SENTINEL)) {
    assert.equal(output.includes(value), false, 'checker output leaked fixture content')
  }
  for (const key of ['centralContacts', 'protocolSection', 'contactsLocationsModule', 'locations']) {
    assert.equal(output.includes(key), false, 'checker output leaked a structured field name')
  }
}

/** 输出约定：每个命中一行 `<path>\t<RULE>`；汇总行没有 tab。 */
function findingPairs(result) {
  const pairs = new Set()
  for (const line of String(result.stdout || '').split('\n')) {
    if (!line.includes('\t')) continue
    const parts = line.split('\t')
    assert.equal(parts.length, 2, `finding line must contain exactly one tab: ${line}`)
    const [path, rule] = parts
    assert.match(rule, /^[A-Z_]+$/, `finding line must end in a rule id: ${line}`)
    assert.ok(path.length > 0, 'finding path must not be empty')
    pairs.add(`${path}\t${rule}`)
  }
  return pairs
}

function rawPage() {
  return {
    totalCount: 1,
    studies: [{
      protocolSection: {
        identificationModule: {
          nctId: SENTINEL.nctId,
          briefTitle: 'Fixture study',
        },
        contactsLocationsModule: {
          centralContacts: [{
            name: SENTINEL.name,
            role: 'CONTACT',
            phone: SENTINEL.phone,
            email: SENTINEL.email,
          }],
          locations: [{
            facility: 'Fixture Site',
            contacts: [{
              name: SENTINEL.name,
              phone: SENTINEL.phone,
              email: SENTINEL.email,
            }],
          }],
        },
      },
    }],
  }
}

function emptyPage() {
  return { totalCount: 0, studies: [] }
}

function contactOnly() {
  return {
    protocolSection: {
      contactsLocationsModule: {
        centralContacts: [{
          name: SENTINEL.name,
          phone: SENTINEL.phone,
          email: SENTINEL.email,
        }],
      },
    },
  }
}

function locationsOnly() {
  return {
    protocolSection: {
      contactsLocationsModule: {
        locations: [{
          facility: 'Fixture Site',
          contacts: [{ name: SENTINEL.name, email: SENTINEL.email }],
        }],
      },
    },
  }
}

test('普通文献、作者邮箱和泛化 contacts 不误判，且不输出内容', async (t) => {
  const repo = await makeRepo(t, 'clean')
  const email = SENTINEL.authorEmail

  await writeRepoFile(repo, 'docs/paper.md', [
    '# A normal review',
    '',
    `通讯作者：${email}`,
    'This mentions clinical trials and contact details in prose only.',
    '',
  ].join('\n'))
  await writeRepoFile(repo, 'reference/library.bib', [
    '@article{fixture,',
    '  author = {Jane Doe},',
    `  email = {${email}},`,
    '  title = {A normal bibliography entry}',
    '}',
    '',
  ].join('\n'))
  await writeRepoFile(repo, 'assets/reference/paper.pdf', Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.from(`Metadata: ${email}; clinical trial literature.\n`),
  ]))
  await writeRepoFile(repo, 'package.json', JSON.stringify({
    name: 'fixture',
    author: `Jane <${email}>`,
    contributors: [{ name: 'Jane', email }],
  }, null, 2))
  await writeRepoFile(repo, 'data/authors.json', JSON.stringify({
    authors: [{ name: 'Jane', email, affiliation: 'Fixture University' }],
  }, null, 2))
  await writeRepoFile(repo, 'data/authors.jsonl', [
    JSON.stringify({ name: 'Jane', email }),
    JSON.stringify({ name: 'John', email: `john.only.7f3a@example.invalid` }),
    '',
  ].join('\n'))
  await writeRepoFile(repo, 'data/generic-contacts.json', JSON.stringify({
    contacts: [{ name: 'Lab', email }],
  }, null, 2))
  await writeRepoFile(repo, 'docs/site-notes.json', JSON.stringify({
    protocolSection: {
      contactsLocationsModule: {
        locations: [{ facility: 'Fixture Site', country: 'US' }],
      },
    },
  }, null, 2))
  await writeRepoFile(repo, 'docs/central-roles.json', JSON.stringify({
    centralContacts: [{ role: 'CONTACT' }],
  }, null, 2))
  await writeRepoFile(repo, 'docs/ctg-notes.json', JSON.stringify({
    totalCount: 2,
    studies: [{ title: 'Not a CTG protocol', nctId: SENTINEL.nctId }],
  }, null, 2))
  await writeRepoFile(repo, 'docs/broken.json', `{"centralContacts": [{"email": "${email}"}],`)
  await writeRepoFile(repo, 'docs/input/notes.txt', 'nested input is documentation, not the root data dir\n')

  stageAll(repo)
  const result = runChecker(repo)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(findingPairs(result).size, 0)
  assert.match(result.stdout, /clinical-snapshot-commit: PASS/)
  assertNoLeak(result)
})

test('staged 私有目录、SQLite/sidecar、CTG 原始页与联系字段命中，且只输出路径+规则', async (t) => {
  const repo = await makeRepo(t, 'sensitive')
  await writeRepoFile(repo, 'README.md', 'baseline\n')
  commitAll(repo, 'baseline')

  const sqlite = Buffer.concat([
    Buffer.from('SQLite format 3\u0000'),
    Buffer.from(SENTINEL.privateBody),
  ])

  await writeRepoFile(repo, '_private/ctg-fixture/pages/page-0001.json', JSON.stringify(rawPage()))
  await writeRepoFile(repo, '_private/ctg-fixture/trials.sqlite', sqlite)
  await writeRepoFile(repo, 'nested/_private/notes.txt', `${SENTINEL.privateBody}\n`)
  await writeRepoFile(repo, 'input/visit.txt', `${SENTINEL.privateBody}\n`)
  await writeRepoFile(repo, 'output/report.json', JSON.stringify({ note: SENTINEL.privateBody }))
  await writeRepoFile(repo, 'cache/study.sqlite', 'path extension is enough\n')
  await writeRepoFile(repo, 'cache/study.sqlite-wal', `${SENTINEL.privateBody}\n`)
  await writeRepoFile(repo, 'cache/study.sqlite-shm', `${SENTINEL.privateBody}\n`)
  await writeRepoFile(repo, 'cache/study.db-journal', `${SENTINEL.privateBody}\n`)
  await writeRepoFile(repo, 'exports/ctg-page.json', JSON.stringify(rawPage()))
  await writeRepoFile(repo, 'exports/contact-only.json', JSON.stringify(contactOnly()))
  await writeRepoFile(repo, 'exports/site-contacts.json', JSON.stringify(locationsOnly()))
  await writeRepoFile(repo, 'exports/studies.jsonl', `${JSON.stringify(rawPage().studies[0])}\n`)
  await writeRepoFile(repo, 'exports/empty-page.json', JSON.stringify(emptyPage()))
  await writeRepoFile(repo, 'exports/renamed.bin', sqlite)
  await writeRepoFile(repo, 'research/ctg-run/pages/page-0001.json', JSON.stringify(emptyPage()))

  stageAll(repo)
  const result = runChecker(repo)

  assert.equal(result.status, 1)
  const pairs = findingPairs(result)
  const expected = [
    '_private/ctg-fixture/pages/page-0001.json\tPRIVATE_DIR',
    '_private/ctg-fixture/pages/page-0001.json\tCTG_RAW_PAGE',
    '_private/ctg-fixture/pages/page-0001.json\tCONTACT_FIELDS',
    '_private/ctg-fixture/trials.sqlite\tPRIVATE_DIR',
    '_private/ctg-fixture/trials.sqlite\tSQLITE_DB',
    'nested/_private/notes.txt\tPRIVATE_DIR',
    'input/visit.txt\tPRIVATE_DIR',
    'output/report.json\tPRIVATE_DIR',
    'cache/study.sqlite\tSQLITE_DB',
    'cache/study.sqlite-wal\tSQLITE_SIDECAR',
    'cache/study.sqlite-shm\tSQLITE_SIDECAR',
    'cache/study.db-journal\tSQLITE_SIDECAR',
    'exports/ctg-page.json\tCTG_RAW_PAGE',
    'exports/ctg-page.json\tCONTACT_FIELDS',
    'exports/contact-only.json\tCONTACT_FIELDS',
    'exports/site-contacts.json\tCONTACT_FIELDS',
    'exports/studies.jsonl\tCONTACT_FIELDS',
    'exports/empty-page.json\tCTG_RAW_PAGE',
    'exports/renamed.bin\tSQLITE_DB',
    'research/ctg-run/pages/page-0001.json\tRAW_RESPONSE_DIR',
    'research/ctg-run/pages/page-0001.json\tCTG_RAW_PAGE',
  ]

  for (const pair of expected) assert.ok(pairs.has(pair), `missing finding: ${pair}`)
  assert.equal(pairs.size, expected.length, 'unexpected extra finding(s)')
  assertNoLeak(result)
})

test('HEAD 已跟踪的敏感 blob 持续告警；staged 修改读取索引内容而非工作区', async (t) => {
  const repo = await makeRepo(t, 'tracked')
  await writeRepoFile(repo, 'README.md', 'baseline\n')
  commitAll(repo, 'baseline')

  await writeRepoFile(repo, 'snapshots/raw.json', JSON.stringify(rawPage()))
  commitAll(repo, 'snapshot')

  let result = runChecker(repo)
  assert.equal(result.status, 1)
  let pairs = findingPairs(result)
  assert.ok(pairs.has('snapshots/raw.json\tCTG_RAW_PAGE'))
  assert.ok(pairs.has('snapshots/raw.json\tCONTACT_FIELDS'))
  assertNoLeak(result)

  // staged 删除只改索引；HEAD 里的敏感 blob 仍然存在，不能因此静默。
  repo.git('rm', '--quiet', 'snapshots/raw.json')
  result = runChecker(repo)
  assert.equal(result.status, 1)
  pairs = findingPairs(result)
  assert.ok(pairs.has('snapshots/raw.json\tCTG_RAW_PAGE'))
  assertNoLeak(result)

  await writeRepoFile(repo, 'exports/modified.json', '{"hello":"world"}\n')
  commitAll(repo, 'benign export')

  // 工作区改成敏感内容并 staged；HEAD 仍是 benign，必须读索引 blob。
  await writeRepoFile(repo, 'exports/modified.json', JSON.stringify(rawPage()))
  repo.git('add', '--', 'exports/modified.json')
  // 再把工作区改回 benign、不 stage：仍须命中的是索引 blob，不是工作区副本。
  await writeRepoFile(repo, 'exports/modified.json', '{"hello":"working-tree-only"}\n')
  result = runChecker(repo)
  assert.equal(result.status, 1)
  pairs = findingPairs(result)
  assert.ok(pairs.has('exports/modified.json\tCTG_RAW_PAGE'))
  assert.ok(pairs.has('exports/modified.json\tCONTACT_FIELDS'))
  assert.equal(pairs.has('exports/modified.json\tSQLITE_DB'), false)
  assertNoLeak(result)
})

test('未跟踪工作区文件不扫描；非 Git 目录返回 2', async (t) => {
  const repo = await makeRepo(t, 'untracked')
  await writeRepoFile(repo, 'README.md', 'baseline\n')
  commitAll(repo, 'baseline')

  // 只写工作区、不 add：检查器的约定是 staged/tracked，不能把它当已提交。
  await writeRepoFile(repo, '_private/untracked/page.json', JSON.stringify(rawPage()))
  let result = runChecker(repo)
  assert.equal(result.status, 0)
  assert.equal(findingPairs(result).size, 0)
  assertNoLeak(result)

  const plain = await mkdtemp(join(tmpdir(), 'clinical-snapshot-plain-'))
  t.after(() => rm(plain, { recursive: true, force: true }))
  result = spawnSync(process.execPath, [checker], { cwd: plain, encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /不在 Git 工作树/)
  assertNoLeak(result)
})