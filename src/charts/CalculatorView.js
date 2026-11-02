import { h } from '../ui/dom.js';
import { measureIndex } from '../platform/strategy.js';
import { calculatorRates } from '../platform/dashboards.js';
import { monthLabel } from '../strategy/dates.js';

/**
 * An impact calculator: a slider for a gift, and what that gift means in
 * the org's own outcomes, worked out from its program data. Used in the
 * Workbench preview and on public sites.
 */
const dollars = (v) => `$${Math.round(v).toLocaleString('en-CA')}`;
const count = (n) => n.toLocaleString('en-CA', { maximumFractionDigits: n < 10 ? 1 : 0 });

export function CalculatorView(calc, docs, { amount } = {}) {
  const rates = calculatorRates(calc, measureIndex(docs.strategy), docs.data).filter((r) => r.costOfOne);
  const amounts = (calc.amounts ?? []).filter((a) => a > 0).sort((a, b) => a - b);
  const max = Math.max(100, ...amounts.map((a) => a * 2));
  const step = max > 2000 ? 25 : 5;
  let gift = amount ?? amounts[1] ?? amounts[0] ?? 50;
  const result = h('div', { class: 'calc-result', 'aria-live': 'polite' });
  const slider = h('input', { type: 'range', class: 'range range-primary calc-range', min: step, max, step, value: gift, 'aria-label': 'Gift amount in dollars',
    oninput: (e) => set(+e.target.value) });
  const money = h('input', { type: 'number', class: 'input calc-money', min: 1, step: 1, value: gift, 'aria-label': 'Gift amount in dollars', name: `${calc.id}-amount`,
    onchange: (e) => set(Math.max(1, +e.target.value || 1)) });
  const presets = h('div', { class: 'calc-presets', role: 'group', 'aria-label': 'Suggested amounts' },
    amounts.map((a) => h('button', { type: 'button', class: 'btn btn-sm', 'data-amount': a, onclick: () => set(a) }, dollars(a))));

  function set(v) {
    gift = v;
    slider.value = Math.min(max, v);
    if (+money.value !== v) money.value = v;
    for (const b of presets.children) b.classList.toggle('btn-primary', +b.dataset.amount === v);
    const [first, ...rest] = rates;
    const line = (r) => {
      const n = gift / r.costOfOne;
      return n >= 1 ? [h('strong', {}, count(n)), ` ${r.label}`] : [`a share of the cost of ${r.label} (about ${dollars(r.costOfOne)} each)`];
    };
    result.replaceChildren(
      !first ? h('p', { class: 'muted' }, 'Add an outcome with program data to see what a gift means.')
        : h('p', { class: 'calc-sentence' }, `A gift of ${dollars(gift)} means `, ...line(first), rest.length ? '' : '.'),
      rest.length ? h('ul', { class: 'calc-more' }, rest.map((r, i) => h('li', {}, 'or ', ...line(r), i === rest.length - 1 ? '.' : ''))) : '');
  }
  set(gift);

  const latest = rates.map((r) => docs.data.series[r.measureId]?.points.at(-1)?.date).filter(Boolean).sort().at(-1);
  return h('section', { class: 'calculator', 'aria-label': calc.title },
    h('header', {}, h('h2', {}, calc.title), calc.intro && h('p', {}, calc.intro)),
    h('div', { class: 'calc-controls' },
      h('label', { class: 'calc-amount' }, h('span', {}, '$'), money),
      slider),
    presets,
    result,
    rates.length > 0 && h('p', { class: 'calc-basis' },
      'Worked out from ', rates.map((r, i) => [i ? '; ' : '', `${dollars(r.budget)} a year and ${Math.round(r.perYear).toLocaleString('en-CA')} ${r.measure.name.toLowerCase()} a year`]),
      latest ? `, with program data to ${monthLabel(latest)}.` : '.'));
}
