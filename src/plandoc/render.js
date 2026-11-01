import { h } from '../ui/dom.js';
import { artUrl } from '../ui/art.js';
import { textOf, headlineMeasures, defaultText } from '../platform/plandocs.js';

/**
 * Draw a strategic plan document as pages, in its template and colours.
 * The same drawing is the designer's editing surface (editable: true, where
 * words can be typed over and pictures changed), the public web view, and
 * what prints to PDF.
 *
 *   PlanDocument(pd, snapshot, { editable, onText(key, value), onImage(slot), palette })
 */

/** Any CSS colour as #rrggbb (DaisyUI themes use oklch). */
export function toHex(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return `#${[r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The three colours of a DaisyUI palette, as hex. */
export function paletteColours(palette) {
  const probe = h('div', { 'data-theme': palette || 'corporate', style: 'position:absolute;visibility:hidden' });
  document.body.append(probe);
  const css = getComputedStyle(probe);
  const get = (n, f) => toHex(css.getPropertyValue(n).trim() || f);
  const out = [get('--color-primary', '#1d4ed8'), get('--color-secondary', '#2a9d8f'), get('--color-accent', '#f4a261')];
  probe.remove();
  // Keep the three far enough apart to tell objectives apart: turn the hue of any too close to the ones before.
  for (let i = 1; i < 3; i++) {
    while (out.slice(0, i).some((c) => distance(c, out[i]) < 90)) out[i] = rotate(out[i] === out[0] ? out[0] : out[i], 110 * i);
  }
  return out;
}

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const distance = (a, b) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
/** Turn a colour's hue by `deg`, giving it some saturation if it has little. */
function rotate(c, deg) {
  let [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let hh = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  hh = (hh + deg) % 360; sat = Math.max(sat, 0.45);
  const L = Math.min(0.55, Math.max(0.38, l));
  const f = (n) => { const k = (n + hh / 30) % 12; const a = sat * Math.min(L, 1 - L); return Math.round((L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const fmt = (v, unit) => (v == null || v === '' ? '' : unit === '%' ? `${Math.round(v)}%` : Number(v).toLocaleString('en-CA', { maximumFractionDigits: 1 }));
const yearOf = (d) => (d ? String(d).slice(0, 4) : '');

export function PlanDocument(pd, snap, { editable = false, onText, onImage, palette } = {}) {
  const colours = paletteColours(palette);
  const T = (key, tag = 'span', cls = '', multiline = false) => {
    const value = textOf(pd, snap, key);
    const el = h(tag, { class: `pd-t ${cls}`, 'data-key': key }, value);
    if (editable) {
      el.contentEditable = 'plaintext-only';
      el.spellcheck = true;
      el.title = 'Click to edit';
      if (!value) el.dataset.placeholder = multiline ? 'Click to write…' : 'Click to add…';
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); el.blur(); } });
      el.addEventListener('blur', () => {
        const v = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
        if (v !== textOf(pd, snap, key)) onText?.(key, v === defaultText(snap, key) ? null : v);
      });
    }
    return el;
  };
  const imageUrl = (slot, seed) => {
    const img = pd.images?.[slot];
    if (img?.kind === 'url' && img.url) return img.url;
    return artUrl(img?.art ?? ['waves', 'hills', 'topo', 'circles', 'rays', 'mosaic'][seed % 6], colours, seed + 1);
  };
  const Picture = (slot, seed, cls) => {
    const img = pd.images?.[slot];
    return h('figure', { class: `pd-pic ${cls}` },
      h('img', { src: imageUrl(slot, seed), alt: img?.alt ?? '', loading: 'lazy' }),
      img?.kind === 'url' && img.credit && h('figcaption', { class: 'pd-credit' }, img.credit),
      editable && h('button', { type: 'button', class: 'pd-pic-btn', onclick: () => onImage?.(slot, seed) }, 'Change picture'));
  };
  const show = (id) => !pd.hidden?.[id];
  const pages = [];
  const page = (id, cls, ...kids) => h('section', { class: `pd-page pd-${cls}`, 'data-section': id }, ...kids);
  const foot = (n) => h('footer', { class: 'pd-foot' }, h('span', {}, snap.org.name), h('span', {}, textOf(pd, snap, 'title')), h('span', {}, String(n)));

  if (show('cover')) pages.push(page('cover', 'cover',
    Picture('cover', 0, 'pd-cover-pic'),
    h('div', { class: 'pd-cover-text' },
      snap.org.logo && h('img', { class: 'pd-logo', src: snap.org.logo, alt: '' }),
      h('p', { class: 'pd-kicker' }, 'Strategic plan'),
      T('title', 'h1', 'pd-title'),
      T('subtitle', 'p', 'pd-subtitle'),
      T('tagline', 'p', 'pd-tagline', true))));

  if (show('letter')) pages.push(page('letter', 'letter',
    h('div', { class: 'pd-inner' },
      h('p', { class: 'pd-kicker' }, 'A message from us'),
      T('letterTitle', 'h2', 'pd-h2'),
      T('letter', 'p', 'pd-body pd-letter', true),
      T('letterSign', 'p', 'pd-sign')),
    foot(pages.length + 1)));

  if (show('foundations')) pages.push(page('foundations', 'foundations',
    h('div', { class: 'pd-inner' },
      h('p', { class: 'pd-kicker' }, 'Our foundations'),
      h('div', { class: 'pd-found' },
        h('div', { class: 'pd-found-card pd-vision' }, h('h3', {}, 'Vision'), T('vision', 'p', 'pd-lead', true)),
        h('div', { class: 'pd-found-card pd-mission' }, h('h3', {}, 'Mission'), T('mission', 'p', 'pd-lead', true)),
        h('div', { class: 'pd-found-card pd-values' }, h('h3', {}, 'Values'), T('values', 'p', 'pd-body', true)))),
    foot(pages.length + 1)));

  if (show('glance')) pages.push(page('glance', 'glance',
    h('div', { class: 'pd-inner' },
      h('p', { class: 'pd-kicker' }, 'The plan at a glance'),
      T('title', 'h2', 'pd-h2'),
      T('glanceIntro', 'p', 'pd-body', true),
      h('div', { class: 'pd-glance', style: `--cols:${Math.min(3, Math.max(1, snap.objectives.length))}` },
        snap.objectives.map((o, i) => h('div', { class: 'pd-glance-col', style: `--hue:var(--pd-c${i % 3})` },
          h('div', { class: 'pd-glance-head' }, h('span', { class: 'pd-num' }, String(i + 1).padStart(2, '0')), T(`obj:${o.id}:title`, 'h3')),
          h('ul', {}, o.goals.map((g) => h('li', {}, T(`goal:${g.id}:title`)))))))),
    foot(pages.length + 1)));

  if (show('objectives')) snap.objectives.forEach((o, i) => pages.push(page('objectives', 'objective',
    Picture(`obj:${o.id}`, i + 1, 'pd-strip'),
    h('div', { class: 'pd-inner', style: `--hue:var(--pd-c${i % 3})` },
      h('p', { class: 'pd-kicker' }, `Objective ${i + 1}`),
      T(`obj:${o.id}:title`, 'h2', 'pd-h2'),
      T(`obj:${o.id}:intro`, 'p', 'pd-body pd-intro', true),
      o.measures.length > 0 && h('div', { class: 'pd-measures' }, o.measures.map(Measure)),
      h('div', { class: 'pd-goals' }, o.goals.map((g, k) => h('article', { class: 'pd-goal' },
        h('span', { class: 'pd-goal-num' }, `${i + 1}.${k + 1}`),
        h('div', {},
          T(`goal:${g.id}:title`, 'h3', 'pd-goal-title'),
          (g.notes || editable) && T(`goal:${g.id}:notes`, 'p', 'pd-small', true),
          g.measures.length > 0 && h('div', { class: 'pd-measures compact' }, g.measures.map(Measure)),
          g.workplans.length > 0 && h('p', { class: 'pd-work' }, h('b', {}, 'How: '), g.workplans.map((w) => w.title + (w.start ? ` (${yearOf(w.start)}${yearOf(w.end) && yearOf(w.end) !== yearOf(w.start) ? `–${yearOf(w.end)}` : ''})` : '')).join(' · '))))))),
    foot(pages.length + 1))));

  const headline = headlineMeasures(snap);
  if (show('numbers') && headline.length) pages.push(page('numbers', 'numbers',
    h('div', { class: 'pd-inner' },
      h('p', { class: 'pd-kicker' }, 'Progress'),
      T('numbersTitle', 'h2', 'pd-h2'),
      T('numbersIntro', 'p', 'pd-body', true),
      h('div', { class: 'pd-big-grid' }, headline.map((m, i) => h('div', { class: 'pd-big', style: `--hue:var(--pd-c${i % 3})` },
        h('div', { class: 'pd-big-num' }, fmt(m.facts.value, m.unit), m.unit && m.unit !== '%' && h('small', {}, ` ${m.unit}`)),
        h('div', { class: 'pd-big-name' }, m.name),
        m.facts.ofTarget != null && h('div', { class: 'pd-bar' }, h('span', { style: `width:${Math.min(100, m.facts.ofTarget)}%` })),
        h('div', { class: 'pd-big-sub' }, [m.facts.ofTarget != null && `${m.facts.ofTarget}% of target ${fmt(m.facts.target, m.unit)}`, m.facts.change != null && `${m.facts.change >= 0 ? '▲' : '▼'} ${Math.abs(m.facts.change)}% on last year`].filter(Boolean).join(' · ')))))),
    foot(pages.length + 1)));

  if (show('closing')) {
    const c = snap.org.contact ?? {};
    pages.push(page('closing', 'closing',
      h('div', { class: 'pd-inner' },
        T('closingTitle', 'h2', 'pd-h2'),
        T('closing', 'p', 'pd-lead', true),
        h('dl', { class: 'pd-contact' },
          c.website && [h('dt', {}, 'Web'), h('dd', {}, c.website)],
          c.email && [h('dt', {}, 'Email'), h('dd', {}, c.email)],
          c.phone && [h('dt', {}, 'Phone'), h('dd', {}, c.phone)],
          c.address && [h('dt', {}, 'Address'), h('dd', {}, c.address)]),
        h('p', { class: 'pd-made' }, `${snap.org.name} · ${textOf(pd, snap, 'title')} · Made with Dashi`))));
  }

  const doc = h('div', { class: `pd-doc pd-${pd.template ?? 'modern'}`, 'data-theme': palette || 'corporate' }, pages);
  doc.style.setProperty('--pd-c0', colours[0]);
  doc.style.setProperty('--pd-c1', colours[1]);
  doc.style.setProperty('--pd-c2', colours[2]);
  return doc;

  function Measure(m) {
    const f = m.facts;
    return h('div', { class: 'pd-measure' },
      h('div', { class: 'pd-measure-row' }, h('span', {}, m.name), h('b', {}, f ? `${fmt(f.value, m.unit)}${m.unit && m.unit !== '%' ? ` ${m.unit}` : ''}` : m.target ? `Target ${fmt(m.target, m.unit)}` : '')),
      f?.ofTarget != null && h('div', { class: 'pd-bar' }, h('span', { style: `width:${Math.min(100, f.ofTarget)}%` })),
      f?.target && h('div', { class: 'pd-measure-sub' }, `Target ${fmt(f.target, m.unit)}${m.unit && m.unit !== '%' ? ` ${m.unit}` : ''}`));
  }
}
