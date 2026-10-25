import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { measureIndex } from '../platform/strategy.js';
import { applyTheme } from '../platform/themes.js';
import { monthLabel } from '../strategy/dates.js';
import { measureFacts } from '../platform/data.js';

/**
 * Data postcards: turn one measure into a picture to share in a newsletter,
 * a social post or a slide. The card wears the org's theme and comes with
 * alt text, so it can be posted accessibly.
 */
const SIZES = [
  { id: 'wide', label: 'Wide (social post)', w: 1200, h: 675 },
  { id: 'square', label: 'Square', w: 1080, h: 1080 },
];
const STYLES = [{ id: 'bold', label: 'Bold' }, { id: 'light', label: 'Light' }];

const num = (v) => (Math.abs(v) >= 100000 ? new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : v.toLocaleString('en-CA', { maximumFractionDigits: 1 }));
const withUnit = (v, unit) => (unit === '%' ? `${num(v)}%` : num(v));

export function PostcardTool(ctx) {
  const measures = Object.values(measureIndex(ctx.strategy)).filter((m) => ctx.data.doc.series[m.id]?.points.length);
  if (!measures.length) return h('div', {}, h('h1', {}, 'Data postcards'), h('p', { class: 'empty' }, 'Add measures in Strategy & Work and some program data first.'));
  const s = (ctx.postcard ??= { measureId: measures[0].id, size: 'wide', style: 'bold', headline: '', note: '' });
  if (!measures.some((m) => m.id === s.measureId)) s.measureId = measures[0].id;
  const m = measures.find((x) => x.id === s.measureId);
  const facts = measureFacts(m, ctx.data.doc.series[m.id]);
  const size = SIZES.find((x) => x.id === s.size);
  const canvas = h('canvas', { class: 'postcard-canvas', width: size.w, height: size.h, role: 'img' });
  const alt = altText(ctx.org, m, facts, s);
  canvas.setAttribute('aria-label', alt);
  const set = (patch) => { Object.assign(s, patch); ctx.render(); };
  const draw = () => drawPostcard(canvas, { org: ctx.org, measure: m, facts, ...s });
  requestAnimationFrame(draw);
  document.fonts?.ready.then(draw);

  return h('div', {},
    h('h1', {}, 'Data postcards'),
    h('p', { class: 'lede' }, 'Turn a measure into a card to share in a newsletter, a social post or a slide. It uses your colours, and comes with alt text so everyone can read it.'),
    h('div', { class: 'postcard-layout' },
      h('div', { class: 'postcard-controls' },
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Measure'),
          h('select', { class: 'select select-sm', name: 'pc-measure', onchange: (e) => set({ measureId: e.target.value }) },
            measures.map((x) => h('option', { value: x.id, selected: x.id === m.id }, x.name)))),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Headline (optional)'),
          h('input', { class: 'input input-sm', name: 'pc-headline', value: s.headline, placeholder: m.name, maxLength: 70, onchange: (e) => set({ headline: e.target.value }) })),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'A line of your own (optional)'),
          h('input', { class: 'input input-sm', name: 'pc-note', value: s.note, placeholder: 'Thank you to our partners!', maxLength: 90, onchange: (e) => set({ note: e.target.value }) })),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Size'),
          h('select', { class: 'select select-sm', name: 'pc-size', onchange: (e) => set({ size: e.target.value }) }, options(SIZES, s.size))),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Style'),
          h('select', { class: 'select select-sm', name: 'pc-style', onchange: (e) => set({ style: e.target.value }) }, options(STYLES, s.style))),
        h('div', { class: 'postcard-actions' },
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => canvas.toBlob((blob) => {
            const a = h('a', { href: URL.createObjectURL(blob), download: `${m.name.toLowerCase().replace(/[^\w]+/g, '-')}.png` });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }, 'image/png') }, icon('upload', 14), 'Download PNG'),
          h('button', { class: 'btn btn-sm', onclick: (e) => navigator.clipboard?.writeText(alt).then(() => { e.target.textContent = 'Copied'; }) }, 'Copy alt text'))),
      h('figure', { class: 'postcard-preview' }, canvas, h('figcaption', { class: 'muted small' }, h('strong', {}, 'Alt text: '), alt))));
}

function altText(org, m, f, s) {
  const bits = [`${s.headline || m.name}: ${withUnit(f.value, m.unit)}${m.unit && m.unit !== '%' ? ` ${m.unit}` : ''} as of ${monthLabel(f.date)}.`];
  if (f.ofTarget != null) bits.push(`That is ${f.ofTarget}% of the target of ${withUnit(f.target, m.unit)}.`);
  if (f.change != null) bits.push(`${f.change >= 0 ? 'Up' : 'Down'} ${Math.abs(f.change)}% from a year earlier.`);
  if (s.note) bits.push(s.note);
  bits.push(`From ${org.name}.`);
  return bits.join(' ');
}

/** The org's theme colours, read from a hidden element wearing the theme. */
function themeColours(org) {
  const probe = h('div', { hidden: true });
  applyTheme(probe, org.theme);
  document.body.append(probe);
  const css = getComputedStyle(probe);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const out = {
    primary: get('--color-primary', '#1d4ed8'), onPrimary: get('--color-primary-content', '#ffffff'),
    base: get('--color-base-100', '#ffffff'), baseAlt: get('--color-base-200', '#f2f2f2'), ink: get('--color-base-content', '#1f2937'),
  };
  probe.remove();
  return out;
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawPostcard(canvas, { org, measure, facts, style, headline, note }) {
  const c = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const col = themeColours(org);
  const bold = style === 'bold';
  const bg = bold ? col.primary : col.base;
  const fg = bold ? col.onPrimary : col.ink;
  const accent = bold ? col.onPrimary : col.primary;
  const pad = Math.round(W * 0.07);
  const font = (weight, px) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = fg;
  c.textBaseline = 'alphabetic';

  // Headline.
  let y = pad + 40;
  c.font = font(600, 40);
  c.globalAlpha = 0.85;
  for (const line of wrap(c, headline || measure.name, W - pad * 2).slice(0, 2)) { c.fillText(line, pad, y); y += 50; }
  c.globalAlpha = 1;

  // The number.
  const big = Math.round(Math.min(W, H) * 0.24);
  c.font = font(800, big);
  y += big * 0.85;
  const value = withUnit(facts.value, measure.unit);
  c.fillText(value, pad, y);
  if (measure.unit && measure.unit !== '%') {
    const x = pad + c.measureText(value).width + 18;
    c.font = font(500, 34);
    c.globalAlpha = 0.8;
    c.fillText(measure.unit, x, y);
    c.globalAlpha = 1;
  }

  // Context: target and change.
  y += 58;
  c.font = font(500, 32);
  const context = [facts.ofTarget != null && `${facts.ofTarget}% of our ${withUnit(facts.target, measure.unit)} target`, facts.change != null && `${facts.change >= 0 ? '▲' : '▼'} ${Math.abs(facts.change)}% on last year`].filter(Boolean).join('   ·   ');
  if (context) c.fillText(context, pad, y);

  // Progress bar to target.
  if (facts.ofTarget != null) {
    y += 30;
    const bw = W - pad * 2;
    c.globalAlpha = 0.25;
    c.fillStyle = accent;
    roundRect(c, pad, y, bw, 14, 7);
    c.globalAlpha = 1;
    roundRect(c, pad, y, Math.max(14, bw * Math.min(1, facts.ofTarget / 100)), 14, 7);
    c.fillStyle = fg;
  }

  // Sparkline of the last twelve months, in the space left.
  const footer = H - pad;
  const top = y + 50;
  const bottom = footer - (note ? 110 : 70);
  if (bottom - top > 60 && facts.points.length > 1) {
    const vals = facts.points.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const x = (i) => pad + (i / (vals.length - 1)) * (W - pad * 2);
    const yv = (v) => bottom - ((v - lo) / span) * (bottom - top);
    c.beginPath();
    vals.forEach((v, i) => (i ? c.lineTo(x(i), yv(v)) : c.moveTo(x(i), yv(v))));
    c.lineTo(x(vals.length - 1), bottom);
    c.lineTo(x(0), bottom);
    c.closePath();
    c.globalAlpha = 0.15;
    c.fillStyle = accent;
    c.fill();
    c.globalAlpha = 1;
    c.beginPath();
    vals.forEach((v, i) => (i ? c.lineTo(x(i), yv(v)) : c.moveTo(x(i), yv(v))));
    c.strokeStyle = accent;
    c.lineWidth = 4;
    c.lineJoin = 'round';
    c.stroke();
    c.beginPath();
    c.arc(x(vals.length - 1), yv(vals.at(-1)), 9, 0, Math.PI * 2);
    c.fillStyle = accent;
    c.fill();
    c.fillStyle = fg;
    c.font = font(500, 22);
    c.globalAlpha = 0.75;
    c.fillText(`${monthLabel(facts.points[0].date)} – ${monthLabel(facts.date)}`, pad, bottom + 32);
    c.globalAlpha = 1;
  }

  // Note and footer.
  if (note) {
    c.font = font(600, 30);
    c.fillText(note, pad, footer - 50, W - pad * 2);
  }
  c.font = font(700, 26);
  c.fillText(org.name, pad, footer);
  c.font = font(500, 22);
  c.globalAlpha = 0.7;
  c.textAlign = 'right';
  c.fillText(`Data to ${monthLabel(facts.date)}`, W - pad, footer);
  c.textAlign = 'left';
  c.globalAlpha = 1;
}

function roundRect(c, x, y, w, hgt, r) {
  c.beginPath();
  c.roundRect ? c.roundRect(x, y, w, hgt, r) : c.rect(x, y, w, hgt);
  c.fill();
}
