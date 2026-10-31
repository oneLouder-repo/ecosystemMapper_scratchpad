import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { readImage } from '../ui/images.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadAll } from '../platform/docs.js';
import { ROLES } from '../platform/org.js';
import { currentUser } from '../platform/session.js';
import { statusById, taskSummary, ancestors, NODE_TYPES } from '../platform/strategy.js';
import { mapsFor } from '../platform/maps.js';
import { short, today } from '../strategy/dates.js';

/**
 * My profile: the signed-in person's picture and details, the strategic
 * areas they follow, and everything that is theirs across the plugins:
 * tasks, workplans, dashboards, maps and shows.
 */
const docs = loadAll();
const store = new Store(docs.org, applyCollectionOp);
autosaveDoc('org', store, 150);
const app = document.querySelector('#app');
const now = today();

function render() {
  const org = store.doc;
  Shell(document.querySelector('#shell'), { current: 'me', org });
  const me = currentUser(org);
  if (!me) return app.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'empty' }, 'This org has no staff yet.')));
  const update = (patch) => store.apply(col.update('staff', me.id, patch));
  const nodes = Object.values(docs.strategy.nodes);
  const myTasks = nodes.filter((n) => n.type === 'task' && n.assigneeIds.includes(me.id)).sort((a, b) => (a.end ?? '').localeCompare(b.end ?? ''));
  const myWorkplans = nodes.filter((n) => n.type === 'workplan' && (n.staffIds.includes(me.id) || n.teamIds.some((t) => me.teamIds.includes(t))));
  const areas = nodes.filter((n) => n.type === 'objective' || n.type === 'goal');
  const myDashboards = Object.values(docs.dashboards.dashboards).filter((d) => d.createdBy === me.id);
  const myMaps = mapsFor(docs.maps, me.id);
  const myShows = Object.values(docs.podcasts.podcasts).filter((p) => p.hostIds.includes(me.id));
  const open = myTasks.filter((t) => t.status !== 'done');

  const section = (title, count, body) => h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, title), count != null && h('span', { class: 'badge badge-ghost' }, String(count))), body);
  const empty = (text) => h('p', { class: 'muted' }, text);

  app.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'profile-head' },
      h('label', { class: 'avatar-upload', title: 'Change your picture' },
        Avatar(me, 96),
        h('span', { class: 'avatar-edit' }, 'Change'),
        h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (e) => {
          try { update({ avatar: await readImage(e.target.files[0], 192) }); } catch (err) { alert(err.message); }
        } })),
      h('div', { class: 'profile-fields' },
        h('input', { class: 'title-input profile-name', name: 'name', value: me.name, 'aria-label': 'Your name', onchange: (e) => e.target.value.trim() && update({ name: e.target.value.trim() }) }),
        h('input', { class: 'title-input', name: 'title', value: me.title, placeholder: 'Your title', 'aria-label': 'Your title', onchange: (e) => update({ title: e.target.value.trim() }) }),
        h('input', { class: 'title-input muted', name: 'email', value: me.email, placeholder: 'Email', 'aria-label': 'Your email', type: 'email', onchange: (e) => update({ email: e.target.value.trim() }) }),
        h('div', { class: 'chips' },
          h('span', { class: 'badge badge-primary' }, ROLES.find((r) => r.id === me.roleId)?.label ?? me.roleId),
          me.teamIds.map((id) => org.teams[id] && h('span', { class: 'chip' }, h('span', { class: 'swatch', style: `background:${org.teams[id].color}` }), org.teams[id].name)),
          me.avatar && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => update({ avatar: null }) }, 'Remove picture'))),
      h('div', { class: 'profile-stats' },
        stat(open.length, 'open tasks'),
        stat(open.filter((t) => t.end && t.end < now).length, 'overdue'),
        stat(myDashboards.length, 'dashboards'),
        stat(myMaps.length, 'maps'))),

    h('div', { class: 'profile-grid' },
      section('My tasks', open.length, myTasks.length
        ? h('ul', { class: 'upcoming' }, myTasks.map((t) =>
            h('li', { class: t.status === 'done' ? 'done' : '' },
              h('span', { class: 'when' }, t.end ? (t.status !== 'done' && t.end < now ? `Overdue · ${short(t.end)}` : short(t.end)) : '—'),
              h('span', { class: 'dot', style: `background:${statusById[t.status].color}`, title: statusById[t.status].label }),
              h('a', { href: `strategy.html#${t.id}` }, t.title),
              h('span', { class: 'muted' }, docs.strategy.nodes[t.parentId]?.title ?? ''))))
        : empty('No tasks assigned to you.')),

      section('My strategic areas', me.interests.length, h('div', {},
        h('p', { class: 'muted' }, 'Follow the objectives and goals you care about. They show here with their progress.'),
        h('ul', { class: 'interest-list' }, areas.map((n) => {
          const s = taskSummary(docs.strategy, n.id);
          const on = me.interests.includes(n.id);
          return h('li', { class: on ? 'on' : '' },
            h('input', { type: 'checkbox', class: 'checkbox checkbox-sm checkbox-primary', checked: on, 'aria-label': `Follow ${n.title}`,
              onchange: (e) => update({ interests: e.target.checked ? [...me.interests, n.id] : me.interests.filter((id) => id !== n.id) }) }),
            h('span', { class: 'glyph' }, NODE_TYPES[n.type].glyph),
            h('a', { href: `strategy.html#${n.id}` }, n.title),
            on && h('span', { class: 'interest-progress' },
              h('progress', { class: 'progress progress-primary', value: s.done, max: s.total || 1, 'aria-label': `${s.done} of ${s.total} tasks done` }),
              h('small', {}, `${s.done}/${s.total} tasks done`)));
        })))),

      section('My workplans', myWorkplans.length, myWorkplans.length
        ? h('ul', { class: 'asset-list' }, myWorkplans.map((w) => {
            const s = taskSummary(docs.strategy, w.id);
            return h('li', { class: 'asset' }, icon('strategy', 18),
              h('div', { class: 'asset-text' }, h('a', { href: `strategy.html#${w.id}` }, w.title),
                h('small', {}, ancestors(docs.strategy, w.id).filter((a) => a.type === 'goal' || a.type === 'objective').map((a) => a.title).join(' › '))),
              h('span', { class: 'from' }, `${s.done}/${s.total} done`));
          }))
        : empty('You are not on any workplans yet.')),

      section('Dashboards I made', myDashboards.length, myDashboards.length
        ? h('ul', { class: 'asset-list' }, myDashboards.map((d) =>
            h('li', { class: 'asset' }, icon('chart', 18),
              h('div', { class: 'asset-text' }, h('a', { href: `palette.html#${d.id}` }, d.title), h('small', {}, `${d.widgets.length} widgets`)),
              h('span', { class: `badge ${d.visibility}` }, d.visibility))))
        : empty('Make one from an objective in Strategy & Work, or in the Data Workbench.')),

      section('My ecosystem maps', myMaps.length, myMaps.length
        ? h('ul', { class: 'asset-list' }, myMaps.map((m) =>
            h('li', { class: 'asset' }, icon('mapper', 18),
              h('div', { class: 'asset-text' }, h('a', { href: `mapper.html#${m.id}` }, m.title),
                h('small', {}, `${Object.keys(docs.mapContents[m.id]?.actors ?? {}).length} actors · ${m.memberIds.length + 1} people`)),
              h('span', { class: 'badge badge-ghost' }, m.ownerId === me.id ? 'Owner' : 'Member'))))
        : empty('You don’t own or belong to any maps yet.')),

      myShows.length > 0 && section('Shows I host', myShows.length,
        h('ul', { class: 'asset-list' }, myShows.map((p) =>
          h('li', { class: 'asset' }, icon('mic', 18), h('div', { class: 'asset-text' }, h('a', { href: `podcasts.html#${p.id}` }, p.title), h('small', {}, p.category)))))),
    ),
    h('p', { class: 'note' }, 'Accounts are mocked for now: use the menu under your picture (top right) to see the platform as anyone in the org.'),
  ));
}

const stat = (n, label) => h('div', { class: 'stat-box' }, h('strong', {}, String(n)), h('span', {}, label));

store.addEventListener('change', render);
render();
