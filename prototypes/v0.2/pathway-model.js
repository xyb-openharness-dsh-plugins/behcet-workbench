// 治疗阶段折叠卡的读模型：只从当前记录与指标重述，不推断阶段、疗效或因果。
// 五块固定顺序；缺内容写「无记录」+说明，不省略块；私密阶段只显示记录存在。
window.BEIPAL_PATHWAY_MODEL = (function () {
  const BLOCKS = [
    ['regimen', '方案'],
    ['metrics', '指标和趋势'],
    ['imaging', '影像发现'],
    ['ae', '副作用总结'],
    ['support', '心理/营养措施和效果']
  ];
  const NO_DATA = '无记录';

  const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const isMonth = v => /^\d{4}-\d{2}$/.test(String(v || ''));

  function precision(r) {
    const d = String((r && r.date) || '');
    const declared = String((r && r.datePrecision) || '');
    if (declared) {
      if (declared === 'day' && isDay(d)) return 'day';
      if (declared === 'month' && isMonth(d)) return 'month';
      return 'unknown';
    }
    if (isDay(d)) return 'day';
    if (isMonth(d)) return 'month';
    return 'unknown';
  }

  function lastDayOfMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  function dateLabel(r) {
    const p = precision(r);
    if (p === 'day') return r.date;
    if (p === 'month') return r.date + '（仅月份）';
    return '日期未知';
  }

  function startKey(r) {
    const p = precision(r);
    if (p === 'day') return r.date;
    if (p === 'month') return r.date + '-01';
    return '9999-99-99';
  }

  function stageRange(r) {
    const p = precision(r);
    if (p === 'unknown') return null;
    const start = p === 'day' ? r.date : r.date + '-01';
    let end = null;
    if (r.ongoing) end = null;
    else if (isDay(r.endDate)) end = r.endDate;
    else if (isMonth(r.endDate)) end = lastDayOfMonth(r.endDate);
    return { start, end, precision: p };
  }

  function text(v, fallback = '未记录') {
    return v === undefined || v === null || String(v).trim() === '' ? fallback : String(v);
  }

  // 与 metric-model 的可比性契约保持一致：点自有字段优先（空值/未知词也算点自己的
  // 未知值，不回退到指标级），只有点未声明该字段时才回退；未知维度归入同一未知组。
  const COMPARABLE_FIELDS = ['unit', 'method', 'laboratory'];

  function known(v) {
    return typeof v === 'string' && v.trim() !== ''
      && !/^(未知|不详|未记录|待核|unknown)$/i.test(v.trim());
  }

  function pointField(p, m, key) {
    const raw = Object.hasOwn(p, key) ? p[key] : m[key];
    return known(raw) ? raw.trim() : '';
  }

  function metricGroups(m) {
    const groups = new Map();
    for (const [index, p] of (Array.isArray(m.points) ? m.points : []).entries()) {
      if (!p || typeof p !== 'object') continue;
      const fields = {};
      for (const key of COMPARABLE_FIELDS) fields[key] = pointField(p, m, key);
      const groupKey = JSON.stringify(COMPARABLE_FIELDS.map(key => fields[key] || null));
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          ...fields,
          complete: COMPARABLE_FIELDS.every(key => fields[key] !== ''),
          points: []
        });
      }
      groups.get(groupKey).points.push({ point: p, index });
    }
    return [...groups.values()];
  }

  function datedPoints(group) {
    return group.points
      .filter(x => isDay(x.point.date))
      .sort((a, b) => String(a.point.date).localeCompare(String(b.point.date)) || a.index - b.index);
  }

  function groupSuffix(g) {
    const field = (label, v) => label + (v ? ' ' + v : '未记录');
    return '（可比组：' + field('单位', g.unit)
      + '；' + field('方法', g.method)
      + '；' + field('机构', g.laboratory) + '）';
  }

  function block(summary, items) {
    return { summary, items };
  }

  function missingBlock(why) {
    return block(NO_DATA + '；' + why, [['说明', why + '；本页不补写、不推断。']]);
  }

  function filteredBlock() {
    return block('已过滤；本阶段为私密记录', [
      ['说明', '记录存在；路径卡不显示药名、日期、数值或原文。']
    ]);
  }

  function regimenBlock(r) {
    const p = precision(r);
    const start = dateLabel(r);
    const end = r.ongoing ? '未记录（仍标记为进行中）' : (r.endDate ? text(r.endDate) : '未记录');
    const items = [
      ['药名（原文）', text(r.drug)],
      ['剂量（原文）', text(r.dose)],
      ['周期/频次（原文）', text(r.cycle)],
      ['起止', '起始：' + start + '；结束：' + end + (p === 'month' ? '；开始仅记到月份' : '')],
      ['记录说明（原文）', text(r.text)],
      ['记录来源', text(r.source)],
      ['更正情况', r.history && r.history.length
        ? '有 ' + r.history.length + ' 次更正；本卡显示当前版本，旧版本见下方原始记录'
        : '无更正记录']
    ];
    return block(
      '药名 ' + text(r.drug) + '；剂量原文 ' + text(r.dose) + '；起始 ' + start + '；结束 ' + end + '。',
      items
    );
  }

  function metricBlock(r, metrics) {
    const range = stageRange(r);
    if (!range) {
      return missingBlock('开始日期未知，不能把指标点归入该阶段');
    }
    const rows = [];
    const trend = [];
    let hasComparableGroup = false;
    for (const m of (Array.isArray(metrics) ? metrics : [])) {
      if (!m || typeof m !== 'object' || !Array.isArray(m.points)) continue;
      const groups = metricGroups(m);
      if (!groups.length) continue;
      const name = text(m.name, '指标名未记录');
      const metricRows = [];
      const labelled = groups.length > 1 || groups.some(g => !g.complete);
      for (const g of groups) {
        g.dated = datedPoints(g);
        const inside = g.dated.filter(x => x.point.date >= range.start && (!range.end || x.point.date <= range.end));
        if (!inside.length) continue;
        for (const x of inside) metricRows.push({ ...x, group: g });
        if (labelled) hasComparableGroup = true;
        const counts = new Map();
        for (const x of g.dated) counts.set(x.point.date, (counts.get(x.point.date) || 0) + 1);
        const lastDate = inside[inside.length - 1].point.date;
        const lastAt = inside.filter(x => x.point.date === lastDate);
        const last = lastAt.length === 1 ? lastAt[0].point : null;
        const before = g.dated.filter(x => x.point.date < range.start);
        const priorDate = before.length ? before[before.length - 1].point.date : null;
        const priorAt = priorDate ? before.filter(x => x.point.date === priorDate) : [];
        const prior = priorAt.length === 1 ? priorAt[0].point : null;
        const numeric = p => typeof p.value === 'number' && Number.isFinite(p.value);
        // 同一可比组内，非数值、同日并列都不能被跨过去做趋势；跨组值不参与本组比较。
        const between = prior && last
          ? g.dated.filter(x => x.point.date >= prior.date && x.point.date <= last.date)
          : [];
        const pathStable = between.every(x => numeric(x.point) && counts.get(x.point.date) === 1);
        const comparable = g.complete && prior && last && numeric(prior) && numeric(last) && pathStable;
        trend.push(name + (comparable
          ? ' 阶段前最近 ' + text(prior.value) + ' → 阶段内最后 ' + text(last.value)
          : ' 阶段内 ' + inside.length + ' 个点') + (labelled ? groupSuffix(g) : ''));
      }
      if (!metricRows.length) continue;
      metricRows.sort((a, b) => String(a.point.date).localeCompare(String(b.point.date)) || a.index - b.index);
      for (const { point: p, group: g } of metricRows) {
        const value = text(p.value, '值未记录');
        const unit = text(g.unit, '单位未记录');
        const method = text(g.method, '方法未记录');
        const lab = text(g.laboratory, '机构未记录');
        rows.push([
          name + ' · ' + p.date,
          value + ' ' + unit + '（' + method + ' / ' + lab + '；来源：' + text(m.source || p.source) + '）'
        ]);
      }
    }
    if (!rows.length) {
      return missingBlock('本阶段没有可归入的指标点，不补写趋势');
    }
    const pointCount = rows.length;
    rows.push(['阶段范围', range.start + ' 至 ' + (range.end || '未记录（进行中或结束未知）')]);
    rows.push(['参考语境', '单位、方法、机构随点并列；示例数据未提供参考范围，本页不补写。']);
    const summary = '阶段内 ' + pointCount + ' 个记录点；' + trend.join('；') + '。'
      + (hasComparableGroup ? '不同单位、方法、机构的记录拆成可比组，不跨组比较。' : '')
      + '仅按日期并排数值，不判断好坏。';
    return block(summary, rows);
  }

  function providedBlock(raw, why) {
    if (!raw || !Array.isArray(raw.items) || !raw.items.length) return missingBlock(why);
    const items = raw.items
      .filter(x => Array.isArray(x) && x.length >= 2 && String(x[1] === undefined ? '' : x[1]).trim() !== '')
      .map(x => [String(x[0]), String(x[1])]);
    if (!items.length) return missingBlock(why);
    return block(text(raw.summary, '记录见下；只抄原文，不判断。'), items);
  }

  function recap(r) {
    if (r.ongoing) return '仍标记为进行中；剂量原文' + (r.dose ? '已记录' : '未记录');
    if (r.endDate && (isDay(r.endDate) || isMonth(r.endDate))) return '已记录结束：' + r.endDate;
    if (precision(r) === 'month') return '仅记录开始月份；结束日期未记录';
    if (precision(r) === 'unknown') return '日期未知；结束日期未记录';
    return '结束日期未记录';
  }

  function planText(r) {
    return '药名 ' + text(r.drug) + '；剂量 ' + text(r.dose) + '；起始 ' + dateLabel(r)
      + (r.cycle ? '；周期 ' + text(r.cycle) : '');
  }

  function actualText(r) {
    return text(r.text) + '；' + (r.ongoing
      ? '仍标记为进行中'
      : r.endDate ? '结束：' + r.endDate : '结束日期未记录');
  }

  function publicStage(r, metrics) {
    const detail = {
      regimen: regimenBlock(r),
      metrics: metricBlock(r, metrics),
      imaging: providedBlock(r.pathwayDetail && r.pathwayDetail.imaging, '本阶段没有登记影像结论原文'),
      ae: providedBlock(r.pathwayDetail && r.pathwayDetail.ae, '本阶段没有登记副作用记录'),
      support: providedBlock(r.pathwayDetail && r.pathwayDetail.support, '本阶段没有登记心理/营养措施')
    };
    return {
      d: dateLabel(r),
      phase: text(r.drug, '治疗阶段（药名未记录）'),
      text: recap(r),
      recordId: r.id,
      private: false,
      plan: planText(r),
      actual: actualText(r),
      detail
    };
  }

  function privateStage(r) {
    const detail = {};
    for (const [id] of BLOCKS) detail[id] = filteredBlock();
    return {
      d: '日期已过滤',
      phase: '私密治疗记录',
      text: '记录存在；内容已按隐私设置过滤',
      recordId: r.id,
      private: true,
      plan: '已过滤',
      actual: '已过滤',
      detail
    };
  }

  function build(records, metrics) {
    const list = (Array.isArray(records) ? records : [])
      .map((r, i) => ({ r, i, key: r && r.kind === '当前用药' ? startKey(r) : '' }))
      .filter(x => x.r && x.r.kind === '当前用药');
    list.sort((a, b) => a.key === b.key ? a.i - b.i : a.key.localeCompare(b.key));
    return list.map(x => x.r.private === true ? privateStage(x.r) : publicStage(x.r, metrics));
  }

  return { build, BLOCKS };
})();