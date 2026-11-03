// 单 HTML 原型浏览器路径走查（docs/INTERACTION-DESIGN.md §2.0 S01–S15）。
//
// 原则：
// - 每条路径都从看板入口开始，用 CDP Input.dispatchMouseEvent 真实点击；
// - 不调用页面全局 go()，不注入脚本、不改写 prototypes/v0.2/index.html；
// - 每条路径 Page.reload 隔离，避免上一条路径的内存残留；
// - 入口、步骤、产物、回首页分别断言；AI 默认通道缺失与手工路径失败分开记录；
// - 任何检查 FAIL / NOT_RUN 都不能得到 PASS，退出码非 0（除非 15/15 全绿）。
//
// 用法：
//   node scripts/path-walk.mjs            # 人类可读表格 + 失败明细
//   node scripts/path-walk.mjs --json     # 机器可读 JSON（stdout 仅 JSON）
//   node scripts/path-walk.mjs --only S01,S13
//   node scripts/path-walk.mjs --out /tmp/path-walk.json
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openSession } from './lib/cdp-session.mjs';
import { buildPathResult, summarize } from './lib/path-walk-result.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const PROTOTYPE_PATH = join(ROOT, 'prototypes/v0.2/index.html');
const PROTOTYPE_URL = pathToFileURL(PROTOTYPE_PATH).href;
const CHROMIUM = process.env.CHROMIUM || '/usr/bin/chromium';

const TEXTS = {
  S01: '走查S01合成发作记录（非真实资料）',
  S04: '走查S04合成血管资料（非真实资料）',
  S05: '走查S05合成消化道记录（非真实资料）',
  S06: '走查S06合成治疗记录（非真实资料）',
  S07: '走查S07合成医嘱记录（非真实资料）',
  S08: '走查S08合成生活影响（非真实资料）',
  S13: '走查S13私密问题（非真实资料）',
  S15: '走查S15合成用药前检查（非真实资料）',
};

const CRITERIA = [
  'docs/INTERACTION-DESIGN.md §2.0 S01–S15（入口文案、AI/手工步骤、产物）',
  'X2：从看板入口按文档逐条点击，步骤可点、产物可观察、结束后一步回首页',
  'IP3：记录入口/导航文案与文档的逐字差异；已知 S09 偏差写入 notes，未做全量 IP3 签认',
  'X4：无头 DOM/state 断言，逐路径 PASS/FAIL 与失败定位；每次 render 后重新取元素',
].join('；');

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function q(value) {
  return JSON.stringify(value);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

class PathContext {
  constructor(driver, spec) {
    this.driver = driver;
    this.spec = spec;
    this.checks = [];
    this.notes = [];
    this.reached = false;
    this.entryRendered = '';
  }

  push(kind, name, status, detail) {
    this.checks.push({ kind, name, status, detail });
  }

  note(text) {
    this.notes.push(text);
  }

  async check(kind, name, fn) {
    if (!this.reached && kind !== 'entry') {
      this.push(kind, name, 'NOT_RUN', '入口未到达，未执行');
      return false;
    }
    try {
      const detail = await fn();
      this.push(kind, name, 'PASS', typeof detail === 'string' ? detail : '');
      return true;
    } catch (error) {
      this.push(kind, name, 'FAIL', error.message);
      return false;
    }
  }

  result(durationMs) {
    return buildPathResult(this.spec, this.checks, {
      entryRendered: this.entryRendered,
      notes: this.notes,
      durationMs,
    });
  }
}

// ---------- 通用页面操作 ----------

async function pageText(driver) {
  return driver.eval("document.querySelector('#main')?.innerText.replace(/\\s+/g, ' ').trim() || ''");
}

async function dialogText(driver) {
  return driver.eval(
    "document.querySelector('#dialog')?.open ? document.querySelector('#dialog-body')?.innerText.replace(/\\s+/g, ' ').trim() : ''",
  );
}

async function assertDashboard(driver) {
  const state = await driver.state();
  must(state.view === '看板', `重载后不在看板：${state.view}/${state.sub}`);
  const text = await pageText(driver);
  must(text.includes('把零散的日子，慢慢整理起来。'), '看板主标题未出现，页面可能未正常加载');
}

async function clickEntry(driver, spec) {
  const entry = spec.entry;
  const matcher = {
    small: entry.small ?? null,
    title: entry.title || '',
    linkPrefix: entry.linkPrefix || '',
  };
  const found = await driver.eval(`(() => {
    const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const matcher = ${q(matcher)};
    const cards = [...document.querySelectorAll('#main .grid .card')];
    const labels = cards.map((card) => {
      const small = norm(card.querySelector('small')?.textContent || '');
      const title = norm(card.querySelector('h3')?.textContent || '');
      return small ? small + ' → ' + title : title;
    });
    const card = cards.find((card) => {
      const small = norm(card.querySelector('small')?.textContent || '');
      const title = norm(card.querySelector('h3')?.textContent || '');
      if (matcher.small !== null && small !== matcher.small) return false;
      if (matcher.title && title !== matcher.title) return false;
      return true;
    });
    if (!card) return { found: false, labels };
    const link = [...card.querySelectorAll('button.link, button[data-action="privacy"], button')].find((button) => {
      const text = norm(button.textContent);
      return matcher.linkPrefix ? text.startsWith(matcher.linkPrefix) : true;
    });
    if (!link) return { found: false, labels, reason: '卡片存在但没有匹配的入口按钮' };
    const small = norm(card.querySelector('small')?.textContent || '');
    const title = norm(card.querySelector('h3')?.textContent || '');
    document.querySelectorAll('[data-path-walk-entry]').forEach((el) => el.removeAttribute('data-path-walk-entry'));
    link.setAttribute('data-path-walk-entry', '1');
    return {
      found: true,
      rendered: small ? small + ' → ' + title : title,
      linkText: norm(link.textContent),
      dataset: { ...link.dataset },
    };
  })()`);
  if (!found.found) {
    throw new Error(
      `看板没有与文档入口「${entry.label}」匹配的卡片${found.reason ? `（${found.reason}）` : ''}；`
      + `当前任务卡：${(found.labels || []).join(' / ') || '无'}`,
    );
  }
  await driver.click('[data-path-walk-entry="1"]');
  return found;
}

async function assertDestination(driver, spec) {
  const state = await driver.state();
  if (spec.target.dialog) {
    must(state.dialogOpen, `点击入口后没有弹窗，当前 ${state.view}/${state.sub}`);
    must(
      state.dialogTitle === spec.target.dialog,
      `弹窗标题为「${state.dialogTitle}」，文档入口指向「${spec.target.dialog}」`,
    );
    return `弹窗「${state.dialogTitle}」`;
  }
  must(
    state.view === spec.target.view && state.sub === spec.target.sub,
    `落点为 ${state.view}/${state.sub}，文档期望 ${spec.target.view}/${spec.target.sub}`,
  );
  return `${state.view} / ${state.sub}`;
}

async function returnHome(driver) {
  if (await driver.eval("document.querySelector('#dialog')?.open === true")) {
    await driver.click('#close-dialog');
    await driver.waitFor("document.querySelector('#dialog').open === false", { label: '关闭弹窗' });
  }
  if (await driver.eval("document.querySelector('#pane')?.hidden === false")) {
    await driver.click('#pane-close');
    await driver.waitFor("document.querySelector('#pane').hidden === true", { label: '关闭草稿面板' });
  }
  await driver.click('.brand[data-view="看板"]');
  await driver.waitFor("state.view === '看板'", { label: '回到看板' });
  const text = await pageText(driver);
  must(text.includes('把零散的日子，慢慢整理起来。'), '点击顶栏品牌后没有回到看板主标题');
  return '点击顶栏品牌「✿ 小贝宝 BeiPal」→ 看板';
}

async function openAddDialog(driver, label, expectedTitle) {
  await driver.clickText(label, { scope: '#main' });
  await driver.waitFor("document.querySelector('#dialog').open === true", { label: '表单弹窗出现' });
  const title = await driver.text('#dialog-title');
  must(title === expectedTitle, `弹窗标题为「${title}」，期望「${expectedTitle}」`);
  return title;
}

async function saveDialog(driver, saveSelector) {
  const before = await driver.eval('state.records.length');
  await driver.click(saveSelector);
  await driver.waitFor(
    `document.querySelector('#dialog').open === false && state.records.length === ${before + 1}`,
    { label: '保存后弹窗关闭且记录 +1' },
  );
  return before + 1;
}

async function recordByText(driver, text) {
  return driver.eval(`(() => {
    const record = state.records.find((item) => item.text === ${q(text)});
    return record ? JSON.parse(JSON.stringify(record)) : null;
  })()`);
}

async function aiProbe(driver) {
  return driver.eval(`(() => {
    const buttons = [...document.querySelectorAll('#main button')]
      .map((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
    return {
      buttons,
      candidateNodes: document.querySelectorAll('#main [data-candidate], #main [data-accept], #main [data-parse-run]').length,
    };
  })()`);
}

async function checkAiRequired(driver, what) {
  const probe = await aiProbe(driver);
  const candidateControl = probe.candidateNodes > 0
    || probe.buttons.some((text) => /生成候选|逐项确认|采纳为记录|核对候选/.test(text));
  if (!candidateControl) {
    throw new Error(
      `未实现：${what}；页面没有候选生成、逐项核对或确认入口。可见按钮：${probe.buttons.join(' / ') || '无'}`,
    );
  }
  return `发现候选入口：${probe.buttons.filter((text) => /候选|核对|采纳/.test(text)).join(' / ')}`;
}

async function noteAiRedline(ctx, driver, requirement) {
  const probe = await aiProbe(driver);
  const candidateControl = probe.candidateNodes > 0
    || probe.buttons.some((text) => /生成候选|逐项确认|采纳为记录|核对候选/.test(text));
  if (candidateControl) {
    ctx.push('ai', '文档红线', 'FAIL', `文档要求「${requirement}」，但页面出现候选生成入口：${probe.buttons.join(' / ')}`);
  } else {
    ctx.push('ai', '文档红线', 'N/A', `文档要求「${requirement}」；页面未发现候选生成入口`);
  }
}

// ---------- 逐条路径 ----------

async function runS01(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：打开发作表单', async () => {
    const title = await openAddDialog(driver, '手工补一条', '手工补一条发作');
    return `点击「手工补一条」→「${title}」`;
  });
  await ctx.check('manual', '手工步骤：填写并保存发作', async () => {
    await driver.fill('#entry-date', '2026-11-01');
    await driver.fill('#entry-site', '合成部位');
    await driver.fill('#entry-text', TEXTS.S01);
    await driver.fill('#entry-source', '合成来源 · 走查');
    const count = await saveDialog(driver, '[data-action="save-episode"]');
    return `保存后记录数 ${count}`;
  });
  await ctx.check('product', '产物：发作记录 +1，结束未知可保留', async () => {
    const record = await recordByText(driver, TEXTS.S01);
    must(record, '页面状态中找不到新增的发作记录');
    must(record.kind === '发作记录', `新增记录 kind=${record.kind}，不是发作记录`);
    must(record.endDate === '', `未填结束日期却出现 endDate=${record.endDate}`);
    const count = await driver.eval("state.records.filter((item) => item.kind === '发作记录').length");
    must(count === 2, `发作记录应为 2 条（示例 1 + 新增 1），实际 ${count}`);
    must((await pageText(driver)).includes(TEXTS.S01), '发作记录页没有渲染新增原文');
    return '发作记录 1→2，结束日期保持未知，原文可见';
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '叙述生成候选 → 逐项确认'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS02(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：勾选两条同日记录', async () => {
    await driver.setChecked('[data-timeline-select="1"]', true);
    await driver.setChecked('[data-timeline-select="4"]', true);
    await driver.waitFor("document.querySelectorAll('#timeline-results article').length === 2", {
      label: '时间线出现两条所选记录',
    });
    return '真实点击两条记录复选框';
  });
  await ctx.check('product', '产物：同日并列 + 回源', async () => {
    const text = await driver.eval("document.querySelector('#timeline-results').innerText.replace(/\\s+/g, ' ').trim()");
    must(text.includes('2026-10-18'), '时间线没有按日分组标题 2026-10-18');
    must(text.includes('口腔科示例记录'), '缺少资料库 id4 的原文');
    must(text.includes('口腔不适，影响进食'), '缺少发作记录 id1 的原文');
    await driver.click('[data-timeline-source="4"]');
    await driver.waitFor("document.querySelector('#dialog').open === true", { label: '来源弹窗' });
    const title = await driver.text('#dialog-title');
    must(title === '记录来源', `回源弹窗标题为「${title}」`);
    const body = await dialogText(driver);
    must(body.includes('来源：'), '回源弹窗没有来源字段');
    must(body.includes('口腔科合成原件') || body.includes('合成原件'), '有原件记录未显示原件内容');
    await driver.click('#dialog-foot [data-action="cancel"]');
    await driver.waitFor("document.querySelector('#dialog').open === false", { label: '关闭来源弹窗' });
    return '两条记录按 2026-10-18 并列，回源弹窗含来源与合成原件';
  });
  await ctx.push('ai', 'AI 通道', 'PASS', '本路径 AI 要素是「选取已确认记录」，已由真实点击复选框完成（无生成动作）');
  ctx.note('示例数据没有冲突来源样本，本次只验证同日并列与回源，未验证冲突并列。');
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS03(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：查看审核状态及联系提示', async () => {
    const text = await pageText(driver);
    must(text.includes('尚待临床审核'), '求助信息页没有审核状态文字');
    const missing = [];
    if (!text.includes('来源')) missing.push('来源');
    if (!/联系[^。]{0,12}(医生|医疗|专业人员|急救)/.test(text)) missing.push('联系医疗专业人员的提示');
    if (missing.length) throw new Error(`页面只有一句占位，缺：${missing.join('、')}。原文：${text}`);
    return '审核状态与来源、求助指引均可见';
  });
  await ctx.check('product', '产物：来源/审核状态可查', async () => {
    await driver.click('#main [data-action="s03-sources"]');
    await driver.waitFor("document.querySelector('#dialog').open === true", { label: '来源和审核状态' });
    const body = await dialogText(driver);
    must(body.includes('未临床审核') && body.includes('0 次'), '未如实展示审核状态');
    must(body.includes('E08') && body.includes('全文未取得'), '来源和取得状态不完整');
    await driver.click('#dialog-foot [data-action="cancel"]');
    return '实际打开来源弹窗，核对未审核状态及来源取得情况';
  });
  await noteAiRedline(ctx, driver, '不做 AI 分诊');
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS04(ctx) {
  const driver = ctx.driver;
  const source = '合成血管报告抄录 · 走查';
  await ctx.check('manual', '手工步骤：打开血管资料表单', async () => {
    ctx.s04Baseline = await driver.eval(
      "state.records.filter((item) => item.kind === '血管资料' || item.kind === '血管').length",
    );
    const title = await openAddDialog(driver, '录入一条血管资料', '录入血管资料');
    const form = await driver.eval(`(() => ({
      hasText: !!document.querySelector('#v-text'),
      hasSource: !!document.querySelector('#v-source'),
      privateDefault: document.querySelector('#v-private')?.checked === true,
      examPrecision: document.querySelector('#v-exam-precision')?.value,
      reportPrecision: document.querySelector('#v-report-precision')?.value,
    }))()`);
    must(form.hasText && form.hasSource, '血管资料表单缺少原文或来源字段');
    must(form.privateDefault, '新增血管资料未默认勾选私密');
    must(form.examPrecision === 'unknown', `检查日期默认精度为 ${form.examPrecision}，未保持未知`);
    must(form.reportPrecision === 'unknown', `报告日期默认精度为 ${form.reportPrecision}，未保持未知`);
    return `点击「录入一条血管资料」→「${title}」；原文/来源可填，默认私密，检查与报告日期默认未知`;
  });
  await ctx.check('manual', '手工步骤：填写原文、检查日期并保存', async () => {
    await driver.fill('#v-exam-precision', 'day');
    await driver.fill('#v-exam-day', '2026-10-20');
    await driver.fill('#v-text', TEXTS.S04);
    await driver.fill('#v-source', source);
    const count = await saveDialog(driver, '[data-action="save-vascular"]');
    return `保存后记录数 ${count}（检查日期 2026-10-20，报告日期保持未知）`;
  });
  await ctx.check('product', '产物：材料 +1、无原件标记与回源', async () => {
    const record = await recordByText(driver, TEXTS.S04);
    must(record, '新增血管资料未进入页面状态');
    must(record.kind === '血管资料', `新增记录 kind=${record.kind}`);
    must(record.date === '2026-10-20' && record.datePrecision === 'day', `检查日期保存为 ${record.date}/${record.datePrecision}`);
    must(!record.reportDate && record.reportDatePrecision === 'unknown', `未填报告日期却得到 ${record.reportDate}/${record.reportDatePrecision}`);
    must(record.private === true, '新增血管资料没有按默认私密保存');
    must(record.fileId == null && !record.original, '未关联原件的记录却带有原件');
    must(record.source === source, `来源被改写为「${record.source}」`);

    const badge = await driver.text(`[data-no-original-badge="${record.id}"]`);
    must(badge && badge.includes('无原件'), `记录没有「无原件」标记，实际：${badge}`);

    const stats = await driver.eval(`(() => {
      const el = document.querySelector('#vascular-page [data-vascular-total]');
      const items = state.records.filter((item) => item.kind === '血管资料' || item.kind === '血管');
      return {
        total: el ? Number(el.dataset.vascularTotal) : null,
        withOriginal: el ? Number(el.dataset.vascularWithOriginal) : null,
        withoutOriginal: el ? Number(el.dataset.vascularWithoutOriginal) : null,
        records: items.length,
        withoutBadges: document.querySelectorAll('#vascular-page [data-no-original-badge]').length,
        rowText: (document.querySelector('[data-vascular-row="${record.id}"]') || {}).innerText || '',
      };
    })()`);
    must(stats.total === stats.records, `材料计数 ${stats.total} 与记录数 ${stats.records} 不一致`);
    must(stats.total === ctx.s04Baseline + 1, `材料计数未 +1：${ctx.s04Baseline} → ${stats.total}`);
    must(stats.withoutOriginal === stats.withoutBadges, `无原件计数 ${stats.withoutOriginal} 与标记数 ${stats.withoutBadges} 不一致`);
    must(stats.rowText.includes(source) && stats.rowText.includes('无原件'), '记录行未同时显示来源与无原件标记');

    await driver.click(`[data-vascular-source="${record.id}"]`);
    await driver.waitFor("document.querySelector('#dialog').open === true", { label: '血管资料回源弹窗' });
    const title = await driver.text('#dialog-title');
    must(title === '血管资料回源', `回源弹窗标题为「${title}」`);
    const body = await dialogText(driver);
    must(body.includes(TEXTS.S04), '回源弹窗没有显示本人抄录原文');
    must(body.includes(source), '回源弹窗没有显示来源');
    must(body.includes('检查日期：2026-10-20'), '回源弹窗没有显示检查日期');
    must(body.includes('报告日期：日期未知'), '回源弹窗把未知报告日期补造为具体日期');
    must(body.includes('无原件') && body.includes('原件缺失'), '回源弹窗没有说明原件缺失');
    await driver.click('#dialog-foot [data-action="cancel"]');
    await driver.waitFor("document.querySelector('#dialog').open === false", { label: '关闭回源弹窗' });
    return `血管资料 ${ctx.s04Baseline}→${stats.total}；检查 2026-10-20 / 报告未知；无原件标记 ${stats.withoutOriginal} 条；回源弹窗含原文、来源与缺失说明`;
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '上传资料生成候选 → 逐项确认'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS05(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：分别记录症状与检查', async () => {
    await openAddDialog(driver, '手工补一条', '手工补一条');
    await driver.fill('#entry-date', '2026-11-01');
    await driver.fill('#entry-text', TEXTS.S05);
    await saveDialog(driver, '[data-action="save"]');
    const record = await recordByText(driver, TEXTS.S05);
    must(record, '新增记录未进入页面状态');
    const addLabels = await driver.eval(
      "[...document.querySelectorAll('#main button')].map((button) => button.textContent.replace(/\\s+/g, ' ').trim())",
    );
    const hasSeparateCheck = addLabels.some((text) => /检查|化验|报告/.test(text) && text !== '用药前检查记录');
    must(hasSeparateCheck, `没有单独的「检查」记录入口，页面按钮：${addLabels.join(' / ')}`);
    await driver.click('[data-action="add-check"]');
    await driver.waitFor("document.querySelector('#dialog').open === true", { label: '检查表单出现' });
    const checkTitle = await driver.text('#dialog-title');
    must(checkTitle === '手工补检查', `检查弹窗标题为「${checkTitle}」`);
    await driver.fill('#entry-date', '2026-09-15');
    await driver.fill('#entry-text', TEXTS.S05 + '：肠道检查');
    await driver.fill('#entry-source', '合成检查抄录 · 走查');
    await saveDialog(driver, '[data-action="save"]');
    const symptom = await recordByText(driver, TEXTS.S05);
    const exam = await recordByText(driver, TEXTS.S05 + '：肠道检查');
    must(symptom && symptom.kind === '消化症状', `症状记录类型为 ${symptom && symptom.kind}`);
    must(symptom.source === '', `空来源被伪造成「${symptom.source}」`);
    must(exam && exam.kind === '消化道检查', `检查记录类型为 ${exam && exam.kind}`);
    must(exam.source === '合成检查抄录 · 走查', `检查来源被改写为「${exam.source}」`);
    return '症状与检查各有一条记录；空来源保持为空';
  });
  await ctx.check('product', '产物：症状与检查按时间并列', async () => {
    const rows = await driver.eval(
      `(() => [...document.querySelectorAll('#digestive-page .digest-day')].map((row) => ({
        date: row.dataset.digestDate,
        precision: row.dataset.digestPrecision,
        symptom: (row.querySelector('[data-digest-kind="消化症状"]') || {}).innerText || '',
        exam: (row.querySelector('[data-digest-kind="消化道检查"]') || {}).innerText || '',
      })))()`,
    );
    must(rows.length >= 2, `并列行数不足：${rows.length}`);
    must(rows[0].date === '2026-11-01' && rows[0].precision === 'day', `症状行日期/精度不正确：${rows[0].date}/${rows[0].precision}`);
    must(rows[1].date === '2026-09-15' && rows[1].precision === 'day', `检查行日期/精度不正确：${rows[1].date}/${rows[1].precision}`);
    const symptomRow = rows[0], examRow = rows[1];
    must(symptomRow.symptom.includes(TEXTS.S05), '症状原文未出现在 2026-11-01 的症状栏');
    must(symptomRow.symptom.includes('来源：未填写'), '症状栏空来源未显示为未填写');
    must(!symptomRow.exam.includes(TEXTS.S05), '症状原文混入 2026-11-01 的检查栏');
    must(symptomRow.exam.includes('未记录'), '症状日期的检查栏未显示未记录');
    must(examRow.exam.includes(TEXTS.S05 + '：肠道检查'), '检查原文未出现在 2026-09-15 的检查栏');
    must(examRow.exam.includes('来源：合成检查抄录 · 走查'), '检查栏未单独显示来源');
    must(!examRow.symptom.includes('肠道检查'), '检查原文混入 2026-09-15 的症状栏');
    must(examRow.symptom.includes('未记录'), '检查日期的症状栏未显示未记录');
    const board = await driver.eval("document.querySelector('#digestive-page')?.innerText || ''");
    must(!board.includes('本人记录 · 本次演示'), '并列视图把空来源伪造成本人记录来源');
    must(board.includes('不推断因果'), '并列视图未声明不推断因果');
    return `症状/检查各 1 条，按日期 ${rows[0].date} → ${rows[1].date} 分栏并列；空来源显示未填写，检查来源单独显示，声明不推断因果`;
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '症状与检查分别生成候选'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS06(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：打开治疗表单', async () => {
    const title = await openAddDialog(driver, '手工补一条', '记录治疗');
    return `点击「手工补一条」→「${title}」`;
  });
  await ctx.check('manual', '手工步骤：填写并保存治疗', async () => {
    await driver.fill('#t-drug', '走查合成药名');
    await driver.fill('#t-text', TEXTS.S06);
    await driver.fill('#t-source', '合成处方抄录 · 走查');
    const count = await saveDialog(driver, '[data-action="save-treatment"]');
    return `保存后记录数 ${count}（剂量留空）`;
  });
  await ctx.check('product', '产物：治疗记录 +1，缺剂量显示未知', async () => {
    const record = await recordByText(driver, TEXTS.S06);
    must(record, '找不到新增治疗记录');
    must(record.kind === '当前用药', `新增记录 kind=${record.kind}`);
    must(record.dose === '', `剂量未填却得到「${record.dose}」`);
    must((await pageText(driver)).includes('剂量原文：未知'), '治疗列表没有显示「剂量原文：未知」');
    return '治疗记录 2→3，剂量留空显示未知';
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '叙述生成药名/剂量原文候选'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS07(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：打开医嘱表单', async () => {
    const title = await openAddDialog(driver, '记录一条医嘱', '记录医嘱');
    return `点击「记录一条医嘱」→「${title}」`;
  });
  await ctx.check('manual', '手工步骤：抄录并保存医嘱', async () => {
    await driver.fill('#a-text', TEXTS.S07);
    await driver.fill('#a-source', '合成纸质医嘱 · 走查');
    await driver.fill('#a-proposer', '合成复诊医生');
    const count = await saveDialog(driver, '[data-action="save-advice"]');
    return `保存后记录数 ${count}（复查日期留空）`;
  });
  await ctx.check('product', '产物：原文/来源可回看，不推算间隔', async () => {
    const record = await recordByText(driver, TEXTS.S07);
    must(record, '找不到新增医嘱记录');
    must(record.kind === '医嘱记录', `新增记录 kind=${record.kind}`);
    must(record.reviewDate === '', `复查日期未填却得到「${record.reviewDate}」`);
    const text = await pageText(driver);
    must(text.includes(TEXTS.S07), '医嘱页没有渲染原文');
    must(text.includes('拟复查日期：未知'), '医嘱页没有显示「拟复查日期：未知」');
    must(!/\d{4}-\d{2}-\d{2}[^。]{0,12}复查/.test(text), '页面自动补出了具体复查日期');
    return '医嘱记录 0→1，原文/来源可见，复查日期未知且无自动补日期';
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '整理医嘱原文候选'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS08(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：输入本人描述', async () => {
    await openAddDialog(driver, '手工补一条', '手工补一条');
    await driver.fill('#entry-date', '2026-11-01');
    await driver.fill('#entry-text', TEXTS.S08);
    const count = await saveDialog(driver, '[data-action="save"]');
    return `保存后记录数 ${count}`;
  });
  await ctx.check('product', '产物：影响记录 +1，不作疾病分级', async () => {
    const record = await recordByText(driver, TEXTS.S08);
    must(record, '找不到新增生活影响记录');
    must(record.kind === '工作·费用·异地就医', `新增记录 kind=${record.kind}`);
    const text = await pageText(driver);
    must(text.includes(TEXTS.S08), '页面没有渲染本人描述');
    must(!/疾病分级|活动度评分|严重程度评分/.test(text), '页面出现疾病分级/评分');
    return '生活影响记录 +1，页面未出现分级评分';
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '叙述生成生活影响候选'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS09(ctx) {
  const driver = ctx.driver;
  const privateText = '下次复诊想问的问题（示例）';
  await ctx.check('manual', '手工步骤：本人逐条选择私密属性', async () => {
    const panel = await driver.eval(`(() => {
      const dialog = document.querySelector('#dialog');
      return {
        toggles: dialog.querySelectorAll('[data-record-private]').length,
        includes: dialog.querySelectorAll('[data-privacy-include]').length,
        body: dialog.querySelector('#dialog-body')?.innerText.replace(/\\s+/g, ' ').trim() || '',
      };
    })()`);
    must(panel.toggles > 0, '弹窗没有逐条私密开关');
    must(panel.includes > 0, '弹窗没有逐条「本次纳入」控件');
    must(panel.body.includes('不宣称加密'), '弹窗没有说明不宣称加密/真实权限');
    must(panel.body.includes('AI 草稿始终排除私密'), '弹窗没有说明 AI 始终排除私密');
    must(await driver.isChecked('[data-record-private="3"]'), '示例私密记录未显示为已私密');
    must(!(await driver.isChecked('[data-privacy-include="3"]')), '私密记录默认被纳入摘要/导出');
    const state = await driver.state();
    must(!state.selected.includes(3), `初始选择集包含了私密记录：${state.selected.join(',')}`);
    return `逐条开关 ${panel.toggles} 个、纳入控件 ${panel.includes} 个；私密默认未纳入`;
  });
  await ctx.check('product', '产物：私密记录默认不进摘要/导出', async () => {
    await driver.click('#dialog-foot [data-action="cancel"]');
    await driver.waitFor("document.querySelector('#dialog').open === false", { label: '关闭逐条私密标记' });
    await driver.clickText('复诊与准备', { selector: 'button', scope: '#nav' });
    await driver.waitFor("state.view === '复诊与准备'", { label: '打开复诊与准备' });
    await driver.clickText('就诊准备与导出', { selector: '[role="tab"]', scope: '#main' });
    await driver.waitFor("state.sub === '就诊准备与导出'", { label: '打开摘要/导出' });
    const preview = await driver.eval("document.querySelector('#export-preview')?.innerText || ''");
    must(!preview.includes(privateText), '未显式纳入时摘要/导出预览包含私密记录');
    must(!preview.includes('【私密】'), '未显式纳入时摘要/导出预览出现【私密】标记');
    const state = await driver.state();
    must(!state.selected.includes(3), `未显式纳入时私密记录进入选择集：${state.selected.join(',')}`);
    await driver.click('.brand[data-view="看板"]');
    await driver.waitFor("state.view === '看板'", { label: '回到看板' });
    await driver.click('[data-action="privacy"]');
    await driver.waitFor("document.querySelector('#dialog').open === true", { label: '重新打开逐条私密标记' });
    return '未勾选「本次纳入」时，摘要/导出预览不含私密原文，也没有【私密】标记';
  });
  await ctx.check('manual', '手工步骤：逐条显式纳入私密记录', async () => {
    await driver.setChecked('[data-privacy-include="3"]', true);
    await driver.waitFor('state.selected.has(3)', { label: '显式纳入私密记录' });
    const body = await dialogText(driver);
    must(body.includes('私密已显式纳入 1'), `显式纳入计数未更新：${body}`);
    must(await driver.isChecked('[data-record-private="3"]'), '显式纳入不应取消私密属性');
    return '勾选「本次纳入」后私密记录进入选择集，私密属性保持不变';
  });
  await ctx.check('product', '产物：摘要/导出可显式纳入私密，AI 始终排除', async () => {
    await driver.click('#dialog-foot [data-action="privacy-visit"]');
    await driver.waitFor(
      "document.querySelector('#dialog').open === false && state.view === '复诊与准备' && state.sub === '就诊准备与导出'",
      { label: '去就诊准备逐条核对' },
    );
    const preview = await driver.eval("document.querySelector('#export-preview')?.innerText || ''");
    must(preview.includes(privateText), '显式纳入后摘要预览仍不含该私密记录');
    must(preview.includes('【私密】'), '显式纳入后摘要预览没有标记【私密】');
    await driver.clickText('和 AI 讨论', { scope: '#main' });
    await driver.waitFor("document.querySelector('#pane').hidden === false", { label: '打开 AI 草稿面板' });
    const draft = await driver.eval("document.querySelector('#draft').value");
    must(!draft.includes(privateText), 'AI 草稿包含了已显式纳入的私密记录');
    must((await driver.state()).selected.includes(3), '生成 AI 草稿不应改变摘要/导出选择');
    await driver.click('#pane-close');
    await driver.waitFor("document.querySelector('#pane').hidden === true", { label: '关闭草稿面板' });
    return '摘要含【私密】与原文；AI 草稿仍排除，选择集未变';
  });
  await ctx.check('product', '产物：标私密移出已有选择并清草稿', async () => {
    await driver.click('.brand[data-view="看板"]');
    await driver.waitFor("state.view === '看板'", { label: '回到看板' });
    await driver.click('[data-action="privacy"]');
    await driver.waitFor("document.querySelector('#dialog').open === true", { label: '再次打开私密标记' });
    await driver.setChecked('[data-record-private="1"]', true);
    await driver.waitFor("state.records.find((r) => r.id === 1)?.private === true", { label: '记录标为私密' });
    const state = await driver.state();
    must(!state.selected.includes(1), '标私密后仍留在摘要/导出选择集');
    must(!state.timelineSelected.includes(1), '标私密后仍留在时间线选择集');
    const draft = await driver.eval("document.querySelector('#draft').value");
    must(draft === '', '标私密后未清空 AI 草稿');
    const body = await dialogText(driver);
    must(body.includes('私密 2'), `私密计数未更新：${body}`);
    return '公开记录 1 标私密后移出选择集与时间线，AI 草稿清空';
  });
  await ctx.push('ai', 'AI 默认通道', 'PASS', '真实生成草稿时验证私密记录被排除；原型没有发送通道，未发送任何内容');
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS10(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：录入检验日期/值/单位/方法/来源', async () => {
    const buttons = await driver.eval(
      "[...document.querySelectorAll('#main button')].map((button) => button.textContent.replace(/\\s+/g, ' ').trim())",
    );
    const hasEntry = buttons.some((text) => /手工|录入|新增/.test(text));
    must(hasEntry, `「整理草稿 / 核对」页没有手工录入控件，只有：${buttons.join(' / ')}`);
    return '存在手工录入入口';
  });
  await ctx.check('product', '产物：检验记录 +1，不可比不连线', async () => {
    throw new Error('该页只是说明 + 跳转资料目录/资料库，没有报告导入或检验记录录入；指标页也只有只读示例卡');
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '报告生成逐项候选'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS11(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：以代记者身份记录', async () => {
    const controls = await driver.eval(`(() => {
      const dialog = document.querySelector('#dialog');
      return [...dialog.querySelectorAll('input:not([type="hidden"]), select, textarea')].map((el) => el.id || el.tagName);
    })()`);
    must(controls.length > 0, '入口只打开授权说明弹窗，没有代记者身份或授权范围表单');
    return '存在代记表单';
  });
  await ctx.check('product', '产物：记录主体/授权可见，未授权拒绝写入', async () => {
    const body = await dialogText(driver);
    throw new Error(`代记仅为占位说明（「${body.slice(0, 60)}…」），没有记录主体、授权范围或未授权拒绝写入的可观察行为`);
  });
  await ctx.check('ai', 'AI 默认通道', async () => {
    throw new Error('入口仅打开授权说明弹窗，未进入代记记录表单；授权范围内的候选通道无法触发');
  });
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS12(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：选择/取消资料与问题', async () => {
    const preview = await driver.eval("document.querySelector('#export-preview')?.innerText || ''");
    must(preview.includes('输出预览'), '就诊准备页没有输出预览');
    must(preview.includes('资料（5）'), `默认预览资料数不是 5：${preview.slice(0, 80)}`);
    await driver.setChecked('[data-select="4"]', false);
    await driver.waitFor(
      "document.querySelector('#export-preview').innerText.includes('资料（4）')",
      { label: '取消一条资料后预览更新' },
    );
    await driver.setChecked('[data-select="4"]', true);
    await driver.waitFor(
      "document.querySelector('#export-preview').innerText.includes('资料（5）')",
      { label: '恢复资料后预览更新' },
    );
    return '复选框真实点击，预览 5→4→5 即时更新';
  });
  await ctx.check('product', '产物：材料包预览 + 导出失败保留选择', async () => {
    const before = await driver.eval('state.selected.size');
    await driver.clickText('下载所选文本', { scope: '#main' });
    await driver.waitFor(
      "document.querySelector('#export-status')?.textContent.includes('已发起下载')",
      { label: '导出状态提示' },
    );
    const after = await driver.eval('state.selected.size');
    must(after === before, `导出后选择数变化：${before}→${after}`);
    return `预览可读，点击导出后状态提示出现，选择数保持 ${after}；未强制导出失败分支`;
  });
  await ctx.check('ai', 'AI 默认通道', () => checkAiRequired(driver, '所选记录生成问题候选'));
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS13(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：本人输入私密问题', async () => {
    await openAddDialog(driver, '手工补一条', '手工补一条');
    const privateChecked = await driver.isChecked('#entry-private');
    must(privateChecked === true, '「问题清单」的私密复选框默认未勾选');
    await driver.fill('#entry-date', '2026-11-02');
    await driver.fill('#entry-text', TEXTS.S13);
    const count = await saveDialog(driver, '[data-action="save"]');
    return `私密默认勾选，保存后记录数 ${count}`;
  });
  await ctx.check('product', '产物：私密问题 +1', async () => {
    const record = await recordByText(driver, TEXTS.S13);
    must(record, '找不到新增私密问题');
    must(record.kind === '问题清单', `新增记录 kind=${record.kind}`);
    must(record.private === true, '新增问题没有保持私密属性');
    must((await pageText(driver)).includes(TEXTS.S13), '问题清单没有渲染新增内容');
    return '问题清单 1→2，新增条目标记私密';
  });
  await ctx.check('product', '产物：默认不进入导出', async () => {
    await driver.clickText('复诊与准备', { scope: '#nav', selector: 'button' });
    await driver.waitFor("state.view === '复诊与准备'", { label: '导航到复诊与准备' });
    await driver.clickText('就诊准备与导出', { scope: '#main', selector: '[role="tab"]' });
    await driver.waitFor("state.sub === '就诊准备与导出'", { label: '切到就诊准备与导出' });
    const preview = await driver.eval("document.querySelector('#export-preview')?.innerText || ''");
    must(!preview.includes(TEXTS.S13), '私密问题未经选择就出现在导出预览中');
    return '导出预览不含该私密问题';
  });
  await ctx.check('product', '产物：默认不进入 AI 草稿', async () => {
    await driver.clickText('和 AI 讨论', { scope: '#main' });
    await driver.waitFor("document.querySelector('#pane').hidden === false", { label: '草稿面板打开' });
    const draft = await driver.eval("document.querySelector('#draft').value");
    must(!draft.includes(TEXTS.S13), '私密问题未经选择就出现在 AI 草稿中');
    await driver.click('#pane-close');
    await driver.waitFor("document.querySelector('#pane').hidden === true", { label: '关闭草稿面板' });
    return 'AI 草稿仅含非私密记录，不含该问题';
  });
  await noteAiRedline(ctx, driver, '不自动生成敏感问题');
  await ctx.check('return', '回首页', () => returnHome(driver));
}

async function runS15(ctx) {
  const driver = ctx.driver;
  await ctx.check('manual', '手工步骤：抄录检查名/日期/来源', async () => {
    await openAddDialog(driver, '手工补一条', '手工补一条');
    await driver.fill('#entry-date', '2026-11-03');
    await driver.fill('#entry-text', TEXTS.S15);
    const count = await saveDialog(driver, '[data-action="save"]');
    return `保存后记录数 ${count}`;
  });
  await ctx.check('product', '产物：纯抄录，无缺项/用药建议', async () => {
    const record = await recordByText(driver, TEXTS.S15);
    must(record, '找不到新增用药前检查记录');
    must(record.kind === '用药前检查记录', `新增记录 kind=${record.kind}`);
    const text = await pageText(driver);
    for (const forbidden of ['缺项', '还差', '可以开始用药']) {
      must(!text.includes(forbidden), `页面出现禁用措辞「${forbidden}」`);
    }
    must(text.includes(TEXTS.S15), '页面没有渲染新增抄录内容');
    return '记录 +1，页面无「缺项/还差/可以开始用药」';
  });
  await noteAiRedline(ctx, driver, 'AI 通道留空：不生成、不比对缺项');
  await ctx.check('return', '回首页', () => returnHome(driver));
}

const SPECS = [
  {
    id: 'S01', title: '记录发作', entry: { label: '今天要记什么 → 记录发作', small: '今天要记什么', title: '记录发作' },
    target: { view: '发作与病程', sub: '发作记录' }, run: runS01,
  },
  {
    id: 'S02', title: '跨科时间线', entry: { label: '时间线上看变化 → 跨科时间线', small: '时间线上看变化', title: '跨科时间线' },
    target: { view: '病情一图秀', sub: '治疗与事件节点' }, run: runS02,
  },
  {
    id: 'S03', title: '求助信息', entry: { label: '安全提示 → 求助信息', small: '安全提示', title: '求助信息' },
    target: { view: '复诊与准备', sub: '什么情况要马上就医' }, run: runS03,
  },
  {
    id: 'S04', title: '血管资料', entry: { label: '资料整理 → 血管资料', small: '资料整理', title: '血管资料' },
    target: { view: '器官与专科', sub: '血管' }, run: runS04,
  },
  {
    id: 'S05', title: '消化症状', entry: { label: '今天要记什么 → 消化症状', small: '今天要记什么', title: '消化症状' },
    target: { view: '器官与专科', sub: '消化道' }, run: runS05,
  },
  {
    id: 'S06', title: '记录治疗', entry: { label: '用药 → 记录治疗', small: '用药', title: '记录治疗' },
    target: { view: '治疗与用药', sub: '当前用药' }, run: runS06,
  },
  {
    id: 'S07', title: '记录医嘱', entry: { label: '下次复诊 → 记录医嘱', small: '下次复诊', title: '记录医嘱' },
    target: { view: '复诊与准备', sub: '医嘱记录' }, run: runS07,
  },
  {
    id: 'S08', title: '生活影响', entry: { label: '今天要记什么 → 生活影响', small: '今天要记什么', title: '生活影响' },
    target: { view: '长期与生活', sub: '工作·费用·异地就医' }, run: runS08,
  },
  {
    id: 'S09', title: '私密标记', entry: { label: '只给我自己看 → 私密标记', small: '', title: '只给我自己看', linkPrefix: '私密标记' },
    target: { dialog: '授权与隐私' }, run: runS09,
  },
  {
    id: 'S10', title: '整理报告', entry: { label: '最近检查 → 整理报告', small: '最近检查', title: '整理报告' },
    target: { view: '病情整理', sub: '整理草稿 / 核对' }, run: runS10,
  },
  {
    id: 'S11', title: '以代记者身份记录', entry: { label: '家人帮我记 → 以代记者身份记录', small: '家人帮我记', title: '以代记者身份记录' },
    target: { dialog: '授权与隐私' }, run: runS11,
  },
  {
    id: 'S12', title: '准备材料', entry: { label: '下次复诊 → 准备材料', small: '下次复诊', title: '准备材料' },
    target: { view: '复诊与准备', sub: '就诊准备与导出' }, run: runS12,
  },
  {
    id: 'S13', title: '私密问题', entry: { label: '只给我自己看 → 私密问题', small: '只给我自己看', title: '私密问题' },
    target: { view: '复诊与准备', sub: '问题清单' }, run: runS13,
  },
  {
    id: 'S14', title: '查看来源', entry: { label: '支持资源 → 查看来源', small: '支持资源', title: '查看来源' },
    target: { view: null, sub: null }, run: null,
    notes: ['文档自己写明 S14 暂缓；本次走查同时核对看板没有「支持资源 → 查看来源」入口。'],
  },
  {
    id: 'S15', title: '用药前检查记录', entry: { label: '用药 → 用药前检查记录', small: '用药', title: '用药前检查记录' },
    target: { view: '治疗与用药', sub: '用药前检查记录' }, run: runS15,
  },
];

// ---------- 执行 ----------

async function runPath(driver, spec) {
  const ctx = new PathContext(driver, spec);
  const startedAt = Date.now();

  await ctx.check('entry', '入口点击', async () => {
    await driver.reload();
    await assertDashboard(driver);
    const found = await clickEntry(driver, spec);
    ctx.reached = true;
    ctx.entryRendered = `${found.rendered}（按钮「${found.linkText}」）`;
    const dataset = Object.entries(found.dataset || {})
      .filter(([key]) => key !== 'pathWalkEntry')
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    return `看板「${found.rendered}」→ 真实点击「${found.linkText}」${dataset ? `（${dataset}）` : ''}`;
  });
  await ctx.check('destination', '目标页', () => assertDestination(driver, spec));

  for (const note of spec.notes || []) ctx.note(note);
  if (ctx.reached && spec.run) {
    await spec.run(ctx);
  } else if (!ctx.reached) {
    ctx.push('manual', '手工步骤', 'NOT_RUN', '入口未到达，未执行');
    ctx.push('product', '产物', 'NOT_RUN', '入口未到达，未执行');
    ctx.push('ai', 'AI 通道', 'NOT_RUN', '入口未到达，未执行');
    ctx.push('return', '回首页', 'NOT_RUN', '入口未到达，未执行');
  }

  return ctx.result(Date.now() - startedAt);
}

function renderHuman(report) {
  console.log('');
  console.log('小贝宝 v0.2 单 HTML 原型 · 文档路径走查');
  console.log(`原型：${report.prototype.relativePath}`);
  console.log(`SHA-256：${report.prototype.sha256}${report.prototype.unchanged ? '（走查前后未变化）' : '（走查期间发生变化！）'}`);
  console.log(`浏览器：${report.chromium.version}（${report.chromium.path}），视口 ${report.viewport.width}×${report.viewport.height}`);
  console.log(`路径：docs/INTERACTION-DESIGN.md §2.0 S01–S15（共 ${report.summary.total} 条）`);
  console.log('');
  console.log('方法：每条路径先 Page.reload 隔离；看板入口与所有按钮均用 CDP 真实鼠标事件，'
    + '点击前校验 elementFromPoint 命中；表单值用 DOM setter + input/change 写入（无头环境不逐字敲键盘）。');
  console.log('判据：入口点击 / 目标页 / 手工步骤 / 产物 / AI 默认通道 / 回首页 全部 PASS 才算 PASS；'
    + '文档明确写「—」的 AI 红线记 N/A。');
  console.log('');
  console.table(report.paths.map((path) => ({
    ID: path.id,
    场景: path.title,
    入口: path.checks.find((check) => check.kind === 'entry')?.status || '—',
    手工产物: path.manualOutcome,
    AI通道: path.aiOutcome,
    回首页: path.returnOutcome,
    结论: path.status,
    失败定位: path.failedChecks.map((check) => check.name).join('、') || '',
  })));
  console.log(`结论：PASS ${report.summary.pass}/${report.summary.total}；FAIL ${report.summary.fail}`
    + `（手工/产物未成立 ${report.summary.failManual} 条，仅 AI 默认通道缺失 ${report.summary.failAiOnly} 条）`);
  console.log('');
  console.log('失败明细：');
  for (const path of report.paths.filter((item) => item.status !== 'PASS')) {
    console.log(`  ${path.id} ${path.title} [${path.manualOutcome}/${path.aiOutcome}]`);
    for (const check of path.failedChecks) console.log(`    - ${check.name}：${check.detail}`);
    for (const note of path.notes) console.log(`    · 备注：${note}`);
  }
  const passIds = report.paths.filter((path) => path.status === 'PASS').map((path) => path.id);
  console.log('');
  console.log(`PASS：${passIds.join('、') || '无'}`);
  console.log(`逐条检查：${report.paths.reduce((sum, path) => sum + path.checks.length, 0)} 项；`
    + `其中 NOT_RUN ${report.paths.flatMap((path) => path.checks).filter((check) => check.status === 'NOT_RUN').length} 项。`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1].split(',').map((item) => item.trim())) : null;
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;

  const specs = SPECS.filter((spec) => !only || only.has(spec.id));
  const before = await readFile(PROTOTYPE_PATH);
  const beforeHash = sha256(before);
  const chromiumVersion = (() => {
    const result = spawnSync(CHROMIUM, ['--version'], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : `不可用（${result.error?.message || result.stderr?.trim()}）`;
  })();

  let session;
  let report;
  try {
    session = await openSession({ chromium: CHROMIUM });
    await session.goto(PROTOTYPE_URL);
    const results = [];
    for (const spec of specs) {
      const result = await runPath(session, spec);
      results.push(result);
      if (!json) {
        console.error(`${result.status === 'PASS' ? '✓' : '✗'} ${result.id} ${result.title}（${result.durationMs}ms）`);
      }
    }
    const after = await readFile(PROTOTYPE_PATH);
    const afterHash = sha256(after);
    report = {
      generatedAt: new Date().toISOString(),
      prototype: {
        relativePath: 'prototypes/v0.2/index.html',
        sha256: beforeHash,
        afterSha256: afterHash,
        unchanged: beforeHash === afterHash,
      },
      chromium: { path: CHROMIUM, version: chromiumVersion },
      viewport: { width: 1280, height: 900 },
      criteria: CRITERIA,
      method: {
        navigation: 'CDP Input.dispatchMouseEvent（mousePressed/mouseReleased），点击前 elementFromPoint 校验命中；不调用 go()',
        formInput: '原生 value setter + input/change 事件（无头环境无法可靠逐字键盘输入）',
        isolation: '每条路径 Page.reload，重置页面内存状态',
        dom: '每次 render 后重新查询元素，不缓存按钮节点',
        indexModified: false,
      },
      summary: summarize(results),
      paths: results,
      harnessErrors: [],
    };
    if (!report.prototype.unchanged) report.harnessErrors.push('走查期间 index.html 的 SHA-256 发生变化');
    if (session.exceptions.length) {
      report.pageExceptions = [...new Set(session.exceptions)];
    }
  } catch (error) {
    report = {
      generatedAt: new Date().toISOString(),
      fatal: true,
      error: error.stack || error.message,
      chromium: { path: CHROMIUM, version: chromiumVersion },
      summary: { total: specs.length, pass: 0, fail: specs.length, failManual: specs.length, failAiOnly: 0 },
      paths: [],
      harnessErrors: [error.message],
    };
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(`走查未能完成：${error.stack || error.message}`);
    }
    process.exitCode = 2;
    return;
  } finally {
    await session?.close();
  }

  if (outPath) await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderHuman(report);
    if (outPath) console.error(`JSON 已写入 ${outPath}`);
  }
  if (report.harnessErrors.length || report.summary.pass !== report.summary.total) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 2;
});