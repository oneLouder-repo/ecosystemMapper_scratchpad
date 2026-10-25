/**
 * Program data: values recorded over time against strategy measures.
 * { id, series: { [measureId]: { id, points: [{ date: 'YYYY-MM-01', value }] } } }
 *
 * In production this is fed by program systems (registrations, surveys,
 * finance). Here it is seeded with example data and can be edited in the
 * Creative Palette's Data mini-tool; public sites read it live.
 */
export function valueAt(series, date) {
  if (!series?.points.length) return null;
  let found = null;
  for (const p of series.points) if (p.date <= date) found = p;
  return found;
}

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
