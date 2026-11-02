/**
 * Podcasts: an org's own podcast station. The shape follows Castopod's
 * model (https://castopod.org), so a self-hosted Node service (or a
 * Castopod server) can take over hosting without reshaping the data.
 *
 * {
 *   station:  { name, tagline, description, siteId, cover,      the public station page
 *               look: { player, art, hero } },                  how the station page is skinned
 *   podcasts: { [id]: Show },
 *   episodes: { [id]: Episode },
 * }
 * Show    { handle, title, description, category, language, type: 'episodic' | 'serial',
 *           owner: { name, email }, cover, explicit, hostIds: [staff ids], featured, order,
 *           seasons: { [number]: { number, title, description } } }
 * Episode { podcastId, season, number, title, slug, description, notes,
 *           type: 'full' | 'trailer' | 'bonus', status: 'published' | 'scheduled' | 'draft', publishedAt,
 *           audio: { url | mediaId, duration, mimetype, size }, personIds: [staff ids] }
 *
 * Audio is an uploaded .mp3 or .wav. In the browser prototype uploads live
 * in IndexedDB (see media.js) and `audio.mediaId` names them; bundled
 * samples use `audio.url`.
 */
export const EPISODE_TYPES = ['full', 'trailer', 'bonus'];
export const CATEGORIES = ['Education', 'Science', 'Society & Culture', 'Kids & Family', 'News', 'Arts', 'Health & Fitness'];
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'];
export const isAudioFile = (file) => AUDIO_TYPES.includes(file?.type) || /\.(mp3|wav)$/i.test(file?.name ?? '');

/** Ways to skin the public station page, on top of the org's theme. */
export const LOOKS = {
  player: [
    { id: 'bar', label: 'Bar', blurb: 'A slim player along the bottom' },
    { id: 'card', label: 'Card', blurb: 'A player card with the cover art' },
    { id: 'minimal', label: 'Minimal', blurb: 'Just the play button and progress' },
  ],
  art: [
    { id: 'square', label: 'Square art' },
    { id: 'rounded', label: 'Rounded art' },
    { id: 'circle', label: 'Round art' },
  ],
  hero: [
    { id: 'split', label: 'Split', blurb: 'Station text beside the latest episode' },
    { id: 'banner', label: 'Banner', blurb: 'A full-width banner in the theme colour' },
  ],
};
export const DEFAULT_LOOK = { player: 'card', art: 'rounded', hero: 'split' };

const ep = (id, podcastId, season, number, title, url, duration, publishedAt, description, more = {}) => ({
  id, podcastId, season, number, title, slug: slugify(title), description, notes: '',
  type: 'full', status: 'published', publishedAt,
  audio: { url, duration, mimetype: 'audio/mpeg' }, personIds: [], ...more,
});

export function seedPodcasts() {
  return migratePodcasts({
    id: 'podcasts',
    station: {
      name: 'STEM Network Station',
      tagline: 'Youth, science and the land, in their own voices.',
      description: 'Podcasts from across the network: young people, instructors and knowledge keepers on the science they love and the barriers they break.',
      siteId: 'site-main',
      cover: null,
      look: { ...DEFAULT_LOOK },
    },
    podcasts: {
      'pod-stem-voices': {
        id: 'pod-stem-voices', handle: 'stemvoices', title: 'STEM Voices', category: 'Education', language: 'en', type: 'episodic', explicit: false,
        description: 'Youth and instructors from across the network talk about the science they love and the barriers they break.',
        owner: { name: 'Example STEM Outreach Network', email: 'podcast@example.org' }, cover: null, hostIds: ['s-comms', 's-prog'],
        featured: true, order: 0,
        seasons: {
          1: { number: 1, title: 'Season 1: Getting started', description: 'How young people found their way into STEM.' },
          2: { number: 2, title: 'Season 2: Staying in', description: 'What keeps them there, and what pushes them out.' },
        },
      },
      'pod-land': {
        id: 'pod-land', handle: 'landlearning', title: 'Learning with the Land', category: 'Science', language: 'en', type: 'serial', explicit: false,
        description: 'Indigenous knowledge keepers and STEM instructors in conversation, recorded during the co-design sessions.',
        owner: { name: 'Example STEM Outreach Network', email: 'podcast@example.org' }, cover: null, hostIds: ['s-indig'],
        featured: true, order: 1,
        seasons: { 1: { number: 1, title: 'Treaty 6 sessions', description: '' } },
      },
      'pod-instructor': {
        id: 'pod-instructor', handle: 'instructornotes', title: 'Instructor Notes', category: 'Education', language: 'en', type: 'episodic', explicit: false,
        description: 'Short, practical episodes for outreach instructors. Our first show, now resting.',
        owner: { name: 'Example STEM Outreach Network', email: 'podcast@example.org' }, cover: null, hostIds: ['s-train'],
        featured: false, order: 2,
        seasons: { 1: { number: 1, title: '2025 series', description: '' } },
      },
    },
    episodes: Object.fromEntries([
      ep('ep-sv-0', 'pod-stem-voices', 1, 0, 'Welcome to STEM Voices', 'media/podcasts/stem-voices-trailer.mp3', 15, '2025-08-20', 'What this show is and who you will hear.', { type: 'trailer' }),
      ep('ep-sv-1', 'pod-stem-voices', 1, 1, 'Robots in the Arctic', 'media/podcasts/stem-voices-1.mp3', 30, '2025-09-03', 'Youth from Iqaluit on the robotics club that runs through the polar night.', { personIds: ['s-comms'], notes: 'Mentioned in this episode:\n\n- The Iqaluit robotics club\n- Our northern programs map' }),
      ep('ep-sv-2', 'pod-stem-voices', 1, 2, 'Coding camp, in Cree', 'media/podcasts/stem-voices-2.mp3', 30, '2025-10-01', 'An instructor on teaching code in a learner’s first language.', { personIds: ['s-comms', 's-train'] }),
      ep('ep-sv-3', 'pod-stem-voices', 2, 1, 'Girls who build bridges', 'media/podcasts/stem-voices-1.mp3', 30, '2026-09-24', 'Engineering challenge winners on what made them stay.', { personIds: ['s-comms'] }),
      ep('ep-sv-4', 'pod-stem-voices', 2, 2, 'The first-year wall', 'media/podcasts/stem-voices-2.mp3', 30, '2026-10-22', 'Why so many leave STEM in first year, and what helps them through.', { personIds: ['s-comms', 's-eval'] }),
      ep('ep-sv-5', 'pod-stem-voices', 2, 3, 'Mentors who look like you', 'media/podcasts/stem-voices-1.mp3', 30, '2026-11-05', 'Coming soon.', { status: 'scheduled' }),
      ep('ep-land-1', 'pod-land', 1, 1, 'Starting with the land', 'media/podcasts/land-learning-1.mp3', 30, '2026-10-16', 'From the first co-design session in Treaty 6.', { personIds: ['s-indig'] }),
      ep('ep-in-1', 'pod-instructor', 1, 1, 'Five-minute icebreakers', 'media/podcasts/stem-voices-2.mp3', 30, '2025-03-10', 'Quick openers that work with any age group.', { personIds: ['s-train'] }),
      ep('ep-in-2', 'pod-instructor', 1, 2, 'When the demo fails', 'media/podcasts/stem-voices-1.mp3', 30, '2025-04-14', 'Turning a broken experiment into the best part of the day.', { personIds: ['s-train'] }),
    ].map((e) => [e.id, e])),
  });
}

export const blankPodcasts = () => migratePodcasts({ id: 'podcasts', station: { name: 'Our station', tagline: '', description: '', siteId: null }, podcasts: {}, episodes: {} });

/** Fill in fields added since a document was saved. */
export function migratePodcasts(doc) {
  doc.station = { name: 'Our station', tagline: '', description: '', siteId: null, cover: null, ...doc.station };
  doc.station.look = { ...DEFAULT_LOOK, ...doc.station.look };
  doc.podcasts ??= {};
  doc.episodes ??= {};
  for (const p of Object.values(doc.podcasts)) {
    p.featured ??= false;
    p.order ??= 0;
    p.hostIds ??= [];
    p.seasons ??= {};
  }
  for (const e of Object.values(doc.episodes)) {
    e.season ??= 1;
    e.notes ??= '';
    e.personIds ??= [];
    const show = doc.podcasts[e.podcastId];
    if (show && !show.seasons[e.season]) show.seasons[e.season] = { number: e.season, title: `Season ${e.season}`, description: '' };
  }
  return doc;
}

export const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');

/** Live on the station: published, or scheduled for a date that has come. Drafts never are. */
export const published = (e, today) => e.status === 'published' || (e.status === 'scheduled' && e.publishedAt <= today);

/** A show's episodes, newest first (seasons, then numbers; trailers before episode 1). */
export const episodesOf = (doc, podcastId) =>
  Object.values(doc.episodes).filter((e) => e.podcastId === podcastId)
    .sort((a, b) => (b.season - a.season) || (b.number - a.number) || b.publishedAt.localeCompare(a.publishedAt));

export const seasonsOf = (doc, podcastId) =>
  Object.values(doc.podcasts[podcastId]?.seasons ?? {}).sort((a, b) => a.number - b.number);

export const showsInOrder = (doc) => Object.values(doc.podcasts).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

/** Everything the public station page shows: the current episode, featured shows, and the archive. */
export function stationView(doc, today) {
  const live = Object.values(doc.episodes).filter((e) => published(e, today) && doc.podcasts[e.podcastId])
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const shows = showsInOrder(doc);
  const latestOf = (id) => live.find((e) => e.podcastId === id) ?? null;
  return {
    current: live[0] ?? null,
    featured: shows.filter((s) => s.featured).map((show) => ({ show, latest: latestOf(show.id), count: live.filter((e) => e.podcastId === show.id).length })),
    archive: shows.map((show) => ({
      show,
      seasons: seasonsOf(doc, show.id).map((season) => ({
        season,
        episodes: live.filter((e) => e.podcastId === show.id && e.season === season.number).sort((a, b) => a.number - b.number),
      })).filter((s) => s.episodes.length),
    })).filter((a) => a.seasons.length),
    episodes: live,
  };
}

/** The next episode number in a season (trailers and bonuses don't take a number). */
export function nextNumber(doc, podcastId, season) {
  const nums = Object.values(doc.episodes).filter((e) => e.podcastId === podcastId && e.season === season && e.type === 'full').map((e) => e.number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const esc = (s = '') => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const hms = (sec) => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':');

/**
 * A show's RSS feed, in the form Castopod and the podcast apps use (RSS 2.0
 * with the iTunes namespace). Uploaded audio gets its URL from the server
 * that hosts it, so `audioUrl(episode)` supplies one.
 */
export function podcastRss(doc, podcastId, { baseUrl = 'https://example.org', today = '9999-12-31', audioUrl } = {}) {
  const p = doc.podcasts[podcastId];
  const items = episodesOf(doc, podcastId).filter((e) => published(e, today));
  const abs = (u) => (/^https?:/.test(u) ? u : `${baseUrl}/${u}`);
  const urlOf = (e) => audioUrl?.(e) ?? abs(e.audio.url ?? `media/${e.audio.mediaId}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>${esc(p.title)}</title>
    <link>${baseUrl}/@${esc(p.handle)}</link>
    <description>${esc(p.description)}</description>
    <language>${esc(p.language)}</language>
    <itunes:type>${p.type}</itunes:type>
    <itunes:category text="${esc(p.category)}" />
    <itunes:explicit>${p.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:owner><itunes:name>${esc(p.owner.name)}</itunes:name><itunes:email>${esc(p.owner.email)}</itunes:email></itunes:owner>
${items.map((e) => `    <item>
      <title>${esc(e.title)}</title>
      <guid isPermaLink="false">${esc(e.id)}</guid>
      <description>${esc(e.description)}</description>
      <pubDate>${new Date(`${e.publishedAt}T12:00:00Z`).toUTCString()}</pubDate>
      <enclosure url="${esc(urlOf(e))}" type="${e.audio.mimetype}" length="${e.audio.size ?? 0}" />
      <itunes:duration>${hms(e.audio.duration ?? 0)}</itunes:duration>
      <itunes:season>${e.season}</itunes:season>
      ${e.type === 'full' ? `<itunes:episode>${e.number}</itunes:episode>` : ''}
      <itunes:episodeType>${e.type}</itunes:episodeType>
    </item>`).join('\n')}
  </channel>
</rss>`;
}
