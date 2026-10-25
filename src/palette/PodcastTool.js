import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { isAudioFile, slugify, published, seasonsOf, showsInOrder, nextNumber } from '../platform/podcasts.js';
import { putMedia, audioDuration } from '../platform/media.js';
import { fmtDuration } from '../site/station.js';
import { today, short } from '../strategy/dates.js';

const MAX_MB = 200;

/**
 * Podcast publishing mini-tool (only when the org has the Podcasts plugin):
 * put an episode out in one step, and push drafts and scheduled episodes
 * live. Show settings, seasons and the station's look stay in Podcasts.
 */
export function PodcastTool(ctx) {
  const store = ctx.podcasts;
  const doc = store.doc;
  const now = today();
  const shows = showsInOrder(doc);
  const site = ctx.org.sites[doc.station.siteId];
  const stationUrl = `site.html?site=${doc.station.siteId}&view=station`;
  const showOf = (e) => doc.podcasts[e.podcastId];
  const waiting = Object.values(doc.episodes).filter((e) => !published(e, now) && showOf(e)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const latest = Object.values(doc.episodes).filter((e) => published(e, now) && showOf(e)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
  const publishNow = (e) => store.apply(col.update('episodes', e.id, { status: 'published', publishedAt: now }));
  const row = (e, action) => h('li', { class: 'quick-episode' },
    h('div', {},
      h('strong', {}, e.title),
      h('small', { class: 'muted' }, [showOf(e).title, `Season ${e.season}`, e.status === 'draft' ? 'draft' : e.publishedAt > now ? `out ${short(e.publishedAt)}` : short(e.publishedAt), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · '))),
    action,
    h('a', { class: 'btn btn-xs btn-ghost', href: `podcasts.html#${e.podcastId}` }, 'Edit'));

  return h('div', {},
    h('h1', {}, 'Podcast publishing'),
    h('p', { class: 'lede' }, 'Put an episode out in one step, or send a draft live. Shows, seasons and how the station looks are in ', h('a', { href: 'podcasts.html' }, 'Podcasts'), '.'),
    h('div', { class: 'editor-bar' },
      site ? h('a', { class: 'btn btn-sm', href: stationUrl, target: '_blank', rel: 'noopener' }, icon('globe', 14), 'Station page') : h('span', { class: 'muted' }, 'The station isn’t on a site yet.'),
      h('a', { class: 'btn btn-sm', href: 'podcasts.html' }, icon('mic', 14), 'Open Podcasts')),
    shows.length ? QuickPublish(ctx, shows, now) : h('p', { class: 'empty' }, 'No shows yet. Make one in ', h('a', { href: 'podcasts.html' }, 'Podcasts'), ' first.'),
    h('div', { class: 'station-columns' },
      h('section', {},
        h('h2', {}, 'Waiting to go out'),
        waiting.length
          ? h('ul', { class: 'quick-episodes' }, waiting.map((e) => row(e, h('button', { class: 'btn btn-xs btn-primary', onclick: () => publishNow(e) }, 'Publish now'))))
          : h('p', { class: 'empty' }, 'No drafts or scheduled episodes.')),
      h('section', {},
        h('h2', {}, 'Out now'),
        latest.length ? h('ul', { class: 'quick-episodes' }, latest.map((e) => row(e, null))) : h('p', { class: 'empty' }, 'Nothing published yet.'))));
}

function QuickPublish(ctx, shows, now) {
  const store = ctx.podcasts;
  ctx.quickShow = shows.some((s) => s.id === ctx.quickShow) ? ctx.quickShow : shows[0].id;
  const seasons = seasonsOf(store.doc, ctx.quickShow);
  const last = seasons.at(-1)?.number ?? 1;
  const f = {
    show: h('select', { class: 'select select-sm', name: 'q-show', 'aria-label': 'Show', onchange: (e) => { ctx.quickShow = e.target.value; ctx.render(); } },
      options(shows.map((s) => ({ id: s.id, label: s.title })), ctx.quickShow)),
    season: h('select', { class: 'select select-sm', name: 'q-season', 'aria-label': 'Season' },
      options([...seasons.map((s) => ({ id: String(s.number), label: s.title || `Season ${s.number}` })), { id: 'new', label: `New season (${last + 1})` }], String(last))),
    file: h('input', { class: 'file-input file-input-sm', type: 'file', name: 'q-file', accept: '.mp3,.wav,audio/mpeg,audio/wav', required: true, 'aria-label': 'Audio file (.mp3 or .wav)' }),
    title: h('input', { class: 'input input-sm', name: 'q-title', placeholder: 'Episode title', required: true }),
    description: h('input', { class: 'input input-sm', name: 'q-description', placeholder: 'One line on what it is about' }),
    when: h('select', { class: 'select select-sm', name: 'q-when', 'aria-label': 'When' },
      options([{ id: 'now', label: 'Publish now' }, { id: 'later', label: 'Schedule for a date' }, { id: 'draft', label: 'Save as a draft' }], 'now')),
    date: h('input', { class: 'input input-sm', type: 'date', name: 'q-date', value: now, min: now, 'aria-label': 'Publish on', hidden: true }),
  };
  f.when.addEventListener('change', () => { f.date.hidden = f.when.value !== 'later'; });
  f.file.addEventListener('change', () => {
    const file = f.file.files[0];
    if (file && !isAudioFile(file)) { alert('Choose an .mp3 or .wav file.'); f.file.value = ''; return; }
    if (file && !f.title.value) f.title.value = file.name.replace(/\.(mp3|wav)$/i, '').replace(/[-_]+/g, ' ');
  });
  const submit = h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, icon('upload', 14), 'Upload');

  return h('form', { class: 'panel quick-publish', onsubmit: async (ev) => {
    ev.preventDefault();
    const file = f.file.files[0];
    if (file.size > MAX_MB * 1048576) return alert(`Audio files must be under ${MAX_MB} MB.`);
    submit.disabled = true;
    submit.textContent = 'Uploading…';
    let audio;
    try {
      audio = { mediaId: await putMedia(file), duration: await audioDuration(file), mimetype: file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg'), size: file.size, name: file.name };
    } catch (err) {
      alert(err.message);
      submit.disabled = false;
      submit.textContent = 'Upload';
      return;
    }
    const show = store.doc.podcasts[f.show.value];
    const season = f.season.value === 'new' ? last + 1 : +f.season.value;
    const date = f.when.value === 'later' ? (f.date.value || now) : now;
    const status = f.when.value === 'draft' ? 'draft' : date > now ? 'scheduled' : 'published';
    const ops = [];
    if (!show.seasons[season]) ops.push(col.update('podcasts', show.id, { seasons: { ...show.seasons, [season]: { number: season, title: `Season ${season}`, description: '' } } }));
    ops.push(col.add('episodes', {
      podcastId: show.id, season, number: nextNumber(store.doc, show.id, season), type: 'full', title: f.title.value.trim(), slug: slugify(f.title.value),
      description: f.description.value.trim(), notes: '', status, publishedAt: date, audio, personIds: [...(show.hostIds ?? [])],
    }));
    store.apply(ops.length > 1 ? col.batch(ops) : ops[0]);
  } },
    h('h2', {}, 'Quick publish'),
    h('div', { class: 'quick-grid' },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Show'), f.show),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Season'), f.season),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Audio (.mp3 or .wav)'), f.file),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Title'), f.title),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Summary'), f.description),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'When'), f.when, f.date),
      h('div', { class: 'fieldset quick-submit' }, submit)),
    h('p', { class: 'muted small' }, 'The show’s hosts are credited. Add show notes and guests afterwards in Podcasts.'));
}
