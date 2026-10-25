import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg, loadRadio } from '../platform/docs.js';
import { staffList } from '../platform/org.js';
import { DAYS, CATEGORIES, EPISODE_TYPES, episodesOf, published, onAir, nextSlot, podcastRss } from '../platform/radio.js';
import { today, short } from '../strategy/dates.js';

/**
 * Radio & Podcasts. Shows (podcasts) with episodes, and an online radio
 * station that plays them on a weekly programme. The data follows
 * Castopod's model, and each show has a Castopod-style RSS feed, so a real
 * Castopod server can take over hosting later (see platform/radio.js).
 *
 * Routes: #station (default) or #<podcast id>.
 */
const org = loadOrg();
const store = new Store(loadRadio(), applyCollectionOp);
autosaveDoc('radio', store, 150);
Shell(document.querySelector('#shell'), { current: 'radio', org });

const app = document.querySelector('#app');
app.classList.add('radio-app');
const side = h('nav', { class: 'palette-side', 'aria-label': 'Shows' });
const main = h('section', { class: 'palette-main' });
const audio = h('audio', { controls: true, preload: 'none', 'aria-label': 'Player' });
const nowTitle = h('div', { class: 'now-title' }, 'Nothing playing');
const bar = h('div', { class: 'player-bar' }, icon('radio', 22), nowTitle, audio);
app.replaceChildren(side, main, bar);

// A play queue, so the station keeps playing from one episode to the next.
let queue = [];
function play(episodes, label) {
  queue = [...episodes];
  playNext(label);
}
function playNext(label) {
  const e = queue.shift();
  if (!e) { nowTitle.textContent = 'Nothing playing'; return; }
  const show = store.doc.podcasts[e.podcastId];
  nowTitle.replaceChildren(h('strong', {}, e.title), h('span', {}, label ?? show?.title ?? ''));
  audio.src = e.audio.url;
  audio.play().catch(() => { /* the browser may wait for a click */ });
}
audio.addEventListener('ended', () => playNext());

const route = () => decodeURIComponent(location.hash.slice(1)) || 'station';
const doc = () => store.doc;
const now = today();
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function render() {
  const r = route();
  side.replaceChildren(
    h('h2', {}, 'Station'),
    h('div', { class: 'mini-tools' },
      h('button', { class: `mini-tool${r === 'station' ? ' on' : ''}`, onclick: () => (location.hash = 'station') },
        icon('radio', 20), h('span', {}, doc().station.name, h('small', {}, 'Programme and live player')))),
    h('h2', {}, 'Shows'),
    h('div', { class: 'mini-tools' },
      Object.values(doc().podcasts).map((p) =>
        h('button', { class: `mini-tool${r === p.id ? ' on' : ''}`, onclick: () => (location.hash = p.id) },
          Cover(p, 32), h('span', {}, p.title, h('small', {}, `${episodesOf(doc(), p.id).length} episodes`)))),
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
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const op = store.apply(col.add('podcasts', {
    handle, title: title.trim(), description: '', category: 'Education', language: 'en', type: 'episodic', explicit: false,
    owner: { name: org.name, email: org.contact.email }, cover: null, hostIds: [],
  }));
  location.hash = op.id;
}

/** A show's cover, or its initials on the theme colour. */
function Cover(p, size = 96) {
  return p.cover
    ? h('img', { class: 'cover', src: p.cover, alt: '', style: `width:${size}px;height:${size}px` })
    : h('span', { class: 'cover cover-initials', style: `width:${size}px;height:${size}px;font-size:${size * 0.34}px`, 'aria-hidden': 'true' },
        p.title.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''));
}

function Station() {
  const st = doc().station;
  const live = onAir(doc());
  const next = nextSlot(doc());
  const showOf = (slot) => doc().podcasts[slot?.podcastId];
  const latest = Object.values(doc().episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const ident = { id: 'ident', podcastId: null, title: `${st.name} ident`, audio: { url: 'media/radio/station-ident.mp3', duration: 12 } };
  const update = (patch) => store.apply(col.set('station', { ...st, ...patch }));

  // The programme, as a week grid.
  const grid = h('div', { class: 'week-grid' }, DAYS.map((d, day) =>
    h('div', { class: 'week-day' },
      h('strong', {}, d),
      Object.values(doc().schedule).filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start)).map((s) =>
        h('div', { class: `slot${live?.id === s.id ? ' live' : ''}` },
          h('span', { class: 'slot-time' }, `${s.start}–${s.end}`),
          h('span', {}, showOf(s)?.title ?? 'Unknown show'),
          h('button', { class: 'icon-button', 'aria-label': `Remove ${d} ${s.start} slot`, onclick: () => store.apply(col.remove('schedule', s.id)) }, '×'))))));

  const slotForm = {
    day: h('select', { class: 'select select-sm', 'aria-label': 'Day' }, DAYS.map((d, i) => h('option', { value: i }, d))),
    start: h('input', { class: 'input input-sm', type: 'time', value: '09:00', 'aria-label': 'Starts' }),
    end: h('input', { class: 'input input-sm', type: 'time', value: '10:00', 'aria-label': 'Ends' }),
    show: h('select', { class: 'select select-sm', 'aria-label': 'Show' }, options(Object.values(doc().podcasts).map((p) => ({ id: p.id, label: p.title })))),
  };

  return h('div', {},
    h('div', { class: 'station-hero' },
      h('div', {},
        h('input', { class: 'title-input station-name', name: 'station-name', value: st.name, 'aria-label': 'Station name', onchange: (e) => update({ name: e.target.value }) }),
        h('input', { class: 'title-input lede', name: 'station-tagline', value: st.tagline, placeholder: 'A tagline for your station', 'aria-label': 'Tagline', onchange: (e) => update({ tagline: e.target.value }) })),
      h('div', { class: 'on-air card' },
        h('span', { class: `badge ${live ? 'badge-error' : 'badge-ghost'}` }, live ? '● On air' : 'Off air'),
        h('strong', {}, live ? showOf(live)?.title : 'Rotation: the latest episodes'),
        h('span', { class: 'muted' }, next ? `Next: ${showOf(next)?.title}, ${DAYS[next.day]} ${next.start}` : 'No programme yet'),
        h('button', { class: 'btn btn-primary', onclick: () => {
          const eps = live ? episodesOf(doc(), live.podcastId).filter((e) => published(e, now)).reverse() : latest;
          play([ident, ...eps], live ? `Live on ${st.name}` : `${st.name} rotation`);
        } }, icon('play', 16), 'Listen live'))),
    h('h2', {}, 'Weekly programme'),
    grid,
    h('form', { class: 'inline-form', onsubmit: (e) => {
      e.preventDefault();
      if (!slotForm.show.value || slotForm.end.value <= slotForm.start.value) return alert('Choose a show, and an end time after the start.');
      store.apply(col.add('schedule', { day: +slotForm.day.value, start: slotForm.start.value, end: slotForm.end.value, podcastId: slotForm.show.value }));
    } }, slotForm.day, slotForm.start, slotForm.end, slotForm.show, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add to programme')),
    h('h2', {}, 'Latest episodes'),
    EpisodeList(latest.slice(0, 6), { showShow: true }),
    h('section', { class: 'panel castopod-note' },
      h('h2', {}, 'Hosting with Castopod'),
      h('p', {}, 'For now, episodes play from files in this app. ',
        h('a', { href: 'https://castopod.org', target: '_blank', rel: 'noopener' }, 'Castopod'),
        ' is an open-source podcast host (PHP and MySQL) with RSS feeds, a fediverse presence and listening stats. The shows and episodes here use its fields, so moving to a Castopod server means pointing this plugin at its API and feeds, not reshaping your data.'),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Castopod server (later)'),
        h('input', { class: 'input input-sm', name: 'castopod', placeholder: 'https://podcasts.example.org', value: st.castopodUrl ?? '', onchange: (e) => update({ castopodUrl: e.target.value.trim() }) }))),
  );
}

function EpisodeList(episodes, { showShow = false } = {}) {
  if (!episodes.length) return h('p', { class: 'empty' }, 'No episodes yet.');
  return h('ul', { class: 'episode-list' }, episodes.map((e) => {
    const show = doc().podcasts[e.podcastId];
    return h('li', { class: 'episode' },
      h('button', { class: 'btn btn-circle btn-sm btn-primary', 'aria-label': `Play ${e.title}`, onclick: () => play([e]) }, icon('play', 14)),
      h('div', { class: 'episode-text' },
        h('strong', {}, e.type === 'full' ? `${e.number}. ${e.title}` : e.title),
        h('span', { class: 'muted' }, [showShow && show?.title, e.type !== 'full' && e.type, `${short(e.publishedAt)}`, fmtDur(e.audio.duration)].filter(Boolean).join(' · ')),
        e.description && h('p', {}, e.description),
        e.personIds?.length > 0 && h('div', { class: 'avatar-row' }, e.personIds.map((id) => org.staff[id] && h('span', { title: org.staff[id].name }, Avatar(org.staff[id], 22))))),
      h('span', { class: `badge badge-sm ${published(e, now) ? 'badge-success' : 'badge-warning'}` }, published(e, now) ? 'published' : `scheduled ${short(e.publishedAt)}`),
      h('button', { class: 'icon-button', 'aria-label': `Delete ${e.title}`, onclick: () => confirm(`Delete “${e.title}”?`) && store.apply(col.remove('episodes', e.id)) }, '×'));
  }));
}

function Show(p) {
  const update = (patch) => store.apply(col.update('podcasts', p.id, patch));
  const eps = episodesOf(doc(), p.id);
  const form = {
    title: h('input', { class: 'input input-sm', placeholder: 'Episode title', required: true }),
    description: h('input', { class: 'input input-sm', placeholder: 'What it is about' }),
    type: h('select', { class: 'select select-sm', 'aria-label': 'Episode type' }, EPISODE_TYPES.map((t) => h('option', { value: t }, t))),
    date: h('input', { class: 'input input-sm', type: 'date', value: now, 'aria-label': 'Publish on' }),
    file: h('input', { class: 'file-input file-input-sm', type: 'file', accept: 'audio/*', 'aria-label': 'Audio file' }),
  };
  const addEpisode = async (e) => {
    e.preventDefault();
    const f = form.file.files[0];
    let url = 'media/radio/stem-voices-2.mp3';
    let duration = 30;
    if (f) {
      if (f.size > 1.5 * 1024 * 1024) return alert('For now, audio files must be under 1.5 MB (they are kept in the browser). A Castopod server removes this limit.');
      url = await new Promise((res) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(f); });
      duration = await new Promise((res) => { const a = new Audio(url); a.onloadedmetadata = () => res(Math.round(a.duration) || 0); a.onerror = () => res(0); });
    }
    const number = Math.max(0, ...eps.map((x) => x.number)) + (form.type.value === 'full' ? 1 : 0);
    store.apply(col.add('episodes', {
      podcastId: p.id, title: form.title.value.trim(), slug: form.title.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: form.description.value.trim(), number, season: 1, type: form.type.value,
      status: form.date.value <= now ? 'published' : 'scheduled', publishedAt: form.date.value,
      audio: { url, duration, mimetype: f?.type || 'audio/mpeg' }, personIds: [...p.hostIds],
    }));
  };
  const showRss = () => {
    const xml = podcastRss(doc(), p.id, { baseUrl: org.contact.website || 'https://example.org', today: now });
    const dialog = h('dialog', { class: 'modal' },
      h('div', { class: 'modal-box rss-box' },
        h('h3', {}, `RSS feed for ${p.title}`),
        h('p', { class: 'muted' }, 'This is the feed podcast apps subscribe to. With Castopod, it is served at your show’s address.'),
        h('pre', {}, xml),
        h('div', { class: 'modal-action' },
          h('button', { class: 'btn btn-sm', onclick: () => navigator.clipboard?.writeText(xml) }, 'Copy'),
          h('a', { class: 'btn btn-sm', href: URL.createObjectURL(new Blob([xml], { type: 'application/rss+xml' })), download: `${p.handle}.xml` }, 'Download'),
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => dialog.close() }, 'Close'))),
      h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  };

  return h('div', {},
    h('div', { class: 'show-head' },
      Cover(p, 112),
      h('div', { class: 'show-fields' },
        h('input', { class: 'title-input station-name', name: 'show-title', value: p.title, 'aria-label': 'Show title', onchange: (e) => update({ title: e.target.value }) }),
        h('span', { class: 'muted' }, `@${p.handle} · ${p.category} · ${p.type}`),
        h('textarea', { class: 'textarea textarea-sm', name: 'show-description', rows: 2, 'aria-label': 'Description', onchange: (e) => update({ description: e.target.value }) }, p.description),
        h('div', { class: 'inline-form' },
          h('select', { class: 'select select-sm', name: 'show-category', 'aria-label': 'Category', onchange: (e) => update({ category: e.target.value }) }, options(CATEGORIES.map((c) => ({ id: c, label: c })), p.category)),
          h('select', { class: 'select select-sm', name: 'show-type', 'aria-label': 'Show type', onchange: (e) => update({ type: e.target.value }) },
            options([{ id: 'episodic', label: 'Episodic (newest first)' }, { id: 'serial', label: 'Serial (in order)' }], p.type)),
          h('button', { class: 'btn btn-sm', onclick: showRss }, icon('rss', 16), 'RSS feed'),
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => play(eps.filter((e) => published(e, now)).reverse(), p.title) }, icon('play', 14), 'Play all')))),
    h('h2', {}, 'Hosts'),
    h('div', { class: 'chips' }, staffList(org).map((s) =>
      h('label', { class: 'chip' },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: p.hostIds.includes(s.id), onchange: (e) =>
          update({ hostIds: e.target.checked ? [...p.hostIds, s.id] : p.hostIds.filter((id) => id !== s.id) }) }),
        Avatar(s, 18), s.name))),
    h('h2', {}, 'Episodes'),
    EpisodeList(eps),
    h('form', { class: 'add-widget', onsubmit: addEpisode },
      h('strong', {}, 'New episode'), form.title, form.description, form.type, form.date, form.file,
      h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add episode'),
      h('span', { class: 'muted' }, 'No file? It uses a sample recording.')),
    h('p', { class: 'note' }, h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: () => {
      if (!confirm(`Delete the show “${p.title}” and its episodes?`)) return;
      store.apply(col.batch([...eps.map((e) => col.remove('episodes', e.id)), ...Object.values(doc().schedule).filter((s) => s.podcastId === p.id).map((s) => col.remove('schedule', s.id)), col.remove('podcasts', p.id)]));
      location.hash = 'station';
    } }, 'Delete this show')),
  );
}

store.addEventListener('change', render);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
render();
window.radio = { store, play };
