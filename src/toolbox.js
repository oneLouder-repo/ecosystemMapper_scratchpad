/**
 * The toolbox: the tools an org can choose from the dashboard. A tool is a
 * page (an .html file) plus its modules. To add one, make the page, then
 * add an entry here and it shows up on the dashboard and in the header.
 *
 * `stats(docs)` returns a short line for the dashboard card from the
 * loaded documents ({ org, strategy, map, data, dashboards }).
 */
export const TOOLBOX = [
  {
    id: 'mapper',
    name: 'Ecosystem Mapper',
    href: 'mapper.html',
    icon: 'mapper',
    blurb: 'Map the actors, agents, relationships and feedback loops in your change ecosystem, through five systems lenses.',
    stats: ({ map }) => (map ? `${Object.keys(map.actors).length} actors · ${Object.keys(map.connectors).length} relationships` : 'Opens with an example map'),
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
    id: 'org',
    name: 'Org Overview',
    href: 'org.html',
    icon: 'org',
    blurb: 'Your people, teams, roles and the public sites you share data and knowledge through.',
    stats: ({ org }) => `${Object.keys(org.staff).length} staff · ${Object.keys(org.teams).length} teams · ${Object.values(org.sites).filter((s) => s.visibility === 'public').length} public sites`,
  },
];
