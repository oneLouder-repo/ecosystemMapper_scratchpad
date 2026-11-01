/**
 * The plugins: the tools an org can switch on for its dashboard. A plugin
 * is a page (an .html file) plus its modules. To add one, make the page,
 * then add an entry here; it shows up on the dashboard, in the header and
 * in Organisation settings, where an org can switch it off.
 *
 * `short` is its label in the header, beside its icon.
 * `tone` is the plugin's own colour: its icon in the header, and the
 * buttons, links and highlights on its pages.
 * `core: true` plugins can't be switched off.
 * `stats(docs)` returns a short line for the dashboard card from the
 * loaded documents (see platform/docs.js loadAll).
 */
const count = (o) => Object.keys(o ?? {}).length;

export const PLUGINS = [
  {
    id: 'mapper',
    short: 'Mapper',
    tone: '#13897a',
    name: 'Ecosystem Mapper',
    href: 'mapper.html',
    icon: 'mapper',
    blurb: 'Map the actors, agents, relationships and feedback loops in your change ecosystem, through five systems lenses.',
    stats: ({ maps, mapContents }) => {
      const actors = Object.values(mapContents ?? {}).reduce((n, m) => n + count(m.actors), 0);
      return `${count(maps?.maps)} maps · ${actors} actors`;
    },
  },
  {
    id: 'strategy',
    short: 'Strategy',
    tone: '#3d63dd',
    name: 'Strategy & Work',
    href: 'strategy.html',
    icon: 'strategy',
    blurb: 'From mission and vision to plans, objectives, goals, workplans and tasks, with Gantt charts and task timelines.',
    stats: ({ strategy }) => {
      const nodes = Object.values(strategy.nodes);
      const open = nodes.filter((n) => n.type === 'task' && n.status !== 'done').length;
      return `${nodes.filter((n) => n.type === 'plan').length} plans · ${nodes.filter((n) => n.type === 'workplan').length} workplans · ${open} open tasks`;
    },
  },
  {
    id: 'studio',
    short: 'Studio',
    tone: '#7a4cc4',
    name: 'Planning Studio',
    href: 'studio.html',
    icon: 'studio',
    blurb: 'Facilitate strategic planning online: a shared SOAR whiteboard, the plan’s context and team, a results framework, and a canvas for wiring ideas into objectives and goals.',
    stats: ({ studio }) => `${Object.keys(studio?.plans ?? {}).length} plans in the studio · ${Object.keys(studio?.cards ?? {}).length} SOAR cards`,
  },
  {
    id: 'palette',
    short: 'Data',
    tone: '#c25a14',
    name: 'Data Workbench',
    href: 'palette.html',
    icon: 'workbench',
    blurb: 'Mini-tools for bringing others into the data dialogue: design dashboards from your strategy, keep program data current, and publish to public sites.',
    stats: ({ dashboards }) => {
      const list = Object.values(dashboards?.dashboards ?? {});
      return `${list.length} dashboards · ${list.filter((d) => d.visibility === 'public' && d.siteId).length} published`;
    },
  },
  {
    id: 'podcasts',
    short: 'Podcasts',
    tone: '#c03a64',
    name: 'Podcasts',
    href: 'podcasts.html',
    icon: 'mic',
    blurb: 'Your own podcast station: shows organised by season, uploaded .mp3 or .wav episodes, featured shows, RSS feeds, and a public station page skinned to your look.',
    stats: ({ podcasts }) => {
      const shows = Object.values(podcasts?.podcasts ?? {});
      return `${shows.length} shows · ${shows.filter((s) => s.featured).length} featured · ${Object.values(podcasts?.episodes ?? {}).filter((e) => e.status === 'published').length} episodes`;
    },
  },
  {
    id: 'library',
    short: 'Library',
    tone: '#7a5a2f',
    name: 'Library',
    href: 'library.html',
    icon: 'book',
    blurb: 'Your documents in one place: files with proper references, Dashi docs written and exported to Word or PDF, and annotated bibliographies with weekly briefs.',
    stats: ({ library }) => {
      const items = Object.values(library?.items ?? {});
      return `${items.length} documents · ${items.filter((d) => d.kind === 'doc').length} Dashi docs · ${Object.keys(library?.bibs ?? {}).length} bibliographies`;
    },
  },
  {
    id: 'pages',
    short: 'Web views',
    tone: '#3a8a3f',
    name: 'Web views',
    href: 'pages.html',
    icon: 'globe',
    blurb: 'Your public face in one place: what visitors see of your dashboards, strategic plan, podcasts, pages and news, site by site.',
    stats: ({ pages }) => {
      const list = Object.values(pages?.pages ?? {});
      return `${list.filter((p) => p.kind === 'page').length} pages · ${list.filter((p) => p.kind === 'article').length} articles · ${list.filter((p) => p.status === 'draft').length} drafts`;
    },
  },
  {
    id: 'org',
    tone: '#56657f',
    name: 'Organisation',
    href: 'org.html',
    icon: 'org',
    core: true,
    nav: false,
    blurb: 'Your profile, people, teams, public sites and their theme, and which plugins you use.',
    stats: ({ org }) => `${count(org.staff)} staff · ${count(org.teams)} teams · ${Object.values(org.sites).filter((s) => s.visibility === 'public').length} public sites`,
  },
  {
    id: 'help',
    tone: '#56657f',
    name: 'Help',
    href: 'help.html',
    icon: 'help',
    core: true,
    nav: false,
    blurb: 'How the platform fits together, how the systems lenses line up, and the data model.',
    stats: () => 'Guides and diagrams',
  },
];

/** Paused by the platform admin (hosted only): the org can't switch it on itself. */
export const pausedForOrg = (org, id) => !!org.platform?.paused?.[id];
/** The plugins this org has switched on (and the platform hasn't paused). */
export const enabledPlugins = (org) => PLUGINS.filter((p) => p.core || (!pausedForOrg(org, p.id) && org.plugins?.[p.id] !== false));

/** Each page's colour: a plugin's tone, or Dashi's own for the dashboard and the rest. */
export const DASHI_TONE = '#d0621b';
export const toneFor = (id) => PLUGINS.find((p) => p.id === id)?.tone ?? DASHI_TONE;
