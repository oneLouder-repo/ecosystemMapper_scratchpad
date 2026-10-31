import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp } from '../core/collections.js';
import { autosaveDoc, saveDoc, onDocChange } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadStudio, loadMaps } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { migrateStrategy, strategyOps, rootOf } from '../platform/strategy.js';
import { currentUser } from '../platform/session.js';
import { mergeStudio, migrateStudio, plansOf, studioOps, ofPlan, QUADRANTS } from '../platform/studio.js';
import { short } from '../strategy/dates.js';
import { PlanHome } from './PlanHome.js';
import { SoarBoard } from './SoarBoard.js';
import { SoarList } from './SoarList.js';
import { Results } from './Results.js';
import { Assemble } from './Assemble.js';

/**
 * Planning Studio: facilitating a strategic plan, online and together.
 *
 *   #framework             the org's framework (mission, vision, values) and its plans
 *   #<planId>              a plan's home: context, team, what it serves
 *   #<planId>/soar         the shared SOAR whiteboard
 *   #<planId>/s|o|a        Strengths, Opportunities, Aspirations as lists, with assets
 *   #<planId>/results      the results framework, on a grid
 *   #<planId>/assemble     the canvas where ideas are wired into goals and objectives
 *
 * The framework and plans are Strategy & Work's (the strategy document);
 * the planning around them is the studio document (platform/studio.js).
 * Other people's saves merge in as they arrive, so a session can run live.
 */
export const TABS = [
  { id: 'home', label: 'Plan home', icon: 'home' },
  { id: 'soar', label: 'SOAR board', icon: 'workbench' },
  { id: 's', label: 'Strengths', icon: 'star' },
  { id: 'o', label: 'Opportunities', icon: 'globe' },
  { id: 'a', label: 'Aspirations', icon: 'eye' },
  { id: 'results', label: 'Results', icon: 'chart' },
  { id: 'assemble', label: 'Assemble', icon: 'connect' },
];

const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'studio', org });
const store = new Store(loadStudio(), applyCollectionOp);
const strategy = new Store(loadStrategy(), applyCollectionOp);
autosaveDoc('strategy', strategy);

// Save our changes; merge other people's as they arrive, saving back only if we had something they didn't.
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDoc('studio', store.doc), 200); };
store.addEventListener('change', (e) => { if (e.op?.op !== 'remote') save(); });
onDocChange('studio', (theirs) => {
  theirs = migrateStudio(theirs);
  const merged = mergeStudio(store.doc, theirs);
  const ahead = JSON.stringify(merged) !== JSON.stringify(mergeStudio(theirs, theirs));
  store.map = merged;
  store.dispatchEvent({ type: 'change', op: { op: 'remote' } });
  if (ahead) save();
  live.flash();
});
onDocChange('strategy', (doc) => strategy.load(migrateStrategy(doc)));

const app = document.querySelector('#app');
app.classList.add('frame', 'studio-app');
let side = h('nav');
const main = h('section', { class: 'studio-main' });
app.replaceChildren(side, main);

const live = (() => {
  const el = h('span', { class: 'live-chip', title: 'Changes other people make show up here as they save' }, h('span', { class: 'live-dot-mini' }), 'Live');
  return { el, flash: () => { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } };
})();

const ctx = {
  org,
  store,
  strategy,
  me: currentUser(org),
  get doc() { return store.doc; },
  get route() {
    const [planId, tab = 'home'] = decodeURIComponent(location.hash.slice(1)).split('/');
    const plans = plansOf(strategy.doc);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return { planId: null, tab: 'framework' };
    return { planId, tab: TABS.some((t) => t.id === tab) ? tab : 'home' };
  },
  go(route) { if (location.hash !== `#${route}`) location.hash = route; else render(); },
  add: (collection, data) => store.apply(studioOps.add(collection, data)),
  put: (collection, id, patch) => store.apply(studioOps.update(collection, id, patch)),
  remove: (collection, ids) => store.apply(studioOps.remove(store.doc, collection, ids)),
  /** Documents the asset chooser and asset chips read. */
  get docs() {
    docsCache.strategy = strategy.doc;
    return docsCache;
  },
  // A drag in progress holds redraws until it ends, so the dragged thing doesn't vanish under the pointer.
  dragging: false,
  pending: false,
  render: () => render(),
  live,
};
const docsCache = (() => { const maps = loadMaps(); return { org, maps, mapContents: loadAllMaps(maps), strategy: strategy.doc }; })();

/** The studio's record for a plan, made the first time someone opens it. */
ctx.planRecord = (planId) => store.doc.plans[planId] ?? { id: planId, team: [], notes: '' };
ctx.savePlan = (planId, patch) => (store.doc.plans[planId] ? ctx.put('plans', planId, patch) : store.apply(studioOps.add('plans', { id: planId, team: [], notes: '', ...patch })));

function drawSide({ planId, tab }) {
  const plans = plansOf(strategy.doc);
  const count = (id, c) => ofPlan(store.doc, c, id).length;
  side = swapSide(side, SideNav({ label: 'Planning Studio', sections: [
    { title: 'Planning Studio', items: [{ label: 'Framework and plans', sub: 'Mission, vision, values', icon: 'strategy', href: '#framework', on: tab === 'framework' }] },
    { title: 'Plans', action: { label: 'New plan', onclick: newPlan }, items: plans.map((p) => ({
      label: p.title, sub: count(p.id, 'cards') ? `${count(p.id, 'cards')} SOAR cards` : [p.start, p.end].filter(Boolean).map(short).join(' – '),
      icon: 'doc', href: `#${p.id}`, on: p.id === planId && tab === 'home', className: p.depth ? 'side-indent' : null,
    })) },
    planId && { title: 'This plan', items: TABS.filter((t) => t.id !== 'home').map((t) => ({
      label: t.label, icon: t.icon, href: `#${planId}/${t.id}`, on: t.id === tab,
      badge: ['s', 'o', 'a'].includes(t.id) ? String(ofPlan(store.doc, 'cards', planId).filter((c) => c.quadrant === t.id).length) : null,
    })) },
  ] }));
}

function newPlan() {
  const title = prompt('Name of the new strategic plan', 'Strategic plan');
  if (!title?.trim()) return;
  const root = rootOf(strategy.doc);
  const op = strategy.apply(strategyOps.addNode(strategy.doc, { type: 'plan', parentId: root.id, title: title.trim() }));
  ctx.savePlan(op.id, { team: ctx.me ? [{ staffId: ctx.me.id, role: 'facilitator' }] : [] });
  ctx.go(`${op.id}/soar`);
}

function Framework() {
  const root = rootOf(strategy.doc);
  const plans = plansOf(strategy.doc);
  const setRoot = (k) => (e) => strategy.apply(strategyOps.update(root.id, { [k]: e.target.value }));
  const area = (k, label, rows = 2) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label),
    h('textarea', { class: 'textarea textarea-sm', name: `fw-${k}`, rows, onchange: setRoot(k) }, root?.[k] ?? ''));
  return h('div', { class: 'studio-page-body' },
    PluginHeader('studio', { actions: h('button', { class: 'btn btn-sm btn-primary', onclick: newPlan }, icon('plus', 14), 'New plan') }),
    !root ? h('p', { class: 'empty' }, 'Start a framework in Strategy & Work first.') : [
      h('section', { class: 'card card-border bg-base-100 framework-card' }, h('div', { class: 'card-body' },
        h('h2', { class: 'card-title' }, icon('strategy', 18), 'The strategic framework'),
        h('p', { class: 'muted' }, 'One framework for the organisation. Every plan in the Studio works toward it. These are the same fields as in Strategy & Work.'),
        h('div', { class: 'framework-fields' }, area('mission', 'Mission'), area('vision', 'Vision'), area('values', 'Values', 1)))),
      h('h2', { class: 'studio-h2' }, 'Plans'),
      h('div', { class: 'cards plan-cards' }, plans.map((p) => {
        const rec = store.doc.plans[p.id];
        const cards = ofPlan(store.doc, 'cards', p.id);
        return h('a', { class: 'card card-border bg-base-100 plan-card', href: `#${p.id}`, style: p.depth ? 'margin-left:24px' : null },
          h('div', { class: 'card-body' },
            h('h3', { class: 'card-title' }, icon('doc', 18), p.title),
            h('p', { class: 'muted' }, [p.start, p.end].filter(Boolean).map(short).join(' – ') || 'No dates yet'),
            h('div', { class: 'soar-mini' }, QUADRANTS.map((q) => h('span', { style: `--q:${q.color}` }, h('strong', {}, cards.filter((c) => c.quadrant === q.id).length), q.label))),
            h('div', { class: 'avatar-row' }, (rec?.team ?? []).map((t) => org.staff[t.staffId] && Avatar(org.staff[t.staffId], 24)))));
      })),
    ]);
}

const VIEWS = { home: PlanHome, soar: SoarBoard, s: SoarList, o: SoarList, a: SoarList, results: Results, assemble: Assemble };

function render() {
  if (ctx.dragging) { ctx.pending = true; return; }
  const route = ctx.route;
  drawSide(route);
  const scroll = main.scrollTop;
  const focused = main.contains(document.activeElement) ? document.activeElement.name : null;
  const sel = focused && document.activeElement.selectionStart;
  if (route.tab === 'framework') main.replaceChildren(Framework());
  else {
    const plan = strategy.doc.nodes[route.planId];
    main.replaceChildren(h('div', { class: `studio-page-body tab-${route.tab}` },
      h('header', { class: 'studio-plan-head' },
        h('div', { class: 'studio-plan-title' },
          h('span', { class: 'plugin-header-icon', 'aria-hidden': 'true' }, icon('studio', 22)),
          h('div', {}, h('small', { class: 'muted' }, 'Planning Studio · strategic plan'), h('h1', {}, plan.title)),
          h('span', { class: 'spacer' }),
          live.el,
          h('div', { class: 'avatar-row' }, ctx.planRecord(plan.id).team.map((t) => org.staff[t.staffId] && Avatar(org.staff[t.staffId], 26)))),
        h('div', { role: 'tablist', class: 'tabs tabs-border studio-tabs' }, TABS.map((t) =>
          h('a', { role: 'tab', class: `tab${t.id === route.tab ? ' tab-active' : ''}`, href: `#${plan.id}${t.id === 'home' ? '' : `/${t.id}`}`, 'aria-selected': String(t.id === route.tab) }, icon(t.icon, 15), t.label)))),
      VIEWS[route.tab](ctx, plan, route.tab)));
  }
  main.scrollTop = scroll;
  if (focused) {
    const el = main.querySelector(`[name="${focused}"]`);
    el?.focus();
    if (el && sel != null && 'setSelectionRange' in el) try { el.setSelectionRange(sel, sel); } catch { /* not a text field */ }
  }
}
ctx.endDrag = () => { ctx.dragging = false; if (ctx.pending) { ctx.pending = false; render(); } };

store.addEventListener('change', render);
strategy.addEventListener('change', render);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    try { e.shiftKey ? store.redo() : store.undo(); } catch { /* someone else removed what that undo touches */ }
  }
});
if (!location.hash) {
  const first = plansOf(strategy.doc).find((p) => store.doc.plans[p.id]);
  if (first) history.replaceState(null, '', `#${first.id}/soar`);
}
render();
window.studio = ctx;
