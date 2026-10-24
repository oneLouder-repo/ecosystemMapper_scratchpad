import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { TOOLBOX } from '../toolbox.js';
import { loadOrSeed } from '../platform/storage.js';
import { seedOrg } from '../platform/org.js';
import { seedStrategy } from '../platform/strategySeed.js';
import { statusById } from '../platform/strategy.js';
import { loadLocal } from '../persistence/local.js';
import { addDays, short, today } from '../strategy/dates.js';

const org = loadOrSeed('org', seedOrg);
const strategy = loadOrSeed('strategy', seedStrategy);
const map = loadLocal();

Shell(document.querySelector('#shell'), { current: 'home', org });

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
    h('h2', {}, 'Your toolbox'),
    h('div', { class: 'cards' },
      TOOLBOX.map((tool) =>
        h('a', { class: 'card', href: tool.href },
          h('h3', {}, icon(tool.icon, 26), tool.name),
          h('p', {}, tool.blurb),
          h('div', { class: 'stat-line' }, tool.stats({ org, strategy, map })),
        ),
      ),
    ),
    h('h2', {}, 'Due in the next 30 days'),
    upcoming.length
      ? h('ul', { class: 'upcoming' },
          upcoming.map((t) =>
            h('li', {},
              h('span', { class: 'when' }, t.end < now ? `Overdue · ${short(t.end)}` : short(t.end)),
              h('span', { class: 'dot', style: `background:${statusById[t.status].color}`, title: statusById[t.status].label }),
              h('a', { href: `strategy.html#${t.id}` }, t.title),
              h('span', { class: 'muted' }, t.assigneeIds.map((id) => org.staff[id]?.name).filter(Boolean).join(', ')),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'Nothing due soon.'),
    h('p', { class: 'note' },
      'Coming next: dashboards built from the measures on your objectives and goals, public views you choose to share, and staff accounts with roles and sandboxes.'),
  ),
);
