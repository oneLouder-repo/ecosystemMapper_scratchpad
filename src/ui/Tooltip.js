import { h } from './dom.js';

/**
 * Quick, readable tooltips for a page's controls. Inside the given scopes,
 * anything with a `title` (or `data-tip`) shows a small label after a short
 * pause, instead of the browser's slow native one. Keyboard focus shows it
 * too. Touch screens skip it.
 *
 *   Tooltips('#topbar, .dock-panel, .selection-bar');
 */
export function Tooltips(scopes) {
  if (installed) return;
  installed = true;
  const tip = h('div', { class: 'ui-tip', role: 'tooltip', hidden: true });
  document.body.append(tip);
  let timer = null;
  let current = null;

  const target = (e) => {
    const el = e.target.closest?.('[title], [data-tip]');
    return el && el.closest(scopes) ? el : null;
  };
  const show = (el) => {
    // Keep the text off `title` so the browser's own tooltip doesn't show as well.
    if (el.hasAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
    const text = el.dataset.tip;
    if (!text) return;
    tip.textContent = text;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    let y = r.bottom + 8;
    if (y + t.height > innerHeight - 8) y = r.top - t.height - 8;
    x = Math.max(8, Math.min(x, innerWidth - t.width - 8));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const hide = () => { clearTimeout(timer); timer = null; current = null; tip.hidden = true; };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = target(e);
    if (el === current) return;
    hide();
    if (!el) return;
    current = el;
    timer = setTimeout(() => show(el), 350);
  });
  document.addEventListener('pointerout', (e) => { if (current && !current.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  document.addEventListener('focusin', (e) => {
    const el = target(e);
    if (el && el.matches(':focus-visible')) { current = el; show(el); }
  });
  document.addEventListener('focusout', hide);
  addEventListener('scroll', hide, true);
}
let installed = false;
