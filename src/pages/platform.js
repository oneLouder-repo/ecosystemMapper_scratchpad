import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../platform/org.js';
import { PLUGINS } from '../plugins.js';
import { Wordmark } from '../ui/Wordmark.js';

/**
 * The platform's own site (the root domain): the organisations you can
 * open and, for the platform admin, the console to add organisations,
 * set their plan, suspend or remove them, and manage people's sign-in.
 */
const app = document.querySelector('#app');
const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body && JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
  return out;
};
const PLANS = [{ id: 'free', label: 'Free' }, { id: 'basic', label: 'Basic' }, { id: 'standard', label: 'Standard' }, { id: 'custom', label: 'Custom' }];
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40);
const open = (o) => `/auth/switch?org=${encodeURIComponent(o.id)}&next=/`;

let session;
try {
  session = await (await fetch('/api/session')).json();
} catch {
  location.replace('index.html'); // No server: the local prototype.
  throw new Error('No server');
}

async function render() {
  const { user } = session;
  const head = h('header', { class: 'platform-head' },
    h('a', { href: '/', class: 'platform-brand', 'aria-label': 'Dashi home' }, Wordmark(22)),
    h('span', { class: 'spacer' }),
    user
      ? [h('span', { class: 'muted' }, user.email), h('button', { class: 'btn btn-sm', onclick: async () => { await call('POST', '/api/auth/logout'); location.reload(); } }, 'Sign out')]
      : h('a', { class: 'btn btn-sm btn-primary', href: '/login.html?next=/' }, 'Sign in'));

  if (!user) {
    return app.replaceChildren(head, h('section', { class: 'platform-hero' },
      h('h1', {}, 'Planning, mapping and sharing for small nonprofits'),
      h('p', {}, 'Ecosystem maps, strategy and work plans, data dashboards, a podcast station and public pages, for each organisation, in one place.'),
      h('a', { class: 'btn btn-primary', href: '/login.html?next=/' }, 'Sign in')));
  }

  const yours = h('section', {},
    h('h2', {}, user.isSuper ? 'All organisations' : 'Your organisations'),
    session.orgs.length
      ? h('div', { class: 'cards' }, session.orgs.map((o) => h('a', { class: 'card org-card', href: open(o) },
          h('span', { class: 'logo-initials', style: 'width:40px;height:40px;font-size:15px' }, initials(o.name)),
          h('strong', {}, o.name), h('small', { class: 'muted' }, o.url.replace(/^https?:\/\//, '')),
          o.status !== 'active' && h('span', { class: 'badge badge-warning badge-sm' }, o.status))))
      : h('p', { class: 'empty' }, 'You aren’t in any organisation yet. Ask its admin to add your email to the staff list.'));

  if (!user.isSuper) return app.replaceChildren(head, h('div', { class: 'page' }, yours));

  const [orgs, users] = await Promise.all([call('GET', '/api/admin/orgs'), call('GET', '/api/admin/users')]);
  const f = {
    name: h('input', { class: 'input input-sm', placeholder: 'Organisation name', required: true }),
    slug: h('input', { class: 'input input-sm', placeholder: 'address', required: true, pattern: '[a-z0-9\\-]+' }),
    plan: h('select', { class: 'select select-sm', 'aria-label': 'Plan' }, options(PLANS, 'free')),
    adminEmail: h('input', { class: 'input input-sm', type: 'email', placeholder: 'Their admin’s email' }),
    adminName: h('input', { class: 'input input-sm', placeholder: 'Their admin’s name' }),
  };
  let slugEdited = false;
  f.name.addEventListener('input', () => { if (!slugEdited) f.slug.value = slugify(f.name.value); });
  f.slug.addEventListener('input', () => { slugEdited = true; });
  const suffix = location.host;
  const u = { email: h('input', { class: 'input input-sm', type: 'email', placeholder: 'Email', required: true }), name: h('input', { class: 'input input-sm', placeholder: 'Name' }) };
  const OPTIONAL = PLUGINS.filter((p) => !p.core);
  const pluginToggles = (o) => h('div', { class: 'plugin-toggles' }, OPTIONAL.map((p) => {
    const on = !o.paused[p.id] && o.chosen[p.id] !== false;
    return h('label', { class: 'feature-toggle', title: on ? `${p.name} is on for ${o.name}` : o.paused[p.id] ? `Paused by you` : `Switched off by ${o.name}` },
      h('input', { type: 'checkbox', class: 'toggle toggle-xs toggle-primary', checked: on,
        onchange: (e) => act(() => call('POST', `/api/admin/orgs/${o.id}/plugins`, { plugin: p.id, on: e.target.checked })) }),
      icon(p.icon, 14), p.name);
  }));
  const act = async (fn) => { try { await fn(); await reload(); } catch (err) { alert(err.message); } };

  app.replaceChildren(head, h('div', { class: 'page' },
    yours,
    h('section', {},
      h('h2', {}, 'Add an organisation'),
      h('form', { class: 'inline-form platform-form', onsubmit: (e) => {
        e.preventDefault();
        act(() => call('POST', '/api/admin/orgs', { name: f.name.value, slug: f.slug.value, plan: f.plan.value, adminEmail: f.adminEmail.value || null, adminName: f.adminName.value || null }));
      } },
        f.name, h('span', { class: 'slug-field' }, f.slug, h('span', { class: 'muted' }, `.${suffix}`)), f.plan, f.adminEmail, f.adminName,
        h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, icon('plus', 14), 'Add')),
      h('p', { class: 'muted small' }, 'Their admin can then sign in with that email (with Google, or a password you set below) and add their own staff.')),
    h('section', {},
      h('h2', {}, 'Organisations'),
      h('p', { class: 'muted small' }, 'Switch a plugin on to add it to an organisation’s plan; switch it off to pause it. A paused plugin keeps its content, but the organisation and its public site can’t use it until you switch it back on.'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
        h('thead', {}, h('tr', {}, ['Name', 'Address', 'Plan', 'Plugins', 'People', 'Status', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, orgs.map((o) => h('tr', {},
          h('td', {}, h('strong', {}, o.name)),
          h('td', {}, h('a', { href: open(o) }, o.url.replace(/^https?:\/\//, ''))),
          h('td', {}, h('select', { class: 'select select-xs', 'aria-label': `Plan for ${o.name}`, onchange: (e) => act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { plan: e.target.value })) }, options(PLANS, o.plan))),
          h('td', {}, pluginToggles(o)),
          h('td', {}, o.members),
          h('td', {}, h('label', { class: 'feature-toggle' },
            h('input', { type: 'checkbox', class: 'toggle toggle-xs toggle-primary', checked: o.status === 'active', onchange: (e) => act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { status: e.target.checked ? 'active' : 'suspended' })) }),
            o.status)),
          h('td', {}, h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: () => {
            if (prompt(`This deletes ${o.name} and everything in it, for good. Type its address (${o.slug}) to confirm.`) === o.slug) act(() => call('DELETE', `/api/admin/orgs/${o.id}`));
          } }, 'Delete')))))))),
    h('section', {},
      h('h2', {}, 'People who can sign in'),
      h('p', { class: 'muted small' }, 'People join an organisation when its admin lists their email in its staff list. Here you can give someone a password (for those without Google) or add another platform admin.'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
        h('thead', {}, h('tr', {}, ['Name', 'Email', 'Organisations', 'Sign-in', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, users.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.name), x.is_super ? h('span', { class: 'badge badge-sm badge-primary', style: 'margin-left:6px' }, 'platform admin') : null),
          h('td', {}, x.email),
          h('td', {}, x.memberships.map((m) => `${m.name} (${m.role})`).join(', ') || '—'),
          h('td', {}, [x.google && 'Google', x.has_password && 'password'].filter(Boolean).join(', ') || 'not yet'),
          h('td', {}, h('button', { class: 'btn btn-xs', onclick: () => {
            const pw = prompt(`New password for ${x.email} (at least 10 characters). Share it with them safely.`);
            if (pw) act(() => call('POST', `/api/admin/users/${x.id}/password`, { password: pw }));
          } }, 'Set password'))))))),
      h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); act(() => call('POST', '/api/admin/users', { email: u.email.value, name: u.name.value, isSuper: true })); } },
        u.email, u.name, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Add a platform admin')))));
}

async function reload() {
  session = await (await fetch('/api/session')).json();
  await render();
}
render();
