import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { session } from '../platform/storage.js';
import { openFeedback } from '../ui/Support.js';

/**
 * Help → Support: the tickets you've opened, and one ticket's conversation,
 * where you can reply, or close it once it's sorted. The platform admin
 * answers from Platform admin → Support (pages/platform.js).
 */
export const STATUS_LABEL = { new: 'New', open: 'Open', waiting: 'Waiting for you', resolved: 'Resolved', closed: 'Closed' };
export const KIND_LABEL = { problem: 'Problem', question: 'Question', idea: 'Idea', other: 'Note' };
export const statusBadge = (st, { admin = false } = {}) => h('span', { class: `badge badge-sm ticket-status ${st}` }, admin && st === 'waiting' ? 'Waiting on them' : STATUS_LABEL[st] ?? st);
export const when = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body && JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
  return out;
};
export { call as supportCall };

export function SupportPage(id) {
  const host = h('div', { class: 'support-page' }, h('p', { class: 'muted' }, 'Loading…'));
  if (!session()?.user) {
    host.replaceChildren(h('h2', { class: 'help-title' }, 'Support'), h('p', {}, 'Support tickets need the Dashi server; this copy runs in your browser only.'));
    return host;
  }
  (id ? Thread(host, id) : List(host)).catch((err) => host.replaceChildren(h('p', { class: 'text-error' }, err.message)));
  return host;
}

async function List(host) {
  const { tickets } = await call('GET', '/api/tickets');
  host.replaceChildren(
    h('h2', { class: 'help-title' }, 'Support'),
    h('p', { class: 'lede' }, 'What you’ve asked, reported or suggested, and the Dashi team’s replies. Only you and the team see these.'),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm btn-primary', onclick: () => openFeedback() }, icon('plus', 14), 'New ticket')),
    tickets.length
      ? h('ul', { class: 'ticket-list' }, tickets.map((t) => h('li', {},
          h('a', { href: `#support/${t.id}`, class: 'ticket-row' },
            h('span', { class: 'ticket-n' }, `#${t.n}`),
            h('span', { class: 'ticket-title' }, t.title, h('small', { class: 'muted' }, ` ${KIND_LABEL[t.kind]} · ${when(t.updatedAt)}${t.replies ? ` · ${t.replies} repl${t.replies === 1 ? 'y' : 'ies'}` : ''}`)),
            statusBadge(t.status)))))
      : h('p', { class: 'empty' }, 'Nothing yet. If something’s confusing or broken, tell us: it helps everyone.'));
}

async function Thread(host, id) {
  const { ticket: t, messages } = await call('GET', `/api/tickets/${encodeURIComponent(id)}`);
  const reply = h('textarea', { class: 'textarea w-full', rows: 4, placeholder: 'Reply…', 'aria-label': 'Reply' });
  const message = h('p', { class: 'text-error small', role: 'alert' });
  const reload = () => Thread(host, id);
  host.replaceChildren(
    h('nav', { class: 'crumbs' }, h('a', { href: '#support' }, 'Support'), ` / #${t.n}`),
    h('div', { class: 'ticket-head' }, h('h2', { class: 'help-title' }, t.title), statusBadge(t.status)),
    h('p', { class: 'muted small' }, `${KIND_LABEL[t.kind]} · opened ${when(t.createdAt)}${t.org ? ` · ${t.org.name}` : ''}`),
    TicketThread(t, messages),
    !['closed'].includes(t.status) && h('form', { class: 'ticket-reply', onsubmit: async (e) => {
      e.preventDefault();
      try { await call('POST', `/api/tickets/${t.id}/messages`, { body: reply.value }); await reload(); } catch (err) { message.textContent = err.message; }
    } }, reply, message,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Send reply'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { await call('PATCH', `/api/tickets/${t.id}`, { status: 'closed' }); await reload(); } }, 'Close: it’s sorted'))),
    t.status === 'closed' && h('button', { class: 'btn btn-sm', onclick: async () => { await call('PATCH', `/api/tickets/${t.id}`, { status: 'open' }); await reload(); } }, 'Reopen'));
}

/** The first message and the replies, as plain text (never HTML). */
export function TicketThread(t, messages, { admin = false } = {}) {
  const bubble = (who, text, at, cls = '') => h('article', { class: `ticket-msg ${cls}` },
    h('header', {}, h('strong', {}, who), h('span', { class: 'muted small' }, ` ${when(at)}`)),
    h('div', { class: 'ticket-text' }, text));
  return h('div', { class: 'ticket-thread' },
    bubble(admin ? `${t.name ?? 'Someone'}${t.email ? ` <${t.email}>` : ''}` : 'You', t.body, t.createdAt, 'from-them'),
    messages.map((m) => bubble(m.internal ? `${m.name} · internal note` : m.fromAdmin ? `${m.name} · Dashi team` : m.mine ? 'You' : m.name, m.body, m.at, m.internal ? 'internal' : m.fromAdmin ? 'from-team' : 'from-them')),
    admin && Object.keys(t.context ?? {}).length > 0 && h('details', { class: 'ticket-context' }, h('summary', {}, 'Technical details'), h('pre', {}, JSON.stringify(t.context, null, 2))));
}
