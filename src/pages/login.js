import { h } from '../ui/dom.js';
import { Wordmark } from '../ui/Wordmark.js';
import { initials } from '../platform/org.js';

/**
 * Sign in to the hosted platform: with Google, with an email and password,
 * or (on a test server with dev sign-in on) as anyone, to see the platform
 * as they do. Afterwards it goes back to ?next=.
 */
const app = document.querySelector('#app');
const next = new URLSearchParams(location.search).get('next') || '/';
const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) });

let options;
try {
  const res = await fetch('/api/auth/options');
  if (!res.ok) throw new Error();
  options = await res.json();
} catch {
  app.replaceChildren(h('div', { class: 'login-box card' },
    h('h1', {}, 'Sign-in needs the server'),
    h('p', {}, 'This copy is running without the platform server, so there are no accounts. Everything still works in your browser: ', h('a', { href: 'index.html' }, 'open the dashboard'), '.')));
  throw new Error('No server');
}

/** A letter in each provider's colour, beside its name (no logos to license). */
const MARKS = { google: 'G', facebook: 'f', microsoft: '⊞' };

const message = h('p', { class: 'login-error', role: 'alert' });
const email = h('input', { class: 'input w-full', type: 'email', name: 'email', autocomplete: 'username', required: true, placeholder: 'you@example.org' });
const password = h('input', { class: 'input w-full', type: 'password', name: 'password', autocomplete: 'current-password', required: true });

app.replaceChildren(h('div', { class: 'login-wrap' },
  h('div', { class: 'login-box card' },
    h('p', { class: 'eyebrow' }, Wordmark(20)),
    h('h1', {}, options.org ? `Sign in to ${options.org.name}` : 'Sign in'),
    (options.providers ?? []).map((p) => h('a', { class: `btn w-full provider-btn provider-${p.id}`, href: `/auth/${p.id}?next=${encodeURIComponent(safeNext)}` },
      h('span', { class: 'provider-mark', 'aria-hidden': 'true' }, MARKS[p.id] ?? p.label[0]), `Continue with ${p.label}`)),
    options.providers?.length > 0 && h('div', { class: 'divider' }, 'or'),
    h('form', { class: 'login-form', onsubmit: async (e) => {
      e.preventDefault();
      message.textContent = '';
      const res = await post('/api/auth/password', { email: email.value, password: password.value });
      if (res.ok) location.assign(safeNext);
      else message.textContent = (await res.json().catch(() => ({}))).error ?? 'That didn’t work.';
    } },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Email'), email),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Password'), password),
      message,
      h('button', { class: 'btn btn-primary w-full', type: 'submit' }, 'Sign in'),
      h('p', { class: 'small' }, h('a', { href: '/reset.html' }, 'Forgot your password?'))),
    h('p', { class: 'muted small' }, 'No account? Your organisation’s admin adds you to its staff list in Organisation settings.')),
  options.dev && DevLogin(options, safeNext),
));
email.focus();

/**
 * Test sign-in (dev and staging servers): everyone, grouped so a tester can
 * pick a role quickly. The platform admin first, then this org's people by
 * role, then each other org, folded. A search box narrows all of it.
 */
function DevLogin(options, next) {
  const ORDER = ['admin', 'lead', 'staff', 'viewer'];
  const ROLE_LABEL = { admin: 'Admins', lead: 'Leads', staff: 'Staff', viewer: 'Viewers' };
  const here = options.org?.id;
  const person = (u, role) => h('li', { 'data-search': `${u.name} ${u.email} ${(u.orgs ?? []).join(' ')}`.toLowerCase() },
    h('button', { class: 'dev-user', onclick: async () => {
      const res = await post('/api/auth/dev', { userId: u.id });
      if (res.ok) location.assign(next);
    } },
      h('span', { class: 'avatar-initials', style: 'width:30px;height:30px;font-size:12px' }, initials(u.name)),
      h('span', {}, h('strong', {}, u.name, u.isSuper && h('span', { class: 'badge badge-sm badge-primary', style: 'margin-left:6px' }, 'platform admin'),
        role && h('span', { class: 'badge badge-sm badge-ghost', style: 'margin-left:6px' }, role)),
        h('small', {}, [u.email, ...((u.orgs ?? []).length > 1 ? u.orgs : [])].join(' · ')))));
  const supers = options.dev.filter((u) => u.isSuper);
  const orgs = new Map();
  for (const u of options.dev) for (const m of u.memberships ?? []) {
    if (!orgs.has(m.orgId)) orgs.set(m.orgId, { name: m.org, people: [] });
    orgs.get(m.orgId).people.push({ u, role: m.role });
  }
  const byRole = (people) => ORDER.map((r) => {
    const group = people.filter((p) => p.role === r).sort((a, b) => a.u.name.localeCompare(b.u.name));
    return group.length && [h('li', { class: 'dev-role' }, `${ROLE_LABEL[r]} (${group.length})`), group.map((p) => person(p.u, r))];
  });
  const sections = [
    supers.length && h('ul', { class: 'dev-users' }, supers.map((u) => person(u))),
    here && orgs.has(here) && h('details', { class: 'dev-org', open: true },
      h('summary', {}, `${orgs.get(here).name}, here`), h('ul', { class: 'dev-users' }, byRole(orgs.get(here).people))),
    [...orgs].filter(([id]) => id !== here).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([, o]) =>
      h('details', { class: 'dev-org', open: !here },
        h('summary', {}, `${o.name} (${o.people.length})`), h('ul', { class: 'dev-users' }, byRole(o.people)))),
  ];
  const list = h('div', { class: 'dev-groups' }, sections);
  const search = h('input', { class: 'input input-sm w-full', type: 'search', placeholder: 'Find a person, email or org', 'aria-label': 'Find a test person',
    oninput: () => {
      const t = search.value.trim().toLowerCase();
      for (const li of list.querySelectorAll('li[data-search]')) li.hidden = !!t && !li.dataset.search.includes(t);
      for (const d of list.querySelectorAll('details')) { if (t) d.open = !!d.querySelector('li[data-search]:not([hidden])'); }
    } });
  return h('section', { class: 'login-box card dev-login' },
    h('h2', {}, 'Test sign-in'),
    h('p', { class: 'muted small' }, 'This is a test server, so you can be anyone. Pick a role to see what that person sees. A live server has this turned off.'),
    search, list);
}
