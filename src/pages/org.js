import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar, Logo } from '../ui/Shell.js';
import { SideNav } from '../ui/SideNav.js';
import { readImage } from '../ui/images.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc, isHosted } from '../platform/storage.js';
import { loadOrg } from '../platform/docs.js';
import { ROLES, staffList, teamList, membersOf } from '../platform/org.js';
import { orgList, openOrg, createOrg, deleteOrg, renameOrg, platformUrl } from '../platform/session.js';
import { PALETTES, SHAPES, applyTheme } from '../platform/themes.js';
import { PLUGINS, pausedForOrg } from '../plugins.js';
import { LIMITS, FEATURES, PLAN_IDS, PLAN_PLUGINS, amount } from '../platform/plans.js';

const api = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body && JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
  return out;
};

/**
 * Organisation settings: the org's profile, people, public sites and their
 * theme, plugins, and the orgs on this platform. The sections are listed in
 * the shared sidebar and live in the URL hash.
 */
const store = new Store(loadOrg(), applyCollectionOp);
autosaveDoc('org', store, 150);
const app = document.querySelector('#app');
const TABS = [
  ['profile', 'Profile', 'org'],
  ['people', 'People and teams', 'person'],
  ['sites', 'Public sites and theme', 'globe'],
  ['plugins', 'Plugins', 'workbench'],
  ['plan', 'Plan', 'star'],
  ['domain', 'Domain', 'link'],
  ['platform', 'Organisations', 'settings'],
];
app.classList.add('frame');
const main = h('section', { class: 'page-main' });
const tab = () => (TABS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'profile');
const set = (key, value) => store.apply(col.set(key, value));

function render() {
  const org = store.doc;
  Shell(document.querySelector('#shell'), { current: 'org', org });
  const scroll = main.scrollTop;
  const focused = app.contains(document.activeElement) ? document.activeElement.name : null;
  const side = SideNav({ label: 'Organisation', sections: [
    { title: 'Organisation', items: TABS.map(([id, label, ic]) => ({ label, icon: ic, href: `#${id}`, on: tab() === id })) },
  ] });
  main.replaceChildren(
    h('div', { class: 'page' },
      h('div', { class: 'org-head' }, Logo(org, 56), h('div', {}, h('h1', {}, org.name), h('p', { class: 'lede' }, org.description || org.mission))),
      { profile: Profile, people: People, sites: Sites, plugins: Plugins, plan: Plan, domain: Domain, platform: Platform }[tab()](org)));
  app.replaceChildren(side, main);
  main.scrollTop = scroll;
  if (focused) app.querySelector(`[name="${focused}"]`)?.focus();
}

const field = (label, control, hint) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), control, hint && h('span', { class: 'label' }, hint));
const text = (name, value, onchange, attrs = {}) => h('input', { class: 'input input-sm', name, value: value ?? '', onchange: (e) => onchange(e.target.value.trim()), ...attrs });
const area = (name, value, onchange) => h('textarea', { class: 'textarea textarea-sm', name, rows: 3, onchange: (e) => onchange(e.target.value.trim()) }, value ?? '');

function imagePicker({ name, current, onPick, onClear, preview }) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'file-input file-input-sm', name, onchange: async (e) => {
    try { onPick(await readImage(e.target.files[0])); } catch (err) { alert(err.message); }
  } });
  return h('div', { class: 'image-picker' }, preview, h('div', {}, input, current && h('button', { class: 'btn btn-xs btn-ghost', onclick: onClear }, 'Remove')));
}

function Profile(org) {
  const contact = (k) => (v) => set('contact', { ...org.contact, [k]: v });
  return h('div', { class: 'settings-grid' },
    h('section', { class: 'panel' },
      h('h2', {}, 'About'),
      field('Name', text('name', org.name, (v) => { if (v) { set('name', v); renameOrg(org.id, v); } })),
      field('Description', area('description', org.description, (v) => set('description', v)), 'One or two sentences, shown on your public sites.'),
      field('Mission', area('mission', org.mission, (v) => set('mission', v)))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Contact details'),
      field('Email', text('email', org.contact.email, contact('email'), { type: 'email' })),
      field('Phone', text('phone', org.contact.phone, contact('phone'), { type: 'tel' })),
      field('Website', text('website', org.contact.website, contact('website'), { type: 'url' })),
      field('Address', area('address', org.contact.address, contact('address')))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Logo'),
      h('p', { class: 'muted' }, 'Shown on your public sites and in the header. A square image or SVG works best.'),
      imagePicker({ name: 'logo', current: org.logo, preview: Logo(org, 72), onPick: (url) => set('logo', url), onClear: () => set('logo', null) })));
}

function People(org) {
  const newStaff = {
    name: h('input', { class: 'input input-sm', placeholder: 'Name', required: true }),
    email: h('input', { class: 'input input-sm', type: 'email', placeholder: 'Email (to sign in)' }),
    title: h('input', { class: 'input input-sm', placeholder: 'Title' }),
  };
  const newTeam = h('input', { class: 'input input-sm', placeholder: 'Team name' });
  const teamChips = (s) => teamList(org).map((t) =>
    h('label', { class: 'chip' },
      h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: s.teamIds.includes(t.id), onchange: (e) =>
        store.apply(col.update('staff', s.id, { teamIds: e.target.checked ? [...s.teamIds, t.id] : s.teamIds.filter((id) => id !== t.id) })) }),
      h('span', { class: 'swatch', style: `background:${t.color}` }), t.name));
  return h('div', {},
    h('h2', {}, 'Staff and roles'),
    h('table', { class: 'table table-sm list' },
      h('thead', {}, h('tr', {}, ['', 'Name', 'Title', 'Role', 'Teams', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, staffList(org).map((s) =>
        h('tr', {},
          h('td', {}, Avatar(s, 30)),
          h('td', {}, h('strong', {}, s.name),
            h('input', { class: 'input input-xs input-ghost staff-email', type: 'email', value: s.email, placeholder: 'Email (to sign in)', 'aria-label': `Email for ${s.name}`,
              onchange: (e) => store.apply(col.update('staff', s.id, { email: e.target.value.trim().toLowerCase() })) })),
          h('td', {}, s.title),
          h('td', {}, h('select', { class: 'select select-sm', 'aria-label': `Role for ${s.name}`, onchange: (e) => store.apply(col.update('staff', s.id, { roleId: e.target.value })) },
            options(ROLES.map((r) => ({ id: r.id, label: r.label })), s.roleId))),
          h('td', {}, teamChips(s)),
          h('td', {}, h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: () => confirm(`Remove ${s.name}?`) && store.apply(col.remove('staff', s.id)) }, 'Remove')))))),
    h('form', { class: 'inline-form', onsubmit: (e) => {
      e.preventDefault();
      if (!newStaff.name.value.trim()) return;
      store.apply(col.add('staff', { name: newStaff.name.value.trim(), title: newStaff.title.value.trim(), roleId: 'staff', teamIds: [], interests: [], avatar: null, email: newStaff.email.value.trim().toLowerCase() }));
    } }, newStaff.name, newStaff.email, newStaff.title, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add person')),
    h('p', { class: 'note' }, ROLES.map((r) => `${r.label}: ${r.can}.`).join(' '), ' People change their own picture and details in My profile. ', isHosted() ? 'Each person signs in with the email here (with Google, or a password from the platform admin); their role decides what they can change.' : 'On the hosted platform, each person signs in with the email here.'),
    h('h2', {}, 'Teams'),
    h('div', { class: 'cards' }, teamList(org).map((t) =>
      h('div', { class: 'card' },
        h('h3', {}, h('span', { class: 'swatch-lg', style: `background:${t.color}` }), t.name),
        h('div', { class: 'avatar-row' }, membersOf(org, t.id).map((s) => h('span', { title: s.name }, Avatar(s, 28)))),
        h('div', { class: 'stat-line' }, `${membersOf(org, t.id).length} people`)))),
    h('form', { class: 'inline-form', onsubmit: (e) => {
      e.preventDefault();
      if (newTeam.value.trim()) store.apply(col.add('teams', { name: newTeam.value.trim(), color: '#59607a' }));
    } }, newTeam, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add team')));
}

function Sites(org) {
  const newSite = { name: h('input', { class: 'input input-sm', placeholder: 'Site name' }), url: h('input', { class: 'input input-sm', placeholder: 'https://…', type: 'url' }) };
  const theme = (patch) => set('theme', { ...org.theme, ...patch });
  const preview = h('div', { class: 'theme-preview' },
    h('div', { class: 'tp-head' }, Logo(org, 32), h('strong', {}, org.name), h('span', { class: 'spacer' }), h('a', { class: 'link' }, 'Impact'), h('a', { class: 'link' }, 'Contact')),
    h('div', { class: 'tp-body' },
      h('h3', {}, 'Reach and equity'),
      h('p', {}, org.description || org.mission),
      h('div', { class: 'tp-cards' },
        h('div', { class: 'card card-border' }, h('div', { class: 'card-body' }, h('div', { class: 'stat-title' }, 'Youth reached'), h('div', { class: 'stat-value' }, '459K'), h('progress', { class: 'progress progress-primary', value: 92, max: 100 }))),
        h('div', { class: 'card card-border' }, h('div', { class: 'card-body' }, h('div', { class: 'stat-title' }, 'Partners'), h('div', { class: 'stat-value' }, '103'), h('div', { class: 'badge badge-secondary' }, 'New this year')))),
      h('div', { class: 'tp-actions' }, h('button', { class: 'btn btn-primary btn-sm' }, '▶ Play the year'), h('button', { class: 'btn btn-outline btn-sm' }, 'Get in touch'))));
  applyTheme(preview, org.theme);

  return h('div', { class: 'settings-grid wide-first' },
    h('section', { class: 'panel' },
      h('h2', {}, 'Colour palette'),
      h('div', { class: 'palette-grid', role: 'radiogroup', 'aria-label': 'Colour palette' }, PALETTES.map((p) => {
        const sw = h('button', { class: `palette-option${org.theme.palette === p.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(org.theme.palette === p.id), onclick: () => theme({ palette: p.id }) },
          h('span', { class: 'swatches' }, ['primary', 'secondary', 'accent', 'neutral', 'base-200'].map((c) => h('span', { style: `background:var(--color-${c})` }))),
          h('span', {}, p.label));
        sw.querySelector('.swatches').setAttribute('data-theme', p.id);
        return sw;
      })),
      h('h2', { style: 'margin-top:18px' }, 'Look and feel'),
      h('div', { class: 'shape-grid', role: 'radiogroup', 'aria-label': 'Look and feel' }, SHAPES.map((s) =>
        h('button', { class: `shape-option${org.theme.shape === s.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(org.theme.shape === s.id), onclick: () => theme({ shape: s.id }),
          style: `--r:${s.vars['--radius-box']}` },
          h('span', { class: 'shape-sample' }), h('strong', {}, s.label), h('small', {}, s.blurb))))),
    h('section', { class: 'panel' }, h('h2', {}, 'Preview of your public sites'), preview,
      h('p', { class: 'muted' }, 'Public sites use this theme. Staff pages keep the toolbox theme so they stay familiar.')),
    h('section', { class: 'panel span-all' },
      h('h2', {}, 'Sites'),
      h('table', { class: 'table table-sm list' },
        h('thead', {}, h('tr', {}, ['Site', 'Shows', 'Visibility', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, Object.values(org.sites).map((site) =>
          h('tr', {},
            h('td', {}, h('strong', {}, site.name), h('div', { class: 'muted' }, site.url), h('a', { href: `site.html?site=${site.id}`, target: '_blank' }, 'Open site ↗')),
            h('td', {}, h('input', { class: 'input input-sm', name: `${site.id}-shows`, value: site.shows ?? '', placeholder: 'What this site shows', style: 'width:100%',
              onchange: (e) => store.apply(col.update('sites', site.id, { shows: e.target.value })) })),
            h('td', {}, h('select', { class: 'select select-sm', 'aria-label': 'Visibility', onchange: (e) => store.apply(col.update('sites', site.id, { visibility: e.target.value })) },
              options([{ id: 'public', label: 'Public' }, { id: 'unlisted', label: 'Unlisted' }, { id: 'private', label: 'Private' }], site.visibility))),
            h('td', {}, h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: () => confirm(`Remove ${site.name}?`) && store.apply(col.remove('sites', site.id)) }, 'Remove')))))),
      h('form', { class: 'inline-form', onsubmit: (e) => {
        e.preventDefault();
        if (newSite.name.value.trim()) store.apply(col.add('sites', { name: newSite.name.value.trim(), url: newSite.url.value.trim(), visibility: 'private', shows: '' }));
      } }, newSite.name, newSite.url, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add site'))));
}

function Plugins(org) {
  return h('div', {},
    h('p', { class: 'lede' }, 'Choose the plugins your org uses. Switching one off hides it from the dashboard and header; its data is kept.'),
    h('div', { class: 'cards' }, PLUGINS.map((p) =>
      h('div', { class: 'card' },
        h('h3', {}, icon(p.icon, 24), p.name, h('span', { class: 'spacer' }),
          p.core
            ? h('span', { class: 'badge badge-ghost' }, 'Always on')
            : pausedForOrg(org, p.id)
            ? h('span', { class: 'badge badge-warning badge-soft', title: 'Ask the platform admin to switch it on' }, 'Not in your plan')
            : h('input', { type: 'checkbox', class: 'toggle toggle-primary', 'aria-label': `Use ${p.name}`, checked: org.plugins[p.id] !== false,
                onchange: (e) => set('plugins', { ...org.plugins, [p.id]: e.target.checked }) })),
        h('p', {}, p.blurb)))));
}

/** The org's plan: what it includes, how much is used, and asking for another. */
function Plan(org) {
  if (!isHosted()) return h('p', { class: 'note' }, 'Plans apply on the hosted platform. This local copy has everything switched on.');
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  api('GET', '/api/plan').then(({ plan, usage, plans }) => {
    const bar = (l) => {
      const max = plan.limits[l.id];
      const used = usage[l.id] ?? 0;
      const share = max ? Math.min(1, used / max) : 0;
      return h('div', { class: 'usage-row' },
        h('span', {}, l.label),
        h('span', { class: 'usage-num' }, `${l.unit ? amount(used, l) : used} of ${max === 0 ? 'none' : amount(max, l)}`),
        max ? h('div', { class: `meter ${share >= 1 ? 'full' : share > 0.8 ? 'near' : ''}`, role: 'meter', 'aria-valuenow': String(used), 'aria-valuemax': String(max), 'aria-label': l.label }, h('div', { class: 'meter-fill', style: `width:${(share * 100).toFixed(1)}%` })) : h('span'));
    };
    const others = PLAN_IDS.filter((id) => id !== plan.id);
    const note = h('textarea', { class: 'textarea textarea-sm', rows: 2, placeholder: 'Anything we should know (optional)' });
    const choice = h('select', { class: 'select select-sm' }, others.map((id) => h('option', { value: id }, plans[id].label)));
    const sent = h('span', { class: 'muted small', role: 'status' });
    box.replaceChildren(
      h('div', { class: 'card card-border bg-base-100 plan-now' }, h('div', { class: 'card-body' },
        h('h2', { class: 'card-title' }, `${plan.label} plan`), h('p', { class: 'muted' }, plan.tagline),
        h('div', { class: 'usage' }, LIMITS.filter((l) => usage[l.id] != null || l.id === 'storageMb').map(bar)),
        h('p', { class: 'small' }, 'Plugins: ', PLAN_PLUGINS.filter((id) => plan.plugins[id]).map((id) => PLUGINS.find((p) => p.id === id)?.name).join(', '), '.'),
        h('ul', { class: 'plan-feats' }, FEATURES.map((f) => h('li', { class: plan.features[f.id] ? 'on' : 'off' }, icon(plan.features[f.id] ? 'check' : 'close', 14), f.label))))),
      org.platform && h('section', { class: 'plan-ask' },
        h('h2', {}, 'Change plan'),
        h('p', { class: 'muted small' }, 'Ask for another plan and the platform admin will set it up with you. ', h('a', { href: `${location.protocol}//${location.host.split('.').slice(1).join('.')}/pricing.html`, target: '_blank' }, 'Compare plans ↗')),
        h('div', { class: 'inline-form' }, choice, h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
          try { await api('POST', '/api/plan/request', { plan: choice.value, note: note.value }); sent.textContent = 'Sent. The platform admin will be in touch.'; } catch (err) { sent.textContent = err.message; }
        } }, 'Ask'), sent),
        note));
  }).catch((err) => box.replaceChildren(h('p', { class: 'empty' }, err.message)));
  return box;
}

/** The org's own domains (Custom plan): add one, see the DNS records to set, check them. */
function Domain(org) {
  if (!isHosted()) return h('p', { class: 'note' }, 'Your own domain works on the hosted platform.');
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const load = () => api('GET', '/api/domains').then(({ domains, allowed, target }) => {
    const input = h('input', { class: 'input input-sm', placeholder: 'www.yourorg.org', name: 'new-domain' });
    const msg = h('span', { class: 'small', role: 'status' });
    const STATUS = { pending: ['badge-warning', 'Waiting for DNS'], verified: ['badge-info', 'Yours; not pointing here yet'], active: ['badge-success', 'Working'] };
    box.replaceChildren(
      h('p', { class: 'muted' }, `Your Dashi address, ${location.host.replace(/:\d+$/, '')}, always works. `, allowed ? 'You can also use your own domain. You keep managing its DNS where it is; add the records below at your registrar (where you bought the domain), then press Check.' : 'Using your own domain comes with the Custom plan.'),
      h('div', {}, domains.map((d) => h('div', { class: 'card card-border bg-base-100 domain-card' }, h('div', { class: 'card-body' },
        h('div', { class: 'domain-head' }, h('strong', {}, d.host), h('span', { class: `badge badge-sm ${STATUS[d.status][0]}` }, STATUS[d.status][1]), d.primary && h('span', { class: 'badge badge-sm badge-ghost' }, 'Main address'),
          h('span', { class: 'spacer' }),
          d.status !== 'active' && h('button', { class: 'btn btn-xs btn-primary', onclick: async (e) => { e.target.disabled = true; await api('POST', `/api/domains/${d.host}/check`).catch((err) => alert(err.message)); load(); } }, 'Check now'),
          d.status === 'active' && !d.primary && h('button', { class: 'btn btn-xs', onclick: async () => { await api('POST', `/api/domains/${d.host}/primary`); load(); } }, 'Make main address'),
          h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: async () => { if (confirm(`Stop using ${d.host}? It stops working at once.`)) { await api('DELETE', `/api/domains/${d.host}`); load(); } } }, 'Remove')),
        d.records.length > 0 && h('table', { class: 'table table-sm dns-table' },
          h('thead', {}, h('tr', {}, ['Type', 'Name (host)', 'Value', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.records.map((r) => h('tr', {}, h('td', {}, h('code', {}, r.type)), h('td', {}, h('code', {}, r.name)), h('td', {}, h('code', { class: 'dns-value' }, r.value),
            h('button', { class: 'btn btn-xs btn-ghost', onclick: () => navigator.clipboard?.writeText(r.value) }, 'Copy')), h('td', { class: 'muted small' }, r.why))))),
        d.records.length > 0 && h('p', { class: 'muted small' }, 'Some registrars want only the first part of the name (', h('code', {}, '_dashi'), ' or ', h('code', {}, d.records.some((r) => r.type === 'CNAME') ? d.host.split('.')[0] : '@'), '). Changes can take an hour or two to show; Dashi checks again every hour for a week.'),
        d.note && h('p', { class: 'small' }, d.note))))),
      allowed && h('form', { class: 'inline-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/domains', { host: input.value }); load(); } catch (err) { msg.textContent = err.message; }
      } }, input, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add domain'), msg),
      allowed && h('details', { class: 'domain-help' }, h('summary', {}, 'www or the bare domain?'),
        h('p', { class: 'small' }, `Use www.yourorg.org if you can: it takes one CNAME record pointing at ${target}, which keeps working if Dashi’s servers move. A bare domain (yourorg.org) needs A records to Dashi’s addresses instead, unless your registrar offers ALIAS or ANAME records. Many registrars can forward the bare domain to www for you.`)));
  }).catch((err) => box.replaceChildren(h('p', { class: 'empty' }, err.message)));
  load();
  return box;
}

function Platform(org) {
  return h('div', {},
    h('p', { class: 'lede' }, 'This platform can hold many organisations, each with its own people, plugins and data. Open one to switch to it.'),
    h('table', { class: 'table list' },
      h('tbody', {}, orgList().map((o) =>
        h('tr', {},
          h('td', {}, h('strong', {}, o.name), o.id === org.id && h('span', { class: 'badge badge-primary badge-sm', style: 'margin-left:8px' }, 'Open now')),
          h('td', { class: 'right' },
            o.id !== org.id && h('button', { class: 'btn btn-sm', onclick: () => openOrg(o.id) }, 'Open'),
            ' ',
            !isHosted() && h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: () => {
              if (!confirm(`Delete ${o.name} and all its data? This can't be undone.`)) return;
              try { deleteOrg(o.id); location.assign('org.html#platform'); } catch (err) { alert(err.message); }
            } }, 'Delete')))))),
    isHosted()
      ? platformUrl() && h('p', {}, 'Organisations are added and removed on the ', h('a', { href: platformUrl() }, 'platform admin page'), '.')
      : h('div', { class: 'inline-form' },
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
            const name = prompt('Name of the new organisation');
            if (name?.trim()) { createOrg(name.trim()); location.assign('org.html'); }
          } }, icon('plus', 16), 'New organisation')));
}

store.addEventListener('change', render);
window.addEventListener('hashchange', render);
render();
