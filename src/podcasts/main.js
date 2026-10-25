import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg, loadPodcasts } from '../platform/docs.js';
import { staffList } from '../platform/org.js';
import {
  CATEGORIES, EPISODE_TYPES, LOOKS, isAudioFile, slugify, published, episodesOf, seasonsOf, showsInOrder, stationView, nextNumber, podcastRss,
} from '../platform/podcasts.js';
import { putMedia, deleteMedia, audioDuration } from '../platform/media.js';
import { readImage } from '../ui/images.js';
import { Cover, Player, fmtDuration } from '../site/station.js';
import { today, short } from '../strategy/dates.js';

/**
 * Podcasts: the admin for an org's own podcast station.
 *
 *   #station      the station: name, public page, how it looks, which shows are featured
 *   #<show id>    a show: details, cover, hosts, seasons and their episodes, RSS feed
 *
 * Episodes are uploaded .mp3 or .wav files (kept in the browser for now,
 * see platform/media.js). The public station page is on the org's site
 * (site.html?site=<id>&view=station), skinned by the org theme and the
 * station's look.
 */
const org = loadOrg();
const store = new Store(loadPodcasts(), applyCollectionOp);
autosaveDoc('podcasts', store, 150);
Shell(document.querySelector('#shell'), { current: 'podcasts', org });

const app = document.querySelector('#app');
app.classList.add('podcasts-app');
const side = h('nav', { class: 'palette-side', 'aria-label': 'Station and shows' });
const main = h('section', { class: 'palette-main' });
const player = Player(() => store.doc);
player.setLink(({ episode }) => `#${store.doc.episodes[episode]?.podcastId ?? 'station'}`);
player.el.classList.add('admin-player');
app.replaceChildren(side, main, player.el);

const route = () => decodeURIComponent(location.hash.slice(1)) || 'station';
const doc = () => store.doc;
const now = today();
const MAX_MB = 200;
const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const stationSite = () => org.sites[doc().station.siteId];
const stationUrl = (extra = {}) => `site.html?${new URLSearchParams({ site: doc().station.siteId ?? '', view: 'station', ...extra })}`;

function render() {
  const r = route();
  side.replaceChildren(
    h('h2', {}, 'Station'),
    h('div', { class: 'mini-tools' },
      h('button', { class: `mini-tool${r === 'station' ? ' on' : ''}`, onclick: () => (location.hash = 'station') },
        icon('mic', 20), h('span', {}, doc().station.name, h('small', {}, 'Public page, look, featured shows')))),
    h('h2', {}, 'Shows'),
    h('div', { class: 'mini-tools' },
      showsInOrder(doc()).map((p) =>
        h('button', { class: `mini-tool${r === p.id ? ' on' : ''}`, onclick: () => (location.hash = p.id) },
          Cover(p, 32), h('span', {}, p.title, h('small', {}, `${n(episodesOf(doc(), p.id).length, 'episode')}${p.featured ? ' · featured' : ''}`)))),
      h('button', { class: 'mini-tool', onclick: newShow }, icon('plus', 20), h('span', {}, 'New show'))),
  );
  const scroll = main.scrollTop;
  const focused = main.contains(document.activeElement) ? document.activeElement.name : null;
  main.replaceChildren(doc().podcasts[r] ? Show(doc().podcasts[r]) : Station());
  main.scrollTop = scroll;
  if (focused) main.querySelector(`[name="${focused}"]`)?.focus();
}

function newShow() {
  const title = prompt('Name of the new show');
  if (!title?.trim()) return;
  const op = store.apply(col.add('podcasts', {
    handle: slugify(title).replace(/-/g, ''), title: title.trim(), description: '', category: 'Education', language: 'en', type: 'episodic', explicit: false,
    owner: { name: org.name, email: org.contact.email }, cover: null, hostIds: [], featured: false,
    order: showsInOrder(doc()).length, seasons: { 1: { number: 1, title: 'Season 1', description: '' } },
  }));
  location.hash = op.id;
}

/** Click-to-upload cover art (square images work best in podcast apps). */
function CoverUpload(current, size, onPick, label) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': label, onchange: async (e) => {
    try { onPick(await readImage(e.target.files[0], 600)); } catch (err) { alert(err.message); }
  } });
  return h('label', { class: 'cover-upload', title: label }, Cover(current, size), h('span', { class: 'cover-edit' }, current?.cover ? 'Change art' : 'Add art'), input);
}

/** A row of choices, one picked, e.g. the station's look. */
function Segmented(name, choices, value, onPick) {
  return h('div', { class: 'join look-choices', role: 'radiogroup', 'aria-label': name },
    choices.map((c) => h('button', { class: `btn btn-sm join-item${c.id === value ? ' btn-primary' : ''}`, role: 'radio', 'aria-checked': String(c.id === value), title: c.blurb ?? '', onclick: () => onPick(c.id) }, c.label)));
}

function Station() {
  const st = doc().station;
  const v = stationView(doc(), now);
  const update = (patch) => store.apply(col.set('station', { ...st, ...patch }));
  const setLook = (patch) => update({ look: { ...st.look, ...patch } });
  const shows = showsInOrder(doc());
  const move = (show, dir) => {
    const i = shows.indexOf(show);
    const other = shows[i + dir];
    if (!other) return;
    store.apply(col.batch(shows.map((s, k) => col.update('podcasts', s.id, { order: s === show ? i + dir : s === other ? i : k }))));
  };
  const upcoming = Object.values(doc().episodes).filter((e) => !published(e, now)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const publicSites = Object.values(org.sites);

  return h('div', {},
    h('div', { class: 'station-admin-head' },
      CoverUpload({ title: st.name, cover: st.cover }, 112, (cover) => update({ cover }), 'Station art'),
      h('div', { class: 'show-fields' },
        h('input', { class: 'title-input station-name', name: 'station-name', value: st.name, 'aria-label': 'Station name', onchange: (e) => update({ name: e.target.value }) }),
        h('input', { class: 'title-input lede', name: 'station-tagline', value: st.tagline, placeholder: 'A tagline for your station', 'aria-label': 'Tagline', onchange: (e) => update({ tagline: e.target.value }) }),
        h('textarea', { class: 'textarea textarea-sm', name: 'station-description', rows: 2, placeholder: 'What listeners will find here', 'aria-label': 'Description', onchange: (e) => update({ description: e.target.value }) }, st.description)),
      h('div', { class: 'card station-publish' },
        h('strong', {}, 'Public station page'),
        h('select', { class: 'select select-sm', name: 'station-site', 'aria-label': 'Site that hosts the station', onchange: (e) => update({ siteId: e.target.value || null }) },
          h('option', { value: '' }, 'Not on a site'), options(publicSites.map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), st.siteId)),
        stationSite()
          ? h('a', { class: 'btn btn-sm btn-primary', href: stationUrl(), target: '_blank', rel: 'noopener' }, icon('globe', 14), 'View station')
          : h('span', { class: 'muted' }, 'Pick a site to give the station a public page.'),
        stationSite()?.visibility === 'private' && h('span', { class: 'muted' }, 'That site is private. Make it public in Organisation settings.'))),

    h('h2', {}, 'How the station looks'),
    h('p', { class: 'muted' }, 'On top of your organisation’s colour palette and shape (Organisation → Public sites and theme).'),
    h('div', { class: 'look-grid' },
      h('div', {}, h('span', { class: 'fieldset-legend' }, 'Player'), Segmented('Player', LOOKS.player, st.look.player, (player) => setLook({ player }))),
      h('div', {}, h('span', { class: 'fieldset-legend' }, 'Cover art'), Segmented('Cover art', LOOKS.art, st.look.art, (art) => setLook({ art }))),
      h('div', {}, h('span', { class: 'fieldset-legend' }, 'Top of the page'), Segmented('Top of the page', LOOKS.hero, st.look.hero, (hero) => setLook({ hero })))),

    h('h2', {}, 'Shows'),
    h('p', { class: 'muted' }, 'Featured shows lead the station page, in this order. Every show’s past episodes stay in the archive.'),
    shows.length
      ? h('ul', { class: 'feature-list' }, shows.map((s, i) => {
          const count = episodesOf(doc(), s.id).filter((e) => published(e, now)).length;
          return h('li', { class: s.featured ? 'on' : '' },
            Cover(s, 40),
            h('a', { href: `#${s.id}`, class: 'feature-title' }, h('strong', {}, s.title), h('small', { class: 'muted' }, `${n(count, 'episode')} · ${n(seasonsOf(doc(), s.id).length, 'season')}`)),
            h('label', { class: 'feature-toggle' },
              h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', checked: s.featured, onchange: (e) => store.apply(col.update('podcasts', s.id, { featured: e.target.checked })) }),
              'Featured show'),
            h('div', { class: 'join' },
              h('button', { class: 'btn btn-xs join-item', disabled: i === 0, 'aria-label': `Move ${s.title} up`, onclick: () => move(s, -1) }, '↑'),
              h('button', { class: 'btn btn-xs join-item', disabled: i === shows.length - 1, 'aria-label': `Move ${s.title} down`, onclick: () => move(s, 1) }, '↓')));
        }))
      : h('p', { class: 'empty' }, 'No shows yet. Make one with New show.'),

    h('div', { class: 'station-columns' },
      h('section', {},
        h('h2', {}, 'On the station now'),
        v.current ? EpisodeRow(v.current, { showShow: true }) : h('p', { class: 'empty' }, 'Nothing published yet.')),
      h('section', {},
        h('h2', {}, 'Coming up and drafts'),
        upcoming.length ? h('ul', { class: 'episode-list' }, upcoming.map((e) => EpisodeRow(e, { showShow: true }))) : h('p', { class: 'empty' }, 'Nothing scheduled.'))),

    h('section', { class: 'panel castopod-note' },
      h('h2', {}, 'Hosting'),
      h('p', {}, 'For now, uploads are kept in this browser. When the Node backend arrives, it stores the audio, serves it with range requests so listeners can skip ahead, and publishes each show’s RSS feed for podcast apps. The fields follow ',
        h('a', { href: 'https://castopod.org', target: '_blank', rel: 'noopener' }, 'Castopod'), '’s model, so moving to a Castopod server later would not mean reshaping your data.')),
  );
}

function EpisodeRow(e, { showShow = false } = {}) {
  const show = doc().podcasts[e.podcastId];
  const live = published(e, now);
  return h('li', { class: 'episode' },
    h('button', { class: 'btn btn-circle btn-sm btn-primary', 'aria-label': `Play ${e.title}`, onclick: () => player.play([e]) }, icon('play', 14)),
    h('div', { class: 'episode-text' },
      h('strong', {}, e.type === 'full' ? `${e.number}. ${e.title}` : `${e.title} (${e.type})`),
      h('span', { class: 'muted' }, [showShow && show?.title, `Season ${e.season}`, short(e.publishedAt), fmtDuration(e.audio?.duration), e.audio?.mediaId ? 'uploaded' : null].filter(Boolean).join(' · ')),
      e.description && h('p', {}, e.description),
      e.personIds?.length > 0 && h('div', { class: 'avatar-row' }, e.personIds.map((id) => org.staff[id] && h('span', { title: org.staff[id].name }, Avatar(org.staff[id], 22))))),
    h('span', { class: `badge badge-sm ${live ? 'badge-success' : e.status === 'draft' ? 'badge-ghost' : 'badge-warning'}` },
      live ? 'published' : e.status === 'draft' ? 'draft' : `scheduled ${short(e.publishedAt)}`),
    h('button', { class: 'btn btn-xs btn-ghost', onclick: () => editEpisode(e) }, 'Edit'),
    h('button', { class: 'icon-button', 'aria-label': `Delete ${e.title}`, onclick: () => {
      if (!confirm(`Delete “${e.title}”?`)) return;
      store.apply(col.remove('episodes', e.id));
      if (e.audio?.mediaId) deleteMedia(e.audio.mediaId);
    } }, '×'));
}

/**
 * The episode form, for a new episode or editing one. Audio is required
 * for a new episode: an .mp3 or .wav file.
 */
function EpisodeForm(p, e, done) {
  const seasons = seasonsOf(doc(), p.id);
  const lastSeason = seasons.at(-1)?.number ?? 1;
  const f = {
    file: h('input', { class: 'file-input file-input-sm', type: 'file', name: 'ep-file', accept: '.mp3,.wav,audio/mpeg,audio/wav', 'aria-label': 'Audio file (.mp3 or .wav)', required: !e }),
    title: h('input', { class: 'input input-sm', name: 'ep-title', placeholder: 'Episode title', required: true, value: e?.title ?? '' }),
    season: h('select', { class: 'select select-sm', name: 'ep-season', 'aria-label': 'Season' },
      options([...seasons.map((s) => ({ id: String(s.number), label: s.title || `Season ${s.number}` })), { id: 'new', label: `New season (${lastSeason + 1})` }], String(e?.season ?? lastSeason))),
    type: h('select', { class: 'select select-sm', name: 'ep-type', 'aria-label': 'Episode type' }, options(EPISODE_TYPES.map((t) => ({ id: t, label: t === 'full' ? 'Full episode' : t[0].toUpperCase() + t.slice(1) })), e?.type ?? 'full')),
    description: h('input', { class: 'input input-sm', name: 'ep-description', placeholder: 'One line on what it is about', value: e?.description ?? '' }),
    notes: h('textarea', { class: 'textarea textarea-sm', name: 'ep-notes', rows: 3, placeholder: 'Show notes: links, credits, transcript. **bold**, _italic_, - lists and [links](https://…) work.', 'aria-label': 'Show notes' }, e?.notes ?? ''),
    status: h('select', { class: 'select select-sm', name: 'ep-status', 'aria-label': 'Status' },
      options([{ id: 'draft', label: 'Draft (not public)' }, { id: 'published', label: 'Publish' }], e?.status === 'draft' ? 'draft' : 'published')),
    date: h('input', { class: 'input input-sm', type: 'date', name: 'ep-date', value: e?.publishedAt ?? now, 'aria-label': 'Publish on (a future date schedules it)' }),
  };
  const people = new Set(e?.personIds ?? p.hostIds);
  const fileNote = h('span', { class: 'muted' }, e ? (e.audio?.mediaId ? 'Uploaded audio. Choose a file to replace it.' : 'Sample audio. Choose a file to replace it.') : '.mp3 or .wav');
  f.file.addEventListener('change', () => {
    const file = f.file.files[0];
    if (!file) return;
    if (!isAudioFile(file)) { alert('Choose an .mp3 or .wav file.'); f.file.value = ''; return; }
    fileNote.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    if (!f.title.value) f.title.value = file.name.replace(/\.(mp3|wav)$/i, '').replace(/[-_]+/g, ' ');
  });
  const submit = h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, e ? 'Save episode' : 'Add episode');

  const form = h('form', { class: 'episode-form', onsubmit: async (ev) => {
    ev.preventDefault();
    const file = f.file.files[0];
    if (file && file.size > MAX_MB * 1048576) return alert(`For now, audio files must be under ${MAX_MB} MB.`);
    submit.disabled = true;
    submit.textContent = file ? 'Uploading…' : 'Saving…';
    const ops = [];
    let season = f.season.value === 'new' ? lastSeason + 1 : +f.season.value;
    if (f.season.value === 'new') ops.push(col.update('podcasts', p.id, { seasons: { ...p.seasons, [season]: { number: season, title: `Season ${season}`, description: '' } } }));
    let audio = e?.audio;
    if (file) {
      audio = { mediaId: await putMedia(file), duration: await audioDuration(file), mimetype: file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg'), size: file.size, name: file.name };
      if (e?.audio?.mediaId) deleteMedia(e.audio.mediaId);
    }
    const date = f.date.value || now;
    const status = f.status.value === 'draft' ? 'draft' : date > now ? 'scheduled' : 'published';
    const type = f.type.value;
    const number = e && e.season === season && e.type === type ? e.number : type === 'full' ? nextNumber(doc(), p.id, season) : 0;
    const fields = {
      podcastId: p.id, season, number, type, title: f.title.value.trim(), slug: slugify(f.title.value), description: f.description.value.trim(),
      notes: f.notes.value, status, publishedAt: date, audio, personIds: [...people],
    };
    ops.push(e ? col.update('episodes', e.id, fields) : col.add('episodes', fields));
    store.apply(ops.length > 1 ? col.batch(ops) : ops[0]);
    done?.();
  } },
    h('div', { class: 'episode-form-grid' },
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Audio'), f.file, fileNote),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Title'), f.title),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Season'), f.season),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Type'), f.type),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Summary'), f.description),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Show notes'), f.notes),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Status'), f.status),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Publish on'), f.date),
      h('div', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'People in this episode'),
        h('div', { class: 'chips' }, staffList(org).map((s) => h('label', { class: 'chip' },
          h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: people.has(s.id), onchange: (ev) => (ev.target.checked ? people.add(s.id) : people.delete(s.id)) }),
          Avatar(s, 18), s.name))))),
    h('div', { class: 'form-actions' }, submit, e && h('button', { class: 'btn btn-sm', type: 'button', onclick: () => done?.() }, 'Cancel')));
  return form;
}

function editEpisode(e) {
  const p = doc().podcasts[e.podcastId];
  const dialog = h('dialog', { class: 'modal' });
  const close = () => dialog.close();
  dialog.append(h('div', { class: 'modal-box episode-box' }, h('h3', {}, `Edit “${e.title}”`), EpisodeForm(p, e, close)),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function showRss(p) {
  const xml = podcastRss(doc(), p.id, { baseUrl: org.contact.website || 'https://example.org', today: now });
  const dialog = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box rss-box' },
      h('h3', {}, `RSS feed for ${p.title}`),
      h('p', { class: 'muted' }, 'Podcast apps subscribe to this feed. Drafts and episodes scheduled for later are left out. The Node backend will serve it at your show’s address.'),
      h('pre', {}, xml),
      h('div', { class: 'modal-action' },
        h('button', { class: 'btn btn-sm', onclick: () => navigator.clipboard?.writeText(xml) }, 'Copy'),
        h('a', { class: 'btn btn-sm', href: URL.createObjectURL(new Blob([xml], { type: 'application/rss+xml' })), download: `${p.handle}.xml` }, 'Download'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => dialog.close() }, 'Close'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function Show(p) {
  const update = (patch) => store.apply(col.update('podcasts', p.id, patch));
  const eps = episodesOf(doc(), p.id);
  const seasons = seasonsOf(doc(), p.id).reverse();
  const setSeason = (n, patch) => update({ seasons: { ...p.seasons, [n]: { ...p.seasons[n], ...patch } } });
  const addSeason = () => {
    const n = (seasonsOf(doc(), p.id).at(-1)?.number ?? 0) + 1;
    update({ seasons: { ...p.seasons, [n]: { number: n, title: `Season ${n}`, description: '' } } });
  };
  const removeSeason = (n) => {
    const { [n]: _, ...rest } = p.seasons;
    update({ seasons: rest });
  };
  const newEp = h('details', { class: 'panel new-episode', open: eps.length === 0 },
    h('summary', {}, icon('upload', 16), h('strong', {}, 'Upload a new episode')),
    EpisodeForm(p, null, () => {}));

  return h('div', {},
    h('div', { class: 'show-head' },
      CoverUpload(p, 128, (cover) => update({ cover }), 'Show cover art'),
      h('div', { class: 'show-fields' },
        h('input', { class: 'title-input station-name', name: 'show-title', value: p.title, 'aria-label': 'Show title', onchange: (e) => update({ title: e.target.value }) }),
        h('span', { class: 'muted' }, `@${p.handle} · ${p.category} · ${p.type === 'serial' ? 'serial' : 'episodic'}`),
        h('textarea', { class: 'textarea textarea-sm', name: 'show-description', rows: 2, 'aria-label': 'Description', onchange: (e) => update({ description: e.target.value }) }, p.description),
        h('div', { class: 'inline-form' },
          h('label', { class: 'feature-toggle' },
            h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', name: 'show-featured', checked: p.featured, onchange: (e) => update({ featured: e.target.checked }) }), 'Featured show'),
          h('select', { class: 'select select-sm', name: 'show-category', 'aria-label': 'Category', onchange: (e) => update({ category: e.target.value }) }, options(CATEGORIES.map((c) => ({ id: c, label: c })), p.category)),
          h('select', { class: 'select select-sm', name: 'show-type', 'aria-label': 'Show type', onchange: (e) => update({ type: e.target.value }) },
            options([{ id: 'episodic', label: 'Episodic (newest first)' }, { id: 'serial', label: 'Serial (in order)' }], p.type)),
          h('button', { class: 'btn btn-sm', onclick: () => showRss(p) }, icon('rss', 16), 'RSS feed'),
          stationSite() && h('a', { class: 'btn btn-sm', href: stationUrl({ view: '', show: p.id }), target: '_blank', rel: 'noopener' }, icon('globe', 14), 'View on site')))),
    h('h2', {}, 'Hosts'),
    h('div', { class: 'chips' }, staffList(org).map((s) =>
      h('label', { class: 'chip' },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: p.hostIds.includes(s.id), onchange: (e) =>
          update({ hostIds: e.target.checked ? [...p.hostIds, s.id] : p.hostIds.filter((id) => id !== s.id) }) }),
        Avatar(s, 18), s.name))),
    newEp,
    h('div', { class: 'section-head' }, h('h2', {}, 'Seasons and episodes'), h('button', { class: 'btn btn-sm', onclick: addSeason }, icon('plus', 14), 'Add season')),
    seasons.map((s) => {
      const inSeason = eps.filter((e) => e.season === s.number);
      return h('section', { class: 'season-block' },
        h('header', {},
          h('span', { class: 'badge badge-neutral' }, `S${s.number}`),
          h('input', { class: 'title-input season-title', name: `season-${s.number}-title`, value: s.title, 'aria-label': `Season ${s.number} title`, onchange: (e) => setSeason(s.number, { title: e.target.value }) }),
          h('span', { class: 'muted' }, n(inSeason.length, 'episode')),
          inSeason.length > 0 && h('button', { class: 'btn btn-xs', onclick: () => player.play([...inSeason].filter((e) => published(e, now)).sort((a, b) => a.number - b.number)) }, icon('play', 12), 'Play season'),
          !inSeason.length && h('button', { class: 'icon-button', 'aria-label': `Remove season ${s.number}`, onclick: () => removeSeason(s.number) }, '×')),
        h('input', { class: 'title-input season-desc', name: `season-${s.number}-desc`, value: s.description, placeholder: 'What this season is about', 'aria-label': `Season ${s.number} description`, onchange: (e) => setSeason(s.number, { description: e.target.value }) }),
        inSeason.length ? h('ul', { class: 'episode-list' }, inSeason.map((e) => EpisodeRow(e))) : h('p', { class: 'empty' }, 'No episodes in this season yet.'));
    }),
    h('p', { class: 'note' }, h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: () => {
      if (!confirm(`Delete the show “${p.title}” and its episodes?`)) return;
      store.apply(col.batch([...eps.map((e) => col.remove('episodes', e.id)), col.remove('podcasts', p.id)]));
      for (const e of eps) if (e.audio?.mediaId) deleteMedia(e.audio.mediaId);
      location.hash = 'station';
    } }, 'Delete this show')),
  );
}

store.addEventListener('change', render);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
render();
window.podcasts = { store, player };
