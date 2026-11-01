import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * Floating tool panels over a board, a little like Photoshop's: each panel
 * has a title bar you drag. Drop it near the left or right edge and it docks
 * into that edge's column; drop it anywhere else and it floats there. Panels
 * fold to their title bar, can be hidden and shown again, and the layout is
 * remembered per browser.
 *
 *   const dock = DockPanels(mainEl, [
 *     { id: 'tools', title: 'Tools', body, dock: 'left', width: 64, compact: true },
 *     { id: 'layers', title: 'Layers', body, dock: 'right', action: { label, icon, onclick } },
 *   ], { key: 'dashi.mapper.panels' });
 *   dock.toggle('layers'); dock.reset(); dock.state  // { id: { dock, x, y, folded, hidden, order } }
 */
export function DockPanels(host, panels, { key = 'dashi.panels', onchange } = {}) {
  const defaults = () => Object.fromEntries(panels.map((p, i) => [p.id, { dock: p.dock ?? 'left', x: 80, y: 80, folded: false, hidden: !!p.hidden, order: i }]));
  let state = load();
  const columns = { left: h('div', { class: 'dock-col dock-left' }), right: h('div', { class: 'dock-col dock-right' }) };
  const els = new Map();
  host.classList.add('dock-host');
  host.append(columns.left, columns.right);

  for (const p of panels) {
    const foldBtn = h('button', { class: 'dock-btn', type: 'button', title: 'Fold', 'aria-label': `Fold ${p.title}`, onclick: () => set(p.id, { folded: !state[p.id].folded }) }, icon('chevronDown', 14));
    const head = h('header', { class: 'dock-head' },
      h('span', { class: 'dock-grip', 'aria-hidden': 'true' }, '⋮⋮'),
      h('span', { class: 'dock-title' }, p.title),
      p.action && h('button', { class: 'dock-btn', type: 'button', title: p.action.label, 'aria-label': p.action.label, onclick: p.action.onclick }, icon(p.action.icon ?? 'plus', 14)),
      foldBtn,
      p.closable !== false && h('button', { class: 'dock-btn', type: 'button', title: 'Hide this panel (show it again from Panels)', 'aria-label': `Hide ${p.title}`, onclick: () => set(p.id, { hidden: true }) }, icon('close', 13)));
    const el = h('section', { class: `dock-panel${p.compact ? ' compact' : ''}`, 'data-panel': p.id, style: p.width ? `--dock-w:${p.width}px` : null, 'aria-label': p.title },
      head, h('div', { class: 'dock-body' }, p.body));
    head.addEventListener('pointerdown', (e) => startDrag(e, p.id, el));
    els.set(p.id, { el, foldBtn });
  }

  function load() {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved) for (const id of Object.keys(base)) if (saved[id]) base[id] = { ...base[id], ...saved[id] };
    } catch { /* fresh layout */ }
    return base;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* private window */ }
    onchange?.(state);
  }
  function set(id, patch) {
    state[id] = { ...state[id], ...patch };
    save();
    render();
  }

  function render() {
    for (const side of ['left', 'right']) {
      const ids = panels.map((p) => p.id).filter((id) => state[id].dock === side && !state[id].hidden).sort((a, b) => state[a].order - state[b].order);
      columns[side].replaceChildren(...ids.map((id) => els.get(id).el));
    }
    for (const p of panels) {
      const { el, foldBtn } = els.get(p.id);
      const s = state[p.id];
      el.classList.toggle('folded', s.folded);
      el.classList.toggle('floating', s.dock === 'float');
      foldBtn.title = s.folded ? 'Unfold' : 'Fold';
      if (s.hidden) el.remove();
      else if (s.dock === 'float') {
        const r = host.getBoundingClientRect();
        el.style.left = `${Math.max(0, Math.min(s.x, r.width - 80))}px`;
        el.style.top = `${Math.max(0, Math.min(s.y, r.height - 40))}px`;
        if (el.parentNode !== host) host.append(el);
      } else {
        el.style.left = el.style.top = '';
      }
    }
  }

  function startDrag(e, id, el) {
    if (e.button !== 0 || e.target.closest('.dock-btn')) return;
    e.preventDefault();
    const hostRect = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const off = { x: e.clientX - r.left, y: e.clientY - r.top };
    const start = { x: e.clientX, y: e.clientY };
    let moving = false;
    const hint = h('div', { class: 'dock-hint' });
    const edge = (x) => (x - hostRect.left < 70 ? 'left' : hostRect.right - x < 70 ? 'right' : null);
    const move = (ev) => {
      if (!moving && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      if (!moving) {
        moving = true;
        el.classList.add('dragging', 'floating');
        el.style.width = `${r.width}px`;
        host.append(el, hint);
      }
      el.style.left = `${ev.clientX - hostRect.left - off.x}px`;
      el.style.top = `${ev.clientY - hostRect.top - off.y}px`;
      const side = edge(ev.clientX);
      hint.className = `dock-hint${side ? ` show ${side}` : ''}`;
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      hint.remove();
      if (!moving) return;
      el.classList.remove('dragging');
      el.style.width = '';
      const side = edge(ev.clientX);
      if (side) {
        // Slot it among that column's panels by height.
        const others = panels.map((p) => p.id).filter((o) => o !== id && state[o].dock === side && !state[o].hidden);
        const y = ev.clientY;
        const before = others.find((o) => { const b = els.get(o).el.getBoundingClientRect(); return y < b.top + b.height / 2; });
        const ordered = others.sort((a, b) => state[a].order - state[b].order);
        const at = before ? ordered.indexOf(before) : ordered.length;
        ordered.splice(at, 0, id);
        ordered.forEach((o, i) => { state[o].order = i; });
        set(id, { dock: side });
      } else {
        set(id, { dock: 'float', x: ev.clientX - hostRect.left - off.x, y: ev.clientY - hostRect.top - off.y });
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  render();
  window.addEventListener('resize', render);
  return {
    get state() { return state; },
    panels,
    toggle(id, show = state[id].hidden) { set(id, { hidden: !show, folded: show ? false : state[id].folded }); },
    reset() { state = defaults(); save(); render(); },
  };
}
