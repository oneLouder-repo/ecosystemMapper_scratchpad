import { h } from './dom.js';
import { icon } from './icons.js';
import { TOOLBOX } from '../toolbox.js';
import { ROLES } from '../platform/org.js';

/**
 * The header shared by every page: home, the toolbox, and who is signed in.
 * Accounts are a placeholder until the server exists; the "signed in"
 * person is the org's first admin.
 */
export function Shell(el, { current, org }) {
  const me = Object.values(org.staff).find((s) => s.roleId === 'admin');
  const role = ROLES.find((r) => r.id === me?.roleId);
  const link = (id, href, label, iconName) =>
    h('a', { href, class: `shell-link${id === current ? ' active' : ''}`, 'aria-current': id === current ? 'page' : null },
      icon(iconName, 18), h('span', {}, label));

  el.classList.add('shell');
  el.replaceChildren(
    h('a', { href: 'index.html', class: 'shell-brand' }, h('strong', {}, 'Org Toolbox'), h('span', {}, org.name)),
    h('nav', { class: 'shell-nav', 'aria-label': 'Toolbox' },
      link('home', 'index.html', 'Dashboard', 'home'),
      TOOLBOX.map((t) => link(t.id, t.href, t.name, t.icon)),
    ),
    h('div', { class: 'shell-user', title: 'Accounts and roles arrive with the server' },
      h('span', { class: 'avatar' }, (me?.name ?? '?').split(' ').map((p) => p[0]).join('')),
      h('span', {}, me ? `${me.name} · ${role?.label}` : 'Not signed in'),
    ),
  );
}
