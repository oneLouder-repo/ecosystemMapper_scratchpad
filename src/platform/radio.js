/**
 * Radio and podcasts. The shape follows Castopod's model
 * (https://castopod.org), so this plugin can later publish to, or read
 * from, a real Castopod server through its RSS feeds and API instead of
 * the browser.
 *
 * {
 *   station:  { name, tagline, streamUrl },          an online radio station built from the shows
 *   podcasts: { [id]: Podcast },
 *   episodes: { [id]: Episode },
 *   schedule: { [id]: Slot },                        the station's weekly programme
 * }
 * Podcast { handle, title, description, language, category, type: 'episodic' | 'serial',
 *           owner: { name, email }, cover, explicit, hostIds: [staff ids] }
 * Episode { podcastId, title, slug, description, number, season, type: 'full' | 'trailer' | 'bonus',
 *           status: 'published' | 'scheduled' | 'draft', publishedAt,
 *           audio: { url, duration, mimetype }, personIds: [staff ids] }
 * Slot    { day: 0–6 (Mon–Sun), start: 'HH:MM', end: 'HH:MM', podcastId }
 */
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const EPISODE_TYPES = ['full', 'trailer', 'bonus'];
export const CATEGORIES = ['Education', 'Science', 'Society & Culture', 'Kids & Family', 'News', 'Arts', 'Health & Fitness'];

const ep = (id, podcastId, number, title, url, duration, publishedAt, description, more = {}) => ({
  id, podcastId, number, season: 1, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  description, type: 'full', status: publishedAt <= '2026-10-25' ? 'published' : 'scheduled', publishedAt,
  audio: { url, duration, mimetype: 'audio/mpeg' }, personIds: [], ...more,
});

export function seedRadio() {
  return {
    id: 'radio',
    station: { name: 'STEM Network Radio', tagline: 'Youth, science and the land, around the clock.', streamUrl: null },
    podcasts: {
      'pod-stem-voices': {
        id: 'pod-stem-voices', handle: 'stemvoices', title: 'STEM Voices', category: 'Education', language: 'en', type: 'episodic', explicit: false,
        description: 'Youth and instructors from across the network talk about the science they love and the barriers they break.',
        owner: { name: 'Example STEM Outreach Network', email: 'podcast@example.org' }, cover: null, hostIds: ['s-comms', 's-prog'],
      },
      'pod-land': {
        id: 'pod-land', handle: 'landlearning', title: 'Learning with the Land', category: 'Science', language: 'en', type: 'serial', explicit: false,
        description: 'Indigenous knowledge keepers and STEM instructors in conversation, recorded during the co-design sessions.',
        owner: { name: 'Example STEM Outreach Network', email: 'podcast@example.org' }, cover: null, hostIds: ['s-indig'],
      },
    },
    episodes: Object.fromEntries([
      ep('ep-sv-0', 'pod-stem-voices', 0, 'Welcome to STEM Voices', 'media/radio/stem-voices-trailer.mp3', 15, '2026-08-20', 'What this show is and who you will hear.', { type: 'trailer' }),
      ep('ep-sv-1', 'pod-stem-voices', 1, 'Robots in the Arctic', 'media/radio/stem-voices-1.mp3', 30, '2026-09-03', 'Youth from Iqaluit on the robotics club that runs through the polar night.', { personIds: ['s-comms'] }),
      ep('ep-sv-2', 'pod-stem-voices', 2, 'Coding camp, in Cree', 'media/radio/stem-voices-2.mp3', 30, '2026-10-01', 'An instructor on teaching code in a learner’s first language.', { personIds: ['s-comms', 's-train'] }),
      ep('ep-sv-3', 'pod-stem-voices', 3, 'Girls who build bridges', 'media/radio/stem-voices-1.mp3', 30, '2026-11-05', 'Engineering challenge winners on what made them stay.', { personIds: ['s-comms'] }),
      ep('ep-land-1', 'pod-land', 1, 'Starting with the land', 'media/radio/land-learning-1.mp3', 30, '2026-10-16', 'From the first co-design session in Treaty 6.', { personIds: ['s-indig'] }),
    ].map((e) => [e.id, e])),
    schedule: Object.fromEntries([
      ['slot-1', 0, '08:00', '09:00', 'pod-stem-voices'],
      ['slot-2', 2, '08:00', '09:00', 'pod-land'],
      ['slot-3', 4, '16:00', '17:00', 'pod-stem-voices'],
      ['slot-4', 5, '10:00', '12:00', 'pod-land'],
    ].map(([id, day, start, end, podcastId]) => [id, { id, day, start, end, podcastId }])),
  };
}

export const blankRadio = () => ({ id: 'radio', station: { name: 'Our radio', tagline: '', streamUrl: null }, podcasts: {}, episodes: {}, schedule: {} });

export const episodesOf = (radio, podcastId) =>
  Object.values(radio.episodes).filter((e) => e.podcastId === podcastId).sort((a, b) => (b.season - a.season) || (b.number - a.number));

export const published = (e, today) => e.status === 'published' || (e.status === 'scheduled' && e.publishedAt <= today);

/** The slot on air at a moment (a Date), or null. Days run Monday = 0. */
export function onAir(radio, when = new Date()) {
  const day = (when.getDay() + 6) % 7;
  const hm = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  return Object.values(radio.schedule).find((s) => s.day === day && s.start <= hm && hm < s.end) ?? null;
}

/** The next slot after a moment, looking up to a week ahead. */
export function nextSlot(radio, when = new Date()) {
  const slots = Object.values(radio.schedule);
  if (!slots.length) return null;
  const nowKey = ((when.getDay() + 6) % 7) * 1440 + when.getHours() * 60 + when.getMinutes();
  const key = (s) => s.day * 1440 + +s.start.slice(0, 2) * 60 + +s.start.slice(3, 5);
  return [...slots].sort((a, b) => ((key(a) - nowKey + 10080) % 10080) - ((key(b) - nowKey + 10080) % 10080))[0];
}

const esc = (s = '') => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const hms = (sec) => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':');

/**
 * The podcast's RSS feed, in the form Castopod and the podcast apps use
 * (RSS 2.0 with the iTunes and Podcasting 2.0 namespaces).
 */
export function podcastRss(radio, podcastId, { baseUrl = 'https://example.org', today = '9999-12-31' } = {}) {
  const p = radio.podcasts[podcastId];
  const items = episodesOf(radio, podcastId).filter((e) => published(e, today));
  const abs = (u) => (/^https?:/.test(u) ? u : `${baseUrl}/${u}`);
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
      <enclosure url="${esc(abs(e.audio.url))}" type="${e.audio.mimetype}" length="0" />
      <itunes:duration>${hms(e.audio.duration)}</itunes:duration>
      <itunes:episode>${e.number}</itunes:episode>
      <itunes:season>${e.season}</itunes:season>
      <itunes:episodeType>${e.type}</itunes:episodeType>
    </item>`).join('\n')}
  </channel>
</rss>`;
}
