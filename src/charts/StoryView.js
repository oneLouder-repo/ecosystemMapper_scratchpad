import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { renderWidget } from './widgets.js';
import { audioSrc } from '../platform/media.js';

/**
 * A data story: steps of words that scroll past a chart that stays in
 * view. As each step reaches the middle of the screen the chart changes to
 * that step's measure; a step can carry an audio clip with a Listen button.
 * Used in the Workbench preview and on public sites.
 */
let playing = null; // { audio, button }: one clip at a time, across stories

export function StoryView(story, docs) {
  const stage = h('div', { class: 'story-stage' });
  const steps = story.steps.map((s, i) =>
    h('article', { class: 'story-step', 'data-step': i },
      h('span', { class: 'story-count' }, `${i + 1} of ${story.steps.length}`),
      s.heading && h('h3', {}, s.heading),
      s.text && s.text.split(/\n{2,}/).map((p) => h('p', {}, p)),
      s.audio && ListenButton(s.audio)));
  // A step without a chart keeps showing the last one.
  const chartFor = (i) => {
    for (let k = i; k >= 0; k--) if (story.steps[k].chart && story.steps[k].measureId) return k;
    return story.steps.findIndex((s) => s.chart && s.measureId);
  };
  let shown = -2;
  const show = (i) => {
    steps.forEach((el, k) => el.classList.toggle('on', k === i));
    const k = chartFor(i);
    if (k === shown) return;
    shown = k;
    const s = story.steps[k];
    const fig = s ? renderWidget({ id: `${story.id}-${s.id}`, type: s.chart, size: 'full', measureId: s.measureId }, { strategy: docs.strategy, data: docs.data, asOf: '9999', months: [] }) : h('p', { class: 'muted' }, 'Charts show here.');
    fig.classList.add('story-chart');
    stage.replaceChildren(fig);
  };
  show(0);

  const view = h('section', { class: 'story', 'aria-label': story.title },
    h('header', { class: 'story-head' }, h('h2', {}, story.title), story.summary && h('p', {}, story.summary)),
    story.steps.length
      ? h('div', { class: 'story-body' }, h('div', { class: 'story-steps' }, steps), stage)
      : h('p', { class: 'muted' }, 'This story has no steps yet.'));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!view.isConnected) return io.disconnect();
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (hit) show(+hit.target.dataset.step);
    }, { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.25, 0.5, 1] });
    steps.forEach((el) => io.observe(el));
  }
  // Keyboard and screen reader users move through steps by focus as well.
  steps.forEach((el, i) => el.addEventListener('focusin', () => show(i)));
  return view;
}

function ListenButton(audio) {
  const label = h('span', {}, `Listen${audio.name ? `: ${audio.name}` : ''}`);
  const button = h('button', { type: 'button', class: 'btn btn-sm story-listen', 'aria-pressed': 'false' }, icon('play', 14), label);
  const setIcon = (on) => { button.setAttribute('aria-pressed', String(on)); button.firstChild.replaceWith(icon(on ? 'pause' : 'play', 14)); };
  button.onclick = async () => {
    if (playing?.button === button) {
      playing.audio.pause();
      setIcon(false);
      playing = null;
      return;
    }
    if (playing) { playing.audio.pause(); playing.setIcon(false); }
    const src = await audioSrc(audio);
    if (!src) { label.textContent = 'This clip is missing'; return; }
    const a = new Audio(src);
    playing = { audio: a, button, setIcon };
    a.onended = () => { setIcon(false); if (playing?.audio === a) playing = null; };
    setIcon(true);
    a.play().catch(() => setIcon(false));
  };
  return button;
}
