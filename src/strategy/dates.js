/** Dates are stored as 'YYYY-MM-DD' strings and handled in UTC to avoid timezone drift. */
const DAY = 86400000;

export const parse = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const today = () => iso(Date.now());
export const addDays = (isoDate, n) => iso(parse(isoDate) + n * DAY);
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (isoDate) => `${MONTHS[+isoDate.slice(5, 7) - 1]} ${isoDate.slice(0, 4)}`;
export const short = (isoDate) => (isoDate ? `${+isoDate.slice(8, 10)} ${MONTHS[+isoDate.slice(5, 7) - 1]} ${isoDate.slice(2, 4)}` : '—');
export const range = (a, b) => (a || b ? `${short(a)} – ${short(b)}` : 'No dates');

/** First day of each month from a to b inclusive. */
export function monthStarts(a, b) {
  const out = [];
  let y = +a.slice(0, 4);
  let m = +a.slice(5, 7);
  for (;;) {
    const d = `${y}-${String(m).padStart(2, '0')}-01`;
    if (d > b) break;
    out.push(d);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
