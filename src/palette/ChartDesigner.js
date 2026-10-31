import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { measureIndex } from '../platform/strategy.js';
import { seriesOf, calcMeasure, monthRange } from '../platform/data.js';
import { widget } from '../platform/dashboards.js';
import { renderWidget, SERIES_MAX } from '../charts/widgets.js';
import { monthLabel } from '../strategy/dates.js';

/**
 * Design a chart from program data, see it as visitors will, and use it:
 * add it to a dashboard (and so to a public site), or download it as a
 * picture for a report, a slide or a social post.
 *
 * The preview is drawn by the same code as dashboards and public sites
 * (charts/widgets.js), so what you see is what they show. The rules that
 * keep charts honest are built in rather than offered as options: one
 * scale per chart (measures in different units become side-by-side
 * charts), a fixed colour order, labels on the lines, a table for every chart.
 */
const KINDS = [
  { id: 'line', label: 'Line', hint: 'How one measure changed over time', multi: false },
  { id: 'bar', label: 'Columns', hint: 'Monthly amounts, to compare month with month', multi: false },
  { id: 'compare', label: 'Compare', hint: `Up to ${SERIES_MAX} measures together`, multi: true },
  { id: 'kpi', label: 'Headline number', hint: 'One number, with progress to its target', multi: false },
];
const PERIODS = [{ id: '6', label: 'Last 6 months' }, { id: '12', label: 'Last 12 months' }, { id: '24', label: 'Last 24 months' }, { id: 'all', label: 'Every month' }];
const SHAPES = [
  { id: 'wide', label: 'Report or dashboard', w: 900, h: 520 },
  { id: 'slide', label: 'Slide (16:9)', w: 1280, h: 720 },
  { id: 'square', label: 'Social post (square)', w: 1080, h: 1080 },
];

export function ChartDesigner(ctx) {
  const { data, dashboards, org } = ctx;
  const index = measureIndex(ctx.strategy);
  const measures = [...Object.values(index), ...Object.values(data.doc.calcs ?? {}).map(calcMeasure)];
  if (!measures.length) return h('p', { class: 'empty' }, 'Add measures to objectives or goals in Strategy & Work first.');
  const d = (ctx.design ??= { kind: 'line', ids: [measures[0].id], period: '12', shape: 'wide', title: '', note: '' });
  d.ids = d.ids.filter((id) => measures.some((m) => m.id === id));
  if (!d.ids.length) d.ids = [measures[0].id];
  const kind = KINDS.find((k) => k.id === d.kind);
  if (!kind.multi) d.ids = d.ids.slice(0, 1);
  const set = (patch) => { Object.assign(d, patch); ctx.render(); };
  const nameOf = (id) => measures.find((m) => m.id === id)?.name ?? id;

  // The data, cut to the chosen months (calculated measures worked out first, on every month).
  const all = d.ids.map((id) => seriesOf(id, data.doc)).filter(Boolean);
  const dates = [...new Set(all.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const span = monthRange(dates[0], dates.at(-1));
  const months = d.period === 'all' ? span : span.slice(-Number(d.period));
  const trimmed = { ...data.doc, series: { ...data.doc.series } };
  for (const id of d.ids) {
    const s = seriesOf(id, data.doc);
    if (s) trimmed.series[id] = { id, points: s.points.filter((p) => months.includes(p.date)) };
  }
  const w = { id: 'designer', type: d.kind, size: 'full', title: d.title || undefined, ...(kind.multi ? { measureIds: d.ids } : { measureId: d.ids[0] }) };
  const chart = renderWidget(w, { strategy: ctx.strategy, data: trimmed, asOf: '9999', months: d.kind === 'kpi' ? [] : months });
  const shape = SHAPES.find((s) => s.id === d.shape);
  const source = `Source: ${org.name} program data${months.length ? `, ${monthLabel(months[0])} to ${monthLabel(months.at(-1))}` : ''}.`;
  const card = h('div', { class: `design-card shape-${shape.id}`, style: `aspect-ratio:${shape.w} / ${shape.h}` },
    h('div', { class: 'design-org' }, org.name),
    chart,
    d.note && h('p', { class: 'design-note' }, d.note),
    h('p', { class: 'design-source' }, source));

  /* Controls. */
  const picker = kind.multi
    ? h('fieldset', { class: 'design-measures' }, h('legend', {}, `Measures (up to ${SERIES_MAX})`),
        measures.map((m) => h('label', { class: 'check-row' },
          h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: d.ids.includes(m.id), disabled: !d.ids.includes(m.id) && d.ids.length >= SERIES_MAX,
            onchange: (e) => set({ ids: e.target.checked ? [...d.ids, m.id] : d.ids.filter((x) => x !== m.id) }) }),
          m.name, h('small', { class: 'muted' }, ` ${m.unit || ''}`))))
    : h('label', { class: 'field' }, 'Measure',
        h('select', { class: 'select select-sm', onchange: (e) => set({ ids: [e.target.value] }) },
          Object.entries(Object.groupBy(measures, (m) => m.nodeTitle)).map(([g, ms]) => h('optgroup', { label: g }, options(ms.map((m) => ({ id: m.id, label: m.name })), d.ids[0])))));
  const mixed = kind.multi && new Set(d.ids.map((id) => measures.find((m) => m.id === id)?.unit ?? '')).size > 1;

  const dashList = Object.values(dashboards.doc.dashboards);
  const target = h('select', { class: 'select select-sm', 'aria-label': 'Dashboard' }, dashList.map((x) => h('option', { value: x.id }, `${x.title} (${x.visibility})`)));
  // Said once, after the redraw that adding causes.
  const done = d.added && dashboards.doc.dashboards[d.added];
  d.added = null;
  const added = h('span', { class: 'muted small', role: 'status' }, done ? ['Added to ', h('a', { href: `#${done.id}` }, done.title), done.visibility === 'public' ? ', which is public.' : '.'] : '');

  const controls = h('div', { class: 'design-controls' },
    h('div', { class: 'kind-picker', role: 'radiogroup', 'aria-label': 'Kind of chart' }, KINDS.map((k) =>
      h('button', { class: `kind ${k.id === d.kind ? 'on' : ''}`, role: 'radio', 'aria-checked': String(k.id === d.kind), title: k.hint, onclick: () => set({ kind: k.id }) },
        KindIcon(k.id), h('span', {}, k.label)))),
    h('p', { class: 'muted small' }, kind.hint + '.'),
    picker,
    mixed && h('p', { class: 'note small' }, 'These measures are in different units, so each gets its own chart side by side. Sharing one scale would make them look related when they aren’t.'),
    d.kind !== 'kpi' && h('label', { class: 'field' }, 'Months', h('select', { class: 'select select-sm', onchange: (e) => set({ period: e.target.value }) }, options(PERIODS, d.period))),
    h('label', { class: 'field' }, 'Title', h('input', { class: 'input input-sm', name: 'design-title', value: d.title, placeholder: kind.multi ? d.ids.map(nameOf).join(' and ') : nameOf(d.ids[0]), onchange: (e) => set({ title: e.target.value }) })),
    h('label', { class: 'field' }, 'What it shows', h('textarea', { class: 'textarea textarea-sm', name: 'design-note', rows: 2, placeholder: 'One sentence on what readers should take away, e.g. “Meals rose by a third after the second kitchen opened.”', onchange: (e) => set({ note: e.target.value }) }, d.note)),
    h('label', { class: 'field' }, 'Shape', h('select', { class: 'select select-sm', onchange: (e) => set({ shape: e.target.value }) }, options(SHAPES, d.shape))),
    h('div', { class: 'design-actions' },
      h('h3', {}, 'Use it'),
      dashList.length
        ? h('div', { class: 'inline-form' }, target,
            h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
              const dash = dashboards.doc.dashboards[target.value];
              const { id: _id, size: _size, ...rest } = w;
              d.added = dash.id;
              dashboards.apply(col.update('dashboards', dash.id, { widgets: [...dash.widgets, widget(d.kind, { ...rest, size: d.kind === 'kpi' ? 'small' : 'wide' })] }));
            } }, icon('plus', 14), 'Add to dashboard'), added)
        : h('p', { class: 'muted small' }, 'Make a dashboard first to add charts to it.'),
      h('p', { class: 'muted small' }, 'On a dashboard the chart shows every month, with the player to step through them.'),
      h('div', { class: 'inline-form' },
        h('button', { class: 'btn btn-sm', onclick: () => exportImage(card, shape, 'png', fileName(d, nameOf)) }, icon('download', 14), 'Picture (PNG)'),
        h('button', { class: 'btn btn-sm', onclick: () => exportImage(card, shape, 'svg', fileName(d, nameOf)) }, icon('download', 14), 'Scalable (SVG)'))));

  return h('div', { class: 'designer' }, controls, h('div', { class: 'design-stage' }, card));
}

const fileName = (d, nameOf) => (d.title || d.ids.map(nameOf).join(' and ')).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart';

function KindIcon(kind) {
  const paths = {
    line: 'M3 17 L9 11 L13 14 L21 6',
    bar: 'M5 20 V12 M10 20 V7 M15 20 V10 M20 20 V4',
    compare: 'M3 18 L9 12 L14 15 L21 8 M3 12 L9 9 L14 6 L21 4',
    kpi: 'M4 6 H20 M4 18 H14 M4 12 H20',
  };
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'icon');
  s.setAttribute('width', '22');
  s.setAttribute('height', '22');
  s.innerHTML = `<path d="${paths[kind]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}

/**
 * The card as a picture. The card is copied into an SVG <foreignObject>
 * with every element's computed style written onto it, so the picture
 * looks exactly like the preview, then drawn onto a canvas for a PNG.
 */
async function exportImage(card, shape, type, name) {
  const box = card.getBoundingClientRect();
  const scale = shape.w / box.width;
  // The card keeps the shape's proportions, growing taller only if its content needs it.
  const height = Math.round(box.height * scale);
  const clone = card.cloneNode(true);
  const inline = (src, dst) => {
    const cs = getComputedStyle(src);
    let text = '';
    for (const p of cs) text += `${p}:${cs.getPropertyValue(p)};`;
    dst.setAttribute('style', text);
    [...src.children].forEach((c, i) => dst.children[i] && inline(c, dst.children[i]));
  };
  inline(card, clone);
  clone.querySelectorAll('button, .widget-table, .chart-tip').forEach((el) => el.remove());
  // The page's font, carried inside the picture so it looks the same anywhere.
  const font = await fontData();
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${shape.w}" height="${height}" viewBox="0 0 ${shape.w} ${height}">`
    + (font ? `<style>@font-face{font-family:'Nunito';font-weight:200 1000;src:url(${font}) format('woff2');}</style>` : '')
    + `<foreignObject x="0" y="0" width="${box.width}" height="${box.height}" transform="scale(${scale})">`
    + new XMLSerializer().serializeToString(clone)
    + '</foreignObject></svg>';
  const svgBlob = new Blob([xml], { type: 'image/svg+xml' });
  if (type === 'svg') return save(svgBlob, `${name}.svg`);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = shape.w;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, shape.w, height);
  g.drawImage(img, 0, 0, shape.w, height);
  canvas.toBlob((png) => save(png, `${name}.png`), 'image/png');
}
let fontCache;
async function fontData() {
  fontCache ??= fetch('vendor/fonts/nunito-latin-wght-normal.woff2').then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.readAsDataURL(b);
  })).catch(() => null);
  return fontCache;
}
function save(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}
