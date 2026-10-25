/**
 * What a visitor who isn't signed in may see of an org: only what the org
 * has published. Everything else stays on the server. The public site
 * (site.html) gets these filtered documents in place of the real ones.
 *
 *   org         profile, contact, logo, theme, plugins, sites that aren't
 *               private, and the names and pictures of people the public
 *               content mentions (hosts, authors)
 *   dashboards  public ones on a public site, and public impact calculators and data stories
 *   strategy    just the items those dashboards chart (measures, and the
 *               tasks under a progress widget, with titles and status only)
 *   data        just the series those dashboards chart
 *   podcasts    the station, its shows, and episodes that are out
 *   pages       pages and articles that are out, on public sites
 *   maps        nothing
 */
import { published } from '../src/platform/podcasts.js';
import { isLive } from '../src/platform/pages.js';
import { measuresOf } from '../src/platform/dashboards.js';

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
const pluginOn = (org, id) => !org.platform?.paused?.[id] && org.plugins?.[id] !== false;

export function publicDocs(docs, today = new Date().toISOString().slice(0, 10)) {
  const org = docs.org;
  if (!org) return {};
  const sites = Object.fromEntries(Object.entries(org.sites ?? {}).filter(([, s]) => s.visibility !== 'private'));
  const onSite = (id) => !!sites[id];
  const out = {};
  const people = new Set();

  // Dashboards, and the strategy items and data series they chart.
  const dashboards = Object.fromEntries(Object.entries(docs.dashboards?.dashboards ?? {})
    .filter(([, d]) => d.visibility === 'public' && onSite(d.siteId))
    .map(([id, d]) => [id, pick(d, ['id', 'title', 'description', 'visibility', 'siteId', 'sourceNodeId', 'widgets'])]));
  const shown = (coll, keys) => Object.fromEntries(Object.entries(docs.dashboards?.[coll] ?? {})
    .filter(([, d]) => d.visibility === 'public' && onSite(d.siteId))
    .map(([id, d]) => [id, pick(d, keys)]));
  const calculators = shown('calculators', ['id', 'title', 'intro', 'budget', 'outcomes', 'amounts', 'visibility', 'siteId']);
  const stories = shown('stories', ['id', 'title', 'summary', 'visibility', 'siteId', 'steps']);
  out.dashboards = { id: 'dashboards', dashboards, calculators, stories };
  const measureIds = new Set();
  const nodeIds = new Set();
  for (const d of Object.values(dashboards)) for (const w of d.widgets ?? []) {
    if (w.measureId) measureIds.add(w.measureId);
    if (w.nodeId) nodeIds.add(w.nodeId);
  }
  for (const x of [...Object.values(calculators), ...Object.values(stories)]) measuresOf(x).forEach((id) => measureIds.add(id));
  const nodes = docs.strategy?.nodes ?? {};
  const keep = new Set();
  for (const n of Object.values(nodes)) if ((n.measures ?? []).some((m) => measureIds.has(m.id))) keep.add(n.id);
  const under = (id) => Object.values(nodes).filter((n) => n.parentId === id).flatMap((n) => [n.id, ...under(n.id)]);
  for (const id of nodeIds) if (nodes[id]) [id, ...under(id)].forEach((x) => keep.add(x));
  out.strategy = {
    id: docs.strategy?.id ?? 'strategy',
    nodes: Object.fromEntries([...keep].map((id) => {
      const n = nodes[id];
      return [id, {
        ...pick(n, ['id', 'type', 'parentId', 'order', 'title', 'status', 'start', 'end']),
        measures: (n.measures ?? []).filter((m) => measureIds.has(m.id)),
        events: (n.events ?? []).filter((e) => e.kind === 'status').map((e) => pick(e, ['id', 'date', 'kind', 'text'])),
        notes: '',
      }];
    })),
  };
  out.data = { id: 'data', series: Object.fromEntries(Object.entries(docs.data?.series ?? {}).filter(([id]) => measureIds.has(id))) };

  // The podcast station: episodes that are out, on a site that isn't private.
  const pods = docs.podcasts;
  if (pods && pluginOn(org, 'podcasts') && onSite(pods.station?.siteId)) {
    const episodes = Object.fromEntries(Object.entries(pods.episodes ?? {}).filter(([, e]) => published(e, today))
      .map(([id, e]) => [id, pick(e, ['id', 'podcastId', 'season', 'number', 'title', 'slug', 'description', 'notes', 'type', 'status', 'publishedAt', 'audio', 'personIds'])]));
    const podcasts = Object.fromEntries(Object.entries(pods.podcasts ?? {}).map(([id, p]) => [id, { ...p, owner: { name: p.owner?.name ?? org.name, email: p.owner?.email ?? '' } }]));
    for (const p of Object.values(podcasts)) p.hostIds?.forEach((x) => people.add(x));
    for (const e of Object.values(episodes)) e.personIds?.forEach((x) => people.add(x));
    out.podcasts = { id: 'podcasts', station: pods.station, podcasts, episodes };
  } else {
    out.podcasts = { id: 'podcasts', station: { ...(pods?.station ?? { name: '' }), siteId: null }, podcasts: {}, episodes: {} };
  }

  // Pages and articles that are out.
  const pages = pluginOn(org, 'pages')
    ? Object.fromEntries(Object.entries(docs.pages?.pages ?? {}).filter(([, p]) => isLive(p, today) && onSite(p.siteId)))
    : {};
  for (const p of Object.values(pages)) if (p.authorId) people.add(p.authorId);
  out.pages = { id: 'pages', pages };

  out.org = {
    ...pick(org, ['id', 'name', 'description', 'mission', 'contact', 'logo', 'theme', 'plugins', 'platform']),
    sites,
    teams: {},
    staff: Object.fromEntries([...people].filter((id) => org.staff?.[id]).map((id) => [id, pick(org.staff[id], ['id', 'name', 'title', 'avatar'])])),
  };
  return out;
}

/** Is this uploaded file part of something public (a published episode, a public story's clip)? */
export function mediaIsPublic(docs, mediaId, today) {
  const pub = publicDocs(docs, today);
  return Object.values(pub.podcasts?.episodes ?? {}).some((e) => e.audio?.mediaId === mediaId)
    || Object.values(pub.dashboards?.stories ?? {}).some((s) => s.steps?.some((st) => st.audio?.mediaId === mediaId));
}
