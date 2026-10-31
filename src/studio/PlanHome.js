import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Avatar } from '../ui/Shell.js';
import { strategyOps, rootOf } from '../platform/strategy.js';
import { staffList } from '../platform/org.js';
import { CONTEXT_KINDS, TEAM_ROLES, QUADRANTS, ofPlan } from '../platform/studio.js';

/**
 * A plan's home: what it serves (the framework's mission and vision), its
 * dates, the operating context it works in, and the team planning it.
 */
export function PlanHome(ctx, plan) {
  const root = rootOf(ctx.strategy.doc);
  const rec = ctx.planRecord(plan.id);
  const setPlan = (patch) => ctx.strategy.apply(strategyOps.update(plan.id, patch));
  const context = ofPlan(ctx.doc, 'context', plan.id);
  const cards = ofPlan(ctx.doc, 'cards', plan.id);
  const field = (label, control) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), control);
  const kindSel = h('select', { class: 'select select-sm', name: 'cx-kind', 'aria-label': 'Kind of factor' }, options(CONTEXT_KINDS, 'social'));
  const cxText = h('input', { class: 'input input-sm', name: 'cx-text', placeholder: 'e.g. Federal funding is up for renewal next year', 'aria-label': 'Context factor' });
  const addContext = (e) => {
    e.preventDefault();
    if (!cxText.value.trim()) return;
    ctx.add('context', { planId: plan.id, kind: kindSel.value, text: cxText.value.trim() });
  };
  const inTeam = new Set(rec.team.map((t) => t.staffId));
  const setTeam = (team) => ctx.savePlan(plan.id, { team });

  return h('div', { class: 'plan-home' },
    h('section', { class: 'card card-border bg-base-100' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'The plan'),
      h('div', { class: 'plan-fields' },
        field('Title', h('input', { class: 'input input-sm', name: 'plan-title', value: plan.title, onchange: (e) => setPlan({ title: e.target.value.trim() || plan.title }) })),
        field('Starts', h('input', { class: 'input input-sm', type: 'date', name: 'plan-start', value: plan.start ?? '', onchange: (e) => setPlan({ start: e.target.value || null }) })),
        field('Ends', h('input', { class: 'input input-sm', type: 'date', name: 'plan-end', value: plan.end ?? '', onchange: (e) => setPlan({ end: e.target.value || null }) }))),
      root && h('div', { class: 'serves' },
        h('span', { class: 'fieldset-legend' }, 'Works toward'),
        root.mission && h('blockquote', {}, h('strong', {}, 'Mission. '), root.mission),
        root.vision && h('blockquote', {}, h('strong', {}, 'Vision. '), root.vision),
        h('a', { class: 'link small', href: '#framework' }, 'Edit the framework')),
      h('div', { class: 'soar-mini big' }, QUADRANTS.map((q) => h('a', { href: `#${plan.id}/${q.id === 'r' ? 'results' : q.id}`, style: `--q:${q.color}` },
        h('strong', {}, cards.filter((c) => c.quadrant === q.id).length), q.label))),
      h('div', { class: 'card-actions' },
        h('a', { class: 'btn btn-sm btn-primary', href: `#${plan.id}/soar` }, icon('workbench', 14), 'Open the SOAR board'),
        h('a', { class: 'btn btn-sm', href: `#${plan.id}/assemble` }, icon('connect', 14), 'Assemble objectives and goals')))),

    h('section', { class: 'card card-border bg-base-100' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'Operating context'),
      h('p', { class: 'muted' }, 'What is going on around the plan, and inside the organisation, that it has to work with. Context factors can be wired into goals on the Assemble canvas.'),
      h('ul', { class: 'context-list' }, context.map((c) => h('li', {},
        h('select', { class: 'select select-xs', name: `cx-${c.id}-k`, 'aria-label': 'Kind', onchange: (e) => ctx.put('context', c.id, { kind: e.target.value }) }, options(CONTEXT_KINDS, c.kind)),
        h('input', { class: 'input input-sm', name: `cx-${c.id}`, value: c.text, 'aria-label': 'Context factor', onchange: (e) => ctx.put('context', c.id, { text: e.target.value }) }),
        h('button', { class: 'btn btn-ghost btn-xs btn-square', title: 'Remove', 'aria-label': 'Remove factor', onclick: () => ctx.remove('context', c.id) }, '×')))),
      h('form', { class: 'context-add join', onsubmit: addContext }, kindSel, cxText, h('button', { class: 'btn btn-sm join-item', type: 'submit' }, icon('plus', 14), 'Add')))),

    h('section', { class: 'card card-border bg-base-100' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'Planning team'),
      h('ul', { class: 'team-list' }, rec.team.map((t, i) => {
        const s = ctx.org.staff[t.staffId];
        return s && h('li', {},
          Avatar(s, 28), h('span', { class: 'team-name' }, s.name, h('small', { class: 'muted' }, s.title)),
          h('select', { class: 'select select-xs', name: `team-${t.staffId}`, 'aria-label': `${s.name}’s role`, onchange: (e) => setTeam(rec.team.map((x, j) => (j === i ? { ...x, role: e.target.value } : x))) }, options(TEAM_ROLES, t.role)),
          h('button', { class: 'btn btn-ghost btn-xs btn-square', title: 'Remove', 'aria-label': `Remove ${s.name}`, onclick: () => setTeam(rec.team.filter((_, j) => j !== i)) }, '×'));
      })),
      h('select', { class: 'select select-sm', name: 'team-add', 'aria-label': 'Add someone to the team', onchange: (e) => { if (e.target.value) setTeam([...rec.team, { staffId: e.target.value, role: 'member' }]); } },
        h('option', { value: '' }, 'Add someone…'), options(staffList(ctx.org).filter((s) => !inTeam.has(s.id)).map((s) => ({ id: s.id, label: s.name })))),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Facilitation notes'),
        h('textarea', { class: 'textarea textarea-sm', name: 'plan-notes', rows: 3, placeholder: 'Sessions, agreements, who is doing what', onchange: (e) => ctx.savePlan(plan.id, { notes: e.target.value }) }, rec.notes ?? '')))));
}
