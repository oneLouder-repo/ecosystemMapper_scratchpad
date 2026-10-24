import { h, options } from '../ui/dom.js';
import { Shell } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg } from '../platform/docs.js';
import { ROLES, staffList, teamList, membersOf } from '../platform/org.js';

const store = new Store(loadOrg(), applyCollectionOp);
autosaveDoc('org', store);
const app = document.querySelector('#app');

function render() {
  const org = store.doc;
  Shell(document.querySelector('#shell'), { current: 'org', org });
  const sites = Object.values(org.sites);

  const teamChips = (s) =>
    teamList(org).map((t) =>
      h('label', { class: 'chip' },
        h('input', { type: 'checkbox', checked: s.teamIds.includes(t.id), onchange: (e) => {
          const teamIds = e.target.checked ? [...s.teamIds, t.id] : s.teamIds.filter((id) => id !== t.id);
          store.apply(col.update('staff', s.id, { teamIds }));
        } }),
        h('span', { class: 'swatch', style: `background:${t.color}` }), t.name));

  const newStaff = { name: h('input', { placeholder: 'Name', required: true }), title: h('input', { placeholder: 'Title' }) };
  const newTeam = h('input', { placeholder: 'Team name' });
  const newSite = { name: h('input', { placeholder: 'Site name' }), url: h('input', { placeholder: 'https://…', type: 'url' }) };

  app.replaceChildren(
    h('div', { class: 'page' },
      h('h1', {}, h('input', { class: 'title-input', value: org.name, 'aria-label': 'Organisation name',
        onchange: (e) => store.apply(col.set('name', e.target.value)) })),
      h('p', { class: 'lede' }, org.mission),
      h('div', { class: 'tiles' },
        tile(Object.keys(org.staff).length, 'Staff'),
        tile(Object.keys(org.teams).length, 'Teams'),
        tile(sites.filter((s) => s.visibility === 'public').length, 'Public sites'),
        tile(sites.filter((s) => s.visibility !== 'public').length, 'Private or unlisted'),
      ),

      h('h2', {}, 'Teams'),
      h('div', { class: 'cards' },
        teamList(org).map((t) =>
          h('div', { class: 'card' },
            h('h3', {}, h('span', { class: 'swatch-lg', style: `background:${t.color}` }), t.name),
            h('p', {}, membersOf(org, t.id).map((s) => s.name).join(', ') || 'No members yet'),
            h('div', { class: 'stat-line' }, `${membersOf(org, t.id).length} people`),
          ),
        ),
      ),
      h('form', { class: 'inline-form', onsubmit: (e) => {
        e.preventDefault();
        if (!newTeam.value.trim()) return;
        store.apply(col.add('teams', { name: newTeam.value.trim(), color: '#59607a' }));
      } }, newTeam, h('button', { type: 'submit' }, 'Add team')),

      h('h2', {}, 'Staff and roles'),
      h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['Name', 'Title', 'Role', 'Teams', ''].map((t) => h('th', {}, t)))),
        h('tbody', {},
          staffList(org).map((s) =>
            h('tr', {},
              h('td', {}, h('strong', {}, s.name)),
              h('td', {}, s.title),
              h('td', {}, h('select', { onchange: (e) => store.apply(col.update('staff', s.id, { roleId: e.target.value })) },
                options(ROLES.map((r) => ({ id: r.id, label: r.label })), s.roleId))),
              h('td', {}, teamChips(s)),
              h('td', {}, h('button', { class: 'secondary', title: 'Remove', onclick: () => confirm(`Remove ${s.name}?`) && store.apply(col.remove('staff', s.id)) }, 'Remove')),
            ),
          ),
        ),
      ),
      h('form', { class: 'inline-form', onsubmit: (e) => {
        e.preventDefault();
        if (!newStaff.name.value.trim()) return;
        store.apply(col.add('staff', { name: newStaff.name.value.trim(), title: newStaff.title.value.trim(), roleId: 'staff', teamIds: [] }));
      } }, newStaff.name, newStaff.title, h('button', { type: 'submit' }, 'Add person')),
      h('p', { class: 'note' }, ROLES.map((r) => `${r.label}: ${r.can}.`).join(' '), ' Roles take effect once accounts and the server arrive.'),

      h('h2', {}, 'Public sites and sharing'),
      h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['Site', 'Shows', 'Visibility', ''].map((t) => h('th', {}, t)))),
        h('tbody', {},
          sites.map((site) =>
            h('tr', {},
              h('td', {}, h('strong', {}, site.name), h('div', { class: 'muted' }, site.url), h('a', { href: `site.html?site=${site.id}`, target: '_blank' }, 'Open site ↗')),
              h('td', {}, h('input', { value: site.shows ?? '', placeholder: 'What this site shows', style: 'width:100%',
                onchange: (e) => store.apply(col.update('sites', site.id, { shows: e.target.value })) })),
              h('td', {},
                h('span', { class: `badge ${site.visibility}` }, site.visibility), ' ',
                h('select', { 'aria-label': 'Visibility', onchange: (e) => store.apply(col.update('sites', site.id, { visibility: e.target.value })) },
                  options([{ id: 'public', label: 'Public' }, { id: 'unlisted', label: 'Unlisted' }, { id: 'private', label: 'Private' }], site.visibility))),
              h('td', {}, h('button', { class: 'secondary', onclick: () => confirm(`Remove ${site.name}?`) && store.apply(col.remove('sites', site.id)) }, 'Remove')),
            ),
          ),
        ),
      ),
      h('form', { class: 'inline-form', onsubmit: (e) => {
        e.preventDefault();
        if (!newSite.name.value.trim()) return;
        store.apply(col.add('sites', { name: newSite.name.value.trim(), url: newSite.url.value.trim(), visibility: 'private', shows: '' }));
      } }, newSite.name, newSite.url, h('button', { type: 'submit' }, 'Add site')),
    ),
  );
}

function tile(num, label) {
  return h('div', { class: 'tile' }, h('div', { class: 'num' }, String(num)), h('div', { class: 'lbl' }, label));
}

store.addEventListener('change', render);
render();
