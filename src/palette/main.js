import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc, onDocChange } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts } from '../platform/docs.js';
import { pluginOn } from '../platform/org.js';
import { migrateStrategy } from '../platform/strategy.js';
import { dashboardFromNode } from '../platform/dashboards.js';
import { currentUser } from '../platform/session.js';
import { DashboardsTool } from './DashboardsTool.js';
import { DataTool } from './DataTool.js';
import { PublishTool } from './PublishTool.js';
import { HomeTool } from './HomeTool.js';
import { PostcardTool } from './PostcardTool.js';
import { PodcastTool } from './PodcastTool.js';

/**
 * The Workbench: a suite of mini-tools for bringing people into the
 * data dialogue. Each mini-tool is a function (ctx) → element, listed in
 * MINI_TOOLS. To add one, write the function and add an entry; it gets the
 * same ctx (the org, strategy, data and dashboards, plus helpers).
 *
 * `when(org)` limits a mini-tool to orgs with what it needs (a plugin).
 * The route lives in the URL hash: #home, #dashboards, #<dashboard id>,
 * #data, #postcards, #podcast, #publish.
 */
const MINI_TOOLS = [
  { id: 'home', name: 'Overview', blurb: 'Everything in the Workbench', icon: 'workbench', render: HomeTool },
  { id: 'dashboards', name: 'Dashboards', blurb: 'Design private and public dashboards', about: 'Build dashboards from your strategy measures: for staff, for the board, or for a public site.', icon: 'chart', render: DashboardsTool },
  { id: 'data', name: 'Program data', blurb: 'The numbers behind the measures', about: 'Keep the monthly numbers behind each measure current. Every dashboard and site using them updates.', icon: 'timeline', render: DataTool },
  { id: 'postcards', name: 'Data postcards', blurb: 'Share one number, beautifully', about: 'Turn a measure into a shareable picture in your colours, with alt text, for newsletters, social posts and slides.', icon: 'media', render: PostcardTool, isNew: true },
  { id: 'podcast', name: 'Podcast publishing', blurb: 'Upload and publish episodes fast', about: 'Upload an episode and put it out in one step, or send drafts and scheduled episodes live.', icon: 'mic', render: PodcastTool, when: (org) => pluginOn(org, 'podcasts') },
  { id: 'publish', name: 'Publishing', blurb: 'What each public site shows', about: 'Choose which dashboards each public site shows, and what stays private.', icon: 'globe', render: PublishTool },
];
const COMING = [
  { name: 'Impact calculator', blurb: 'A public slider tool: “a gift of $50 means 3 more youth in a program”, from your own data.' },
  { name: 'Data stories', blurb: 'Scrolling stories that mix charts, words and audio.' },
  { name: 'Feedback forms', blurb: 'Ask the community what they make of the data.' },
];

const org = loadOrg();
let strategy = loadStrategy();
const dashboards = new Store(loadDashboards(), applyCollectionOp);
const data = new Store(loadData(), applyCollectionOp);
autosaveDoc('dashboards', dashboards, 150);
autosaveDoc('data', data, 150);
const podcasts = pluginOn(org, 'podcasts') ? new Store(loadPodcasts(), applyCollectionOp) : null;
if (podcasts) autosaveDoc('podcasts', podcasts, 150);
const tools = MINI_TOOLS.filter((t) => !t.when || t.when(org));
Shell(document.querySelector('#shell'), { current: 'palette', org });

const app = document.querySelector('#app');
app.classList.add('palette');
const side = h('nav', { class: 'palette-side', 'aria-label': 'Workbench' });
const main = h('section', { class: 'palette-main' });
app.replaceChildren(side, main);

const ctx = {
  org,
  dashboards,
  data,
  podcasts,
  tools,
  coming: COMING,
  get strategy() { return strategy; },
  get route() { return decodeURIComponent(location.hash.slice(1)) || 'home'; },
  go(route) {
    if (location.hash !== `#${route}`) location.hash = route;
    else render();
  },
  /** Make a dashboard (blank, or from an objective or goal) and open it. */
  create(nodeId) {
    const me = currentUser(org)?.id ?? null;
    const dash = nodeId
      ? dashboardFromNode(strategy, nodeId, me)
      : { title: 'Untitled dashboard', description: '', visibility: 'private', siteId: null, createdBy: me, widgets: [] };
    const op = dashboards.apply(col.add('dashboards', dash));
    ctx.go(op.id);
  },
  asOf: {},
  render: () => render(),
};

function render() {
  const route = ctx.route;
  const dashList = Object.values(dashboards.doc.dashboards);
  const tool = tools.find((t) => t.id === route) ?? (dashboards.doc.dashboards[route] ? tools.find((t) => t.id === 'dashboards') : tools[0]);
  side.replaceChildren(
    h('h2', {}, 'Workbench'),
    h('div', { class: 'mini-tools' },
      tools.map((t) =>
        h('button', { class: `mini-tool${t === tool ? ' on' : ''}`, 'aria-current': t === tool ? 'page' : null, onclick: () => ctx.go(t.id) },
          icon(t.icon, 20), h('span', {}, t.name, h('small', {}, t.blurb)))),
      COMING.map((t) => h('div', { class: 'mini-tool soon' }, icon('plus', 20), h('span', {}, t.name, h('small', {}, 'Coming soon'))))),
    h('h2', {}, 'Dashboards'),
    h('ul', { class: 'dash-list' },
      dashList.map((d) => h('li', {}, h('a', { href: `#${d.id}`, class: route === d.id ? 'on' : '' },
        h('span', {}, d.title), h('span', { class: `badge ${d.visibility}` }, d.visibility))))),
  );

  // Keep the focused field and scroll position across the redraw.
  const scroll = main.scrollTop;
  const focused = main.contains(document.activeElement) ? document.activeElement.name : null;
  main.replaceChildren(tool.render(ctx));
  main.scrollTop = scroll;
  if (focused) main.querySelector(`[name="${focused}"]`)?.focus();
}

dashboards.addEventListener('change', render);
data.addEventListener('change', render);
podcasts?.addEventListener('change', render);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
// Measures edited in Strategy & Work in another tab show up here.
onDocChange('strategy', (doc) => { strategy = migrateStrategy(doc); render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    const store = ctx.route === 'data' ? data : dashboards;
    e.shiftKey ? store.redo() : store.undo();
  }
});
render();

window.palette = ctx;
