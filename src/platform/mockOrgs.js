/**
 * The test platform: six made-up organisations on all four plans, each
 * with people (and profile pictures), a logo, ecosystem maps, strategic
 * plans, program data, dashboards, a public site, podcasts and a document
 * library full of lorem-ipsum Word, PDF, OpenDocument and Excel files,
 * Dashi docs, references and (on plans that have them) annotated
 * bibliographies with weekly briefs.
 *
 *   MOCK_ORGS                         the six, with their plan and size
 *   mockDocs(spec, examples)          every document of one org (sync)
 *   mockFiles(files)                  makes the bytes of its library files (async)
 *
 * The server seeds them into a fresh database (server/index.js). Every
 * person, place, title and finding is fictional; references use the DOI
 * prefix 10.5555, which is reserved for examples.
 */
import { rng, FIRST, LAST, lorem, loremPara, annotationText, portrait, logo } from './mockText.js';
import { SECTORS } from './mockSectors.js';
import { migrateOrg } from './org.js';
import { seedStrategy } from './strategySeed.js';
import { migrateStrategy, measureIndex, strategyOps } from './strategy.js';
import { applyCollectionOp } from '../core/collections.js';
import { dashboardFromNode, widget } from './dashboards.js';
import { migratePodcasts, DEFAULT_LOOK, slugify as podSlug } from './podcasts.js';
import { migratePages, slugify } from './pages.js';
import { mapEntry, mapDocName } from './maps.js';
import { createMap, ops, applyOp, uid } from '../core/ops.js';
import { seedStudio } from './studio.js';
import { blankLibrary, blankMeta, blankBib, draftBrief, weekKey, shiftWeek, weekRange, titleFromName } from './library.js';
import { parseMarkdown } from '../core/markdown.js';

const TODAY = '2026-11-01';
const day = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const AUDIO = ['media/podcasts/stem-voices-1.mp3', 'media/podcasts/stem-voices-2.mp3', 'media/podcasts/land-learning-1.mp3', 'media/podcasts/stem-voices-trailer.mp3'];

export const MOCK_ORGS = [
  { id: 'org-example', slug: 'example', name: 'Example STEM Outreach Network', plan: 'custom', sector: 'stem', people: 55, existing: true, color: '#3d63dd', motif: 'star', domain: 'example.org', bibs: 2 },
  { id: 'org-riverbend', slug: 'riverbend', name: 'Riverbend Community Food Hub', plan: 'standard', sector: 'food', people: 18, existing: true, color: '#2a9d8f', motif: 'leaf', domain: 'riverbend.example' },
  { id: 'org-northshore', slug: 'northshore', name: 'Northshore Housing Coalition', plan: 'custom', sector: 'housing', people: 40, maps: 3, plans: 3, shows: 3, dashboards: 4, color: '#c4622d', motif: 'house', palette: 'autumn', shape: 'rounded', domain: 'northshorehousing.example', customDomain: 'www.northshorehousing.example', address: '210 Esplanade, North Vancouver, BC', bibs: 2 },
  { id: 'org-coastal', slug: 'coastal', name: 'Coastal Climate Research Alliance', plan: 'custom', sector: 'climate', people: 28, maps: 2, plans: 2, shows: 3, dashboards: 5, color: '#0f7c8c', motif: 'wave', palette: 'nord', shape: 'rounded', domain: 'coastalclimate.example', address: '1 Harbour Road, Halifax, NS', bibs: 3 },
  { id: 'org-prairie', slug: 'prairie', name: 'Prairie Youth Arts Collective', plan: 'basic', sector: 'arts', people: 12, maps: 2, plans: 2, shows: 2, dashboards: 3, color: '#c43c6b', motif: 'hex', palette: 'pastel', shape: 'pill', domain: 'prairiearts.example', address: '88 Broad Street, Regina, SK' },
  { id: 'org-lakeside', slug: 'lakeside', name: 'Lakeside Seniors Network', plan: 'free', sector: 'seniors', people: 5, maps: 1, plans: 1, shows: 1, dashboards: 1, color: '#0f7c8c', motif: 'circle', palette: 'winter', shape: 'rounded', domain: 'lakeside.example', address: 'Township Hall, 4 Shore Road, Lakeside, ON', weekly: true },
];

/* ---------- People ---------- */

function people(r, spec, sector, existing = {}) {
  const staff = { ...existing };
  const teams = {};
  const teamDefs = sector.teams ?? [];
  teamDefs.forEach(([name, color], i) => { teams[`t-${i}`] = { id: `t-${i}`, name, color }; });
  const teamIds = Object.keys(teams);
  const used = new Set(Object.values(staff).map((s) => s.name));
  let k = 0;
  while (Object.keys(staff).length < spec.people) {
    let name;
    do { name = `${r.pick(FIRST)} ${r.pick(LAST)}`; } while (used.has(name));
    used.add(name);
    const n = Object.keys(staff).length;
    const id = `p-${spec.slug}-${++k}`;
    const roleId = n === 0 ? 'admin' : n < 3 ? 'lead' : r.chance(0.12) ? 'viewer' : r.chance(0.2) ? 'lead' : 'staff';
    const title = n === 0 ? (spec.sector === 'seniors' ? 'Chair' : spec.sector === 'climate' ? 'Scientific Director' : 'Executive Director') : n === 1 ? 'Director of Programs' : r.pick(sector.titles);
    const [first, last] = name.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').split(' ');
    staff[id] = {
      id, name, title, roleId,
      teamIds: teamIds.length ? r.some(teamIds, r.chance(0.2) ? 2 : 1) : [],
      interests: [], email: `${first}.${last}@${spec.domain}`,
      avatar: r.chance(0.78) ? portrait(r) : null,
    };
  }
  // Existing staff get pictures too (most of them).
  for (const s of Object.values(staff)) if (!s.avatar && r.chance(0.7)) s.avatar = portrait(r);
  return { staff, teams };
}

/* ---------- Strategy, data and dashboards ---------- */

function strategy(r, spec, sector, staffIds) {
  const objectives = sector.objectives;
  const tasksFor = (start) => {
    const n = r.int(3, 5);
    return Array.from({ length: n }, (_, i) => {
      const s = day(start, i * r.int(18, 30));
      const e = day(s, r.int(14, 45));
      const status = e < TODAY ? (r.chance(0.9) ? 'done' : 'blocked') : s <= TODAY ? (r.chance(0.85) ? 'active' : 'blocked') : 'planned';
      // Status history, so dashboards can replay the work month by month.
      const events = [];
      if (s <= TODAY) events.push({ id: uid('ev'), date: s, kind: 'status', text: 'active' });
      if (status === 'done') events.push({ id: uid('ev'), date: e, kind: 'status', text: 'done' });
      if (status === 'blocked') events.push({ id: uid('ev'), date: day(s, 7) < TODAY ? day(s, 7) : s, kind: 'status', text: 'blocked' });
      const assigneeIds = r.some(staffIds, r.int(1, 2));
      // A toolbox for most tasks: who knows it, who outside helps, what to read.
      const assets = [];
      if (r.chance(0.7)) {
        const [actor] = r.pick(sector.actors);
        assets.push({ id: uid('as'), kind: 'staff', ref: r.pick(staffIds), label: 'Staff' });
        if (r.chance(0.6)) assets.push({ id: uid('as'), kind: 'person', label: `${r.pick(FIRST)} ${r.pick(LAST)}`, detail: actor });
        if (r.chance(0.5)) assets.push({ id: uid('as'), kind: 'literature', label: r.pick(sector.refTitles), year: String(r.int(2012, 2025)) });
        if (r.chance(0.3)) assets.push({ id: uid('as'), kind: 'link', label: `${actor}: website`, url: `https://${actor.toLowerCase().replace(/[^a-z]+/g, '')}.example`, detail: 'Partner site' });
      }
      return { type: 'task', title: r.pick(sector.tasks), start: s, end: e, status, assigneeIds, events, assets };
    });
  };
  const measureIds = [];
  const plans = Array.from({ length: spec.plans }, (_, p) => {
    const startYear = 2026 + p;
    const objs = objectives.slice(0, p === 0 ? objectives.length : Math.max(1, objectives.length - 1)).map((o, oi) => ({
      type: 'objective', id: `obj-${spec.slug}-${p}-${oi}`, title: o.title,
      measures: o.measures.map(([name, unit, target], mi) => { const id = `m-${spec.slug}-${p}-${oi}-${mi}`; measureIds.push({ id, o, mi, p }); return { id, name, unit, target: String(target) }; }),
      children: o.goals.map((g, gi) => ({
        type: 'goal', title: g, measures: [],
        children: [{ type: 'workplan', title: `Workplan: ${g}`, start: `${startYear}-0${4 + gi}-01`.slice(0, 10), end: `${startYear + 1}-03-31`, staffIds: r.some(staffIds, 3), teamIds: [], children: tasksFor(day(`${startYear}-0${7 + gi}-01`, -30 * (p === 0 ? 2 : 0))) }],
      })),
    }));
    return { type: 'plan', title: p === 0 ? `Strategic Plan ${startYear}–${startYear + 3}` : p === 1 ? `Operational plan ${startYear}–${startYear + 1}` : `Plan ${startYear}–${startYear + 1}: ${['Growth', 'Renewal', 'Reach'][p % 3]}`, start: `${startYear}-04-01`, end: `${startYear + (p === 0 ? 4 : 1)}-03-31`, theme: ['Foundations', 'Momentum', 'Scale'][p % 3], children: objs };
  });
  const doc = migrateStrategy(seedStrategy({ type: 'framework', title: `${spec.name} framework`, mission: sector.mission, vision: sector.vision, values: sector.values, children: plans }, `strategy-${spec.slug}`));
  return { doc, measureIds };
}

/** Monthly program data, April 2025 to October 2026, rising towards each target. */
function data(r, measureIds, sector) {
  const months = [];
  for (let y = 2025, m = 4; y < 2026 || m <= 10;) { months.push(`${y}-${String(m).padStart(2, '0')}-01`); if (++m > 12) { m = 1; y++; } }
  const series = {};
  for (const { id, o, mi, p } of measureIds) {
    const [, unit, , from, to] = o.measures[mi];
    const scale = p === 0 ? 1 : 0.6;
    series[id] = { id, points: months.map((date, i) => {
      const t = i / (months.length - 1);
      const wobble = 1 + (r() - 0.5) * 0.08;
      const v = (from + (to - from) * t) * scale * (unit === 'motions' || unit === 'units' || unit === 'partners' || unit === 'data sets' ? 1 : wobble);
      return { date, value: Math.round(v) };
    }) };
  }
  return { id: `data-${sector}`, series };
}

function dashboards(spec, strat, staffIds) {
  const objs = Object.values(strat.nodes).filter((n) => n.type === 'objective');
  const out = {};
  objs.slice(0, spec.dashboards).forEach((o, i) => {
    const id = `dash-${spec.slug}-${i}`;
    out[id] = { ...dashboardFromNode(strat, o.id, staffIds[i % staffIds.length]), id, visibility: i < 2 ? 'public' : 'private', siteId: i < 2 ? (i === 0 || !spec.twoSites ? 'site-main' : 'site-data') : null };
  });
  // A comparison dashboard when there's room.
  const ids = Object.keys(measureIndex(strat));
  if (spec.dashboards > objs.length && ids.length > 1) {
    out[`dash-${spec.slug}-compare`] = { id: `dash-${spec.slug}-compare`, title: 'Everything at a glance', description: 'Every measure on one page.', visibility: 'private', siteId: null, sourceNodeId: null, createdBy: staffIds[0], widgets: [widget('text', { title: 'At a glance', text: 'All of our measures, month by month.' }), widget('compare', { measureIds: ids.slice(0, 4) }), ...ids.slice(0, 4).map((m) => widget('kpi', { measureId: m }))] };
  }
  return { id: 'dashboards', dashboards: out, calculators: {}, stories: {} };
}

/* ---------- Maps ---------- */

const LENSES = ['micro-meso-macro', 'water-of-systems-change', 'spheres-of-systems-change', 'leverage-points', 'theory-of-system-change'];
const LINKS = ['relationship', 'resource-flow', 'information', 'power', 'learning', 'feedback'];
function maps(r, spec, sector, staffIds, titles) {
  const index = { maps: {} };
  const contents = {};
  titles.forEach((title, mi) => {
    const id = `map-${spec.slug}-${mi}`;
    const map = { ...createMap({ name: title, lensId: LENSES[mi % LENSES.length] }), id };
    const layerId = map.layers[0].id;
    const chosen = r.some(sector.actors, Math.min(sector.actors.length, r.int(10, 18)));
    const ids = chosen.map(([label, category]) => {
      const op = ops.addActor({ label, category, kind: r.chance(0.15) ? 'agent' : 'actor', place: { depth: +(0.05 + r() * 0.8).toFixed(2), spread: +((r() - 0.5) * 1.8).toFixed(2) }, layerId });
      applyOp(map, op);
      return op.id;
    });
    const pairs = new Set();
    for (let i = 0; i < Math.round(ids.length * 1.4); i++) {
      const a = r.pick(ids); const b = r.pick(ids);
      if (a === b || pairs.has(`${a}|${b}`)) continue;
      pairs.add(`${a}|${b}`);
      applyOp(map, ops.addConnector({ from: { actorId: a }, to: { actorId: b }, type: r.pick(LINKS), label: '', strength: r.int(1, 5), layerId }));
    }
    applyOp(map, ops.addGroup({ label: 'Core partners', description: 'The people and groups we work with most.', memberIds: r.some(ids, 3), layerId }));
    contents[id] = map;
    index.maps[id] = mapEntry({ id, title, description: mi === 0 ? 'Who shapes our work, and how they relate.' : 'A working map from a planning session.', ownerId: staffIds[mi % staffIds.length], memberIds: r.some(staffIds, 4) });
  });
  return { index, contents };
}

/* ---------- Podcasts and pages ---------- */

function podcasts(r, spec, sector, staffIds) {
  const pods = {};
  const episodes = {};
  // Titles dealt from one shuffled pool, so no two shows share an episode title.
  const pool = r.some(sector.episodes, sector.episodes.length);
  let dealt = 0;
  const nextTitle = () => { const t = pool[dealt % pool.length]; const round = Math.floor(dealt++ / pool.length); return round ? `${t}, part ${round + 1}` : t; };
  sector.shows.slice(0, spec.shows).forEach(([title, description], si) => {
    const id = `pod-${spec.slug}-${si}`;
    pods[id] = {
      id, handle: podSlug(title).replace(/-/g, ''), title, description, category: spec.sector === 'climate' ? 'Science' : spec.sector === 'arts' ? 'Arts' : 'Society & Culture',
      language: 'en', type: 'episodic', explicit: false, owner: { name: spec.name, email: `podcast@${spec.domain}` }, cover: null,
      hostIds: r.some(staffIds, si === 0 ? 2 : 1), featured: si < 2, order: si,
      seasons: { 1: { number: 1, title: 'Season 1', description: '' }, ...(si === 0 && !spec.weekly ? { 2: { number: 2, title: 'Season 2', description: '' } } : {}) },
    };
    // Free plan: one show, one episode a week. Others: every few weeks, two seasons on the lead show.
    const count = spec.weekly ? 12 : si === 0 ? 8 : r.int(3, 5);
    const gap = spec.weekly ? 7 : r.int(14, 28);
    const titles = Array.from({ length: count }, nextTitle);
    titles.forEach((t, ei) => {
      const date = day(TODAY, -gap * (count - 1 - ei) + (ei === count - 1 && !spec.weekly ? gap : 0));
      const season = !spec.weekly && si === 0 && ei >= count / 2 ? 2 : 1;
      const eid = `ep-${spec.slug}-${si}-${ei}`;
      episodes[eid] = {
        id: eid, podcastId: id, season, number: season === 2 ? ei - Math.ceil(count / 2) + 1 : ei + 1, title: t, slug: podSlug(t), description: lorem(r, r.int(10, 16)),
        notes: `In this episode:\n\n- ${lorem(r, 6)}\n- ${lorem(r, 7)}`, type: 'full',
        status: date > TODAY ? 'scheduled' : 'published', publishedAt: date,
        audio: { url: AUDIO[(si + ei) % AUDIO.length], duration: 30, mimetype: 'audio/mpeg' }, personIds: pods[id].hostIds,
      };
    });
  });
  return migratePodcasts({ id: 'podcasts', station: { name: `${spec.name.split(' ').slice(0, 2).join(' ')} Radio`, tagline: sector.mission ?? '', description: `Podcasts from ${spec.name}.`, siteId: 'site-main', cover: null, look: { ...DEFAULT_LOOK, player: spec.weekly ? 'minimal' : 'card' } }, podcasts: pods, episodes });
}

function pages(r, spec, sector, dash, pods, staffIds) {
  const pub = Object.values(dash.dashboards).filter((d) => d.visibility === 'public');
  const eps = Object.values(pods.episodes).filter((e) => e.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const shows = Object.values(pods.podcasts);
  const p = (id, kind, siteId, title, publishedAt, summary, body, more = {}) => [id, { id, kind, siteId, title, slug: slugify(title), summary, body, cover: null, status: 'published', publishedAt, authorId: r.pick(staffIds), inNav: kind === 'page', order: 0, ...more }];
  const list = [
    p('pg-about', 'page', 'site-main', 'About us', '2025-02-01', spec.name, `${sector.mission ?? ''}\n\n## Who we are\n\n${loremPara(r, 4)}\n\n## How we work\n\n- ${lorem(r, 7)}\n- ${lorem(r, 6)}\n- ${lorem(r, 8)}\n\n> ${sector.vision ?? lorem(r, 10)}`, { order: 0 }),
    p('pg-work', 'page', 'site-main', 'Our work', '2025-02-01', 'What we do, and the difference it makes.', `${loremPara(r, 3)}\n\n${pub[0] ? `[[dashboard:${pub[0].id}]]\n\n` : ''}${loremPara(r, 3)}`, { order: 1 }),
    shows[0] && p('pg-listen', 'page', 'site-main', 'Listen', '2025-03-01', 'Our podcasts.', `${shows.map((s) => `[[show:${s.id}]]`).join('\n\n')}\n\nEvery show is on [our station](site.html?site=site-main&view=station).`, { order: 2 }),
    p('pg-involved', 'page', 'site-main', 'Get involved', '2025-02-01', 'Volunteer, partner or donate.', `There are three ways to help:\n\n1. **Volunteer** with us\n2. **Partner** with us\n3. **Donate** to the work\n\nWrite to us at [hello@${spec.domain}](mailto:hello@${spec.domain}).`, { order: 3 }),
    pub[1] && spec.twoSites && p('pg-data', 'page', 'site-data', 'Our numbers', '2025-06-01', 'Live from our program data.', `We publish our numbers as they come in.\n\n${pub.map((d) => `[[dashboard:${d.id}]]`).join('\n\n')}`, { order: 0 }),
    ...Array.from({ length: r.int(3, 5) }, (_, i) => {
      const date = day(TODAY, -i * r.int(12, 30) - 3);
      const ep = eps[i];
      return p(`pg-news-${i}`, 'article', 'site-main', `${r.pick(['Update:', 'New:', 'Report:', 'Notes from', 'Looking back at'])} ${lorem(r, r.int(3, 6)).replace(/\.$/, '').toLowerCase()}`, date, lorem(r, 12), `${loremPara(r, 3)}\n\n${ep && i % 2 === 0 ? `[[episode:${ep.id}]]\n\n` : pub[0] && i === 1 ? `[[dashboard:${pub[0].id}]]\n\n` : ''}${loremPara(r, 4)}`);
    }),
    p('pg-draft', 'article', 'site-main', 'Draft: what we heard this season', day(TODAY, 10), 'Not ready yet.', loremPara(r, 2), { status: 'draft' }),
  ].filter(Boolean);
  return migratePages({ id: 'pages', pages: Object.fromEntries(list) });
}

/* ---------- The library ---------- */

const FILE_EXTS = ['pdf', 'docx', 'xlsx', 'pdf', 'docx', 'odt', 'pdf', 'xlsx', 'csv', 'md'];
const SPREADSHEET = /data|results|log|budget|table|schedule|snapshot|outputs|indicators|attendance|reach|costs/i;

function creatorsFor(r, sector) {
  if (r.chance(0.15)) return [{ role: 'author', literal: r.pick([...sector.publishers, 'Statistics Office of Example', 'Ministry of Example Affairs']) }];
  return Array.from({ length: r.int(1, 4) }, () => ({ role: 'author', family: r.pick(LAST), given: `${r.pick(FIRST)}${r.chance(0.4) ? ` ${String.fromCharCode(65 + r.int(0, 25))}.` : ''}` }));
}

/** A fictional reference of a likely kind. */
function reference(r, sector, title, i) {
  const type = r.pick(['article-journal', 'article-journal', 'article-journal', 'report', 'book', 'chapter', 'webpage', 'thesis', 'paper-conference', 'dataset']);
  const year = String(r.int(2009, 2026));
  const meta = blankMeta({ type, title, creators: creatorsFor(r, sector), issued: r.chance(0.3) ? `${year}-${String(r.int(1, 12)).padStart(2, '0')}` : year, abstract: loremPara(r, 3), keywords: r.some(sector.tags, 3) });
  const doi = `10.5555/${sector.publishers[0].split(' ')[0].toLowerCase()}.${year}.${1000 + i}`;
  switch (type) {
    case 'article-journal': Object.assign(meta, { containerTitle: r.pick(sector.journals), volume: String(r.int(3, 48)), issue: String(r.int(1, 6)), page: `${r.int(1, 200)}-${r.int(201, 340)}`, DOI: doi }); break;
    case 'report': Object.assign(meta, { publisher: r.pick(sector.publishers), number: `${year}-${r.int(1, 30)}`, genre: r.chance(0.5) ? 'Policy brief' : '', URL: `https://example.org/reports/${slugify(title)}` }); break;
    case 'book': Object.assign(meta, { publisher: r.pick(sector.publishers), publisherPlace: r.pick(['Toronto', 'Halifax', 'Vancouver', 'Winnipeg', 'Montréal']), edition: r.chance(0.3) ? '2' : '', ISBN: `978-0-${r.int(10000, 99999)}-${r.int(100, 999)}-${r.int(0, 9)}` }); break;
    case 'chapter': Object.assign(meta, { containerTitle: `Handbook of ${r.pick(sector.topic)}`, page: `${r.int(10, 150)}-${r.int(151, 260)}`, publisher: r.pick(sector.publishers), creators: [...meta.creators, { role: 'editor', family: r.pick(LAST), given: r.pick(FIRST) }] }); break;
    case 'webpage': Object.assign(meta, { containerTitle: r.pick(sector.publishers), URL: `https://example.org/${slugify(title)}`, accessed: day(TODAY, -r.int(5, 200)) }); break;
    case 'thesis': Object.assign(meta, { genre: r.pick(['Doctoral dissertation', 'Master’s thesis']), publisher: r.pick(['University of Example', 'Example Metropolitan University', 'Coastal University']), archive: 'ExampleSpace' }); break;
    case 'paper-conference': Object.assign(meta, { event: `${r.pick(['Annual', 'Biennial'])} Conference on ${r.pick(sector.topic)}`, eventPlace: r.pick(['Ottawa, ON', 'Halifax, NS', 'Calgary, AB']), genre: 'Paper presentation', URL: `https://example.org/proceedings/${slugify(title)}` }); break;
    case 'dataset': Object.assign(meta, { publisher: r.pick(sector.publishers), edition: String(r.int(1, 3)), DOI: doi }); break;
    default:
  }
  return meta;
}

/** Markdown for a lorem-ipsum document, with headings, lists and a table. */
function loremDoc(r, title) {
  return `# ${title}\n\n${loremPara(r, 3)}\n\n## Background\n\n${loremPara(r, 5)}\n\n## What we propose\n\n- ${lorem(r, 8)}\n- ${lorem(r, 6)}\n- **${lorem(r, 3).replace(/\.$/, '')}**: ${lorem(r, 9)}\n\n${loremPara(r, 4)}\n\n| Item | Year 1 | Year 2 |\n| --- | --- | --- |\n| ${lorem(r, 2).replace(/\.$/, '')} | ${r.int(10, 90)} | ${r.int(10, 90)} |\n| ${lorem(r, 2).replace(/\.$/, '')} | ${r.int(10, 90)} | ${r.int(10, 90)} |\n\n## Next steps\n\n1. ${lorem(r, 7)}\n2. ${lorem(r, 6)}\n3. ${lorem(r, 8)}\n\n> ${lorem(r, 14)}\n`;
}

/**
 * The library: folders, uploaded files (described here, made by mockFiles),
 * Dashi docs, references, links, and bibliographies on plans that have them.
 * → { library, files: [{ mediaId, name, kind, title, markdown?, sheets? }] }
 */
function library(r, spec, sector, staffIds, withBibs) {
  const lib = blankLibrary();
  const files = [];
  const now = Date.parse(`${TODAY}T15:00:00Z`);
  const folderIds = sector.folders.map((name, i) => { const id = `folder-${spec.slug}-${i}`; lib.folders[id] = { id, name, parentId: null }; return id; });
  const item = (data) => { const id = data.id ?? uid('doc'); lib.items[id] = { id, tags: [], createdBy: r.pick(staffIds), createdAt: now - r.int(1, 300) * 864e5, updatedAt: now - r.int(0, 60) * 864e5, ...data }; return id; };

  // Uploaded files, lorem ipsum inside.
  sector.files.forEach((title, i) => {
    const ext = SPREADSHEET.test(title) ? (i % 3 === 0 ? 'csv' : 'xlsx') : FILE_EXTS[i % FILE_EXTS.length] === 'xlsx' || FILE_EXTS[i % FILE_EXTS.length] === 'csv' ? 'pdf' : FILE_EXTS[i % FILE_EXTS.length];
    const mediaId = `media_mock_${spec.slug}_${i}`;
    const name = `${title.replace(/[^\w\s–-]/g, '').replace(/\s+/g, '_')}.${ext}`;
    const job = { mediaId, name, ext, title };
    if (['xlsx', 'csv'].includes(ext)) {
      const cols = ['Month', ...r.some(['Participants', 'Sessions', 'Volunteers', 'Cost', 'Hours', 'Sites', 'Referrals', 'Surveys'], r.int(3, 5))];
      job.sheets = [{ name: title.slice(0, 28), rows: [cols, ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => [m, ...cols.slice(1).map(() => r.int(5, 900))]), ['Total', ...cols.slice(1).map((_, ci) => `=SUM(${String.fromCharCode(66 + ci)}2:${String.fromCharCode(66 + ci)}13)`)]] }, { name: 'Notes', rows: [['Note'], [lorem(r, 12)], [lorem(r, 9)]] }];
    } else job.markdown = loremDoc(r, title);
    files.push(job);
    item({ kind: 'file', folderId: r.pick(folderIds), tags: r.some(sector.tags, r.int(0, 2)), meta: blankMeta({ type: ['xlsx', 'csv'].includes(ext) ? 'dataset' : /report|review|survey|snapshot/i.test(title) ? 'report' : 'document', title, creators: [{ role: 'author', literal: spec.name }], issued: `${r.int(2024, 2026)}-${String(r.int(1, 10)).padStart(2, '0')}`, publisher: spec.name, abstract: lorem(r, 20) }), file: { mediaId, name, size: 0, type: '' } });
  });

  // Dashi docs.
  sector.docs.forEach((title) => {
    const author = r.pick(staffIds);
    item({ kind: 'doc', folderId: r.chance(0.6) ? r.pick(folderIds) : null, tags: r.some(sector.tags, r.int(1, 2)), body: loremDoc(r, title), meta: blankMeta({ type: 'manuscript', title, creators: [{ role: 'author', ...splitName(spec.staffNames?.[author] ?? 'Staff Member') }], issued: day(TODAY, -r.int(1, 120)), publisher: spec.name, abstract: lorem(r, 18), keywords: r.some(sector.tags, 2) }) });
  });

  // References, links and Google files.
  const refIds = sector.refTitles.map((title, i) => {
    const meta = reference(r, sector, title, i);
    return item({ kind: meta.URL && meta.type === 'webpage' ? 'link' : 'ref', url: meta.type === 'webpage' ? meta.URL : '', folderId: folderIds[0], tags: r.some(sector.tags, r.int(1, 3)), meta });
  });
  item({ kind: 'gdoc', url: 'https://docs.google.com/document/d/1MOCK-EXAMPLE-DOCUMENT-ID/edit', folderId: folderIds.at(-1), meta: blankMeta({ type: 'manuscript', title: 'Shared meeting notes (Google Doc)', URL: 'https://docs.google.com/document/d/1MOCK-EXAMPLE-DOCUMENT-ID/edit' }) });
  item({ kind: 'gdoc', url: 'https://docs.google.com/spreadsheets/d/1MOCK-EXAMPLE-SHEET-ID/edit', folderId: folderIds.at(-1), meta: blankMeta({ type: 'dataset', title: 'Volunteer roster (Google Sheet)', URL: 'https://docs.google.com/spreadsheets/d/1MOCK-EXAMPLE-SHEET-ID/edit' }) });

  // Annotated bibliographies with a lexicon, rules and four weeks of briefs.
  if (withBibs) {
    const names = [`${sector.topic[0][0].toUpperCase()}${sector.topic[0].slice(1)}: an annotated bibliography`, `Evidence for the ${spec.sector === 'climate' ? 'weekly policy brief' : 'policy agenda'}`, 'Methods and measurement'];
    for (let b = 0; b < (spec.bibs ?? 1); b++) {
      const bib = blankBib(names[b] ?? `Collection ${b + 1}`);
      bib.description = lorem(r, 14);
      bib.itemIds = r.some(refIds, Math.min(refIds.length, r.int(8, refIds.length)));
      const lx = bib.lexicon;
      for (const [facet, terms] of Object.entries(sector.facets)) {
        const fid = uid('facet');
        lx.facets[fid] = { id: fid, name: facet };
        for (const t of terms) { const tid = uid('term'); lx.terms[tid] = { id: tid, label: t, definition: lorem(r, 8), facetId: fid }; }
      }
      const termIds = Object.keys(lx.terms);
      for (const id of bib.itemIds) lx.cells[id] = Object.fromEntries(r.some(termIds, r.int(2, Math.min(7, termIds.length))).map((t) => [t, r.int(1, 3)]));
      const tagPool = Object.values(lx.terms).map((t) => t.label).concat(sector.tags);
      lx.constrainTags = b === 1;
      const weeks = [0, -1, -2, -3].map((k) => shiftWeek(weekKey(new Date(`${TODAY}T12:00:00`)), k));
      bib.itemIds.forEach((id, i) => {
        if (i > bib.itemIds.length - 3 && r.chance(0.6)) return; // a few still to do
        const week = weeks[i % weeks.length];
        const { start } = weekRange(week);
        const tags = b === 1 ? r.some(Object.values(lx.terms).map((t) => t.label), r.int(1, 3)) : r.some(tagPool, r.int(2, 4));
        const it = lib.items[id];
        const short = i % 7 === 3;
        bib.annotations[id] = { text: annotationText(r, sector, { kind: { 'article-journal': 'article', report: 'report', book: 'book', chapter: 'chapter', thesis: 'thesis', dataset: 'data set', webpage: 'page', 'paper-conference': 'paper' }[it.meta.type] ?? 'study', tags, minWords: short ? 90 : 220, maxWords: short ? 150 : 520 }), tags, by: r.pick(staffIds), addedAt: start.getTime(), updatedAt: Math.min(now, start.getTime() + r.int(0, 4) * 864e5 + 10 * 36e5) };
      });
      bib.groups = [
        { id: uid('group'), name: 'Recent evidence', rule: 'year>=2020 AND has:annotation' },
        { id: uid('group'), name: 'Grey literature', rule: 'type:report OR type:webpage OR type:dataset' },
        { id: uid('group'), name: '', rule: `by facet:${Object.keys(sector.facets)[0]}` },
      ];
      for (const week of weeks.slice(0, 3)) {
        const draft = draftBrief(lib, bib, week);
        bib.weeks[week] = { ...draft, updatedAt: now };
      }
      lib.bibs[bib.id] = bib;
    }
  }
  return { library: lib, files };
}
const splitName = (name) => { const parts = name.split(' '); return { family: parts.at(-1), given: parts.slice(0, -1).join(' ') }; };

/* ---------- Putting an org together ---------- */

/**
 * Every document of one test org. `examples` holds the example orgs' own
 * documents (platform/seeds.js exampleDocs), which are kept and added to.
 * → { docs, files, domain }
 */
export function mockDocs(spec, examples = null) {
  const r = rng(spec.id);
  const sector = SECTORS[spec.sector];
  const docs = examples ? structuredClone(examples) : {};
  const plan = { free: { bibs: false }, basic: { bibs: false }, standard: { bibs: true }, custom: { bibs: true } }[spec.plan];
  spec = { ...spec, twoSites: spec.plan === 'standard' || spec.plan === 'custom' };

  // People and the org profile.
  const base = docs.org ?? migrateOrg({ id: spec.id, name: spec.name });
  const { staff, teams } = people(r, spec, sector, base.staff);
  const org = migrateOrg({
    ...base,
    name: spec.name,
    description: base.description || `${spec.name}: ${sector.mission}`,
    mission: base.mission || sector.mission,
    contact: base.contact?.email ? base.contact : { email: `hello@${spec.domain}`, phone: `+1 555 0${r.int(100, 199)}`, website: `https://${spec.domain}`, address: spec.address ?? '' },
    logo: logo(spec.name, spec.color, spec.motif),
    theme: base.theme?.palette && examples ? base.theme : { palette: spec.palette ?? 'corporate', shape: spec.shape ?? 'rounded' },
    staff,
    teams: Object.keys(base.teams ?? {}).length ? base.teams : teams,
    sites: Object.keys(base.sites ?? {}).length > 1 || examples ? base.sites : {
      'site-main': { id: 'site-main', name: 'Public website', url: `https://${spec.domain}`, visibility: 'public', shows: 'Who we are, our work, our podcasts' },
      // Free and Basic plans have one public site.
      ...(spec.twoSites ? { 'site-data': { id: 'site-data', name: 'Our numbers', url: `https://${spec.domain}/numbers`, visibility: 'public', shows: 'Live dashboards' } } : {}),
    },
  });
  if (org.plugins) { delete org.plugins.podcasts; }
  // Spread new people across existing teams.
  const teamIds = Object.keys(org.teams);
  for (const s of Object.values(org.staff)) if (!s.teamIds.length && teamIds.length) s.teamIds = [r.pick(teamIds)];
  docs.org = org;
  const staffIds = Object.keys(org.staff);
  spec.staffNames = Object.fromEntries(Object.values(org.staff).map((s) => [s.id, s.name]));

  if (!examples) {
    const { doc: strat, measureIds } = strategy(r, spec, sector, staffIds);
    docs.strategy = strat;
    docs.data = data(r, measureIds, spec.sector);
    docs.dashboards = dashboards(spec, strat, staffIds);
    const mapTitles = [`${spec.name.split(' ')[0]} ecosystem`, 'Funding and influence', 'Community partners'].slice(0, spec.maps);
    const m = maps(r, spec, sector, staffIds, mapTitles);
    docs.maps = m.index;
    for (const [id, map] of Object.entries(m.contents)) docs[mapDocName(id)] = map;
    docs.podcasts = podcasts(r, spec, sector, staffIds);
    docs.pages = pages(r, spec, sector, docs.dashboards, docs.podcasts, staffIds);
    if (spec.plan === 'standard' || spec.plan === 'custom') docs.studio = seedStudio(strat, { staff: staffIds.slice(0, 8) });
  } else {
    // The example orgs: one more map, and a podcast show for Riverbend.
    const extra = maps(r, spec, sector, staffIds, [spec.sector === 'stem' ? 'Funding landscape' : 'Neighbourhood food map']);
    for (const [id, entry] of Object.entries(extra.index.maps)) docs.maps.maps[id] = entry;
    for (const [id, map] of Object.entries(extra.contents)) docs[mapDocName(id)] = map;
    if (!docs.podcasts && sector.shows.length) docs.podcasts = podcasts(r, { ...spec, shows: 1 }, sector, staffIds);
    // A second, draft plan where there's only one.
    const root = Object.values(docs.strategy.nodes).find((n) => n.type === 'framework');
    if (root && Object.values(docs.strategy.nodes).filter((n) => n.type === 'plan').length < 2) {
      const op = strategyOps.addNode(docs.strategy, { type: 'plan', parentId: root.id, title: 'Plan 2027–2028 (draft)', start: '2027-04-01', end: '2028-03-31', theme: 'Next steps' });
      applyCollectionOp(docs.strategy, op);
    }
  }

  const { library: lib, files } = library(r, spec, sector, staffIds, plan.bibs);
  docs.library = lib;
  return { docs, files, domain: spec.customDomain ?? null };
}

/** The library for the browser-only preview: everything but uploaded files. */
export function mockLibrary(orgId) {
  const spec = MOCK_ORGS.find((s) => s.id === orgId);
  if (!spec) return null;
  const r = rng(spec.id);
  const sector = SECTORS[spec.sector];
  const staffIds = [];
  const { library: lib } = library(r, spec, sector, staffIds.length ? staffIds : ['s-ed'], spec.plan === 'standard' || spec.plan === 'custom');
  for (const [id, it] of Object.entries(lib.items)) if (it.kind === 'file') delete lib.items[id];
  for (const b of Object.values(lib.bibs)) b.itemIds = b.itemIds.filter((id) => lib.items[id]);
  return lib;
}

/**
 * Make the bytes of the library's files: Word, PDF, OpenDocument, Excel,
 * CSV and Markdown, with lorem ipsum inside. → [{ mediaId, name, mimetype, bytes }]
 */
export async function mockFiles(files, orgName) {
  const { docx, odt, xlsx } = await import('../core/office.js');
  const { pdf } = await import('../core/pdf.js');
  const enc = new TextEncoder();
  const types = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', md: 'text/markdown; charset=utf-8' };
  const out = [];
  for (const f of files) {
    const dc = { title: f.title, creator: [orgName], language: 'en', description: 'Test document (lorem ipsum).' };
    let bytes;
    if (f.ext === 'pdf') bytes = pdf(parseMarkdown(f.markdown), dc);
    else if (f.ext === 'docx') bytes = await docx(parseMarkdown(f.markdown), dc);
    else if (f.ext === 'odt') bytes = await odt(parseMarkdown(f.markdown), dc);
    else if (f.ext === 'xlsx') bytes = await xlsx(f.sheets, dc);
    else if (f.ext === 'csv') bytes = enc.encode(f.sheets[0].rows.filter((row) => !String(row[1]).startsWith('=')).map((row) => row.join(',')).join('\n'));
    else bytes = enc.encode(f.markdown);
    out.push({ mediaId: f.mediaId, name: f.name, mimetype: types[f.ext], bytes });
  }
  return out;
}

export { titleFromName };
