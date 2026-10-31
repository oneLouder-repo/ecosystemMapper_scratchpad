import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../platform/org.js';
import { PLUGINS } from '../plugins.js';
import { Wordmark } from '../ui/Wordmark.js';
import { SideNav } from '../ui/SideNav.js';
import { salesPage } from './sales.js';
import { PLAN_IDS, PLAN_PLUGINS, LIMITS, FEATURES, amount } from '../platform/plans.js';

/**
 * The platform's own site (the root domain): the organisations you can
 * open and, for the platform admin, the console to add organisations,
 * set their plan, suspend or remove them, and manage people's sign-in.
 * The console uses the same sidebar as the plugins, one section at a time:
 * #orgs (default), #add, #people, #plans, #requests, #site (the sales site's words), #security (the audit and backups).
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

  // Not signed in: Dashi's own public site (sales.js).
  if (!user) return salesPage(app, 'home');

  const yours = h('section', {},
    h('h2', {}, user.isSuper ? 'All organisations' : 'Your organisations'),
    session.orgs.length
      ? h('div', { class: 'cards' }, session.orgs.map((o) => h('a', { class: 'card org-card', href: open(o) },
          h('span', { class: 'logo-initials', style: 'width:40px;height:40px;font-size:15px' }, initials(o.name)),
          h('strong', {}, o.name), h('small', { class: 'muted' }, o.url.replace(/^https?:\/\//, '')),
          o.status !== 'active' && h('span', { class: 'badge badge-warning badge-sm' }, o.status))))
      : h('p', { class: 'empty' }, 'You aren’t in any organisation yet. Ask its admin to add your email to the staff list.'));

  if (!user.isSuper) return app.replaceChildren(head, h('div', { class: 'page-main' }, h('div', { class: 'page' }, yours)));

  const [orgs, users, requests] = await Promise.all([call('GET', '/api/admin/orgs'), call('GET', '/api/admin/users'), call('GET', '/api/admin/requests')]);
  const openRequests = requests.filter((r) => r.status === 'open').length;
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
    const inPlan = o.included?.[p.id] !== false;
    const on = inPlan && !o.paused[p.id] && o.chosen[p.id] !== false;
    return h('label', { class: 'feature-toggle', title: !inPlan ? `Not in the ${o.plan} plan. Change the plan, or give it under Own limits.` : on ? `${p.name} is on for ${o.name}` : o.paused[p.id] ? `Paused by you` : `Switched off by ${o.name}` },
      h('input', { type: 'checkbox', class: 'toggle toggle-xs toggle-primary', checked: on, disabled: !inPlan,
        onchange: (e) => act(() => call('POST', `/api/admin/orgs/${o.id}/plugins`, { plugin: p.id, on: e.target.checked })) }),
      icon(p.icon, 14), p.name);
  }));
  const act = async (fn) => { try { await fn(); await reload(); } catch (err) { alert(err.message); } };

  const route = ['orgs', 'add', 'people', 'plans', 'requests', 'site', 'security'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'orgs';
  const active = orgs.filter((o) => o.status === 'active').length;
  const stat = (label, value, hint) => h('div', { class: 'stat' }, h('div', { class: 'stat-title' }, label), h('div', { class: 'stat-value' }, value), hint && h('div', { class: 'stat-desc' }, hint));
  const side = SideNav({ label: 'Platform admin', sections: [
    { title: 'Platform admin', items: [
      { label: 'Organisations', sub: `${orgs.length} on the platform`, icon: 'org', href: '#orgs', on: route === 'orgs' },
      { label: 'Add an organisation', icon: 'plus', href: '#add', on: route === 'add' },
      { label: 'People who can sign in', sub: `${users.length} people`, icon: 'person', href: '#people', on: route === 'people' },
      { label: 'Plans', sub: 'What each tier includes', icon: 'star', href: '#plans', on: route === 'plans' },
      { label: 'Requests', sub: 'Sign-ups, plan changes, messages', icon: 'news', href: '#requests', on: route === 'requests', badge: openRequests ? String(openRequests) : null, badgeClass: 'badge-primary' },
      { label: 'Sales site', sub: 'The words on Dashi’s own site', icon: 'globe', href: '#site', on: route === 'site' },
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
  sections.plans = () => Plans();
  sections.requests = () => Requests(requests, act);
  sections.site = () => SalesSite();
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
        h('thead', {}, h('tr', {}, ['Name', 'Address', 'Plan', 'Plugins', 'Use', 'Status', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, orgs.map((o) => h('tr', {},
          h('td', {}, h('strong', {}, o.name)),
          h('td', {}, h('a', { href: open(o) }, o.url.replace(/^https?:\/\//, '')),
            (o.domains ?? []).filter((d) => d.status !== 'active').map((d) => h('div', { class: 'small muted' }, `${d.host} (${d.status}) `,
              h('button', { class: 'btn btn-xs btn-ghost', title: 'Switch this domain on without the DNS check', onclick: () => act(() => call('POST', `/api/admin/domains/${d.host}/activate`)) }, 'Switch on')))),
          h('td', {}, h('select', { class: 'select select-xs', 'aria-label': `Plan for ${o.name}`, onchange: (e) => act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { plan: e.target.value })) }, options(PLANS, o.plan))),
          h('td', {}, pluginToggles(o)),
          h('td', { class: 'small' }, `${o.members} people`, h('br'), `${o.usage?.storageMb ?? 0} MB`,
            h('details', { class: 'limits-edit' }, h('summary', { class: 'link-button' }, Object.keys(o.limits?.limits ?? {}).length ? 'Own limits ✓' : 'Own limits'), LimitsEditor(o, act))),
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

/* ---------------------------------------------------------------- plans */
const PLAN_LABEL = (id) => id[0].toUpperCase() + id.slice(1);

/** What each tier includes: plugins, limits and features, for every org on it. */
function Plans() {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  let plans;
  let overrides;
  const status = h('span', { class: 'muted small', role: 'status' });
  const save = async () => {
    try {
      // Only what differs from Dashi's defaults is stored, so later defaults still apply.
      await call('PUT', '/api/admin/plans', overrides);
      status.textContent = 'Saved. Every organisation on these plans has the change now.';
    } catch (err) { status.textContent = err.message; }
  };
  const setPart = (id, part, key, value) => {
    overrides[id] ??= {};
    overrides[id][part] = { ...(overrides[id][part] ?? {}), [key]: value };
    plans[id][part][key] = value;
  };
  const limitInput = (id, l) => h('input', { class: 'input input-xs plan-num', type: 'number', min: 0, value: plans[id].limits[l.id] ?? '', placeholder: 'No limit', 'aria-label': `${l.label} on ${plans[id].label}`,
    onchange: (e) => setPart(id, 'limits', l.id, e.target.value === '' ? null : Number(e.target.value)) });
  const check = (id, part, key, label) => h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !!plans[id][part][key], 'aria-label': `${label} on ${plans[id].label}`,
    onchange: (e) => setPart(id, part, key, e.target.checked) });
  call('GET', '/api/admin/plans').then((r) => {
    ({ plans, overrides } = r);
    box.replaceChildren(
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm plans-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), PLAN_IDS.map((id) => h('th', {}, plans[id].label)))),
        h('tbody', {},
          h('tr', {}, h('th', {}, 'Price a month ($)'), PLAN_IDS.map((id) => h('td', {}, h('input', { class: 'input input-xs plan-num', type: 'number', min: 0, value: plans[id].price.monthly ?? '', placeholder: 'Ask',
            onchange: (e) => setPart(id, 'price', 'monthly', e.target.value === '' ? null : Number(e.target.value)) })))),
          h('tr', {}, h('th', {}, 'Tagline'), PLAN_IDS.map((id) => h('td', {}, h('textarea', { class: 'textarea textarea-xs', rows: 3, onchange: (e) => { overrides[id] = { ...(overrides[id] ?? {}), tagline: e.target.value }; } }, plans[id].tagline)))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Plugins')),
          PLAN_PLUGINS.map((pid) => h('tr', {}, h('th', {}, PLUGINS.find((p) => p.id === pid)?.name ?? pid), PLAN_IDS.map((id) => h('td', {}, check(id, 'plugins', pid, pid))))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Limits (empty: no limit)')),
          LIMITS.map((l) => h('tr', {}, h('th', {}, l.label, l.unit ? h('small', { class: 'muted' }, ` ${l.unit}`) : null), PLAN_IDS.map((id) => h('td', {}, limitInput(id, l))))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Features')),
          FEATURES.map((f) => h('tr', {}, h('th', {}, f.label), PLAN_IDS.map((id) => h('td', {}, check(id, 'features', f.id, f.label)))))))),
      h('div', { class: 'inline-form' }, h('button', { class: 'btn btn-sm btn-primary', onclick: save }, 'Save plans'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (confirm('Go back to Dashi’s default plans?')) { overrides = {}; await save(); location.reload(); } } }, 'Back to the defaults'), status));
  }).catch((err) => box.replaceChildren(h('p', { class: 'empty' }, err.message)));
  return h('div', {},
    h('h2', {}, 'Plans'),
    h('p', { class: 'muted small' }, 'What each tier includes. A change applies at once to every organisation on that plan, and the pricing page shows it. Organisations already over a new limit keep what they have; they just can’t add more.'),
    box);
}

/** A Custom (or any) org's own limits, over its tier's. */
function LimitsEditor(o, act) {
  const own = structuredClone(o.limits ?? {});
  own.limits ??= {};
  own.features ??= {};
  own.plugins ??= {};
  const row = (l) => h('label', { class: 'limit-row' }, h('span', {}, l.label), h('input', { class: 'input input-xs plan-num', type: 'number', min: 0, value: own.limits[l.id] ?? '', placeholder: 'plan’s',
    onchange: (e) => { if (e.target.value === '') delete own.limits[l.id]; else own.limits[l.id] = Number(e.target.value); } }));
  const feat = (f, part, label) => h('label', { class: 'limit-row' }, h('span', {}, label), h('select', { class: 'select select-xs', onchange: (e) => { if (e.target.value === '') delete own[part][f]; else own[part][f] = e.target.value === 'on'; } },
    options([{ id: '', label: 'Plan’s' }, { id: 'on', label: 'On' }, { id: 'off', label: 'Off' }], own[part][f] == null ? '' : own[part][f] ? 'on' : 'off')));
  return h('div', { class: 'limits-panel' },
    h('p', { class: 'muted small' }, `Limits for ${o.name} alone, over the ${PLAN_LABEL(o.plan)} plan’s. Leave a field empty to use the plan’s.`),
    LIMITS.map(row),
    FEATURES.map((f) => feat(f.id, 'features', f.label)),
    PLAN_PLUGINS.map((pid) => feat(pid, 'plugins', PLUGINS.find((p) => p.id === pid)?.name ?? pid)),
    h('button', { class: 'btn btn-xs btn-primary', onclick: () => act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { limits: own })) }, 'Save'));
}

/* ------------------------------------------------------------- requests */
function Requests(requests, act) {
  const KIND = { signup: 'Sign-up', upgrade: 'Plan change', contact: 'Message' };
  const shown = requests.filter((r) => r.status === 'open');
  const done = requests.filter((r) => r.status !== 'open');
  const card = (r) => h('li', { class: `request ${r.status}` },
    h('div', { class: 'request-head' },
      h('span', { class: 'badge badge-sm badge-soft' }, KIND[r.kind] ?? r.kind),
      h('strong', {}, r.org_name ?? r.data.org ?? r.name ?? r.email),
      h('span', { class: 'muted small' }, new Date(r.created_at).toLocaleString()),
      h('span', { class: 'spacer' }),
      r.status === 'open'
        ? [r.org_id && r.data.plan && r.data.plan !== r.org_plan && h('button', { class: 'btn btn-xs btn-primary', onclick: () => act(async () => { await call('PATCH', `/api/admin/orgs/${r.org_id}`, { plan: r.data.plan }); await call('PATCH', `/api/admin/requests/${r.id}`, { status: 'done' }); }) }, `Move to ${PLAN_LABEL(r.data.plan)}`),
           h('button', { class: 'btn btn-xs', onclick: () => act(() => call('PATCH', `/api/admin/requests/${r.id}`, { status: 'done' })) }, 'Done'),
           h('button', { class: 'btn btn-xs btn-ghost', onclick: () => act(() => call('PATCH', `/api/admin/requests/${r.id}`, { status: 'declined' })) }, 'Decline')]
        : h('span', { class: 'muted small' }, r.status)),
    h('p', { class: 'small' }, [r.name, r.email].filter(Boolean).join(' · '),
      r.kind === 'signup' ? ` signed up${r.data.plan && r.data.plan !== 'free' ? ` and would like ${PLAN_LABEL(r.data.plan)}` : ''}.` : '',
      r.kind === 'upgrade' ? ` asks to move from ${PLAN_LABEL(r.data.from ?? r.org_plan)} to ${PLAN_LABEL(r.data.plan)}.` : '',
      r.kind === 'contact' && r.data.plan ? ` (about ${PLAN_LABEL(r.data.plan)})` : ''),
    (r.data.message || r.data.note) && h('blockquote', {}, r.data.message || r.data.note));
  return h('div', {},
    h('h2', {}, 'Requests'),
    h('p', { class: 'muted small' }, 'Sign-ups from the public site, plan changes organisations ask for, and messages from the contact page. New organisations start on Free; moving one to a paid plan is your call, once payment is arranged.'),
    shown.length ? h('ul', { class: 'requests' }, shown.map(card)) : h('p', { class: 'empty' }, 'Nothing waiting.'),
    done.length > 0 && h('details', {}, h('summary', {}, `${done.length} dealt with`), h('ul', { class: 'requests' }, done.map(card))));
}

/* ----------------------------------------------------------- sales site */
function SalesSite() {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const status = h('span', { class: 'muted small', role: 'status' });
  fetch('/api/platform').then((r) => r.json()).then(({ site }) => {
    const text = (obj, key, label, rows = 1) => h('label', { class: 'field' }, h('span', {}, label),
      h(rows > 1 ? 'textarea' : 'input', { class: rows > 1 ? 'textarea textarea-sm' : 'input input-sm', rows, value: rows > 1 ? undefined : obj[key], onchange: (e) => { obj[key] = e.target.value; } }, rows > 1 ? obj[key] : undefined));
    const list = (items, fields, label) => h('fieldset', { class: 'site-list' }, h('legend', {}, label),
      items.map((it) => h('div', { class: 'site-item' }, fields.map(([k, l, rows]) => text(it, k, l, rows)))));
    box.replaceChildren(
      h('section', { class: 'site-edit' }, h('h3', {}, 'Home page'),
        text(site.hero, 'eyebrow', 'Above the title'), text(site.hero, 'title', 'Title'), text(site.hero, 'text', 'Introduction', 3), text(site.hero, 'cta', 'Button'),
        list(site.points, [['title', 'Title'], ['text', 'Text', 2]], 'What Dashi does'),
        list(site.trust, [['title', 'Title'], ['text', 'Text', 2]], 'Why trust it')),
      h('section', { class: 'site-edit' }, h('h3', {}, 'Plans and pricing'), text(site, 'pricingNote', 'Note under the title', 2), h('p', { class: 'muted small' }, 'Prices, taglines and what each plan includes are under Plans.')),
      h('section', { class: 'site-edit' }, h('h3', {}, 'About'),
        text(site.about, 'title', 'Title'), text(site.about, 'intro', 'Introduction', 4),
        list(site.about.sections, [['title', 'Heading'], ['text', 'Text', 4]], 'Sections'),
        list(site.about.faq, [['q', 'Question'], ['a', 'Answer', 2]], 'Questions')),
      h('section', { class: 'site-edit' }, h('h3', {}, 'Contact'), text(site.contact, 'email', 'Email'), text(site.contact, 'note', 'Note')),
      h('div', { class: 'inline-form sticky-save' },
        h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { await call('PUT', '/api/admin/site', site); status.textContent = 'Saved. The public site shows it now.'; } catch (err) { status.textContent = err.message; } } }, 'Save'),
        h('a', { class: 'btn btn-sm', href: '/pricing.html', target: '_blank' }, 'View the site ↗'), status));
  });
  return h('div', {}, h('h2', {}, 'Sales site'), h('p', { class: 'muted small' }, 'The words on Dashi’s own public site: the home page visitors see at this address, Plans and pricing, About, and Contact.'), box);
}

async function reload() {
  session = await (await fetch('/api/session')).json();
  await render();
}
render();
