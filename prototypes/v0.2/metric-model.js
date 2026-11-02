// Pure read model for synthetic observations; no conversion or clinical interpretation.
(function (root) {
  const known = v => typeof v === 'string' && v.trim() !== '' && !/^(未知|不详|未记录|待核|unknown)$/i.test(v.trim());
  const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  function build(input) {
    return input.flatMap(metric => {
      const groups = new Map();
      (metric.points || []).forEach((point, index) => {
        const fields = ['unit', 'method', 'laboratory'].map(k => Object.hasOwn(point, k) ? point[k] : metric[k]);
        const key = JSON.stringify(fields.map(v => known(v) ? v.trim() : null));
        if (!groups.has(key)) groups.set(key, {fields, points: []});
        groups.get(key).points.push({...point, key: String(index), date: validDate(point.date) ? point.date : '', rawDate: point.date, numeric: typeof point.value === 'number' && Number.isFinite(point.value)});
      });
      const allDated = [...groups.entries()].flatMap(([groupKey, group]) => group.points.filter(p => p.date).map(p => ({date:p.date, groupKey})));
      return [...groups.entries()].map(([groupKey, {fields, points}], index) => {
        const interrupted = (a,b) => allDated.some(p => p.groupKey !== groupKey && p.date >= a && p.date <= b);
        const [unit, method, laboratory] = fields;
        const complete = fields.every(known);
        points.sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999') || Number(a.key)-Number(b.key));
        const dated = points.filter(p => p.date);
        const counts = new Map(); dated.forEach(p => counts.set(p.date, (counts.get(p.date)||0)+1));
        const latestDate = dated.at(-1)?.date;
        const latestRows = dated.filter(p => p.date === latestDate);
        const latest = latestRows.length === 1 ? latestRows[0] : null;
        const previousDate = latest ? [...new Set(dated.map(p=>p.date))].at(-2) : null;
        const previousRows = dated.filter(p=>p.date === previousDate);
        const previous = previousRows.length === 1 ? previousRows[0] : null;
        const delta = complete && latest?.numeric && previous?.numeric && !interrupted(previous.date, latest.date) ? latest.value - previous.value : null;
        // A nonnumeric or ambiguous day breaks the path; never bridge over it.
        const segments = []; let segment = [];
        for (const p of dated) {
          if (!complete || !p.numeric || counts.get(p.date) !== 1) { if (segment.length > 1) segments.push(segment); segment = []; }
          else { if (segment.length && interrupted(segment.at(-1).date, p.date)) { if (segment.length > 1) segments.push(segment); segment = []; } segment.push(p); }
        }
        if (segment.length > 1) segments.push(segment);
        return {...metric, id: metric.id + '~' + index, metricId: metric.id, unit, method, laboratory, points, dated, latest, latestRows, delta, previous, segments, complete, undated: points.length-dated.length};
      });
    });
  }
  root.BEIPAL_METRIC_MODEL = {build};
})(typeof window === 'undefined' ? globalThis : window);
