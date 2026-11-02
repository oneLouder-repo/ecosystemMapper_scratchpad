import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { measureIndex } from '../platform/strategy.js';
import { blankStory, STORY_CHARTS } from '../platform/dashboards.js';
import { putMedia, deleteMedia } from '../platform/media.js';
import { StoryView } from '../charts/StoryView.js';

/**
 * Data stories mini-tool: a story told in steps, each with a few words, a
 * chart of one measure and, if you like, a short audio clip (a voice from
 * a program, a line from a podcast episode). Readers scroll and the chart
 * changes with them. Public stories are listed on their site.
 */
const VISIBILITY = [{ id: 'private', label: 'Private' }, { id: 'public', label: 'Public' }];

export function StoriesTool(ctx) {
  const { dashboards: store, org } = ctx;
  const stories = Object.values(store.doc.stories ?? {});
  const measures = Object.values(measureIndex(ctx.strategy));
  const firstSite = Object.values(org.sites).find((s) => s.visibility === 'public')?.id ?? null;
  const add = () => {
    const op = store.apply(col.add('stories', { ...blankStory(firstSite), steps: [step(measures[0])] }));
    ctx.storyId = op.id;
    ctx.render();
  };
  const head = h('div', {},
    h('h1', {}, 'Data stories'),
    h('p', { class: 'lede' }, 'Tell what the numbers mean, a step at a time. Each step has a few words, a chart that changes as readers scroll, and an audio clip if you have one.'));
  if (!stories.length) return h('div', {}, head, h('p', { class: 'empty' }, 'No stories yet. ', h('button', { class: 'btn btn-sm btn-primary', onclick: add }, icon('plus', 14), 'New story')));

  const s = stories.find((x) => x.id === ctx.storyId) ?? stories[0];
  ctx.storyId = s.id;
  const save = (patch) => store.apply(col.update('stories', s.id, patch));
  const setStep = (id, patch) => save({ steps: s.steps.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const move = (i, by) => { const steps = [...s.steps]; [steps[i], steps[i + by]] = [steps[i + by], steps[i]]; save({ steps }); };
  const field = (label, input, cls = '') => h('label', { class: `fieldset ${cls}` }, h('span', { class: 'fieldset-legend' }, label), input);

  const stepEditor = (st, i) => h('fieldset', { class: 'story-step-edit' },
    h('legend', {}, `Step ${i + 1}`,
      h('span', { class: 'step-tools' },
        h('button', { class: 'icon-button', title: 'Move up', 'aria-label': `Move step ${i + 1} up`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { class: 'icon-button', title: 'Move down', 'aria-label': `Move step ${i + 1} down`, disabled: i === s.steps.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { class: 'icon-button', title: 'Remove step', 'aria-label': `Remove step ${i + 1}`, onclick: () => save({ steps: s.steps.filter((x) => x.id !== st.id) }) }, '×'))),
    field('Heading', h('input', { class: 'input input-sm', name: `st-${st.id}-h`, value: st.heading, onchange: (e) => setStep(st.id, { heading: e.target.value }) })),
    field('Words', h('textarea', { class: 'textarea textarea-sm', name: `st-${st.id}-t`, rows: 3, onchange: (e) => setStep(st.id, { text: e.target.value }) }, st.text)),
    h('div', { class: 'maker-row' },
      field('Chart', h('select', { class: 'select select-sm', name: `st-${st.id}-c`, onchange: (e) => setStep(st.id, { chart: e.target.value || null }) }, options(STORY_CHARTS, st.chart ?? ''))),
      st.chart && field('Measure', h('select', { class: 'select select-sm', name: `st-${st.id}-m`, onchange: (e) => setStep(st.id, { measureId: e.target.value }) },
        options(measures.map((m) => ({ id: m.id, label: m.name })), st.measureId)))),
    h('div', { class: 'story-audio-row' },
      st.audio
        ? [icon('mic', 16), h('input', { class: 'input input-xs', name: `st-${st.id}-an`, value: st.audio.name ?? '', 'aria-label': 'Clip name', onchange: (e) => setStep(st.id, { audio: { ...st.audio, name: e.target.value } }) }),
          h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { if (st.audio.mediaId) deleteMedia(st.audio.mediaId); setStep(st.id, { audio: null }); } }, 'Remove clip')]
        : h('label', { class: 'btn btn-xs' }, icon('mic', 14), 'Add an audio clip',
          h('input', { type: 'file', accept: 'audio/*', class: 'sr-only', onchange: async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try { setStep(st.id, { audio: { mediaId: await putMedia(file), name: file.name.replace(/\.\w+$/, '') } }); } catch (err) { alert(err.message); }
          } }))));

  return h('div', {},
    head,
    h('div', { class: 'tool-picker' },
      h('select', { class: 'select select-sm', name: 'story-pick', 'aria-label': 'Story', onchange: (e) => { ctx.storyId = e.target.value; ctx.render(); } },
        options(stories.map((x) => ({ id: x.id, label: `${x.title}${x.visibility === 'public' ? '' : ' (private)'}` })), s.id)),
      h('button', { class: 'btn btn-sm', onclick: add }, icon('plus', 14), 'New story'),
      h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: () => { if (confirm(`Delete “${s.title}”?`)) { store.apply(col.remove('stories', s.id)); ctx.storyId = null; ctx.render(); } } }, 'Delete')),
    h('div', { class: 'maker-layout story-maker' },
      h('div', { class: 'maker-controls' },
        field('Title', h('input', { class: 'input input-sm', name: 'story-title', value: s.title, onchange: (e) => save({ title: e.target.value.trim() || 'Untitled story' }) })),
        field('Summary', h('input', { class: 'input input-sm', name: 'story-summary', value: s.summary, onchange: (e) => save({ summary: e.target.value }) })),
        h('div', { class: 'maker-row' },
          field('Visibility', h('select', { class: 'select select-sm', name: 'story-vis', onchange: (e) => save({ visibility: e.target.value }) }, options(VISIBILITY, s.visibility))),
          field('Site', h('select', { class: 'select select-sm', name: 'story-site', onchange: (e) => save({ siteId: e.target.value || null }) },
            h('option', { value: '' }, 'No site'), options(Object.values(org.sites).map((x) => ({ id: x.id, label: x.name })), s.siteId)))),
        h('p', { class: 'muted small' }, s.visibility === 'public' && s.siteId
          ? ['Listed on ', h('a', { href: `site.html?site=${s.siteId}&story=${s.id}`, target: '_blank' }, `${org.sites[s.siteId]?.name} ↗`), '. Put it in a page with ', h('code', {}, `[[story:${s.id}]]`), '.']
          : 'Make it public and choose a site to put it on the site.'),
        s.steps.map(stepEditor),
        h('button', { class: 'btn btn-sm', onclick: () => save({ steps: [...s.steps, step(measures[0])] }) }, icon('plus', 14), 'Add a step')),
      h('div', { class: 'maker-preview' }, h('span', { class: 'fieldset-legend' }, 'Preview: scroll the steps'), StoryView(s, { strategy: ctx.strategy, data: ctx.data.doc }))));
}

const step = (m) => ({ id: uid('st'), heading: '', text: '', chart: m ? 'line' : null, measureId: m?.id ?? null, audio: null });
