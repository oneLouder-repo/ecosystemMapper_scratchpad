/**
 * A featured show to take away: everything needed to listen offline, in
 * one .zip. Unzip it and open index.html; it works straight from the disk,
 * with no internet and nothing to install.
 *
 *   <handle>/
 *     index.html     the show, its seasons and episodes, notes and hosts, with a player
 *     player.js      the player: a queue, skip, speed, and it remembers where you were
 *     style.css
 *     show.json      the same details as data, for anyone who wants to reuse them
 *     cover.<ext>    the show's art, when it has some
 *     audio/         S01E01 title.mp3 …
 *     README.txt
 *
 * showArchive() only plans the files; the server (or the browser, in the
 * local preview) streams the audio into the zip itself.
 */
import { published } from './podcasts.js';

const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
const safeName = (s) => String(s ?? '').normalize('NFKD').replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) || 'episode';
const pad = (n) => String(n).padStart(2, '0');
const hms = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(sec % 60)}` : `${m}:${pad(sec % 60)}`; };

/** Show notes (light markdown) as simple, safe HTML. */
function notesHtml(md) {
  if (!md) return '';
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return md.split(/\n{2,}/).map((block) => (/^\s*[-*] /.test(block)
    ? `<ul>${block.split('\n').map((l) => l.replace(/^\s*[-*] /, '')).filter(Boolean).map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`
    : /^#{1,3} /.test(block) ? `<h4>${inline(block.replace(/^#+ /, ''))}</h4>` : `<p>${inline(block).replace(/\n/g, '<br>')}</p>`)).join('\n');
}

/** The episodes of a show that are out, in listening order. */
export function archiveEpisodes(doc, showId, today) {
  return Object.values(doc.episodes).filter((e) => e.podcastId === showId && published(e, today))
    .sort((a, b) => a.season - b.season || a.number - b.number || a.publishedAt.localeCompare(b.publishedAt));
}

/** How big the download is, roughly (audio is nearly all of it). */
export const archiveBytes = (doc, showId, today) => archiveEpisodes(doc, showId, today).reduce((n, e) => n + (e.audio?.size ?? 0), 0);

/**
 * Plan the archive. `audioSize(episode)` gives each file's exact size in
 * bytes (the server stats the file). Returns { folder, filename, texts:
 * [{ name, text }], binaries: [{ name, bytes }], audio: [{ name, episode, size }] }.
 */
export function showArchive({ doc, org, showId, today, audioSize, sourceUrl = '' }) {
  const show = doc.podcasts[showId];
  if (!show) throw new Error('No such show');
  const folder = safeName(show.handle || show.title).replace(/\s/g, '-').toLowerCase();
  const episodes = archiveEpisodes(doc, showId, today);
  const people = (ids) => (ids ?? []).map((id) => org.staff?.[id]).filter(Boolean).map((p) => ({ name: p.name, title: p.title ?? '' }));
  const audio = episodes.map((e) => {
    const ext = /wav/.test(e.audio?.mimetype ?? '') ? 'wav' : 'mp3';
    return { name: `${folder}/audio/S${pad(e.season)}E${pad(e.number)} ${safeName(e.title)}.${ext}`, episode: e, size: audioSize(e) };
  });

  // The cover, if it's an image held in the show (a data: URL).
  const binaries = [];
  let cover = null;
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(show.cover ?? '');
  if (m) {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    cover = `cover.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    binaries.push({ name: `${folder}/${cover}`, bytes });
  }

  const data = {
    title: show.title,
    description: show.description ?? '',
    category: show.category ?? '',
    language: show.language ?? 'en',
    type: show.type,
    station: doc.station?.name ?? '',
    organisation: { name: org.name, website: org.contact?.website ?? '', email: show.owner?.email ?? '' },
    hosts: people(show.hostIds),
    cover,
    source: sourceUrl,
    downloaded: today,
    seasons: Object.values(show.seasons ?? {}).map((s) => ({ number: s.number, title: s.title ?? `Season ${s.number}`, description: s.description ?? '' })),
    episodes: episodes.map((e, i) => ({
      season: e.season, number: e.number, type: e.type, title: e.title, description: e.description ?? '',
      notes: e.notes ?? '', published: e.publishedAt, duration: e.audio?.duration ?? 0,
      file: audio[i].name.slice(folder.length + 1), people: people(e.personIds),
    })),
  };

  const seasonBlocks = [...new Set(data.episodes.map((e) => e.season))].map((n) => {
    const s = data.seasons.find((x) => x.number === n);
    const eps = data.episodes.map((e, i) => ({ e, i })).filter(({ e }) => e.season === n);
    return `<section class="season">
  <h2>${esc(s?.title || `Season ${n}`)}</h2>${s?.description ? `\n  <p class="muted">${esc(s.description)}</p>` : ''}
  <ol class="episodes">
${eps.map(({ e, i }) => `    <li class="episode" data-i="${i}">
      <button class="play" data-i="${i}" aria-label="Play ${esc(e.title)}">▶</button>
      <div>
        <h3>${esc(e.title)}</h3>
        <p class="muted">Season ${e.season}, episode ${e.number} · ${esc(e.published)} · ${hms(e.duration)}${e.people.length ? ` · with ${esc(e.people.map((p) => p.name).join(', '))}` : ''}</p>
        ${e.description ? `<p>${esc(e.description)}</p>` : ''}
        ${e.notes ? `<details><summary>Show notes</summary>${notesHtml(e.notes)}</details>` : ''}
        <a class="file" href="${esc(e.file)}" download>Download this episode</a>
      </div>
    </li>`).join('\n')}
  </ol>
</section>`;
  }).join('\n');

  const index = `<!doctype html>
<html lang="${esc(data.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(show.title)}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="hero">
  ${cover ? `<img class="cover" src="${cover}" alt="">` : `<div class="cover blank">${esc(show.title.slice(0, 2))}</div>`}
  <div>
    <p class="muted">${esc(data.station || org.name)}</p>
    <h1>${esc(show.title)}</h1>
    <p>${esc(data.description)}</p>
    ${data.hosts.length ? `<p class="muted">Hosted by ${esc(data.hosts.map((h) => h.name).join(', '))}</p>` : ''}
    <p><button id="play-all" class="primary">▶ Play from the start</button></p>
  </div>
</header>
<main>
${seasonBlocks}
</main>
<footer class="muted">
  <p>${esc(org.name)}${data.organisation.website ? ` · <a href="${esc(data.organisation.website)}">${esc(data.organisation.website)}</a>` : ''}${sourceUrl ? ` · <a href="${esc(sourceUrl)}">Listen online</a>` : ''}</p>
  <p>Downloaded ${esc(today)}. Everything here plays from this folder, with no internet needed.</p>
</footer>
<div id="player" class="player" hidden>
  <button id="p-prev" aria-label="Previous episode">⏮</button>
  <button id="p-toggle" class="primary" aria-label="Play or pause">▶</button>
  <button id="p-next" aria-label="Next episode">⏭</button>
  <div class="p-now"><strong id="p-title"></strong><input id="p-seek" type="range" min="0" max="1000" value="0" aria-label="Position"><span id="p-time" class="muted">0:00</span></div>
  <button id="p-speed" aria-label="Playback speed">1×</button>
  <audio id="p-audio" preload="metadata"></audio>
</div>
<script>window.SHOW = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script src="player.js"></script>
</body>
</html>
`;

  const readme = `${show.title}
${'='.repeat(show.title.length)}

${data.description}

To listen: open index.html in any web browser. It plays straight from
this folder, with no internet needed. The audio files are in audio/ and
play in any music app too.

From ${org.name}${data.organisation.website ? ` (${data.organisation.website})` : ''}.
${sourceUrl ? `Listen online: ${sourceUrl}\n` : ''}Downloaded ${today}. ${episodes.length} episodes.

show.json has the same details as data (titles, descriptions, notes,
seasons, hosts), if you'd like to reuse them.
`;

  return {
    folder,
    filename: `${folder}.zip`,
    texts: [
      { name: `${folder}/index.html`, text: index },
      { name: `${folder}/player.js`, text: PLAYER_JS },
      { name: `${folder}/style.css`, text: STYLE_CSS },
      { name: `${folder}/show.json`, text: `${JSON.stringify(data, null, 2)}\n` },
      { name: `${folder}/README.txt`, text: readme },
    ],
    binaries,
    audio,
  };
}

const PLAYER_JS = `// A small player for this folder: a queue of the episodes, skip, speed,
// and it remembers where you were (in this browser).
(function () {
  var show = window.SHOW, eps = show.episodes, $ = function (id) { return document.getElementById(id); };
  var audio = $('p-audio'), bar = $('player'), seek = $('p-seek'), now = -1;
  var key = 'offline-player:' + show.title;
  var saved = {}; try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
  function fmt(s) { s = Math.floor(s || 0); var m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
  function mark() {
    document.querySelectorAll('.episode').forEach(function (li) { li.classList.toggle('now', +li.dataset.i === now); });
    document.querySelectorAll('.play').forEach(function (b) { b.textContent = +b.dataset.i === now && !audio.paused ? '❚❚' : '▶'; });
    $('p-toggle').textContent = audio.paused ? '▶' : '❚❚';
  }
  function play(i, from) {
    if (i < 0 || i >= eps.length) return;
    if (i !== now) { now = i; audio.src = eps[i].file; audio.currentTime = from || 0; $('p-title').textContent = eps[i].title; }
    bar.hidden = false;
    audio.play().catch(function () {});
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.play');
    if (!b) return;
    var i = +b.dataset.i;
    if (i === now && !audio.paused) audio.pause(); else play(i, i === now ? audio.currentTime : (saved.i === i ? saved.t : 0));
  });
  $('play-all').onclick = function () { play(saved.i != null ? saved.i : 0, saved.t || 0); };
  $('p-toggle').onclick = function () { if (audio.paused) play(now < 0 ? 0 : now); else audio.pause(); };
  $('p-prev').onclick = function () { if (audio.currentTime > 5) audio.currentTime = 0; else play(now - 1); };
  $('p-next').onclick = function () { play(now + 1); };
  var speeds = [1, 1.25, 1.5, 2, 0.75];
  $('p-speed').onclick = function () { var s = speeds[(speeds.indexOf(audio.playbackRate) + 1) % speeds.length]; audio.playbackRate = s; this.textContent = s + '×'; };
  seek.oninput = function () { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; };
  audio.ontimeupdate = function () {
    if (audio.duration) seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
    $('p-time').textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
    try { localStorage.setItem(key, JSON.stringify({ i: now, t: audio.currentTime })); } catch (e) {}
  };
  audio.onplay = audio.onpause = mark;
  audio.onended = function () { if (now + 1 < eps.length) play(now + 1); else mark(); };
  if (saved.i != null && eps[saved.i]) $('play-all').textContent = '▶ Carry on: ' + eps[saved.i].title;
})();
`;

const STYLE_CSS = `:root { --ink: #23262d; --muted: #6b7080; --line: #e5e5e3; --accent: #b83c63; --bg: #f6f6f4; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--ink); background: var(--bg); padding-bottom: 90px; }
.hero, main, footer { max-width: 860px; margin: 0 auto; padding: 24px 20px; }
.hero { display: flex; gap: 24px; align-items: flex-start; padding-top: 40px; }
.cover { width: 180px; height: 180px; border-radius: 12px; object-fit: cover; flex: none; box-shadow: 0 4px 18px rgb(0 0 0 / 0.12); }
.cover.blank { display: grid; place-items: center; background: var(--accent); color: #fff; font-size: 56px; font-weight: 800; }
h1 { margin: 2px 0 8px; font-size: 32px; line-height: 1.15; }
h2 { font-size: 20px; margin: 28px 0 6px; }
h3 { font-size: 17px; margin: 0; }
.muted { color: var(--muted); }
a { color: var(--accent); }
button { font: inherit; cursor: pointer; border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 6px 12px; color: var(--ink); }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 650; }
.episodes { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.episode { display: flex; gap: 14px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.episode.now { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 20%, transparent); }
.episode p { margin: 4px 0; }
.play { width: 40px; height: 40px; border-radius: 50%; flex: none; padding: 0; background: var(--accent); color: #fff; border: 0; }
.file { font-size: 14px; }
details { margin: 6px 0; }
.player { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 10px; align-items: center; padding: 12px 16px; background: #fff; border-top: 1px solid var(--line); box-shadow: 0 -4px 18px rgb(0 0 0 / 0.06); }
.p-now { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; }
.p-now strong { grid-column: 1 / -1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-now input { width: 100%; accent-color: var(--accent); }
@media (max-width: 600px) { .hero { flex-direction: column; } .cover { width: 120px; height: 120px; } }
`;
