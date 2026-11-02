import { h, options } from '../ui/dom.js';
import { col } from '../core/collections.js';

/** Publishing mini-tool: which dashboards each site shows, and what is public. */
export function PublishTool(ctx) {
  const { org, dashboards } = ctx;
  const list = Object.values(dashboards.doc.dashboards);
  const sites = Object.values(org.sites);
  const update = (id, patch) => dashboards.apply(col.update('dashboards', id, patch));

  return h('div', {},
    h('h1', {}, 'Publishing'),
    h('p', { class: 'lede' }, 'A dashboard shows on a site when it is public and the site is chosen. Site visibility is set in ', h('a', { href: 'org.html' }, 'Org Overview'), '.'),
    h('div', { class: 'cards' }, sites.map((s) => {
      const shown = list.filter((d) => d.siteId === s.id && d.visibility === 'public');
      return h('div', { class: 'card' },
        h('h3', {}, s.name, ' ', h('span', { class: `badge ${s.visibility}` }, s.visibility)),
        h('p', {}, s.shows || s.url),
        h('p', {}, shown.length ? shown.map((d) => d.title).join(', ') : 'No public dashboards yet.'),
        h('div', { class: 'stat-line' }, h('a', { href: `site.html?site=${s.id}`, target: '_blank' }, s.visibility === 'public' ? 'Open site ↗' : 'Preview site ↗')));
    })),
    h('h2', {}, 'Every dashboard'),
    h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Dashboard'), h('th', {}, 'Visibility'), h('th', {}, 'Site'))),
      h('tbody', {}, list.map((d) =>
        h('tr', {},
          h('td', {}, h('a', { href: `#${d.id}` }, d.title)),
          h('td', {}, h('select', { name: `${d.id}-vis`, 'aria-label': `Visibility of ${d.title}`, onchange: (e) => update(d.id, { visibility: e.target.value }) },
            options([{ id: 'private', label: 'Private' }, { id: 'public', label: 'Public' }], d.visibility))),
          h('td', {}, h('select', { name: `${d.id}-site`, 'aria-label': `Site for ${d.title}`, onchange: (e) => update(d.id, { siteId: e.target.value || null }) },
            h('option', { value: '' }, 'No site'), options(sites.map((s) => ({ id: s.id, label: s.name })), d.siteId))))))));
}
