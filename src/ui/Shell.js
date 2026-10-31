import { h } from './dom.js';
import { icon } from './icons.js';
import { Wordmark } from './Wordmark.js';
import { enabledPlugins, toneFor } from '../plugins.js';
import { ROLES, initials } from '../platform/org.js';
import { orgList, openOrg, createOrg, currentUser, signInAs, can, signOut, signedInUser, platformUrl } from '../platform/session.js';

/**
 * The header shared by every page: which org is open (and a switcher), the
 * org's plugins, help, and who is signed in. Accounts are mocked: "Sign in
 * as" picks a staff record, so you can see the platform as anyone.
 */
export function Shell(el, { current, org }) {
  const me = currentUser(org);
  const role = ROLES.find((r) => r.id === me?.roleId);
  const link = (id, href, label, iconName, short = label) =>
    h('a', { href, title: label, class: `shell-link${id === current ? ' active' : ''}`, style: `--tone:${toneFor(id)}`, 'aria-current': id === current ? 'page' : null },
      icon(iconName, 18), h('span', {}, short));
  const account = signedInUser();

  // The page takes its plugin's colour (buttons, links, highlights).
  document.body.dataset.plugin = current;
  document.body.style.setProperty('--color-primary', toneFor(current));
  el.classList.add('shell');
  el.replaceChildren(
    h('details', { class: 'dropdown shell-org' },
      h('summary', { class: 'shell-brand', title: 'Switch organisation' },
        Logo(org, 26),
        h('span', { class: 'shell-org-text' }, h('strong', { class: 'shell-dashi' }, Wordmark(13, { text: false }), 'Dashi'), h('span', {}, org.name)),
        h('span', { class: 'caret-down', 'aria-hidden': 'true' }, '▾')),
      h('ul', { class: 'menu dropdown-content shell-menu' },
        h('li', { class: 'menu-title' }, 'Organisations'),
        orgList().map((o) => h('li', {}, h('button', { class: o.id === org.id ? 'menu-active' : '', onclick: () => o.id !== org.id && openOrg(o.id) }, o.name))),
        can.manageOrgs() && (platformUrl()
          ? h('li', {}, h('a', { href: platformUrl() }, icon('plus', 16), 'Platform admin…'))
          : h('li', {}, h('button', { onclick: () => {
              const name = prompt('Name of the new organisation');
              if (name?.trim()) { createOrg(name.trim()); location.assign('org.html'); }
            } }, icon('plus', 16), 'New organisation…'))),
        h('li', {}, h('a', { href: 'org.html' }, icon('settings', 16), 'Organisation settings')))),
    h('nav', { class: 'shell-nav', 'aria-label': 'Plugins' },
      link('home', 'index.html', 'Dashboard', 'home', 'Home'),
      enabledPlugins(org).filter((p) => p.nav !== false).map((p) => link(p.id, p.href, p.name, p.icon, p.short)),
    ),
    link('help', 'help.html', 'Help', 'help'),
    h('details', { class: 'dropdown dropdown-end shell-user' },
      h('summary', { title: 'Your profile' }, Avatar(me, 28), h('span', { class: 'shell-user-name' }, me ? `${me.name} · ${role?.label}` : 'Not signed in')),
      h('ul', { class: 'menu dropdown-content shell-menu' },
        account && h('li', { class: 'menu-title' }, `Signed in as ${account.email}${account.isSuper ? ' (platform admin)' : ''}`),
        h('li', {}, h('a', { href: 'me.html' }, icon('person', 16), 'My profile and work')),
        can.signOut() && h('li', {}, h('button', { onclick: signOut }, icon('swap', 16), 'Sign out')),
        can.viewAs() && [
          h('li', { class: 'menu-title' }, account ? 'View as (to see what they see)' : 'Sign in as (mock accounts)'),
          Object.values(org.staff).sort((a, b) => a.name.localeCompare(b.name)).map((s) =>
            h('li', {}, h('button', { class: s.id === me?.id ? 'menu-active' : '', onclick: async () => {
              try { await signInAs(org.id, s.id); location.reload(); } catch (err) { alert(err.message); }
            } }, Avatar(s, 20), s.name)))])),
  );
  // A small note in the bottom-left corner when a change is saved, or when it couldn't be.
  window.addEventListener('toolbox:saved', () => toast('Saved', 'ok'));
  window.addEventListener('toolbox:save-failed', (e) => toast(`Not saved: ${e.detail.why}`, 'error'));
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

/** Show a short note in the bottom-left corner. A failure stays longer, and a "Saved" never covers it. */
let toastTimer;
export function toast(text, kind = 'ok') {
  let box = document.querySelector('.save-toast');
  if (box?.dataset.kind === 'error' && kind === 'ok') return;
  if (!box) {
    box = h('div', { class: 'toast toast-start toast-bottom save-toast', role: kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.dataset.kind = kind;
  box.replaceChildren(h('div', { class: `alert alert-soft ${kind === 'error' ? 'alert-error' : 'alert-success'}` },
    icon(kind === 'error' ? 'close' : 'check', 16), h('span', {}, text)));
  box.classList.remove('leaving');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.classList.add('leaving'); setTimeout(() => box.remove(), 250); }, kind === 'error' ? 7000 : 1600);
}
