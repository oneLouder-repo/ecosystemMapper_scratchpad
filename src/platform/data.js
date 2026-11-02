import { parseFormula, evaluate } from '../core/formula.js';

/**
 * Program data: values recorded over time against strategy measures.
 * { id, series: { [measureId]: { id, points: [{ date: 'YYYY-MM-01', value }] } },
 *   calcs: { [id]: { id, name, unit, target?, expr } } }
 *
 * Calculated measures (calcs) are worked out from other measures by a
 * formula (core/formula.js), month by month, like a spreadsheet column:
 * meals per box, cost per participant, change on last year.
 *
 * In production this is fed by program systems (registrations, surveys,
 * finance). Here it is seeded with example data and can be edited in the
 * Workbench's Data mini-tool; public sites read it live.
 */
export function valueAt(series, date) {
  if (!series?.points.length) return null;
  let found = null;
  for (const p of series.points) if (p.date <= date) found = p;
  return found;
}

/**
 * The headline facts about a measure: its latest value, how far it is to
 * its target, and the change over a year. Null when there is no data.
 */
export function measureFacts(measure, series) {
  const points = series?.points ?? [];
  const last = points.at(-1);
  if (!last) return null;
  const yearAgo = points.find((p) => p.date === `${+last.date.slice(0, 4) - 1}${last.date.slice(4)}`);
  const target = Number(measure.target);
  return {
    value: last.value,
    date: last.date,
    points: points.slice(-12),
    target: Number.isFinite(target) && target > 0 ? target : null,
    ofTarget: Number.isFinite(target) && target > 0 ? Math.round((last.value / target) * 100) : null,
    change: yearAgo && yearAgo.value ? Math.round(((last.value - yearAgo.value) / Math.abs(yearAgo.value)) * 100) : null,
  };
}

/** Every month from `first` to `last` (YYYY-MM-01), with none skipped. */
export function monthRange(first, last) {
  const out = [];
  if (!first || !last) return out;
  let [y, m] = [+first.slice(0, 4), +first.slice(5, 7)];
  for (let guard = 0; guard < 1200; guard++) {
    const d = `${y}-${String(m).padStart(2, '0')}-01`;
    if (d > last) break;
    out.push(d);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** A calculated measure's monthly values: { id, points, error? }. */
export function calcSeries(calc, data) {
  let parsed;
  try { parsed = parseFormula(calc.expr); } catch (err) { return { id: calc.id, points: [], error: err.message }; }
  const months = dataMonths(data, parsed.refs);
  const range = monthRange(months[0], months.at(-1));
  const index = Object.fromEntries(parsed.refs.map((id) => [id, Object.fromEntries((data.series[id]?.points ?? []).map((p) => [p.date, p.value]))]));
  const value = (id, at) => index[id]?.[range[at]] ?? null;
  const points = [];
  range.forEach((date, at) => {
    const v = evaluate(parsed.tree, at, value);
    if (v != null) points.push({ date, value: +v.toPrecision(6) });
  });
  return { id: calc.id, points, refs: parsed.refs };
}

/** A calculated measure, shaped like a strategy measure for charts. */
export const calcMeasure = (c) => ({ id: c.id, name: c.name, unit: c.unit ?? '', target: c.target ?? '', nodeTitle: 'Calculated', calc: true });

/** The series for a measure or a calculated measure. */
export const seriesOf = (id, data) => data.series?.[id] ?? (data.calcs?.[id] ? calcSeries(data.calcs[id], data) : undefined);

export const pointsUntil = (series, date) => (series?.points ?? []).filter((p) => p.date <= date);

/** All the months any series has data for, sorted. */
export function dataMonths(doc, measureIds = Object.keys(doc.series)) {
  const set = new Set();
  for (const id of measureIds) for (const p of doc.series[id]?.points ?? []) set.add(p.date);
  return [...set].sort();
}

// Example series: monthly from April 2025 to October 2026, with gentle seasonality.
// Reach is a rolling 12-month count, so it compares with the yearly target.
const SHAPES = {
  'm-reach': { from: 312000, to: 458000, season: 0.06, round: 100 },
  'm-equity': { from: 41, to: 52, season: 0.02, round: 0.1 },
  'm-trained': { from: 120, to: 690, season: 0, round: 1, cumulative: true },
  'm-girls': { from: 38, to: 46, season: 0.03, round: 0.1 },
  'm-partners': { from: 74, to: 103, season: 0, round: 1 },
  'm-checkins': { from: 0, to: 47, season: 0, round: 1, cumulative: true },
  'm-meetings': { from: 0, to: 23, season: 0, round: 1, cumulative: true },
  'm-views': { from: 90, to: 410, season: 0.25, round: 1 },
  'm-reporting': { from: 30, to: 78, season: 0, round: 1 },
  'm-meals': { from: 1900, to: 3600, season: -0.12, round: 10 },
  'm-boxes': { from: 120, to: 260, season: -0.1, round: 1 },
};

/** Example data for the given measures (by default, every example measure). */
export function seedData(ids = Object.keys(SHAPES)) {
  const months = [];
  for (let y = 2025, m = 4; y < 2026 || m <= 10; ) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`);
    if (++m > 12) { m = 1; y++; }
  }
  const series = {};
  for (const id of ids) {
    const s = SHAPES[id];
    if (!s) continue;
    let seed = id.length * 97;
    const noise = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.04;
    const points = months.map((date, i) => {
      const t = i / (months.length - 1);
      const month = +date.slice(5, 7);
      // Summer programs peak in July.
      const seasonal = 1 + s.season * Math.cos(((month - 7) / 12) * 2 * Math.PI);
      let v = (s.from + (s.to - s.from) * t) * (s.cumulative ? 1 : seasonal) * (1 + (s.cumulative ? 0 : noise()));
      v = Math.round(v / s.round) * s.round;
      return { date, value: +v.toFixed(1) };
    });
    series[id] = { id, points };
  }
  return { id: 'data-example', series };
}
