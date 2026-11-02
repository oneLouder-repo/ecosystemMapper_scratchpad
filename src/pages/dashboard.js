import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { enabledPlugins } from '../plugins.js';
import { loadAll } from '../platform/docs.js';
import { currentUser } from '../platform/session.js';
import { statusById } from '../platform/strategy.js';
import { addDays, short, today } from '../strategy/dates.js';
import { libraryTags } from '../platform/library.js';

const docs = loadAll();
const { org, strategy, dashboards } = docs;
const hasLibrary = enabledPlugins(org).some((p) => p.id === 'library');
const tags = hasLibrary ? libraryTags(docs.library).slice(0, 36) : [];

/** The library's tags as a cloud: what the organisation is reading and thinking about. */
function TagCloudCard() {
  if (!hasLibrary) return null;
  const top = tags[0]?.n ?? 1;
  return h('section', { class: 'card tag-cloud-card' },
    h('div', { class: 'section-head' }, h('h2', {}, icon('tag', 20), ' What we’re reading about'), h('a', { href: 'library.html#tags' }, 'All tags →')),
    tags.length
      ? h('div', { class: 'tag-cloud' }, [...tags].sort((a, b) => a.tag.localeCompare(b.tag)).map((t) =>
          h('a', { class: 'cloud-tag', href: `library.html#tag/${encodeURIComponent(t.tag)}`, title: `${t.tag}: ${t.n} item${t.n === 1 ? '' : 's'}`,
            style: `font-size:${(0.85 + (t.n / top) * 1.0).toFixed(2)}rem; --w:${(0.35 + (t.n / top) * 0.65).toFixed(2)}` }, t.tag, h('small', {}, t.n))))
      : h('p', { class: 'muted' }, 'Tag readings in the ', h('a', { href: 'library.html' }, 'library'), ' and the themes show up here.'));
}

Shell(document.querySelector('#shell'), { current: 'home', org });
const me = currentUser(org);
const myOpen = Object.values(strategy.nodes).filter((n) => n.type === 'task' && n.status !== 'done' && (n.assigneeIds ?? []).includes(me?.id)).length;

// Tasks that are open and due in the next 30 days, or overdue.
const now = today();
const soon = addDays(now, 30);
const upcoming = Object.values(strategy.nodes)
  .filter((n) => n.type === 'task' && n.status !== 'done' && n.end && n.end <= soon)
  .sort((a, b) => a.end.localeCompare(b.end))
  .slice(0, 8);

document.querySelector('#app').replaceChildren(
  h('div', { class: 'page' },
    h('h1', {}, org.name),
    h('p', { class: 'lede' }, org.mission),
    me && h('p', {}, `Welcome back, ${me.name.split(' ')[0]}. `, h('a', { href: 'me.html' }, `You have ${myOpen} open task${myOpen === 1 ? '' : 's'}`), '.'),
    h('h2', {}, 'Your plugins'),
    h('div', { class: 'cards' },
      enabledPlugins(org).map((tool) =>
        h('a', { class: 'card plugin-card', href: tool.href, style: `--tone:${tool.tone ?? 'var(--accent)'}` },
          h('h3', {}, h('span', { class: 'tone-tile', 'aria-hidden': 'true' }, icon(tool.icon, 22)), tool.name),
          h('p', {}, tool.blurb),
          h('div', { class: 'stat-line' }, tool.stats(docs)),
        ),
      ),
    ),
    TagCloudCard(),
    h('h2', {}, 'Due in the next 30 days'),
    upcoming.length
      ? h('ul', { class: 'upcoming' },
          upcoming.map((t) =>
            h('li', {},
              h('span', { class: 'when' }, t.end < now ? `Overdue · ${short(t.end)}` : short(t.end)),
              h('span', { class: 'dot', style: `background:${statusById[t.status].color}`, title: statusById[t.status].label }),
              h('a', { href: `strategy.html#${t.id}` }, t.title),
              h('span', { class: 'muted' }, (t.assigneeIds ?? []).map((id) => org.staff[id]?.name).filter(Boolean).join(', ')),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'Nothing due soon.'),
    h('h2', {}, 'Your public sites'),
    h('div', { class: 'cards' },
      Object.values(org.sites).map((s) => {
        const shown = Object.values(dashboards.dashboards).filter((d) => d.siteId === s.id && d.visibility === 'public');
        return h('a', { class: 'card', href: `site.html?site=${s.id}`, target: '_blank' },
          h('h3', {}, icon('globe', 22), s.name),
          h('p', {}, s.shows || s.url),
          h('div', { class: 'stat-line' }, h('span', { class: `badge ${s.visibility}` }, s.visibility), ' ',
            shown.length ? `${shown.length} live dashboard${shown.length > 1 ? 's' : ''}` : 'No dashboards yet'));
      })),
    h('p', { class: 'note' },
      'Dashi is in alpha. Something odd, or an idea? Use Help & feedback at the bottom right of any page.'),
  ),
);
