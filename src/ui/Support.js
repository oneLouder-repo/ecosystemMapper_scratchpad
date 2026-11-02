import { h } from './dom.js';
import { icon } from './icons.js';
import { session } from '../platform/storage.js';
import { VERSION } from '../version.js';

/**
 * Help & feedback, from every staff page: a round button at the bottom
 * right opens a short form to report a problem, ask a question or suggest
 * an idea. It becomes a support ticket (server/support.js) that the
 * platform admin answers; replies show in Help → Support and by email.
 *
 * With "Include technical details" ticked (the default), the ticket carries
 * the page, Dashi's version, the browser, the screen size and the last few
 * errors on this page, which is usually what it takes to find a bug. It
 * never carries the page's contents. The person can see exactly what is
 * sent before sending.
 */

// The last few errors on this page, for a problem report.
const errors = [];
const note = (text) => { errors.push(`${new Date().toISOString().slice(11, 19)} ${String(text).slice(0, 300)}`); if (errors.length > 10) errors.shift(); };
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => note(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
  window.addEventListener('unhandledrejection', (e) => note(`Unhandled: ${e.reason?.message ?? e.reason}`));
  window.addEventListener('toolbox:save-failed', (e) => note(`Save failed (${e.detail.name}): ${e.detail.why}`));
}

export const version = () => session()?.version ?? VERSION;

export function technicalDetails() {
  const s = session();
  return {
    page: location.pathname + location.hash,
    version: version(),
    browser: navigator.userAgent,
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    plugin: document.body.dataset.plugin ?? '',
    ...(s?.user?.isSuper && s?.staffId && { viewAs: s.staffId }),
    errors: [...errors],
  };
}

const KINDS = [
  { id: 'problem', label: 'Something’s wrong', icon: 'alert', hint: 'What were you doing, what did you expect, and what happened instead?' },
  { id: 'question', label: 'A question', icon: 'help', hint: 'What would you like to know?' },
  { id: 'idea', label: 'An idea', icon: 'spark', hint: 'What would make Dashi better for you? What would it let you do?' },
];

export async function sendTicket(body) {
  const res = await fetch('/api/tickets', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
  return out;
}

/** The form, in a dialog. `kind` picks the first tab. */
export function openFeedback({ kind = 'problem' } = {}) {
  const hosted = !!session()?.user;
  let current = kind;
  const message = h('p', { class: 'text-error small', role: 'alert' });
  const title = h('input', { class: 'input input-sm w-full', maxlength: 200, required: true, placeholder: 'In a few words', 'aria-label': 'Title' });
  const details = h('textarea', { class: 'textarea w-full', rows: 6, required: true, 'aria-label': 'Details' });
  const blocking = h('input', { type: 'checkbox', class: 'checkbox checkbox-sm' });
  const tech = h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: true });
  const techView = h('pre', { class: 'tech-details' });
  const kindRow = h('div', { class: 'join feedback-kinds', role: 'radiogroup', 'aria-label': 'What is it?' });
  const blockingRow = h('label', { class: 'check small' }, blocking, ' It stops me getting on with my work');
  const draw = () => {
    kindRow.replaceChildren(...KINDS.map((k) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(k.id === current), class: `btn btn-sm join-item${k.id === current ? ' btn-active' : ''}`, onclick: () => { current = k.id; draw(); } }, k.label)));
    details.placeholder = KINDS.find((k) => k.id === current).hint;
    blockingRow.hidden = current !== 'problem';
  };
  draw();
  const body = h('div', { class: 'feedback-body' });
  const formView = () => body.replaceChildren(h('form', { class: 'feedback-form', onsubmit: async (e) => {
    e.preventDefault();
    message.textContent = '';
    const button = e.target.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const t = await sendTicket({ kind: current, title: title.value, body: details.value, blocking: blocking.checked, context: tech.checked ? technicalDetails() : { version: version() } });
      body.replaceChildren(h('div', { class: 'feedback-done' },
        h('h3', {}, `Thanks. That’s #${t.n}.`),
        h('p', {}, 'It’s with the Dashi team. Replies show under Help → Support, and come by email.'),
        h('div', { class: 'modal-action' },
          h('a', { class: 'btn btn-sm', href: `help.html#support/${t.id}` }, 'See it'),
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => dialog.close() }, 'Done'))));
    } catch (err) {
      message.textContent = err.message;
      button.disabled = false;
    }
  } },
    kindRow,
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Title'), title),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Details'), details),
    blockingRow,
    h('label', { class: 'check small' }, tech, ' Include technical details (page, version, browser, recent errors)'),
    h('details', { class: 'small muted' }, h('summary', { onclick: () => { techView.textContent = JSON.stringify(technicalDetails(), null, 2); } }, 'What’s sent'), techView),
    message,
    h('div', { class: 'modal-action' },
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
      h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Send'))));
  if (hosted) formView();
  else body.replaceChildren(h('p', {}, 'Support tickets need the Dashi server. This copy runs in your browser only.'));

  const dialog = h('dialog', { class: 'modal feedback-dialog' },
    h('div', { class: 'modal-box' },
      h('div', { class: 'feedback-head' },
        h('h2', {}, 'Help & feedback'),
        h('span', { class: 'badge badge-sm badge-ghost', title: 'The version of Dashi you’re using' }, `Dashi ${version()}`)),
      h('p', { class: 'feedback-links small' },
        h('a', { href: 'help.html' }, icon('help', 14), ' Browse help'), ' · ',
        h('a', { href: 'help.html#alpha' }, 'Testing guide'), ' · ',
        h('a', { href: 'help.html#support' }, 'My tickets')),
      body),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  title.focus();
}

/** The round button at the bottom right of staff pages. */
export function FeedbackButton() {
  if (document.querySelector('.feedback-fab')) return;
  document.body.append(h('button', { class: 'feedback-fab', type: 'button', title: 'Help & feedback: report a problem, ask a question, suggest an idea', 'aria-label': 'Help and feedback', onclick: () => openFeedback() },
    icon('help', 20), h('span', {}, 'Feedback')));
}
