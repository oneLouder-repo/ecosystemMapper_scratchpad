/**
 * The plugins: the tools an org can switch on for its dashboard. A plugin
 * is a page (an .html file) plus its modules. To add one, make the page,
 * then add an entry here; it shows up on the dashboard, in the header and
 * in Organisation settings, where an org can switch it off.
 *
 * `core: true` plugins can't be switched off.
 * `stats(docs)` returns a short line for the dashboard card from the
 * loaded documents (see platform/docs.js loadAll).
 */
const count = (o) => Object.keys(o ?? {}).length;

export const PLUGINS = [
  {
    id: 'mapper',
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
    id: 'palette',
    name: 'Creative Palette',
    href: 'palette.html',
    icon: 'palette',
    blurb: 'Mini-tools for bringing others into the data dialogue: design dashboards from your strategy, keep program data current, and publish to public sites.',
    stats: ({ dashboards }) => {
      const list = Object.values(dashboards?.dashboards ?? {});
      return `${list.length} dashboards · ${list.filter((d) => d.visibility === 'public' && d.siteId).length} published`;
    },
  },
  {
    id: 'radio',
    name: 'Radio & Podcasts',
    href: 'radio.html',
    icon: 'radio',
    blurb: 'Your own podcasts and online radio station: publish episodes, build a weekly programme, share feeds. Shaped to work with Castopod.',
    stats: ({ radio }) => `${count(radio?.podcasts)} shows · ${Object.values(radio?.episodes ?? {}).filter((e) => e.status === 'published').length} episodes`,
  },
  {
    id: 'org',
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
    name: 'Help',
    href: 'help.html',
    icon: 'help',
    core: true,
    nav: false,
    blurb: 'How the platform fits together, how the systems lenses line up, and the data model.',
    stats: () => 'Guides and diagrams',
  },
];

/** The plugins this org has switched on. */
export const enabledPlugins = (org) => PLUGINS.filter((p) => p.core || org.plugins?.[p.id] !== false);
