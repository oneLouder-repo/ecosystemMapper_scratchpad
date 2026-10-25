import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { measureIndex } from '../platform/strategy.js';
import { blankCalculator, calculatorRates } from '../platform/dashboards.js';
import { CalculatorView } from '../charts/CalculatorView.js';

/**
 * Impact calculator mini-tool: "a gift of $50 means 3 more youth in a
 * program". Staff give what the work costs a year and pick the measures
 * it moves; the cost of one comes from the program data, so the calculator
 * stays current. Public ones show on their site's home page.
 */
const VISIBILITY = [{ id: 'private', label: 'Private' }, { id: 'public', label: 'Public' }];
const money = (v) => `$${Math.round(v).toLocaleString('en-CA')}`;

export function ImpactTool(ctx) {
  const { dashboards: store, org } = ctx;
  const calcs = Object.values(store.doc.calculators ?? {});
  const index = measureIndex(ctx.strategy);
  const measures = Object.values(index).filter((m) => !(m.unit ?? '').startsWith('%'));
  const firstSite = Object.values(org.sites).find((s) => s.visibility === 'public')?.id ?? null;
  const add = () => { const op = store.apply(col.add('calculators', blankCalculator(firstSite))); ctx.calcId = op.id; ctx.render(); };
  const head = h('div', {},
    h('h1', {}, 'Impact calculator'),
    h('p', { class: 'lede' }, 'A slider for your public site: “a gift of $50 means 3 more youth in a program”. Give what the work costs a year, pick the measures it moves, and the calculator works out the rest from your program data.'));
  if (!calcs.length) return h('div', {}, head, h('p', { class: 'empty' }, 'No calculators yet. ', h('button', { class: 'btn btn-sm btn-primary', onclick: add }, icon('plus', 14), 'New calculator')));

  const c = calcs.find((x) => x.id === ctx.calcId) ?? calcs[0];
  ctx.calcId = c.id;
  const save = (patch) => store.apply(col.update('calculators', c.id, patch));
  const setOutcome = (id, patch) => save({ outcomes: c.outcomes.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const rates = Object.fromEntries(calculatorRates(c, index, ctx.data.doc).map((r) => [r.id, r]));
  const field = (label, input, cls = '') => h('label', { class: `fieldset ${cls}` }, h('span', { class: 'fieldset-legend' }, label), input);
  const num = (v) => (v > 0 ? v : '');

  return h('div', {},
    head,
    h('div', { class: 'tool-picker' },
      h('select', { class: 'select select-sm', name: 'calc-pick', 'aria-label': 'Calculator', onchange: (e) => { ctx.calcId = e.target.value; ctx.render(); } },
        options(calcs.map((x) => ({ id: x.id, label: `${x.title}${x.visibility === 'public' ? '' : ' (private)'}` })), c.id)),
      h('button', { class: 'btn btn-sm', onclick: add }, icon('plus', 14), 'New calculator'),
      h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: () => { if (confirm(`Delete “${c.title}”?`)) { store.apply(col.remove('calculators', c.id)); ctx.calcId = null; ctx.render(); } } }, 'Delete')),
    h('div', { class: 'maker-layout' },
      h('div', { class: 'maker-controls' },
        field('Title', h('input', { class: 'input input-sm', name: 'calc-title', value: c.title, onchange: (e) => save({ title: e.target.value.trim() || 'What your gift does' }) })),
        field('Introduction', h('textarea', { class: 'textarea textarea-sm', name: 'calc-intro', rows: 3, onchange: (e) => save({ intro: e.target.value }) }, c.intro)),
        field('What the work costs a year ($)', h('input', { class: 'input input-sm', type: 'number', min: 0, step: 1000, name: 'calc-budget', value: num(c.budget), placeholder: 'e.g. 250000', onchange: (e) => save({ budget: Math.max(0, +e.target.value || 0) }) })),
        h('fieldset', { class: 'outcome-list' },
          h('legend', { class: 'fieldset-legend' }, 'What a gift makes possible'),
          c.outcomes.map((o) => {
            const r = rates[o.id];
            return h('div', { class: 'outcome-row' },
              h('select', { class: 'select select-sm', name: `o-${o.id}-m`, 'aria-label': 'Measure', onchange: (e) => setOutcome(o.id, { measureId: e.target.value }) },
                options(measures.map((m) => ({ id: m.id, label: m.name })), o.measureId)),
              h('input', { class: 'input input-sm', name: `o-${o.id}-label`, value: o.label, 'aria-label': 'How to say it, after the number', placeholder: 'more youth in a program', onchange: (e) => setOutcome(o.id, { label: e.target.value }) }),
              h('div', { class: 'outcome-nums' },
                h('label', {}, h('span', {}, 'A year'), h('input', { class: 'input input-xs', type: 'number', min: 0, name: `o-${o.id}-per`, value: num(o.perYear), placeholder: r?.fromData ? Math.round(r.fromData) : '', onchange: (e) => setOutcome(o.id, { perYear: Math.max(0, +e.target.value || 0) || undefined }) })),
                h('label', {}, h('span', {}, 'Its own cost ($)'), h('input', { class: 'input input-xs', type: 'number', min: 0, name: `o-${o.id}-budget`, value: num(o.budget), placeholder: c.budget || '', onchange: (e) => setOutcome(o.id, { budget: Math.max(0, +e.target.value || 0) || undefined }) })),
                h('button', { class: 'icon-button', title: 'Remove', 'aria-label': `Remove ${o.label || 'outcome'}`, onclick: () => save({ outcomes: c.outcomes.filter((x) => x.id !== o.id) }) }, '×')),
              h('small', { class: 'muted' }, r?.costOfOne ? `About ${money(r.costOfOne)} each${o.perYear ? '' : `, from ${Math.round(r.fromData).toLocaleString('en-CA')} a year in your data`}.` : 'Needs a cost and some program data.'));
          }),
          h('button', { class: 'btn btn-sm', disabled: !measures.length, onclick: () => {
            const m = measures.find((x) => !c.outcomes.some((o) => o.measureId === x.id)) ?? measures[0];
            save({ outcomes: [...c.outcomes, { id: uid('o'), measureId: m.id, label: `more ${m.name.toLowerCase()}` }] });
          } }, icon('plus', 14), 'Add an outcome'),
          !measures.length && h('p', { class: 'muted small' }, 'Add measures that count something in Strategy & Work first.')),
        field('Suggested amounts ($)', h('input', { class: 'input input-sm', name: 'calc-amounts', value: (c.amounts ?? []).join(', '), placeholder: '25, 50, 100, 250',
          onchange: (e) => save({ amounts: e.target.value.split(/[\s,]+/).map(Number).filter((n) => n > 0).slice(0, 6) }) })),
        h('div', { class: 'maker-row' },
          field('Visibility', h('select', { class: 'select select-sm', name: 'calc-vis', onchange: (e) => save({ visibility: e.target.value }) }, options(VISIBILITY, c.visibility))),
          field('Site', h('select', { class: 'select select-sm', name: 'calc-site', onchange: (e) => save({ siteId: e.target.value || null }) },
            h('option', { value: '' }, 'No site'), options(Object.values(org.sites).map((s) => ({ id: s.id, label: s.name })), c.siteId)))),
        h('p', { class: 'muted small' }, c.visibility === 'public' && c.siteId
          ? ['Shows on the home page of ', h('a', { href: `site.html?site=${c.siteId}#${c.id}`, target: '_blank' }, `${org.sites[c.siteId]?.name} ↗`), '. Put it in a page with ', h('code', {}, `[[calculator:${c.id}]]`), '.']
          : 'Make it public and choose a site to put it on the site.')),
      h('div', { class: 'maker-preview' }, h('span', { class: 'fieldset-legend' }, 'Preview'), CalculatorView(c, { strategy: ctx.strategy, data: ctx.data.doc }))));
}
