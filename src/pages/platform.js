import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../platform/org.js';
import { PLUGINS } from '../plugins.js';
import { Wordmark } from '../ui/Wordmark.js';
import { SideNav } from '../ui/SideNav.js';

/**
 * The platform's own site (the root domain): the organisations you can
 * open and, for the platform admin, the console to add organisations,
 * set their plan, suspend or remove them, and manage people's sign-in.
 * The console uses the same sidebar as the plugins, one section at a time:
 * #orgs (default), #add, #people, #security (the audit and backups).
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

  if (!user.isSuper) return app.replaceChildren(head, h('div', { class: 'page-main' }, h('div', { class: 'page' }, yours)));

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

  const route = ['orgs', 'add', 'people', 'security'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'orgs';
  const active = orgs.filter((o) => o.status === 'active').length;
  const stat = (label, value, hint) => h('div', { class: 'stat' }, h('div', { class: 'stat-title' }, label), h('div', { class: 'stat-value' }, value), hint && h('div', { class: 'stat-desc' }, hint));
  const side = SideNav({ label: 'Platform admin', sections: [
    { title: 'Platform admin', items: [
      { label: 'Organisations', sub: `${orgs.length} on the platform`, icon: 'org', href: '#orgs', on: route === 'orgs' },
      { label: 'Add an organisation', icon: 'plus', href: '#add', on: route === 'add' },
      { label: 'People who can sign in', sub: `${users.length} people`, icon: 'person', href: '#people', on: route === 'people' },
      { label: 'Security audit', sub: 'Checks and backups', icon: 'lock', href: '#security', on: route === 'security' },
    ] },
    { title: 'Open an organisation', items: session.orgs.map((o) => ({ label: o.name, sub: o.url.replace(/^https?:\/\//, ''), lead: h('span', { class: 'logo-initials', style: 'width:20px;height:20px;font-size:9px' }, initials(o.name)), href: open(o) })) },
  ] });
  const sections = {};
  sections.orgs = () => h('div', {},
    h('div', { class: 'stats stats-border platform-stats' },
      stat('Organisations', orgs.length, `${active} active`),
      stat('People', users.length, `${users.filter((x) => x.is_super).length} platform admins`),
      stat('Members', orgs.reduce((n, o) => n + (o.members ?? 0), 0), 'across every organisation')),
    yours,
    allOrgs);
  sections.add = () => addOrg;
  sections.people = () => people;
  sections.security = () => Security();
  window.onhashchange = () => render();

  const addOrg = h('section', { class: 'card card-border bg-base-100 platform-card' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'Add an organisation'),
      h('form', { class: 'inline-form platform-form', onsubmit: (e) => {
        e.preventDefault();
        act(() => call('POST', '/api/admin/orgs', { name: f.name.value, slug: f.slug.value, plan: f.plan.value, adminEmail: f.adminEmail.value || null, adminName: f.adminName.value || null }));
      } },
        f.name, h('span', { class: 'slug-field' }, f.slug, h('span', { class: 'muted' }, `.${suffix}`)), f.plan, f.adminEmail, f.adminName,
        h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, icon('plus', 14), 'Add')),
      h('p', { class: 'muted small' }, 'Their admin can then sign in with that email (with Google, or a password you set below) and add their own staff.')));
  const allOrgs = h('section', {},
      h('h2', {}, 'Manage organisations'),
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
          } }, 'Delete'))))))));
  const people = h('section', {},
      h('h2', {}, 'People who can sign in'),
      h('p', { class: 'muted small' }, 'People join an organisation when its admin lists their email in its staff list. Here you can give someone a password (for those without Google) or add another platform admin.'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
        h('thead', {}, h('tr', {}, ['Name', 'Email', 'Organisations', 'Sign-in', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, users.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.name), x.is_super ? h('span', { class: 'badge badge-sm badge-primary', style: 'margin-left:6px' }, 'platform admin') : null),
          h('td', {}, x.email),
          h('td', {}, x.memberships.map((m) => `${m.name} (${m.role})`).join(', ') || '—'),
          h('td', {}, [...(x.providers ?? (x.google ? ['Google'] : [])), x.has_password && 'password'].filter(Boolean).join(', ') || 'not yet'),
          h('td', {}, h('button', { class: 'btn btn-xs', onclick: () => {
            const pw = prompt(`New password for ${x.email} (at least 10 characters). Share it with them safely.`);
            if (pw) act(() => call('POST', `/api/admin/users/${x.id}/password`, { password: pw }));
          } }, 'Set password'))))))),
      h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); act(() => call('POST', '/api/admin/users', { email: u.email.value, name: u.name.value, isSuper: true })); } },
        u.email, u.name, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Add a platform admin')));

  app.classList.add('frame');
  document.body.classList.add('app-page');
  const main = h('section', { class: 'page-main' }, h('div', { class: 'page' }, sections[route]()));
  app.replaceChildren(side, main);
  document.querySelector('.platform-head')?.remove();
  app.before(head);
}

/**
 * The security audit (server/audit.js) and database backups. The checks run
 * each time this opens; nothing they find (a password in a document, say)
 * is shown, only where it is.
 */
const STATUS = {
  fail: { label: 'Fix', cls: 'badge-error', icon: 'close' },
  warn: { label: 'Look at', cls: 'badge-warning', icon: 'eye' },
  pass: { label: 'OK', cls: 'badge-success', icon: 'check' },
  info: { label: 'Note', cls: 'badge-ghost', icon: 'help' },
};
function Security() {
  const body = h('div', { class: 'audit' }, h('p', { class: 'muted' }, 'Running the checks…'));
  const backups = h('div', {});
  const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
  const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  async function run() {
    const { checks, summary, at } = await call('GET', '/api/admin/audit');
    const groups = [...new Set(checks.map((c) => c.area))];
    body.replaceChildren(h('div', {},
      h('div', { class: 'stats stats-border platform-stats audit-summary' },
        [['fail', 'To fix'], ['warn', 'To look at'], ['pass', 'Passed']].map(([k, label]) => h('div', { class: `stat sum-${k}` },
          h('div', { class: 'stat-title' }, label), h('div', { class: 'stat-value' }, summary[k])))),
      h('p', { class: 'muted small' }, `Checked ${when(at)}. `, h('button', { class: 'btn btn-xs', onclick: run }, 'Run again')),
      groups.map((g) => h('section', { class: 'audit-group' },
        h('h3', {}, g),
        h('ul', { class: 'audit-list' }, checks.filter((c) => c.area === g).map((c) => {
          const st = STATUS[c.status];
          return h('li', { class: `audit-item audit-${c.status}` },
            h('span', { class: `badge badge-sm ${st.cls}` }, icon(st.icon, 12), st.label),
            h('div', {}, h('strong', {}, c.title), h('p', {}, c.detail), c.fix && h('p', { class: 'audit-fix' }, c.fix)));
        }))))));
  }
  async function loadBackups() {
    const list = await call('GET', '/api/admin/backups');
    backups.replaceChildren(list.length
      ? h('ul', { class: 'backup-list' }, list.slice(0, 7).map((b) => h('li', {}, h('span', {}, when(b.at)), h('span', { class: 'muted' }, size(b.size)))))
      : h('p', { class: 'empty' }, 'No snapshots yet.'));
  }
  const now = h('button', { class: 'btn btn-sm', onclick: async () => {
    now.disabled = true;
    try { await call('POST', '/api/admin/backups'); await Promise.all([loadBackups(), run()]); } catch (err) { alert(err.message); }
    now.disabled = false;
  } }, icon('download', 14), 'Back up now');
  run().catch((err) => body.replaceChildren(h('p', { class: 'empty' }, err.message)));
  loadBackups().catch(() => {});
  return h('div', {},
    h('h2', {}, 'Security audit'),
    h('p', { class: 'muted small' }, 'Checks on how the platform is set up and what it stores: settings, how passwords and sign-ins are kept, what visitors can see, and backups. The same checks run from the command line with npm run audit.'),
    body,
    h('section', { class: 'card card-border bg-base-100 platform-card backup-card' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'Database backups'),
      h('p', { class: 'muted small' }, 'A snapshot of the database is taken every day and kept for two weeks, in the data folder’s backups. Uploaded audio isn’t in it; the host’s disk snapshots cover that.'),
      backups, h('div', {}, now))));
}

async function reload() {
  session = await (await fetch('/api/session')).json();
  await render();
}
render();
