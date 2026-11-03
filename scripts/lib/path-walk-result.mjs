// 走查结果聚合：PASS 只在全部检查为 PASS（或文档明确写「—」的 N/A）时成立。
// 单独抽出便于用单元测试锁住“有失败仍报绿”的回归。

export const CHECK_KINDS = ['entry', 'destination', 'manual', 'product', 'ai', 'return'];

export function aggregateChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return { status: 'FAIL', reason: '没有任何检查记录' };
  }
  const bad = checks.filter((check) => check.status !== 'PASS' && check.status !== 'N/A');
  if (bad.length) {
    return {
      status: 'FAIL',
      reason: bad.map((check) => `${check.name}：${check.detail || check.status}`).join('；'),
    };
  }
  return { status: 'PASS', reason: '' };
}

export function outcomeOf(checks, kinds) {
  const relevant = checks.filter((check) => kinds.includes(check.kind));
  if (!relevant.length) return 'NOT_RUN';
  if (relevant.some((check) => check.status === 'FAIL')) return 'FAIL';
  if (relevant.some((check) => check.status === 'NOT_RUN')) return 'NOT_RUN';
  if (relevant.every((check) => check.status === 'N/A')) return 'N/A';
  if (relevant.some((check) => check.status === 'PASS')) return 'PASS';
  return 'N/A';
}

export function buildPathResult(spec, checks, { entryRendered = '', notes = [], durationMs = 0 } = {}) {
  const aggregate = aggregateChecks(checks);
  return {
    id: spec.id,
    title: spec.title,
    entry: spec.entry?.label || '—',
    entryRendered,
    status: aggregate.status,
    reason: aggregate.reason,
    manualOutcome: outcomeOf(checks, ['entry', 'destination', 'manual', 'product']),
    aiOutcome: outcomeOf(checks, ['ai']),
    returnOutcome: outcomeOf(checks, ['return']),
    failedChecks: checks
      .filter((check) => check.status === 'FAIL')
      .map((check) => ({ name: check.name, detail: check.detail })),
    checks,
    notes,
    durationMs,
  };
}

export function summarize(paths) {
  const total = paths.length;
  const pass = paths.filter((path) => path.status === 'PASS').length;
  const failManual = paths.filter((path) => path.status === 'FAIL' && path.manualOutcome !== 'PASS').length;
  const failAiOnly = paths.filter((path) => path.status === 'FAIL' && path.manualOutcome === 'PASS').length;
  return {
    total,
    pass,
    fail: total - pass,
    failManual,
    failAiOnly,
  };
}