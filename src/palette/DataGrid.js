import { h } from '../ui/dom.js';
import { svg } from '../core/svg.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { measureIndex } from '../platform/strategy.js';
import { dataMonths, monthRange, calcSeries, calcMeasure } from '../platform/data.js';
import { parseFormula, formulaText, formulaStore } from '../core/formula.js';
import { monthLabel } from '../strategy/dates.js';

/**
 * Program data as a spreadsheet: a row for every month, a column for every
 * measure, and calculated measures worked out from the others.
 *
 * It behaves like Excel or Google Sheets where it can:
 * - arrow keys, Tab and Enter move; typing replaces a cell; F2 or a double click edits it;
 * - Shift with arrows, or a drag, selects a range; Delete clears it;
 * - Ctrl+C copies the range and Ctrl+V pastes a block from a spreadsheet,
 *   adding months as needed; Ctrl+D fills the top row of a range down;
 * - Ctrl+Z undoes.
 * Below the grid, each column's latest value, change on a year earlier,
 * average, range and progress to target. Unusual values are flagged.
 */
const PERIODS = [{ id: '12', label: 'Last 12 months' }, { id: '24', label: 'Last 24 months' }, { id: 'all', label: 'All months' }];
const today = () => new Date().toISOString().slice(0, 8) + '01';

/** "1,234", "$1 234.50", "45%" → a number, or null. */
export function parseNumber(text) {
  const t = String(text ?? '').trim().replace(/[$€£\s%]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
  if (t === '' || t === '-') return null;
  const n = Number(t.replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
}
const show = (v) => (v == null ? '' : Number(v).toLocaleString('en-CA', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 1 : 2 }));

export function DataGrid(ctx) {
  const { data } = ctx;
  const doc = data.doc;
  const st = (ctx.grid ??= { r: null, c: 0, ar: null, ac: null, period: '12', group: '', calc: null });
  const index = measureIndex(ctx.strategy);
  const nameOf = (id) => (index[id]?.name ?? doc.calcs?.[id]?.name);
  const groups = [...new Map(Object.values(index).map((m) => [m.nodeId, m.nodeTitle])).entries()];
  const calcs = Object.values(doc.calcs ?? {});
  const cols = [
    ...Object.values(index).filter((m) => !st.group || m.nodeId === st.group).map((m) => ({ id: m.id, m, series: doc.series[m.id] })),
    ...calcs.map((c) => ({ id: c.id, m: calcMeasure(c), calc: c, series: calcSeries(c, doc) })),
  ];
  // A message from the last change (pasted, imported), shown once after the redraw it causes.
  let pending = st.msg ?? null;
  st.msg = null;
  if (!cols.length) return h('p', { class: 'empty' }, 'Add measures to objectives or goals in Strategy & Work first.');

  // Months: from the first with data to this month (or the last with data, if later).
  const known = dataMonths(doc);
  const allMonths = monthRange(known[0] ?? today(), [known.at(-1) ?? today(), today()].sort().at(-1));
  const months = st.period === 'all' ? allMonths : allMonths.slice(-Number(st.period));
  const value = (c, d) => c.series?.points.find((p) => p.date === d)?.value ?? null;
  st.r = Math.min(st.r ?? months.length - 1, months.length - 1);
  st.c = Math.min(st.c, cols.length - 1);

  /* Writing: every change goes in one step, so one undo takes it back. */
  function write(changes) {
    const byId = new Map();
    for (const ch of changes) {
      const column = cols.find((x) => x.id === ch.id);
      if (!column || column.calc) continue;
      const pts = byId.get(ch.id) ?? new Map((doc.series[ch.id]?.points ?? []).map((p) => [p.date, p.value]));
      if (ch.value == null) pts.delete(ch.date); else pts.set(ch.date, ch.value);
      byId.set(ch.id, pts);
    }
    if (!byId.size) return;
    const ops = [...byId].map(([id, pts]) => {
      const points = [...pts].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, value: v }));
      return doc.series[id] ? col.update('series', id, { points }) : col.add('series', { id, points });
    });
    ctx.gridFocus = true;
    data.apply(ops.length === 1 ? ops[0] : col.batch(ops));
  }

  const range = () => {
    const [r1, r2] = [st.ar ?? st.r, st.r].sort((a, b) => a - b);
    const [c1, c2] = [st.ac ?? st.c, st.c].sort((a, b) => a - b);
    return { r1, r2, c1, c2 };
  };
  const inRange = (r, c) => { const g = range(); return r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2; };

  /* The table. */
  const cells = [];
  const body = h('tbody', {}, months.map((d, r) => h('tr', {},
    h('th', { scope: 'row' }, monthLabel(d)),
    cols.map((c, ci) => {
      const v = value(c, d);
      const td = h('td', { class: [c.calc && 'calc', flag(c, v)].filter(Boolean).join(' '), 'data-r': r, 'data-c': ci, title: flagText(c, v) ?? '' }, show(v));
      (cells[r] ??= [])[ci] = td;
      return td;
    }))));
  const statsRows = stats(cols, months, value);
  const head = h('thead', {},
    h('tr', {}, h('th', { class: 'corner' }, 'Month'), cols.map((c) => h('th', { scope: 'col', class: c.calc ? 'calc' : '' },
      c.calc
        ? h('button', { class: 'link-button col-name', title: `Calculated: ${formulaText(c.calc.expr, nameOf)}. Click to change.`, onclick: () => { st.calc = c.calc.id; ctx.render(); } }, h('span', { class: 'fx' }, 'ƒ'), c.m.name)
        : h('span', { class: 'col-name', title: `${c.m.name} (${c.m.nodeTitle})` }, c.m.name),
      h('small', {}, [c.m.unit, c.m.target && `target ${c.m.target}`].filter(Boolean).join(' · ') || ' '),
      spark(months.map((d) => value(c, d)))))));
  const table = h('table', { class: 'sheet' }, head, body, h('tfoot', {}, statsRows));
  const grid = h('div', { class: 'sheet-wrap', tabindex: 0, role: 'grid', 'aria-label': 'Program data, a month per row and a measure per column. Arrow keys move, type to change a value.' }, table);

  const editor = h('input', { class: 'cell-editor', inputmode: 'decimal', 'aria-label': 'Value' });
  let editing = false;
  function paint() {
    for (const row of cells) for (const td of row) td.classList.remove('active', 'sel');
    const g = range();
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) cells[r]?.[c]?.classList.add('sel');
    const td = cells[st.r]?.[st.c];
    if (!td) return;
    td.classList.add('active');
    grid.setAttribute('aria-activedescendant', '');
    if (pending) { status.textContent = pending; pending = null; } else status.textContent = `${cols[st.c].m.name}, ${monthLabel(months[st.r])}: ${td.textContent || 'empty'}${cols[st.c].calc ? ' (calculated)' : ''}`;
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function move(dr, dc, extend = false) {
    if (extend) { st.ar ??= st.r; st.ac ??= st.c; } else { st.ar = null; st.ac = null; }
    st.r = Math.max(0, Math.min(months.length - 1, st.r + dr));
    st.c = Math.max(0, Math.min(cols.length - 1, st.c + dc));
    paint();
  }
  function startEdit(initial) {
    if (cols[st.c].calc) { status.textContent = `${cols[st.c].m.name} is calculated from other measures. Click its name to change the formula.`; return; }
    const td = cells[st.r][st.c];
    editing = true;
    editor.value = initial ?? (value(cols[st.c], months[st.r]) ?? '');
    td.replaceChildren(editor);
    editor.focus();
    if (initial == null) editor.select();
  }
  function commit(dr, dc) {
    if (!editing) return;
    editing = false;
    const text = editor.value;
    const v = parseNumber(text);
    if (text.trim() && v == null) { status.textContent = `“${text}” isn’t a number.`; }
    const ch = { id: cols[st.c].id, date: months[st.r], value: v };
    st.r = Math.max(0, Math.min(months.length - 1, st.r + dr));
    st.c = Math.max(0, Math.min(cols.length - 1, st.c + dc));
    const column = cols.find((x) => x.id === ch.id);
    if (v !== value(column, ch.date) && !(text.trim() && v == null)) return write([ch]);
    // Nothing changed: put the cell back as it was.
    const td = editor.parentElement;
    if (td) td.textContent = show(value(column, ch.date));
    grid.focus();
    paint();
  }
  function cancel() {
    editing = false;
    const td = cells[st.r][st.c];
    td.textContent = show(value(cols[st.c], months[st.r]));
    grid.focus();
  }
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) { e.preventDefault(); commit(e.key === 'ArrowUp' ? -1 : 1, 0); }
    e.stopPropagation();
  });
  editor.addEventListener('blur', () => { if (editing) commit(0, 0); });

  grid.addEventListener('keydown', (e) => {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dr, dc] = arrows[e.key];
      if (mod) move(dr * months.length, dc * cols.length, e.shiftKey); else move(dr, dc, e.shiftKey);
    } else if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(); }
    else if (e.key === 'Home') { e.preventDefault(); move(mod ? -months.length : 0, -cols.length, e.shiftKey); }
    else if (e.key === 'End') { e.preventDefault(); move(mod ? months.length : 0, cols.length, e.shiftKey); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const g = range();
      const changes = [];
      for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) changes.push({ id: cols[c].id, date: months[r], value: null });
      write(changes);
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const g = range();
      const changes = [];
      for (let c = g.c1; c <= g.c2; c++) { const v = value(cols[c], months[g.r1]); for (let r = g.r1 + 1; r <= g.r2; r++) changes.push({ id: cols[c].id, date: months[r], value: v }); }
      write(changes);
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault(); st.ar = 0; st.ac = 0; st.r = months.length - 1; st.c = cols.length - 1; paint();
    } else if (e.key === 'Escape') { st.ar = null; st.ac = null; paint(); }
    else if (!mod && e.key.length === 1 && /[\d.\-]/.test(e.key)) { e.preventDefault(); startEdit(e.key); }
  });
  grid.addEventListener('copy', (e) => {
    if (editing) return;
    const g = range();
    const rows = [];
    for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) row.push(value(cols[c], months[r]) ?? ''); rows.push(row.join('\t')); }
    e.clipboardData.setData('text/plain', rows.join('\n'));
    e.preventDefault();
    status.textContent = `Copied ${g.r2 - g.r1 + 1} × ${g.c2 - g.c1 + 1} cells.`;
  });
  grid.addEventListener('paste', (e) => {
    if (editing) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    let rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split(line.includes('\t') ? '\t' : /,(?!\d{3})/));
    // A header row of names (pasted from a spreadsheet with its titles) is skipped.
    if (rows.length > 1 && rows[0].every((x) => parseNumber(x) == null)) rows = rows.slice(1);
    const changes = [];
    let extra = 0;
    rows.forEach((row, i) => {
      let date = months[st.r + i];
      if (!date) { extra++; date = monthRange(months.at(-1), '9999-12-01')[extra]; }
      row.forEach((cell, j) => { const c = cols[st.c + j]; if (c && !c.calc && cell.trim() !== '') changes.push({ id: c.id, date, value: parseNumber(cell) }); });
    });
    const skipped = changes.filter((x) => x.value == null).length;
    say(`Pasted ${changes.length - skipped} values${extra ? `, adding ${extra} month${extra > 1 ? 's' : ''}` : ''}${skipped ? `; ${skipped} weren’t numbers` : ''}.`);
    write(changes.filter((x) => x.value != null));
  });
  let dragging = false;
  grid.addEventListener('pointerdown', (e) => {
    const td = e.target.closest('td[data-r]');
    if (!td || editing) return;
    grid.focus();
    st.r = +td.dataset.r; st.c = +td.dataset.c;
    if (!e.shiftKey) { st.ar = null; st.ac = null; } else { st.ar ??= st.r; st.ac ??= st.c; }
    dragging = true;
    window.addEventListener('pointerup', () => { dragging = false; }, { once: true });
    paint();
  });
  grid.addEventListener('pointerover', (e) => {
    if (!dragging) return;
    const td = e.target.closest('td[data-r]');
    if (!td) return;
    st.ar ??= st.r; st.ac ??= st.c;
    st.r = +td.dataset.r; st.c = +td.dataset.c;
    paint();
  });
  grid.addEventListener('dblclick', (e) => { if (e.target.closest('td[data-r]')) startEdit(); });

  const status = h('p', { class: 'sheet-status', role: 'status', 'aria-live': 'polite' });
  const say = (text) => { st.msg = text; status.textContent = text; };

  /* Toolbar. */
  const addMonth = () => {
    const next = monthRange(allMonths.at(-1), '9999-12-01')[1];
    st.period = st.period === 'all' ? 'all' : String(Math.max(Number(st.period), months.length + 1));
    write(cols.filter((c) => !c.calc).slice(0, 1).map((c) => ({ id: c.id, date: next, value: value(c, allMonths.at(-1)) ?? 0 })));
  };
  const toolbar = h('div', { class: 'sheet-tools' },
    h('select', { class: 'select select-sm', 'aria-label': 'Measures to show', onchange: (e) => { st.group = e.target.value; ctx.render(); } },
      h('option', { value: '' }, 'Every measure'), groups.map(([id, title]) => h('option', { value: id, selected: st.group === id }, title))),
    h('select', { class: 'select select-sm', 'aria-label': 'Months to show', onchange: (e) => { st.period = e.target.value; ctx.render(); } },
      PERIODS.map((p) => h('option', { value: p.id, selected: st.period === p.id }, p.label))),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn-sm', onclick: () => { st.calc = 'new'; ctx.render(); } }, h('span', { class: 'fx' }, 'ƒ'), 'Calculated measure'),
    h('button', { class: 'btn btn-sm', onclick: addMonth, title: `Add ${monthLabel(monthRange(allMonths.at(-1), '9999-12-01')[1])}` }, icon('plus', 14), 'Month'),
    h('label', { class: 'btn btn-sm', title: 'A CSV with a Month column and a column per measure (as Export gives)' }, icon('upload', 14), 'Import',
      h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (f) importCsv(await f.text()); } })),
    h('button', { class: 'btn btn-sm', onclick: () => download(`program-data-${today().slice(0, 7)}.csv`, toCsv(cols, allMonths, value)) }, icon('download', 14), 'Export'));

  function importCsv(text) {
    const rows = parseCsv(text);
    const head = rows.shift() ?? [];
    const byName = (n) => cols.find((c) => !c.calc && c.m.name.toLowerCase() === String(n).trim().toLowerCase());
    const map = head.map((n, i) => (i ? byName(n) : null));
    const changes = [];
    for (const row of rows) {
      const date = monthOf(row[0]);
      if (!date) continue;
      row.slice(1).forEach((cell, j) => { const c = map[j + 1]; const v = parseNumber(cell); if (c && v != null) changes.push({ id: c.id, date, value: v }); });
    }
    const unknown = head.slice(1).filter((n, i) => !map[i + 1] && n.trim());
    say(`Imported ${changes.length} values.${unknown.length ? ` No measure called ${unknown.map((n) => `“${n}”`).join(', ')}.` : ''}`);
    write(changes);
  }

  const out = h('div', { class: 'sheet-tool' },
    toolbar,
    st.calc && CalcEditor(ctx, st, index, nameOf),
    grid, status,
    h('p', { class: 'muted small sheet-help' },
      'Type to change a value; Enter or Tab to move on. Shift with the arrows (or a drag) selects; Delete clears. Paste a block straight from Excel or Google Sheets; Ctrl+D fills down; Ctrl+Z undoes. ',
      h('span', { class: 'flag-key odd' }), ' unusual for that measure, worth a check.'));
  paint();
  if (ctx.gridFocus) { ctx.gridFocus = false; queueMicrotask(() => { grid.focus({ preventScroll: true }); cells[st.r]?.[st.c]?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }); }
  return out;
}

/** Add or change a calculated measure. */
function CalcEditor(ctx, st, index, nameOf) {
  const { data } = ctx;
  const existing = st.calc === 'new' ? null : data.doc.calcs?.[st.calc];
  const measures = Object.values(index);
  const resolve = (name) => measures.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  const f = {
    name: h('input', { class: 'input input-sm', placeholder: 'Name, e.g. Meals per box', value: existing?.name ?? '' }),
    unit: h('input', { class: 'input input-sm', placeholder: 'Unit, e.g. %', value: existing?.unit ?? '', style: 'width:110px' }),
    target: h('input', { class: 'input input-sm', placeholder: 'Target', value: existing?.target ?? '', style: 'width:90px' }),
    expr: h('input', { class: 'input input-sm formula', placeholder: '[Meals served] / [Good food boxes]', value: existing ? formulaText(existing.expr, nameOf) : '' }),
  };
  const preview = h('p', { class: 'muted small' });
  const check = () => {
    try {
      const expr = formulaStore(f.expr.value, resolve);
      const s = calcSeries({ id: 'x', expr }, data.doc);
      preview.className = 'small';
      preview.textContent = s.points.length ? `Latest: ${s.points.slice(-3).map((p) => `${monthLabel(p.date)} ${show(p.value)}`).join(', ')}` : 'No months have all the numbers this needs yet.';
      return expr;
    } catch (err) {
      preview.className = 'small error-text';
      preview.textContent = err.message;
      return null;
    }
  };
  f.expr.addEventListener('input', check);
  const insert = (text) => {
    const { selectionStart: a = f.expr.value.length, selectionEnd: b = a } = f.expr;
    f.expr.value = f.expr.value.slice(0, a) + text + f.expr.value.slice(b);
    f.expr.focus();
    f.expr.setSelectionRange(a + text.length, a + text.length);
    check();
  };
  if (existing) queueMicrotask(check);
  const close = () => { st.calc = null; ctx.render(); };
  return h('section', { class: 'calc-editor' },
    h('h3', {}, existing ? `Change “${existing.name}”` : 'New calculated measure'),
    h('p', { class: 'muted small' }, 'Worked out each month from other measures, like a spreadsheet formula. Use + − × ÷ as + - * /, and functions: prev([x]) for last month, ago([x], 12) for a year earlier, avg3([x]) for a three-month average.'),
    h('div', { class: 'inline-form' }, f.name, f.unit, f.target),
    f.expr,
    h('div', { class: 'measure-chips' }, measures.map((m) => h('button', { type: 'button', class: 'btn btn-xs', onclick: () => insert(`[${m.name}]`) }, m.name)),
      ['prev(', 'ago(', 'avg3(', ' / ', ' * 100'].map((t) => h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => insert(t) }, t.trim()))),
    preview,
    h('div', { class: 'inline-form' },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
        const expr = check();
        if (!expr) return;
        if (!f.name.value.trim()) { preview.textContent = 'Give it a name.'; return; }
        const rec = { name: f.name.value.trim(), unit: f.unit.value.trim(), target: f.target.value.trim(), expr };
        st.calc = null;
        data.apply(existing ? col.update('calcs', existing.id, rec) : col.add('calcs', { id: `calc-${Math.random().toString(36).slice(2, 8)}`, ...rec }));
      } }, existing ? 'Save' : 'Add column'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: close }, 'Cancel'),
      existing && h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: () => { st.calc = null; data.apply(col.remove('calcs', existing.id)); } }, 'Remove')));
}

/* Column statistics, below the grid. */
function stats(cols, months, value) {
  const rows = [
    ['Latest', (c, vals) => { const last = [...vals].reverse().find((v) => v != null); return show(last); }],
    ['vs a year before', (c) => {
      const pts = c.series?.points ?? [];
      const last = pts.at(-1);
      if (!last) return '';
      const before = pts.find((p) => p.date === `${+last.date.slice(0, 4) - 1}${last.date.slice(4)}`);
      if (!before || !before.value) return '—';
      const pct = Math.round(((last.value - before.value) / Math.abs(before.value)) * 100);
      return `${pct > 0 ? '▲' : pct < 0 ? '▼' : ''} ${Math.abs(pct)}%`;
    }],
    ['Average', (c, vals) => { const v = vals.filter((x) => x != null); return v.length ? show(v.reduce((s, x) => s + x, 0) / v.length) : ''; }],
    ['Lowest – highest', (c, vals) => { const v = vals.filter((x) => x != null); return v.length ? `${show(Math.min(...v))} – ${show(Math.max(...v))}` : ''; }],
    ['Of target', (c, vals) => { const t = parseFloat(c.m.target); const last = [...vals].reverse().find((v) => v != null); return t && last != null ? `${Math.round((last / t) * 100)}%` : ''; }],
  ];
  return rows.map(([label, fn]) => h('tr', {}, h('th', { scope: 'row' }, label), cols.map((c) => h('td', {}, fn(c, months.map((d) => value(c, d)))))));
}

/** A value far from the rest of its column (more than 3 standard deviations), or a share outside 0–100. */
function flag(c, v) {
  if (v == null) return '';
  if ((c.m.unit ?? '').startsWith('%') && (v < 0 || v > 100)) return 'odd';
  const vals = (c.series?.points ?? []).map((p) => p.value);
  if (vals.length < 6) return '';
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length);
  return sd && Math.abs(v - mean) > 3 * sd ? 'odd' : '';
}
const flagText = (c, v) => (flag(c, v) ? 'Unusual for this measure: worth checking' : null);

function spark(vals) {
  const pts = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
  const s = svg('svg', { class: 'spark', viewBox: '0 0 80 20', 'aria-hidden': 'true' });
  if (pts.length < 2) return s;
  const lo = Math.min(...pts.map(([, v]) => v));
  const hi = Math.max(...pts.map(([, v]) => v));
  const x = (i) => 2 + (i / Math.max(1, vals.length - 1)) * 76;
  const y = (v) => 18 - ((v - lo) / (hi - lo || 1)) * 16;
  svg('polyline', { points: pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }, s);
  return s;
}

/* CSV in and out. */
function toCsv(cols, months, value) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  return [['Month', ...cols.map((c) => c.m.name)], ...months.map((d) => [d.slice(0, 7), ...cols.map((c) => value(c, d) ?? '')])].map((r) => r.map(q).join(',')).join('\n') + '\n';
}
export function parseCsv(text) {
  const rows = [];
  let row = [''];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { row[row.length - 1] += '"'; i++; } else if (ch === '"') quoted = false; else row[row.length - 1] += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t') row.push('');
    else if (ch === '\n') { rows.push(row); row = ['']; } else if (ch !== '\r') row[row.length - 1] += ch;
  }
  if (row.length > 1 || row[0]) rows.push(row);
  return rows;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "2025-04", "2025-04-01", "Apr 2025", "April 2025" → "2025-04-01". */
export function monthOf(text) {
  const t = String(text ?? '').trim().toLowerCase();
  let m = t.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1])) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-01`;
  return null;
}
function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}
