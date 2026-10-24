import { h } from '../ui/dom.js';
import { svg } from '../core/svg.js';
import { statusById, strategyOps } from '../platform/strategy.js';
import { addDays, daysBetween, monthLabel, monthStarts, short, today } from './dates.js';

const KINDS = [
  { id: 'note', label: 'Note' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'status', label: 'Status change' },
];

/**
 * A task's lifetime as one line: start to end, coloured by status over
 * time, with notes, milestones and status changes pinned along it, and
 * today marked.
 */
export function Timeline(ctx, task) {
  const { store } = ctx;
  const now = today();
  const dates = [task.start, task.end, ...task.events.map((e) => e.date)].filter(Boolean);
  if (!dates.length) return h('p', { class: 'muted' }, 'Give the task dates to see its timeline.');
  const from = addDays([...dates].sort()[0], -7);
  const to = addDays([...dates, now].sort().at(-1), 7);
  const W = 900;
  const H = 220;
  const mid = 112;
  const span = Math.max(1, daysBetween(from, to));
  const xOf = (d) => 20 + (daysBetween(from, d) / span) * (W - 40);

  const chart = svg('svg', { class: 'timeline-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  svg('line', { class: 'tl-axis', x1: 20, x2: W - 20, y1: mid, y2: mid }, chart);
  for (const m of monthStarts(from.slice(0, 8) + '01', to)) {
    if (m < from) continue;
    const x = xOf(m);
    svg('line', { class: 'tl-tick', x1: x, x2: x, y1: mid - 5, y2: mid + 5 }, chart);
    svg('text', { class: 'tl-month', x, y: H - 6, 'text-anchor': 'middle' }, chart).textContent = monthLabel(m);
  }

  // Status segments between start and end: the status in force on each day.
  if (task.start && task.end) {
    const changes = task.events.filter((e) => e.kind === 'status' && statusById[e.text]);
    let cursor = task.start;
    let status = 'planned';
    const segment = (a, b, s) => {
      if (b <= a) return;
      svg('rect', { class: 'tl-life', x: xOf(a), y: mid - 7, width: Math.max(2, xOf(b) - xOf(a)), height: 14, fill: statusById[s].color }, chart);
    };
    for (const c of changes) {
      const d = c.date < task.start ? task.start : c.date > task.end ? task.end : c.date;
      segment(cursor, d, status);
      cursor = d;
      status = c.text;
    }
    segment(cursor, addDays(task.end, 1), status);
    for (const [d, label] of [[task.start, 'Start'], [task.end, 'End']]) {
      svg('line', { class: 'tl-bound', x1: xOf(d), x2: xOf(d), y1: mid - 22, y2: mid + 22 }, chart);
      svg('text', { class: 'tl-bound-label', x: xOf(d), y: mid + 36, 'text-anchor': 'middle' }, chart).textContent = `${label} ${short(d)}`;
    }
  }

  // Labels go in four lanes (two above the line, two below), each event in
  // the first lane where it won't overlap the previous label.
  const LANES = [mid - 40, mid + 58, mid - 66, mid + 84];
  const laneEnds = LANES.map(() => -Infinity);
  task.events.forEach((ev) => {
    const x = xOf(ev.date);
    const label = `${short(ev.date)} · ${ev.kind === 'status' ? `→ ${statusById[ev.text]?.label ?? ev.text}` : ev.text}`;
    const halfWidth = label.length * 3.1;
    let lane = laneEnds.findIndex((end) => end < x - halfWidth - 8);
    if (lane === -1) lane = laneEnds.indexOf(Math.min(...laneEnds));
    laneEnds[lane] = x + halfWidth;
    const y = LANES[lane];
    const up = y < mid;
    svg('line', { class: 'tl-stem', x1: x, x2: x, y1: mid, y2: up ? y + 6 : y - 14 }, chart);
    const shape =
      ev.kind === 'milestone' ? svg('path', { d: `M ${x} ${mid - 9} L ${x + 9} ${mid} L ${x} ${mid + 9} L ${x - 9} ${mid} Z` }, chart)
      : ev.kind === 'status' ? svg('rect', { x: x - 6, y: mid - 6, width: 12, height: 12 }, chart)
      : svg('circle', { cx: x, cy: mid, r: 6 }, chart);
    shape.setAttribute('class', `tl-mark ${ev.kind}`);
    svg('text', { class: 'tl-event', x, y, 'text-anchor': 'middle' }, chart).textContent = label;
  });

  const tx = xOf(now);
  svg('line', { class: 'tl-today', x1: tx, x2: tx, y1: 14, y2: H - 22 }, chart);
  svg('text', { class: 'tl-today-label', x: tx + 4, y: 22 }, chart).textContent = 'Today';

  const date = h('input', { type: 'date', value: now });
  const kind = h('select', {}, KINDS.filter((k) => k.id !== 'status').map((k) => h('option', { value: k.id }, k.label)));
  const text = h('input', { placeholder: 'What happened?', style: 'flex:1;min-width:180px' });

  return h('div', { class: 'timeline' },
    chart,
    h('form', { class: 'inline-form', onsubmit: (e) => {
      e.preventDefault();
      if (!text.value.trim()) return;
      store.apply(strategyOps.addEvent(store.doc, task.id, { date: date.value, kind: kind.value, text: text.value.trim() }));
    } }, date, kind, text, h('button', { type: 'submit' }, 'Add to timeline')),
    task.events.length > 0 && h('ul', { class: 'event-list' },
      [...task.events].reverse().map((ev) =>
        h('li', {},
          h('span', { class: 'when' }, short(ev.date)),
          h('span', { class: `kind ${ev.kind}` }, KINDS.find((k) => k.id === ev.kind)?.label ?? ev.kind),
          h('span', {}, ev.kind === 'status' ? statusById[ev.text]?.label ?? ev.text : ev.text),
          h('button', { class: 'icon-button', title: 'Remove', onclick: () =>
            store.apply(strategyOps.update(task.id, { events: task.events.filter((x) => x.id !== ev.id) })) }, '×'),
        ))),
  );
}
