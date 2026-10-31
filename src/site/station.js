import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Avatar } from '../ui/Shell.js';
import { Markdown } from '../ui/markdown.js';
import { audioSrc } from '../platform/media.js';
import { isHosted } from '../platform/storage.js';
import { showArchive, archiveBytes } from '../platform/showArchive.js';
import { zipStream } from '../core/zip.js';
import { stationView, seasonsOf, published, podcastRss } from '../platform/podcasts.js';
import { short } from '../strategy/dates.js';

/**
 * The public podcast station: its pages (station home, a show, an
 * episode), the cards other pages embed, and the player. Used by the
 * public site (pages/site.js) and, for previews, by the Podcasts plugin.
 *
 * Everything is skinned twice: by the org's theme (palette and shape,
 * platform/themes.js) and by the station's look (player style, cover art
 * shape, hero layout; platform/podcasts.js LOOKS), set as classes on the
 * station's root element.
 *
 * ctx = { doc (podcasts), org, today, player, link(params) → href }
 */

export const fmtDuration = (s = 0) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}`) + `:${String(s % 60).padStart(2, '0')}`;
export const lookClasses = (look) => `look-player-${look.player} look-art-${look.art} look-hero-${look.hero}`;

/** A show's cover art, or its initials on the theme colour. */
export function Cover(show, size = 96, extra = '') {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.32)}px`;
  return show?.cover
    ? h('img', { class: `cover ${extra}`, src: show.cover, alt: '', style })
    : h('span', { class: `cover cover-initials ${extra}`, style, 'aria-hidden': 'true' },
        (show?.title ?? '?').split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).map((w) => w[0]).slice(0, 2).join('') || (show?.title ?? '?')[0].toUpperCase());
}

const episodeLabel = (e) => (e.type === 'full' ? `S${e.season} · E${e.number}` : `S${e.season} · ${e.type}`);
const meta = (e, show) => [show?.title, episodeLabel(e), short(e.publishedAt), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · ');

function PlayButton(ctx, episodes, label, size = 'md') {
  return h('button', { class: `btn btn-primary btn-circle btn-${size} play-btn`, 'aria-label': `Play ${label}`, onclick: () => ctx.player.play(episodes) }, icon('play', size === 'lg' ? 22 : 16));
}

/** One episode, as a row in a list or an embed in an article. */
export function EpisodeCard(ctx, e, { showShow = true, embed = false } = {}) {
  const show = ctx.doc.podcasts[e.podcastId];
  return h('article', { class: `episode-card${embed ? ' embed' : ''}` },
    embed && Cover(show, 72),
    PlayButton(ctx, [e], e.title),
    h('div', { class: 'episode-card-text' },
      h('a', { class: 'episode-title', href: ctx.link({ episode: e.id }) }, e.title),
      h('span', { class: 'muted' }, meta(e, showShow ? show : null)),
      e.description && h('p', {}, e.description)));
}

/** A show, as a card: on the station page, or embedded in an article. */
export function ShowCard(ctx, show, { latest, count } = {}) {
  const live = Object.values(ctx.doc.episodes).filter((e) => e.podcastId === show.id && published(e, ctx.today))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  latest ??= live[0];
  count ??= live.length;
  return h('article', { class: 'show-card' },
    h('a', { href: ctx.link({ show: show.id }), class: 'show-card-art', 'aria-label': show.title }, Cover(show, 112)),
    h('div', { class: 'show-card-body' },
      h('a', { class: 'show-card-title', href: ctx.link({ show: show.id }) }, show.title),
      h('span', { class: 'muted' }, `${count} episode${count === 1 ? '' : 's'} · ${show.category}`),
      h('p', {}, show.description),
      latest && h('div', { class: 'show-card-latest' },
        PlayButton(ctx, [latest], latest.title, 'sm'),
        h('span', {}, h('small', { class: 'muted' }, 'Latest'), h('a', { href: ctx.link({ episode: latest.id }) }, latest.title))),
      show.featured && count > 0 && DownloadShow(ctx, show, 'btn-xs btn-ghost')));
}

const mb = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`);

/**
 * Download a featured show as a .zip to listen to offline: the episodes,
 * a page with every detail, and a small player. On a server it streams
 * from /podcasts/<id>.zip; in the local preview the browser builds it.
 */
export function DownloadShow(ctx, show, cls = 'btn-sm') {
  const bytes = archiveBytes(ctx.doc, show.id, ctx.today);
  const label = ['Download for offline', bytes ? `(.zip, ${mb(bytes)})` : '(.zip)'].join(' ');
  const title = 'Every episode, with a page and a player that work with no internet. Unzip it and open index.html.';
  if (isHosted()) return h('a', { class: `btn ${cls}`, href: `/podcasts/${encodeURIComponent(show.id)}.zip`, download: '', title }, icon('download', 14), label);
  const btn = h('button', { class: `btn ${cls}`, title, onclick: async () => {
    btn.disabled = true;
    try {
      await buildInBrowser(ctx, show, (t) => { btn.lastChild.textContent = t; });
    } catch (err) {
      alert(`The download didn’t work: ${err.message}`);
    }
    btn.lastChild.textContent = label;
    btn.disabled = false;
  } }, icon('download', 14), h('span', {}, label));
  return btn;
}

async function buildInBrowser(ctx, show, say) {
  say('Gathering episodes…');
  const blobs = new Map();
  for (const e of Object.values(ctx.doc.episodes).filter((x) => x.podcastId === show.id && published(x, ctx.today))) {
    const url = await audioSrc(e.audio);
    if (url) blobs.set(e.id, await (await fetch(url)).blob());
  }
  const plan = showArchive({ doc: ctx.doc, org: ctx.org, showId: show.id, today: ctx.today, audioSize: (e) => blobs.get(e.id)?.size ?? -1, sourceUrl: location.href });
  const enc = new TextEncoder();
  const entries = [
    ...plan.texts.map((t) => { const data = enc.encode(t.text); return { name: t.name, size: data.length, data }; }),
    ...plan.binaries.map((b) => ({ name: b.name, size: b.bytes.length, data: b.bytes })),
  ];
  for (const x of plan.audio.filter((y) => y.size >= 0)) entries.push({ name: x.name, size: x.size, data: new Uint8Array(await blobs.get(x.episode.id).arrayBuffer()) });
  say('Making the zip…');
  const parts = [];
  for await (const p of zipStream(entries)) parts.push(p);
  const a = h('a', { href: URL.createObjectURL(new Blob(parts, { type: 'application/zip' })), download: plan.filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/** The station's home: the current episode, featured shows, then the archive of every show. */
export function StationHome(ctx) {
  const st = ctx.doc.station;
  const v = stationView(ctx.doc, ctx.today);
  const current = v.current;
  const currentShow = current && ctx.doc.podcasts[current.podcastId];
  const search = h('input', { class: 'input input-sm archive-search', type: 'search', placeholder: 'Search every episode', 'aria-label': 'Search the archive' });
  const archive = h('div', { class: 'archive' });
  const drawArchive = () => {
    const q = search.value.trim().toLowerCase();
    const hit = (e) => !q || `${e.title} ${e.description}`.toLowerCase().includes(q);
    archive.replaceChildren(...v.archive.map(({ show, seasons }) => {
      const shown = seasons.map((s) => ({ ...s, episodes: s.episodes.filter(hit) })).filter((s) => s.episodes.length);
      if (!shown.length) return null;
      return h('section', { class: 'archive-show' },
        h('header', {}, Cover(show, 40), h('a', { href: ctx.link({ show: show.id }) }, h('strong', {}, show.title)), show.featured && h('span', { class: 'badge badge-sm badge-primary badge-soft' }, 'Featured')),
        shown.map(({ season, episodes }) =>
          h('details', { class: 'archive-season', open: !!q || shown.length === 1 },
            h('summary', {}, h('span', {}, season.title || `Season ${season.number}`), h('small', { class: 'muted' }, `${episodes.length} episode${episodes.length === 1 ? '' : 's'}`)),
            h('div', { class: 'episode-list' }, episodes.map((e) => EpisodeCard(ctx, e, { showShow: false }))))));
    }).filter(Boolean));
    if (!archive.children.length) archive.append(h('p', { class: 'empty' }, q ? 'No episodes match.' : 'No episodes yet.'));
  };
  search.addEventListener('input', drawArchive);
  drawArchive();

  return h('div', { class: 'station' },
    h('section', { class: 'station-hero' },
      h('div', { class: 'station-hero-text' },
        h('p', { class: 'eyebrow' }, 'Podcast station'),
        h('h1', {}, st.name),
        st.tagline && h('p', { class: 'station-tagline' }, st.tagline),
        st.description && h('p', { class: 'station-desc' }, st.description)),
      current
        ? h('div', { class: 'now-card' },
            Cover(currentShow, 120),
            h('div', { class: 'now-card-text' },
              h('span', { class: 'badge badge-sm badge-primary' }, 'Latest episode'),
              h('a', { class: 'now-title', href: ctx.link({ episode: current.id }) }, current.title),
              h('span', { class: 'muted' }, meta(current, currentShow)),
              h('button', { class: 'btn btn-primary btn-sm', onclick: () => ctx.player.play([current]) }, icon('play', 14), 'Play')))
        : h('p', { class: 'empty' }, 'No episodes yet.')),
    v.featured.length > 0 && h('section', {},
      h('h2', {}, 'Featured shows'),
      h('div', { class: 'show-grid' }, v.featured.map((f) => ShowCard(ctx, f.show, f)))),
    h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'All shows and past episodes'), search),
      archive));
}

/** A show's page: about, hosts, its seasons as tabs, and the RSS feed. */
export function ShowPage(ctx, show) {
  const seasons = seasonsOf(ctx.doc, show.id).filter((s) => Object.values(ctx.doc.episodes).some((e) => e.podcastId === show.id && e.season === s.number && published(e, ctx.today)));
  let current = seasons.at(-1)?.number;
  const tabs = h('div', { class: 'tabs tabs-box season-tabs', role: 'tablist' });
  const list = h('div', { class: 'episode-list' });
  const draw = () => {
    tabs.replaceChildren(...seasons.map((s) => h('button', { class: `tab${s.number === current ? ' tab-active' : ''}`, role: 'tab', 'aria-selected': String(s.number === current), onclick: () => { current = s.number; draw(); } }, `Season ${s.number}`)));
    const season = seasons.find((s) => s.number === current);
    const eps = Object.values(ctx.doc.episodes).filter((e) => e.podcastId === show.id && e.season === current && published(e, ctx.today))
      .sort((a, b) => (show.type === 'serial' ? 1 : -1) * ((a.number - b.number) || a.publishedAt.localeCompare(b.publishedAt)));
    list.replaceChildren(
      season?.title && h('div', { class: 'season-intro' }, h('strong', {}, season.title), season.description && h('p', { class: 'muted' }, season.description)),
      ...(eps.length ? eps.map((e) => EpisodeCard(ctx, e, { showShow: false })) : [h('p', { class: 'empty' }, 'No episodes in this season yet.')]));
  };
  draw();
  const all = Object.values(ctx.doc.episodes).filter((e) => e.podcastId === show.id && published(e, ctx.today)).sort((a, b) => a.season - b.season || a.number - b.number);
  const rss = () => URL.createObjectURL(new Blob([podcastRss(ctx.doc, show.id, { baseUrl: ctx.org.contact.website || location.origin, today: ctx.today })], { type: 'application/rss+xml' }));
  return h('div', { class: 'station' },
    h('p', { class: 'crumbs' }, h('a', { href: ctx.link({ view: 'station' }) }, ctx.doc.station.name), ' / ', show.title),
    h('section', { class: 'show-hero' },
      Cover(show, 180),
      h('div', {},
        h('h1', {}, show.title),
        h('p', { class: 'muted' }, [show.category, show.type === 'serial' ? 'Listen in order' : 'Newest first', `${all.length} episodes`].join(' · ')),
        h('p', { class: 'show-desc' }, show.description),
        show.hostIds.length > 0 && h('div', { class: 'hosts' }, h('small', { class: 'muted' }, 'Hosted by'),
          show.hostIds.map((id) => ctx.org.staff[id] && h('span', { class: 'host' }, Avatar(ctx.org.staff[id], 26), ctx.org.staff[id].name))),
        h('div', { class: 'show-actions' },
          all.length > 0 && h('button', { class: 'btn btn-primary btn-sm', onclick: () => ctx.player.play(all) }, icon('play', 14), 'Play from the start'),
          h('a', { class: 'btn btn-sm', href: '#', onclick: (e) => { e.currentTarget.href = rss(); }, download: `${show.handle}.xml` }, icon('rss', 14), 'RSS feed'),
          show.featured && all.length > 0 && DownloadShow(ctx, show)))),
    seasons.length > 1 && tabs,
    list);
}

/** An episode's page: the player, its notes and the people in it. */
export function EpisodePage(ctx, e) {
  const show = ctx.doc.podcasts[e.podcastId];
  return h('div', { class: 'station episode-page' },
    h('p', { class: 'crumbs' }, h('a', { href: ctx.link({ view: 'station' }) }, ctx.doc.station.name), ' / ', h('a', { href: ctx.link({ show: show.id }) }, show.title), ' / ', episodeLabel(e)),
    h('section', { class: 'show-hero' },
      Cover(show, 160),
      h('div', {},
        h('h1', {}, e.title),
        h('p', { class: 'muted' }, meta(e, show)),
        h('button', { class: 'btn btn-primary', onclick: () => ctx.player.play([e]) }, icon('play', 16), 'Play episode'),
        e.description && h('p', { class: 'show-desc' }, e.description))),
    e.personIds.length > 0 && h('div', { class: 'hosts' }, h('small', { class: 'muted' }, 'In this episode'),
      e.personIds.map((id) => ctx.org.staff[id] && h('span', { class: 'host' }, Avatar(ctx.org.staff[id], 26), ctx.org.staff[id].name))),
    e.notes && h('section', { class: 'episode-notes' }, h('h2', {}, 'Show notes'), Markdown(e.notes)));
}

/**
 * The station player: one audio element with a queue, so it keeps playing
 * while the listener moves around the site. Its look follows the station
 * (`bar` along the bottom, `card` with the cover art, or `minimal`).
 */
export function Player(getDoc) {
  const audio = h('audio', { preload: 'none' });
  const art = h('div', { class: 'player-art' });
  const title = h('a', { class: 'player-title' }, '');
  const sub = h('span', { class: 'player-sub' }, '');
  const btn = h('button', { class: 'btn btn-primary btn-circle btn-sm', 'aria-label': 'Play' }, icon('play', 16));
  const seek = h('input', { type: 'range', class: 'range range-xs range-primary player-seek', min: 0, max: 100, value: 0, step: 0.1, 'aria-label': 'Position' });
  const time = h('span', { class: 'player-time' }, '0:00');
  const close = h('button', { class: 'icon-button player-close', 'aria-label': 'Close player' }, '×');
  const el = h('div', { class: 'station-player', hidden: true, role: 'region', 'aria-label': 'Podcast player' },
    art, h('div', { class: 'player-text' }, title, sub), btn, h('div', { class: 'player-progress' }, seek, time), close, audio);
  let queue = [];
  let link = () => '#';

  const setIcon = () => { btn.replaceChildren(icon(audio.paused ? 'play' : 'pause', 16)); btn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause'); };
  btn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  close.addEventListener('click', () => { audio.pause(); el.hidden = true; });
  audio.addEventListener('play', setIcon);
  audio.addEventListener('pause', setIcon);
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 100;
    time.textContent = `${fmtDuration(Math.floor(audio.currentTime))} / ${fmtDuration(Math.floor(audio.duration || 0))}`;
  });
  seek.addEventListener('input', () => { if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration; });
  audio.addEventListener('ended', () => next());

  async function next() {
    const e = queue.shift();
    if (!e) return;
    const show = getDoc().podcasts[e.podcastId];
    art.replaceChildren(Cover(show, 52));
    title.textContent = e.title;
    title.href = link({ episode: e.id });
    sub.textContent = show?.title ?? '';
    el.hidden = false;
    const src = await audioSrc(e.audio);
    if (!src) { sub.textContent = 'This audio file is missing.'; return; }
    audio.src = src;
    audio.play().catch(() => setIcon());
  }

  return {
    el,
    audio,
    /** Play these episodes in order. */
    play(episodes) { queue = [...episodes]; next(); },
    setLink(fn) { link = fn; },
    setLook(look) { el.className = `station-player player-${look.player}`; },
  };
}
