import { h } from './dom.js';
import { icon } from './icons.js';
import { enabledPlugins } from '../plugins.js';
import { ROLES, initials } from '../platform/org.js';
import { orgList, switchOrg, createOrg, currentUser, signInAs } from '../platform/session.js';

/**
 * The header shared by every page: which org is open (and a switcher), the
 * org's plugins, help, and who is signed in. Accounts are mocked: "Sign in
 * as" picks a staff record, so you can see the platform as anyone.
 */
export function Shell(el, { current, org }) {
  const me = currentUser(org);
  const role = ROLES.find((r) => r.id === me?.roleId);
  const link = (id, href, label, iconName) =>
    h('a', { href, title: label, class: `shell-link${id === current ? ' active' : ''}`, 'aria-current': id === current ? 'page' : null },
      icon(iconName, 18), h('span', {}, label));
  const reload = () => location.assign('index.html');

  el.classList.add('shell');
  el.replaceChildren(
    h('details', { class: 'dropdown shell-org' },
      h('summary', { class: 'shell-brand', title: 'Switch organisation' },
        Logo(org, 26),
        h('span', { class: 'shell-org-text' }, h('strong', {}, 'Org Toolbox'), h('span', {}, org.name)),
        h('span', { class: 'caret-down', 'aria-hidden': 'true' }, '▾')),
      h('ul', { class: 'menu dropdown-content shell-menu' },
        h('li', { class: 'menu-title' }, 'Organisations'),
        orgList().map((o) => h('li', {}, h('button', { class: o.id === org.id ? 'menu-active' : '', onclick: () => { switchOrg(o.id); reload(); } }, o.name))),
        h('li', {}, h('button', { onclick: () => {
          const name = prompt('Name of the new organisation');
          if (name?.trim()) { createOrg(name.trim()); location.assign('org.html'); }
        } }, icon('plus', 16), 'New organisation…')),
        h('li', {}, h('a', { href: 'org.html' }, icon('settings', 16), 'Organisation settings')))),
    h('nav', { class: 'shell-nav', 'aria-label': 'Plugins' },
      link('home', 'index.html', 'Dashboard', 'home'),
      enabledPlugins(org).filter((p) => p.nav !== false).map((p) => link(p.id, p.href, p.name, p.icon)),
    ),
    link('help', 'help.html', 'Help', 'help'),
    h('details', { class: 'dropdown dropdown-end shell-user' },
      h('summary', { title: 'Your profile' }, Avatar(me, 28), h('span', { class: 'shell-user-name' }, me ? `${me.name} · ${role?.label}` : 'Not signed in')),
      h('ul', { class: 'menu dropdown-content shell-menu' },
        h('li', {}, h('a', { href: 'me.html' }, icon('person', 16), 'My profile and work')),
        h('li', { class: 'menu-title' }, 'Sign in as (mock accounts)'),
        Object.values(org.staff).sort((a, b) => a.name.localeCompare(b.name)).map((s) =>
          h('li', {}, h('button', { class: s.id === me?.id ? 'menu-active' : '', onclick: () => { signInAs(org.id, s.id); location.reload(); } },
            Avatar(s, 20), s.name))))),
  );
  // Close a menu when clicking elsewhere.
  document.addEventListener('click', (e) => {
    for (const d of el.querySelectorAll('details[open]')) if (!d.contains(e.target)) d.open = false;
  });
}

/** A person's picture, or their initials. */
export function Avatar(person, size = 28) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`;
  return person?.avatar
    ? h('img', { class: 'avatar-img', src: person.avatar, alt: '', style })
    : h('span', { class: 'avatar-initials', style, 'aria-hidden': 'true' }, initials(person?.name));
}

/** The org's logo, or its initials in a square. */
export function Logo(org, size = 28) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  return org.logo
    ? h('img', { class: 'logo-img', src: org.logo, alt: `${org.name} logo`, style })
    : h('span', { class: 'logo-initials', style, 'aria-hidden': 'true' }, initials(org.name));
}
