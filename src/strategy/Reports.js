import { h } from '../ui/dom.js';
import { svg } from '../core/svg.js';
import { NODE_TYPES, measureIndex, ancestors } from '../platform/strategy.js';
import { measureFacts } from '../platform/data.js';
import { roadmap, workplanProgress, lightOf, LIGHTS, PROGRESS_STATES } from '../platform/strategyReports.js';
import { monthLabel, range, short, today } from './dates.js';

const num = (v) => v.toLocaleString('en-CA', { maximumFractionDigits: 1 });
const withUnit = (v, unit) => (unit === '%' ? `${num(v)}%` : `${num(v)}${unit ? ` ${unit}` : ''}`);
const path = (nodes) => nodes.filter((n) => n.type === 'objective' || n.type === 'goal').map((n) => n.title).join(' › ');

/** A traffic light: a coloured disc with a shape inside, so it reads without colour too. */
export function Light(id, size = 18) {
  const l = LIGHTS[id];
  const el = svg('svg', { viewBox: '0 0 20 20', width: size, height: size, class: `light light-${id}`, role: 'img', 'aria-label': l.label });
  svg('circle', { cx: 10, cy: 10, r: 9, fill: l.color }, el);
  const mark = { green: 'M5.5 10.5 L8.5 13.5 L14.5 7', amber: 'M10 5.5 V10.5 L13 12.5', red: 'M6.5 10 H13.5' }[id];
  svg('path', { d: mark, fill: 'none', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, el);
  return el;
}

const Meter = (pct, { marker, label } = {}) => h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, pct), 'aria-label': label },
  h('span', { class: 'meter-fill', style: `width:${Math.min(100, pct)}%` }),
  marker != null && h('span', { class: 'meter-marker', style: `left:${marker}%`, title: `Expected by today: ${marker}%` }));

function Sparkline(points, w = 120, ht = 32) {
  const el = svg('svg', { viewBox: `0 0 ${w} ${ht}`, width: w, height: ht, class: 'sparkline', 'aria-hidden': 'true' });
  if (points.length < 2) return el;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const span = Math.max(...vals) - lo || 1;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * (w - 6) + 3).toFixed(1)} ${(ht - 4 - ((v - lo) / span) * (ht - 8)).toFixed(1)}`).join(' ');
  svg('path', { d, class: 'sparkline-line' }, el);
  return el;
}

/** Strategic data: every measure's latest value against its target, grouped by where it sits. */
export function StrategicData(ctx) {
  const doc = ctx.store.doc;
  const measures = Object.values(measureIndex(doc));
  if (!measures.length) return h('p', { class: 'empty' }, 'No measures yet. Add them to objectives and goals in the Framework tab.');
  const groups = new Map();
  for (const m of measures) {
    const objective = doc.nodes[m.nodeId].type === 'objective' ? doc.nodes[m.nodeId] : ancestors(doc, m.nodeId).find((n) => n.type === 'objective');
    const key = objective?.id ?? 'other';
    if (!groups.has(key)) groups.set(key, { objective, rows: [] });
    groups.get(key).rows.push({ m, f: measureFacts(m, ctx.data.series[m.id]) });
  }
  const withData = measures.filter((m) => ctx.data.series[m.id]?.points.length).length;

  return h('div', {},
    h('p', { class: 'lede' }, `${measures.length} measures across the framework, ${withData} with program data. Values update from the Workbench’s Program data tool.`),
    [...groups.values()].map(({ objective, rows }) => h('section', { class: 'report-group' },
      h('h2', {}, objective ? h('a', { href: `#${objective.id}` }, objective.title) : 'Other measures'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm report-table' },
        h('thead', {}, h('tr', {}, ['Measure', 'Latest', 'Target', 'Progress to target', 'Last 12 months', 'On a year ago'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map(({ m, f }) => h('tr', {},
          h('td', {}, h('strong', {}, m.name), m.nodeType === 'goal' && h('small', { class: 'muted block' }, h('a', { href: `#${m.nodeId}` }, m.nodeTitle))),
          h('td', {}, f ? [h('strong', {}, withUnit(f.value, m.unit)), h('small', { class: 'muted block' }, monthLabel(f.date))] : h('span', { class: 'muted' }, 'No data yet')),
          h('td', {}, f?.target != null ? withUnit(f.target, m.unit) : m.target || '—'),
          h('td', { class: 'meter-cell' }, f?.ofTarget != null ? [Meter(f.ofTarget, { label: `${m.name}: ${f.ofTarget}% of target` }), h('small', {}, `${f.ofTarget}%`)] : '—'),
          h('td', {}, f ? Sparkline(f.points) : ''),
          h('td', {}, f?.change != null ? `${f.change >= 0 ? '▲' : '▼'} ${Math.abs(f.change)}%` : '—')))))))));
}

/** Workplan completion: tasks done per workplan, against how far through its dates it is. */
export function Completion(ctx) {
  const doc = ctx.store.doc;
  const now = today();
  const rows = roadmap(doc).map((r) => ({ ...r, p: workplanProgress(doc, r.workplan.id, now) }));
  if (!rows.length) return h('p', { class: 'empty' }, 'No workplans yet.');
  const all = rows.reduce((s, r) => ({ done: s.done + r.p.done, total: s.total + r.p.total }), { done: 0, total: 0 });
  const count = (state) => rows.filter((r) => r.p.state === state).length;

  return h('div', {},
    h('div', { class: 'stat-tiles' },
      h('div', { class: 'stat-tile' }, h('span', {}, 'All tasks done'), h('strong', {}, `${all.total ? Math.round((all.done / all.total) * 100) : 0}%`), h('small', {}, `${all.done} of ${all.total}`)),
      ['complete', 'on-track', 'behind', 'not-started'].map((s) => h('div', { class: 'stat-tile' },
        h('span', { class: 'icon-text' }, Light(PROGRESS_STATES[s].light, 14), PROGRESS_STATES[s].label), h('strong', {}, count(s)), h('small', {}, 'workplans')))),
    h('p', { class: 'muted small' }, 'The bar is the share of tasks done. The tick is where a workplan would be if its tasks were spread evenly over its dates; more than 15 points short of it counts as behind.'),
    h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm report-table' },
      h('thead', {}, h('tr', {}, ['Workplan', 'Dates', 'Done', 'Completion', 'Open', 'To start', 'Status'].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map(({ workplan: w, path: p, p: pr }) => h('tr', {},
        h('td', {}, h('a', { href: `#${w.id}` }, h('strong', {}, w.title)), h('small', { class: 'muted block' }, path(p))),
        h('td', { class: 'nowrap' }, range(w.start, w.end)),
        h('td', {}, `${pr.done}/${pr.total}`),
        h('td', { class: 'meter-cell' }, Meter(pr.pct, { marker: pr.expected, label: `${w.title}: ${pr.pct}% done` }), h('small', {}, `${pr.pct}%`)),
        h('td', {}, pr.active + pr.blocked, pr.blocked ? h('small', { class: 'muted' }, ` (${pr.blocked} blocked)`) : ''),
        h('td', {}, pr.planned),
        h('td', { class: 'nowrap' }, h('span', { class: 'icon-text' }, Light(PROGRESS_STATES[pr.state].light, 14), PROGRESS_STATES[pr.state].label))))))));
}

/** The roadmap as traffic lights: one light per task, workplan by workplan. */
export function Roadmap(ctx) {
  const doc = ctx.store.doc;
  const rows = roadmap(doc);
  if (!rows.length) return h('p', { class: 'empty' }, 'No workplans yet.');
  const tasks = rows.flatMap((r) => r.tasks);
  const tally = Object.fromEntries(Object.keys(LIGHTS).map((k) => [k, tasks.filter((t) => lightOf(t) === k).length]));
  // Group by objective, then goal.
  const sections = [];
  for (const r of rows) {
    const objective = r.path.find((n) => n.type === 'objective');
    const goal = r.path.find((n) => n.type === 'goal');
    let s = sections.find((x) => x.objective === objective);
    if (!s) sections.push((s = { objective, plan: r.path.filter((n) => n.type === 'plan').at(-1), goals: [] }));
    let g = s.goals.find((x) => x.goal === goal);
    if (!g) s.goals.push((g = { goal, rows: [] }));
    g.rows.push(r);
  }

  return h('div', { class: 'roadmap' },
    h('div', { class: 'roadmap-summary' },
      Object.values(LIGHTS).map((l) => h('div', { class: 'roadmap-total' }, Light(l.id, 34), h('div', {}, h('strong', {}, tally[l.id]), h('span', {}, l.label))))),
    h('p', { class: 'muted small' }, 'Each light is a task (a milestone on the way), in date order: ',
      h('span', { class: 'icon-text' }, Light('green', 14), 'completed'), ', ',
      h('span', { class: 'icon-text' }, Light('amber', 14), 'open (under way or blocked)'), ', ',
      h('span', { class: 'icon-text' }, Light('red', 14), 'still to be completed'), '. Click a light to open the task.'),
    sections.map((s) => h('section', { class: 'roadmap-objective' },
      h('h2', {}, s.objective ? h('a', { href: `#${s.objective.id}` }, `${NODE_TYPES.objective.glyph} ${s.objective.title}`) : 'Workplans', s.plan && h('small', { class: 'muted' }, ` ${s.plan.title}`)),
      s.goals.map((g) => h('div', { class: 'roadmap-goal' },
        g.goal && h('h3', {}, h('a', { href: `#${g.goal.id}` }, `${NODE_TYPES.goal.glyph} ${g.goal.title}`)),
        h('ul', { class: 'roadmap-rows' }, g.rows.map(({ workplan: w, tasks: ts }) => h('li', {},
          h('div', { class: 'roadmap-wp' }, h('a', { href: `#${w.id}` }, w.title), h('small', { class: 'muted' }, range(w.start, w.end))),
          h('ol', { class: 'roadmap-lights', 'aria-label': `Tasks in ${w.title}` },
            ts.length ? ts.map((t) => h('li', {}, h('a', { href: `#${t.id}`, title: `${t.title} · ${LIGHTS[lightOf(t)].label} · ${short(t.start)} – ${short(t.end)}` },
              Light(lightOf(t), 22), h('span', { class: 'sr-only' }, `${t.title}: ${LIGHTS[lightOf(t)].label}`))))
              : h('li', { class: 'muted small' }, 'No tasks yet')),
          h('span', { class: 'roadmap-count muted' }, `${ts.filter((t) => t.status === 'done').length}/${ts.length}`)))))))));
}
