import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { measureIndex } from '../platform/strategy.js';
import { dataMonths } from '../platform/data.js';
import { published } from '../platform/podcasts.js';
import { monthLabel, today } from '../strategy/dates.js';

/** The Workbench's front page: what is here, and a way into each mini-tool. */
export function HomeTool(ctx) {
  const dashes = Object.values(ctx.dashboards.doc.dashboards);
  const measures = Object.keys(measureIndex(ctx.strategy));
  const months = dataMonths(ctx.data.doc);
  const pods = ctx.podcasts?.doc;
  const waiting = pods ? Object.values(pods.episodes).filter((e) => !published(e, today())).length : 0;
  const stat = (label, value, hint) => h('div', { class: 'stat-tile' }, h('span', {}, label), h('strong', {}, value), hint && h('small', {}, hint));

  return h('div', {},
    PluginHeader('palette', {
      blurb: 'Tools for showing, exploring and playing with your data, and for bringing staff, partners and the public into the conversation about it.',
      actions: h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.create() }, icon('plus', 14), 'New dashboard'),
    }),
    h('div', { class: 'stat-tiles' },
      stat('Dashboards', dashes.length, `${dashes.filter((d) => d.visibility === 'public' && d.siteId).length} on a public site`),
      stat('Measures', measures.length, 'from Strategy & Work'),
      stat('Latest data', months.length ? monthLabel(months.at(-1)) : 'None yet', `${months.length} months recorded`),
      pods && stat('Episodes waiting', waiting, waiting ? 'drafts and scheduled' : 'nothing waiting')),
    h('h2', {}, 'Mini-tools'),
    h('div', { class: 'cards' }, ctx.tools.filter((t) => t.id !== 'home').map((t) =>
      h('a', { class: 'card tool-card', href: `#${t.id}` },
        h('h3', {}, icon(t.icon, 22), t.name),
        h('p', {}, t.about ?? t.blurb),
        t.isNew && h('div', { class: 'stat-line' }, h('span', { class: 'badge badge-sm badge-primary' }, 'New'))))),
    h('h2', {}, 'Ideas in the works'),
    h('ul', { class: 'idea-list' }, ctx.coming.map((t) => h('li', {}, h('strong', {}, t.name), ' ', h('span', { class: 'muted' }, t.blurb)))));
}
