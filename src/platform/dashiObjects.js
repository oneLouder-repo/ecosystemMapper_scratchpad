import { Stage } from '../core/Stage.js';
import { Store } from '../core/Store.js';
import { MapView } from '../display/MapView.js';
import { lensBounds, loadLenses } from '../lenses/index.js';
import { migrateMap } from '../seed.js';
import { loadMapContent } from './maps.js';
import { childrenOf, rootOf, measureIndex } from './strategy.js';
import { measureFacts, seriesOf } from './data.js';
import { drawPostcard, themeColours } from '../palette/PostcardTool.js';

/**
 * Dashi objects: pictures of high-level Dashi data, made in the browser,
 * to drop into documents, emails and pages. Each returns a PNG data URL.
 *
 *   mapPicture(mapId)                      an ecosystem map, as drawn in the mapper
 *   strategyPicture(strategy, planId, org) the strategic plan out to its goals, as a dense infographic
 *   dataCardPicture(measureId, docs, org)  a data card (postcard) for one measure
 *
 * The infographic itself is plain SVG (strategySvg), so it can also be
 * tested without a browser.
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Draw an SVG string onto a canvas and return a PNG data URL. */
export async function svgToPng(xml, w, h, scale = 2) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/* ---------- Ecosystem maps ---------- */

let lensesPromise;
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-size', 'font-weight', 'font-family', 'letter-spacing', 'text-transform', 'text-anchor', 'dominant-baseline', 'paint-order', 'display', 'visibility'];

export async function mapPicture(mapId, { width = 1600, height = 1000 } = {}) {
  lensesPromise ??= loadLenses();
  const lenses = await lensesPromise;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('width', width);
  svgEl.setAttribute('height', height);
  svgEl.innerHTML = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666" /></marker></defs>';
  host.append(svgEl);
  document.body.append(host);
  try {
    const store = new Store(migrateMap(structuredClone(loadMapContent(mapId)), lenses));
    const stage = new Stage(svgEl);
    const view = new MapView(stage, store, lenses);
    view.sync();
    // Fit the lens and every actor.
    const b = { ...lensBounds(view.lens) };
    for (const a of Object.values(view.world.actors)) {
      const x0 = Math.min(b.x, a.x - a.w / 2), y0 = Math.min(b.y, a.y - a.h / 2);
      const x1 = Math.max(b.x + b.w, a.x + a.w / 2), y1 = Math.max(b.y + b.h, a.y + a.h / 2);
      Object.assign(b, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    const pad = 24;
    stage.scale = Math.min((width - pad * 2) / b.w, (height - pad * 2) / b.h);
    stage.moveTo(width / 2 - (b.x + b.w / 2) * stage.scale, height / 2 - (b.y + b.h / 2) * stage.scale);
    // Carry the page's styles into the picture.
    const clone = svgEl.cloneNode(true);
    const src = svgEl.querySelectorAll('*');
    const dst = clone.querySelectorAll('*');
    src.forEach((el, i) => {
      const css = getComputedStyle(el);
      dst[i].setAttribute('style', STYLE_PROPS.map((p) => `${p}:${css.getPropertyValue(p)}`).join(';'));
    });
    clone.querySelectorAll('.handle, .dock').forEach((el) => el.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.insertBefore(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'rect'), {}), clone.firstChild);
    clone.firstChild.setAttribute('width', width);
    clone.firstChild.setAttribute('height', height);
    clone.firstChild.setAttribute('fill', '#ffffff');
    return await svgToPng(new XMLSerializer().serializeToString(clone), width, height, 1.5);
  } finally {
    host.remove();
  }
}

/* ---------- Strategic plan infographic ---------- */

/** Plans in the strategy, outermost first: [{ id, title, start, end }]. */
export function plansIn(strategy) {
  return Object.values(strategy.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.parentId === b.parentId ? a.order - b.order : 0));
}

/** The plan's objectives and their goals, with measures and their latest facts. */
export function planOutline(strategy, planId, data) {
  const root = rootOf(strategy);
  const plan = strategy.nodes[planId] ?? plansIn(strategy)[0];
  const factsOf = (m) => (data ? measureFacts(m, seriesOf(m.id, data)) : null);
  const objectivesUnder = (id) => childrenOf(strategy, id).flatMap((n) => (n.type === 'objective' ? [n] : n.type === 'plan' ? objectivesUnder(n.id) : []));
  return {
    framework: root,
    plan,
    objectives: plan ? objectivesUnder(plan.id).map((o) => ({
      ...o,
      measures: (o.measures ?? []).map((m) => ({ ...m, facts: factsOf(m) })),
      goals: childrenOf(strategy, o.id).filter((g) => g.type === 'goal').map((g) => ({ ...g, measures: (g.measures ?? []).map((m) => ({ ...m, facts: factsOf(m) })) })),
    })) : [],
  };
}

/** Wrap text to lines of at most `chars` characters. */
export function wrapText(text, chars) {
  const lines = [];
  let line = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > chars && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const fmt = (v, unit) => (v == null ? '' : unit === '%' ? `${Math.round(v)}%` : `${Number(v).toLocaleString('en-CA', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`);

/**
 * The plan as one dense infographic: mission and vision across the top,
 * a column per objective, its goals as cards with their measures.
 * colours = { primary, onPrimary, ink, base, baseAlt }.
 */
export function strategySvg(outline, { orgName = '', colours = {} } = {}) {
  const c = { primary: '#1d4ed8', onPrimary: '#fff', ink: '#1f2937', base: '#fff', baseAlt: '#f3f4f6', ...colours };
  const hues = [c.primary, '#2a9d8f', '#e76f51', '#8e6bbf', '#d4a017', '#3d7ea6'];
  const W = 1600;
  const pad = 48;
  const cols = Math.max(1, outline.objectives.length);
  const gap = 18;
  const colW = (W - pad * 2 - gap * (cols - 1)) / cols;
  const chars = Math.max(18, Math.floor(colW / 8.2));
  const parts = [];
  let y = pad;
  const years = [outline.plan?.start, outline.plan?.end].filter(Boolean).map((d) => String(d).slice(0, 4)).join('–');

  // Header.
  parts.push(`<text x="${pad}" y="${y + 14}" font-size="15" font-weight="700" letter-spacing="2" fill="${c.primary}">${esc(orgName.toUpperCase())}</text>`);
  parts.push(`<text x="${pad}" y="${y + 58}" font-size="40" font-weight="800" fill="${c.ink}">${esc(outline.plan?.title ?? 'Strategic plan')}</text>`);
  if (years) parts.push(`<text x="${W - pad}" y="${y + 58}" text-anchor="end" font-size="28" font-weight="700" fill="${c.primary}">${esc(years)}</text>`);
  y += 84;

  // Mission and vision.
  const fw = outline.framework ?? {};
  const half = (W - pad * 2 - gap) / 2;
  const boxes = [['Our vision', fw.vision], ['Our mission', fw.mission]].filter(([, t]) => t);
  if (boxes.length) {
    const lines = boxes.map(([, t]) => wrapText(t, Math.floor((boxes.length === 2 ? half : W - pad * 2) / 9.4)).slice(0, 4));
    const bh = 46 + Math.max(...lines.map((l) => l.length)) * 24;
    boxes.forEach(([label], i) => {
      const bw = boxes.length === 2 ? half : W - pad * 2;
      const x = pad + i * (half + gap);
      parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="14" fill="${i ? c.baseAlt : c.primary}"/>`);
      parts.push(`<text x="${x + 22}" y="${y + 30}" font-size="13" font-weight="800" letter-spacing="1.5" fill="${i ? c.primary : c.onPrimary}">${esc(label.toUpperCase())}</text>`);
      lines[i].forEach((ln, k) => parts.push(`<text x="${x + 22}" y="${y + 58 + k * 24}" font-size="18" font-weight="600" fill="${i ? c.ink : c.onPrimary}">${esc(ln)}</text>`));
    });
    y += bh + 26;
  }

  // Objectives and their goals.
  const colTop = y;
  let bottom = y;
  outline.objectives.forEach((o, i) => {
    const hue = hues[i % hues.length];
    const x = pad + i * (colW + gap);
    let cy = colTop;
    const title = wrapText(o.title, Math.floor(colW / 10.5)).slice(0, 3);
    const hh = 40 + title.length * 22;
    parts.push(`<rect x="${x}" y="${cy}" width="${colW}" height="${hh}" rx="12" fill="${hue}"/>`);
    parts.push(`<text x="${x + 16}" y="${cy + 24}" font-size="12" font-weight="800" letter-spacing="1.5" fill="#fff" opacity="0.85">OBJECTIVE ${i + 1}</text>`);
    title.forEach((ln, k) => parts.push(`<text x="${x + 16}" y="${cy + 48 + k * 22}" font-size="18" font-weight="800" fill="#fff">${esc(ln)}</text>`));
    cy += hh + 10;
    for (const g of o.goals) {
      const gl = wrapText(g.title, chars).slice(0, 4);
      const ms = g.measures.slice(0, 3);
      const gh = 18 + gl.length * 19 + ms.length * 34 + 8;
      parts.push(`<rect x="${x}" y="${cy}" width="${colW}" height="${gh}" rx="10" fill="${c.base}" stroke="${hue}" stroke-opacity="0.35"/>`);
      parts.push(`<rect x="${x}" y="${cy}" width="5" height="${gh}" rx="2" fill="${hue}"/>`);
      gl.forEach((ln, k) => parts.push(`<text x="${x + 18}" y="${cy + 24 + k * 19}" font-size="14.5" font-weight="700" fill="${c.ink}">${esc(ln)}</text>`));
      let my = cy + 18 + gl.length * 19 + 6;
      for (const m of ms) {
        const f = m.facts;
        const name = wrapText(m.name, chars + 6)[0] ?? '';
        parts.push(`<text x="${x + 18}" y="${my + 12}" font-size="11.5" fill="${c.ink}" opacity="0.7">${esc(name)}</text>`);
        const val = f ? fmt(f.value, m.unit) : m.target ? `Target ${fmt(m.target, m.unit)}` : '';
        parts.push(`<text x="${x + colW - 14}" y="${my + 12}" text-anchor="end" font-size="12" font-weight="800" fill="${hue}">${esc(val)}</text>`);
        const pct = f?.ofTarget != null ? Math.min(100, f.ofTarget) : null;
        if (pct != null) {
          parts.push(`<rect x="${x + 18}" y="${my + 18}" width="${colW - 32}" height="6" rx="3" fill="${hue}" opacity="0.18"/>`);
          parts.push(`<rect x="${x + 18}" y="${my + 18}" width="${Math.max(6, (colW - 32) * pct / 100)}" height="6" rx="3" fill="${hue}"/>`);
        }
        my += 34;
      }
      cy += gh + 8;
    }
    bottom = Math.max(bottom, cy);
  });
  if (!outline.objectives.length) {
    parts.push(`<text x="${pad}" y="${y + 30}" font-size="18" fill="${c.ink}" opacity="0.6">Add objectives and goals to this plan in Strategy &amp; Work.</text>`);
    bottom = y + 60;
  }
  const H = bottom + 34;
  parts.push(`<text x="${W - pad}" y="${H - 16}" text-anchor="end" font-size="11" fill="${c.ink}" opacity="0.45">Made with Dashi</text>`);
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Nunito, system-ui, -apple-system, 'Segoe UI', sans-serif"><rect width="${W}" height="${H}" fill="${c.base}"/>${parts.join('')}</svg>`;
  return { xml, width: W, height: H };
}

export async function strategyPicture(strategy, planId, org, data) {
  const { xml, width, height } = strategySvg(planOutline(strategy, planId, data), { orgName: org.name, colours: themeColours(org) });
  return svgToPng(xml, width, height, 1.25);
}

/* ---------- Data cards ---------- */

export function measuresWithData(strategy, data) {
  return Object.values(measureIndex(strategy)).filter((m) => seriesOf(m.id, data)?.points.length);
}

export async function dataCardPicture(measureId, { strategy, data }, org, { style = 'bold', size = 'wide' } = {}) {
  const m = measureIndex(strategy)[measureId];
  const facts = m && measureFacts(m, seriesOf(m.id, data));
  if (!facts) throw new Error('That measure has no data yet');
  const canvas = document.createElement('canvas');
  canvas.width = size === 'square' ? 1080 : 1200;
  canvas.height = size === 'square' ? 1080 : 675;
  drawPostcard(canvas, { org, measure: m, facts, style, headline: '', note: '' });
  return canvas.toDataURL('image/png');
}
