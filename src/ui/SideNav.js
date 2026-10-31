import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The left sidebar every plugin shares, built on DaisyUI's menu. Sections
 * have a title and items; an item is a link (href) or a button (onclick).
 * The sidebar folds down to icons, and every plugin remembers that.
 *
 *   SideNav({ label: 'Workbench', sections: [
 *     { title: 'Mini-tools', items: [{ label, sub, icon, href, on, badge }] },
 *     { title: 'Layers', action: { icon: 'plus', label: 'Add layer', onclick }, body: element },
 *   ] })
 *
 * A section's `body` is any element shown in place of items (the mapper's
 * layers list, say); it hides when the sidebar is folded. `menu` is a
 * ready-made ul.menu that someone else keeps drawn (the mapper's tools).
 */
const KEY = 'dashi.side-folded';
const folded = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export function SideNav({ label, sections }) {
  const nav = h('nav', { class: `side-nav${folded() ? ' folded' : ''}`, 'aria-label': label });
  const toggle = h('button', { class: 'btn btn-ghost btn-xs btn-square side-fold', title: 'Fold the sidebar', 'aria-expanded': String(!folded()),
    onclick: () => {
      const now = !nav.classList.toggle('folded') ? '0' : '1';
      try { localStorage.setItem(KEY, now); } catch { /* private window: fold just for now */ }
      toggle.setAttribute('aria-expanded', String(now === '0'));
      document.dispatchEvent(new CustomEvent('dashi:side-fold'));
    } }, h('span', { 'aria-hidden': 'true' }, '‹'));
  nav.append(toggle, ...sections.filter(Boolean).map(Section));
  return nav;
}

function Section({ title, items, menu, body, action, className }) {
  return h('section', { class: `side-section ${className ?? ''}` },
    (title || action) && h('div', { class: 'side-title' },
      h('span', {}, title),
      action && h('button', { class: 'btn btn-ghost btn-xs btn-square', title: action.label, 'aria-label': action.label, onclick: action.onclick }, icon(action.icon ?? 'plus', 15))),
    items && h('ul', { class: 'menu side-menu' }, items.filter(Boolean).map(Item)),
    menu,
    body && h('div', { class: 'side-body' }, body));
}

export function Item(it) {
  if (it instanceof Node) return h('li', {}, it);
  const inner = [
    it.lead ?? (it.icon ? icon(it.icon, 18) : h('span', { class: 'side-dot', 'aria-hidden': 'true' })),
    h('span', { class: 'side-text' }, it.label, it.sub && h('small', {}, it.sub)),
    it.badge && h('span', { class: `badge badge-xs ${it.badgeClass ?? 'badge-ghost'}` }, it.badge),
  ];
  const props = {
    class: [it.on && 'menu-active', it.className].filter(Boolean).join(' ') || null,
    title: it.title ?? it.label,
    'aria-current': it.on ? 'page' : null,
    ...(it.props ?? {}),
  };
  return h('li', { class: it.disabled ? 'menu-disabled' : null },
    it.href ? h('a', { href: it.href, ...props }, ...inner) : h('button', { type: 'button', onclick: it.onclick, disabled: it.disabled, ...props }, ...inner));
}

/** Put a freshly drawn sidebar in place of the old one, keeping its scroll. */
export function swapSide(old, next) {
  next.scrollTop = old.scrollTop;
  old.replaceWith(next);
  return next;
}
