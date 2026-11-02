import { svg } from '../core/svg.js';
import { crosswalk } from '../lenses/crosswalk.js';

/**
 * Diagrams for the Help plugin, drawn from the real lens files and data
 * model, so they stay right when a lens or document changes.
 */

const text = (parent, x, y, str, attrs = {}) => {
  const t = svg('text', { x, y, ...attrs }, parent);
  t.textContent = str;
  return t;
};

/** Wrap a label onto at most `lines` lines of about `chars` characters. */
function wrap(str, chars, lines = 2) {
  const out = [];
  let cur = '';
  for (const w of str.split(' ')) {
    if (cur && `${cur} ${w}`.length > chars) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out;
  const kept = out.slice(0, lines);
  kept[lines - 1] += '…';
  return kept;
}

/**
 * Every lens as a column on the shared depth scale, surface at the top and
 * the deep end at the bottom, with the micro / meso / macro tiers marked
 * across all of them.
 */
export function lensAlignment(lenses, { order } = {}) {
  const list = order ? order.map((id) => lenses.get(id)).filter(Boolean) : [...lenses.values()];
  const colW = 196;
  const gap = 14;
  const left = 118;
  const top = 64;
  const H = 520;
  const W = left + list.length * (colW + gap) + 8;
  const y = (d) => top + d * H;
  const el = svg('svg', { viewBox: `0 0 ${W} ${top + H + 40}`, class: 'diagram', role: 'img',
    'aria-label': 'The five lenses side by side on one depth scale, from explicit structural change at the top to implicit personal change at the bottom.' });

  // The depth axis.
  svg('line', { x1: left - 22, x2: left - 22, y1: y(0), y2: y(1), class: 'dg-axis', 'marker-end': 'url(#dg-arrow)' }, el);
  const defs = svg('defs', {}, el);
  const m = svg('marker', { id: 'dg-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
  svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'dg-arrowhead' }, m);
  text(el, left - 30, y(0) + 12, 'Surface', { class: 'dg-axis-label', 'text-anchor': 'end' });
  text(el, left - 30, y(0) + 27, 'explicit', { class: 'dg-small', 'text-anchor': 'end' });
  text(el, left - 30, y(0) + 41, 'structural', { class: 'dg-small', 'text-anchor': 'end' });
  text(el, left - 30, y(1) - 34, 'Deep', { class: 'dg-axis-label', 'text-anchor': 'end' });
  text(el, left - 30, y(1) - 19, 'implicit', { class: 'dg-small', 'text-anchor': 'end' });
  text(el, left - 30, y(1) - 5, 'personal', { class: 'dg-small', 'text-anchor': 'end' });

  list.forEach((lens, i) => {
    const x = left + i * (colW + gap);
    wrap(lens.name, 24, 2).forEach((line, k) => text(el, x + colW / 2, 22 + k * 16, line, { class: 'dg-head', 'text-anchor': 'middle' }));
    for (const r of lens.regions) {
      const y0 = y(r.depth[0]);
      const h = y(r.depth[1]) - y0;
      svg('rect', { x, y: y0, width: colW, height: h, fill: r.tint ?? '#eef1f6', class: 'dg-region' }, el);
      const size = h < 50 ? 'dg-tiny' : 'dg-label';
      const lines = wrap(r.label, h < 50 ? 36 : 26, h < 50 ? 1 : 2);
      const mid = y0 + h / 2 - ((lines.length - 1) * 14) / 2 + 4;
      lines.forEach((line, k) => text(el, x + 10, mid + k * 14, line, { class: size }));
    }
  });

  // The tiers, drawn across every column.
  const tiers = crosswalk(lenses).map((row) => row.region);
  for (const t of tiers) {
    if (t.depth[0] > 0) svg('line', { x1: left - 8, x2: W - 8, y1: y(t.depth[0]), y2: y(t.depth[0]), class: 'dg-tier-line' }, el);
  }
  return el;
}

/** Boxes for each document and arrows for the ids that connect them. */
export function dataModelDiagram() {
  const W = 1120;
  const Hh = 690;
  const el = svg('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'diagram', role: 'img',
    'aria-label': 'The documents each org holds and the ids that link them: strategy measures feed program data and dashboards, dashboards publish to sites, task assets point at map actors and staff.' });
  const defs = svg('defs', {}, el);
  const m = svg('marker', { id: 'dm-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
  svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'dg-arrowhead' }, m);

  const box = (x, y, w, title, lines, cls = '') => {
    const h = 34 + lines.length * 17;
    svg('rect', { x, y, width: w, height: h, rx: 6, class: `dm-box ${cls}` }, el);
    text(el, x + 12, y + 22, title, { class: 'dm-title' });
    lines.forEach((l, i) => text(el, x + 12, y + 44 + i * 17, l, { class: 'dm-field' }));
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
  };
  const arrow = (d, label, lx, ly) => {
    svg('path', { d, class: 'dm-link', 'marker-end': 'url(#dm-arrow)' }, el);
    if (label) {
      const t = text(el, lx, ly, label, { class: 'dm-link-label', 'text-anchor': 'middle' });
      t.setAttribute('paint-order', 'stroke');
    }
  };

  const reg = box(400, 14, 320, 'Platform registry', ['orgs · which org is open · who is signed in'], 'dm-root');
  svg('rect', { x: 14, y: 96, width: W - 28, height: Hh - 110, rx: 10, class: 'dm-org-frame' }, el);
  text(el, 30, 120, 'Each org’s documents (stored under its id)', { class: 'dm-frame-label' });
  arrow(`M ${reg.cx} ${reg.b} V 96`, 'opens', reg.cx + 28, 86);

  const org = box(40, 140, 300, 'org', ['name · description · contact · logo', 'theme { palette, shape } · plugins', 'staff { role, teams, avatar, interests }', 'teams · sites { visibility }', 'every plugin points here for people']);
  const strat = box(410, 140, 300, 'strategy', ['nodes: framework › plan › objective', '› goal › workplan › task', 'objective/goal.measures [{ id }]', 'task.assigneeIds · workplan.staffIds', 'task/workplan.assets [ ]']);
  const maps = box(780, 140, 300, 'maps  +  map/<id>', ['index: title · ownerId · memberIds (staff)', 'each map: actors { place, kind }', 'connectors · groups · layers · lensId']);
  const data = box(410, 380, 300, 'data', ['series[measureId].points', '[{ date, value }] by month']);
  const dash = box(40, 380, 300, 'dashboards', ['widgets [{ type, measureId, nodeId }]', 'visibility · siteId · createdBy', 'sourceNodeId']);
  const pods = box(780, 380, 300, 'podcasts  (Castopod-shaped)', ['shows { hostIds (staff), seasons, featured }', 'episodes { season, audio: an upload }', 'station { siteId, look } · RSS per show']);
  const pages = box(410, 540, 300, 'pages', ['pages and articles { siteId, authorId }', 'body: light markdown with live', '[[dashboard]] and [[episode]] embeds']);
  const site = box(40, 540, 300, 'public site (site.html)', ['one site’s dashboards, pages, news', 'and podcast station, live, in the', 'org’s theme, with its logo'], 'dm-out');

  arrow(`M ${strat.cx} ${strat.b} V ${data.y}`, 'measureId', strat.cx + 40, (strat.b + data.y) / 2);
  arrow(`M ${data.x} ${data.cy} H ${dash.r}`, 'reads values', (data.x + dash.r) / 2, data.cy - 8);
  arrow(`M ${strat.x} ${strat.b - 20} C ${strat.x - 40} ${strat.b + 40}, ${dash.cx + 60} ${dash.y - 40}, ${dash.cx + 40} ${dash.y}`, 'measures, progress', 336, 340);
  arrow(`M ${strat.r} ${strat.y + 100} H ${maps.x}`, 'assets → actor', (strat.r + maps.x) / 2, strat.y + 92);
  arrow(`M ${strat.x} ${strat.y + 40} H ${org.r}`, 'staff ids', (strat.x + org.r) / 2, strat.y + 32);
  arrow(`M ${dash.cx} ${dash.b} V ${site.y}`, 'siteId', dash.cx + 30, (dash.b + site.y) / 2 + 4);
  arrow(`M ${pages.x} ${pages.cy} H ${site.r}`, 'siteId', (pages.x + site.r) / 2, pages.cy - 8);
  arrow(`M ${pods.cx} ${pods.b} V ${Hh - 24} H ${site.cx} V ${site.b}`, 'station.siteId', (pods.cx + pages.r) / 2 + 30, Hh - 30);
  return el;
}
