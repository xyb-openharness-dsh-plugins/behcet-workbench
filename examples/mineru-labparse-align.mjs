// Pure text processing for MinerU markdown -> lab candidates.
// No API calls, credentials, storage or business writes: the caller owns
// upload/polling, candidate persistence and confirmation UI.
// Rules source: docs/18-MINERU-PARSING.md (sections 4-5).
// Note: MinerU returns tables as HTML — call htmlTablesToPipes() (or pass the
// raw markdown to extractTableCandidates, which converts for you) before any
// tag stripping, or the table collapses into a single line.

const numRe = /^[<>≥≤]?\s*\d+(?:\.\d+)?$/

/** entries: [{ code, names: ['CA15-3', '糖类抗原153', ...] }] — dictionary names + user aliases. */
export function buildMetricMatcher(entries) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array')
  const matchers = []
  for (const entry of entries) {
    if (!entry?.code || !Array.isArray(entry.names)) continue
    for (const name of entry.names) {
      if (typeof name !== 'string' || !name.trim()) continue
      const latin = /^[A-Za-z0-9\-\s]+$/.test(name.trim())
      // Latin names need word boundaries so CRP never matches inside creatinine (Cr) tokens.
      const re = latin
        ? new RegExp(`(?<![A-Za-z0-9])${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`)
        : null
      matchers.push({ code: entry.code, name: name.trim(), re })
    }
  }
  return (text) => {
    if (typeof text !== 'string') return null
    for (const m of matchers) {
      if (m.re ? m.re.test(text) : text.includes(m.name)) return m.code
    }
    return null
  }
}

/** `<0.5` keeps its original text with valueNum null — folding it to 0.5 decides for the patient. */
export function parseResultValue(text) {
  if (typeof text !== 'string') return null
  const t = text.trim()
  if (!t || !numRe.test(t)) return null
  const m = t.match(/^([<>≥≤])\s*(\d+(?:\.\d+)?)$/)
  if (m) return { valueText: t, valueNum: null }
  const n = Number(t)
  return Number.isFinite(n) ? { valueText: t, valueNum: n } : null
}

const UNIT_MAP = [
  [/^10\^9\s*\/\s*L$/i, '10⁹/L'],
  [/^10\^12\s*\/\s*L$/i, '10¹²/L'],
  [/^umol\s*\/\s*L$/i, 'μmol/L'],
  [/^mmol\s*\/\s*L$/i, 'mmol/L'],
  [/^mg\s*\/\s*(dl|dL)$/, 'mg/dL'],
  [/^ug\s*\/\s*(ml|mL)$/, 'μg/mL'],
  [/^ng\s*\/\s*(ml|mL)$/, 'ng/mL'],
  [/^u\s*\/\s*(ml|mL)$/i, 'U/mL'],
  [/^g\s*\/\s*L$/i, 'g/L'],
]

/** Unknown units stay null (candidate flagged "unit missing") — never guessed. */
export function normalizeUnit(unit) {
  if (typeof unit !== 'string') return null
  const t = unit.trim()
  if (!t) return null
  for (const [re, out] of UNIT_MAP) if (re.test(t)) return out
  return /^[^|<>]+$/.test(t) ? t : null
}

/**
 * The real incident: MinerU stuffs a whole table into one cell
 * (`Item CA15-3 CEA ...` / `Result 18.6 2.1 ...`). Naive "first number after
 * the name" then writes every metric with the same value. Align by position
 * instead — and abandon the whole row when counts disagree.
 * `match` maps a cell to a metric code (buildMetricMatcher). Returns array of
 * candidates, or null (whole row abandoned).
 */
export function alignPositional(match, labels, values, units = []) {
  if (typeof match !== 'function' || !Array.isArray(labels) || !Array.isArray(values)) return null
  if (labels.length === 0 || labels.length !== values.length) return null
  if (units.length && units.length !== labels.length) return null
  const rows = []
  for (let i = 0; i < labels.length; i++) {
    const metric = match(labels[i])
    const value = parseResultValue(values[i])
    if (!metric || !value) continue
    rows.push({
      code: metric,
      valueText: value.valueText,
      valueNum: value.valueNum,
      unit: units.length ? normalizeUnit(units[i]) : null,
    })
  }
  return rows
}

/**
 * MinerU's `full.md` keeps tables as HTML (`<table><tr><td>`), not as pipe
 * tables. Stripping tags first collapses the whole table into one line
 * (`Stomach body max diameter 6.8 cm mitoses 12/50 HPF`), and then every
 * downstream rule reads the wrong cell. Convert HTML tables to pipe rows
 * BEFORE anything else touches the text.
 *
 * `colspan` gets blank placeholders, not copies: `<td colspan="2">6.8 cm</td>`
 * becomes `| 6.8 cm | |`, so a three-column header (item | result | unit)
 * still lines up and the unit column stays empty instead of repeating the value.
 */
export function htmlTablesToPipes(markdown) {
  if (typeof markdown !== 'string') return ''
  return markdown.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) || []
    const lines = trs.map((tr) => {
      const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []
      const cells = []
      for (const td of tds) {
        const attrs = (td.match(/^<t[dh][^>]*>/i) || [''])[0]
        // `["']?` — writing `"?'` is a literal single quote, not "optional quote",
        // and silently fails to match colspan="2" (shows up only as a missing column).
        const span = Number((attrs.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1)
        const text = td
          .replace(/^<t[dh][^>]*>/i, '')
          .replace(/<\/t[dh]>$/i, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\|/g, '/')
          .replace(/\s+/g, ' ')
          .trim()
        cells.push(text, ...Array(Math.max(0, span - 1)).fill(''))
      }
      return `| ${cells.join(' | ')} |`
    })
    if (!lines.length) return ''
    // First row is the header; insert a separator so downstream code can use the
    // same "header + separator + data rows" path for HTML and pipe tables alike.
    const sep = `| ${lines[0].split('|').slice(1, -1).map(() => '---').join(' | ')} |`
    return `\n${lines[0]}\n${sep}\n${lines.slice(1).join('\n')}\n`
  })
}

/** Split `| a | b |` cells from a markdown table line; HTML tables must be converted first. */
export function splitMarkdownRow(line) {
  if (typeof line !== 'string') return null
  const t = line.trim()
  if (!t.startsWith('|') || !t.endsWith('|')) return null
  return t.slice(1, -1).split('|').map((c) => c.trim())
}

/**
 * Extract candidates from markdown table lines. Two layouts are handled:
 * 1. packed/header style (the MinerU incident): metric names across one row,
 *    values aligned by position — counts must agree or the row is abandoned;
 * 2. row-per-metric fallback: one metric per row, value = first later numeric
 *    cell, unit = first non-empty non-numeric cell after it.
 * Returns [] when nothing recognized; the caller surfaces "0 candidates —
 * fill by hand" instead of wrong values.
 */
export function extractTableCandidates(lines, entries) {
  const match = buildMetricMatcher(entries)
  const raw = Array.isArray(lines) ? lines : htmlTablesToPipes(String(lines ?? '')).split('\n')
  const rows = raw
    .map(splitMarkdownRow)
    .filter(Boolean)
    .filter((cells) => !cells.every((c) => /^[-:\s]*$/.test(c)))
  const out = []
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].filter((c) => match(c)).length < 2) continue
    const valueRow = rows[i + 1]
    if (valueRow.filter((c) => numRe.test(c)).length === 0) break
    const after = rows[i + 2] ?? []
    const units = after.length === valueRow.length && after.length > 0
      && after.every((c) => !numRe.test(c)) && after.some((c) => c) ? after : []
    const aligned = alignPositional(match, rows[i], valueRow, units)
    if (aligned) out.push(...aligned)
    return out
  }
  for (const cells of rows) {
    const hits = cells.filter((c) => match(c)).length
    if (hits !== 1) continue
    const mi = cells.findIndex((c) => match(c))
    for (let j = mi + 1; j < cells.length; j++) {
      const value = parseResultValue(cells[j])
      if (!value) continue
      const unitCell = cells.slice(j + 1).find((c) => c && !numRe.test(c)) ?? null
      out.push({ code: match(cells[mi]), valueText: value.valueText, valueNum: value.valueNum, unit: normalizeUnit(unitCell) })
      break
    }
  }
  return out
}
