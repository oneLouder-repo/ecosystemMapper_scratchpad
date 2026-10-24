import { h } from '../ui/dom.js';
import { onDocChange } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards } from '../platform/docs.js';
import { migrateStrategy } from '../platform/strategy.js';
import { dashboardMonths } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';

/**
 * A sample public site: site.html?site=<id>. Shows the dashboards that are
 * public and placed on this site, reading live program data. When staff
 * change data or dashboards in another tab, the page redraws.
 *
 * In production this is served by the Node app (or a HubSpot module) from
 * a published snapshot, with only public dashboards and their data.
 */
const docs = { org: loadOrg(), strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards() };
const siteId = new URLSearchParams(location.search).get('site') ?? 'site-impact';
const root = document.querySelector('#site');
// Where each dashboard's player is, so a live update doesn't rewind it.
const asOf = {};
let first = true;

function render() {
  const { org } = docs;
  const site = org.sites[siteId];
  const publicSites = Object.values(org.sites).filter((s) => s.visibility === 'public');
  const shown = Object.values(docs.dashboards.dashboards).filter((d) => d.siteId === siteId && d.visibility === 'public');
  document.title = `${site?.name ?? 'Site'} · ${org.name}`;

  const body = !site
    ? h('p', { class: 'empty' }, 'There is no site here.')
    : site.visibility === 'private'
      ? h('p', { class: 'empty' }, `${site.name} is private. Staff and board members sign in to see it.`)
      : shown.length
        ? shown.map((d) => {
            const months = dashboardMonths(d, docs.data);
            // Follow new data when the reader is on the latest month.
            const at = asOf[d.id] && asOf[d.id] !== asOf[`${d.id}:last`] ? asOf[d.id] : months.at(-1);
            const view = DashboardView(d, docs, { asOf: at });
            view.id = d.id;
            asOf[`${d.id}:last`] = months.at(-1);
            new MutationObserver(() => { asOf[d.id] = view.dataset.asOf; }).observe(view, { attributes: true, attributeFilter: ['data-as-of'] });
            return view;
          })
        : h('p', { class: 'empty' }, 'Nothing is published here yet.');

  root.replaceChildren(
    h('div', { class: 'preview-banner' }, 'Sample public site, made by Org Toolbox from live program data. ', h('a', { href: 'palette.html#publish' }, 'Back to the toolbox')),
    h('header', { class: 'site-head' },
      h('div', { class: 'inner' },
        h('strong', {}, org.name),
        h('nav', { 'aria-label': 'Public sites' },
          publicSites.map((s) => h('a', { href: `?site=${s.id}`, 'aria-current': s.id === siteId ? 'page' : null }, s.name))))),
    h('main', { class: 'site-main' },
      h('section', { class: 'site-hero' },
        h('h1', {}, site?.name ?? 'Not found'),
        h('p', {}, org.mission, site?.shows ? ` This page shares ${site.shows.charAt(0).toLowerCase()}${site.shows.slice(1)}.` : ''),
        h('p', { class: 'live-dot', style: 'margin-top:12px' }, 'Live program data. Press Play on a dashboard to watch the year change.')),
      body),
    h('footer', { class: 'site-foot' }, `© ${org.name}. Every chart has a table view for screen readers and printing.`),
  );
  if (first && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  first = false;
}

onDocChange('dashboards', (doc) => { docs.dashboards = doc; render(); });
onDocChange('data', (doc) => { docs.data = doc; render(); });
onDocChange('strategy', (doc) => { docs.strategy = migrateStrategy(doc); render(); });
onDocChange('org', (doc) => { docs.org = doc; render(); });
render();
