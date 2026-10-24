import { h } from '../ui/dom.js';
import { monthLabel } from '../strategy/dates.js';

/**
 * The timeline data player: play / pause and a month slider. Calls
 * onChange(month) as it moves, so a dashboard can redraw for that month.
 * Steps one month at a time (no tweening), so it is calm with reduced motion.
 */
export function Player({ months, value, onChange, stepMs = 700 }) {
  let i = Math.max(0, months.indexOf(value));
  if (months.indexOf(value) === -1) i = months.length - 1;
  let timer = null;

  const label = h('output', { class: 'player-month', 'aria-live': 'polite' }, months.length ? monthLabel(months[i]) : '—');
  const slider = h('input', {
    type: 'range', min: '0', max: String(Math.max(0, months.length - 1)), step: '1', value: String(i),
    'aria-label': 'Month', 'aria-valuetext': months.length ? monthLabel(months[i]) : '',
    oninput: (e) => go(+e.target.value),
  });
  const button = h('button', { class: 'player-play', 'aria-pressed': 'false', onclick: () => (timer ? stop() : play()) }, '▶ Play');

  function go(n) {
    i = Math.max(0, Math.min(months.length - 1, n));
    slider.value = String(i);
    slider.setAttribute('aria-valuetext', monthLabel(months[i]));
    label.textContent = monthLabel(months[i]);
    onChange(months[i]);
  }
  function play() {
    if (i >= months.length - 1) go(0);
    button.textContent = '❚❚ Pause';
    button.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => (i >= months.length - 1 ? stop() : go(i + 1)), stepMs);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    button.textContent = '▶ Play';
    button.setAttribute('aria-pressed', 'false');
  }

  return h('div', { class: 'player', role: 'group', 'aria-label': 'Timeline player' },
    button,
    h('span', { class: 'player-range' }, months.length ? monthLabel(months[0]) : ''),
    slider,
    h('span', { class: 'player-range' }, months.length ? monthLabel(months.at(-1)) : ''),
    label);
}
