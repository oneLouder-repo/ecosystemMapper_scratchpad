/**
 * Support tickets: how people using Dashi (testers in the alpha, customers
 * later) report a problem, ask a question or suggest something, and how
 * the platform admin keeps track of them.
 *
 *   POST   /api/tickets                 open one (anyone signed in)
 *   GET    /api/tickets                 your own; the platform admin sees all (?status=open|…)
 *   GET    /api/tickets/<id>            one, with its conversation
 *   POST   /api/tickets/<id>/messages   reply (internal notes: platform admin only)
 *   PATCH  /api/tickets/<id>            status and priority (admin); the reporter can close or reopen
 *
 * Who sees what: a ticket is seen by the person who opened it and the
 * platform admin, nobody else. Internal notes are the admin's alone. Text
 * is stored and shown as plain text, never as HTML. A ticket can carry
 * technical details (page, version, browser, recent errors) if the reporter
 * leaves that box ticked; they hold no document contents.
 *
 * New tickets and replies are emailed (server/mail.js): to SUPPORT_EMAIL
 * when someone writes in, and to the reporter when the admin answers.
 */
import { config, urlFor } from './config.js';
import { HttpError, json, readJson } from './http.js';
import { sendMail, letter } from './mail.js';

export const KINDS = ['problem', 'question', 'idea', 'other'];
export const STATUSES = ['new', 'open', 'waiting', 'resolved', 'closed'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const KIND_LABEL = { problem: 'Problem', question: 'Question', idea: 'Idea', other: 'Note' };

export const SUPPORT_SCHEMA = [
  `CREATE TABLE tickets (
     id TEXT PRIMARY KEY, n INTEGER NOT NULL, org_id TEXT REFERENCES orgs(id) ON DELETE SET NULL,
     user_id TEXT REFERENCES users(id) ON DELETE SET NULL, email TEXT, name TEXT,
     kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
     priority TEXT NOT NULL DEFAULT 'normal', context TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE ticket_messages (
     id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
     user_id TEXT REFERENCES users(id) ON DELETE SET NULL, name TEXT, body TEXT NOT NULL,
     internal INTEGER NOT NULL DEFAULT 0, from_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
   CREATE INDEX tickets_user ON tickets (user_id);
   CREATE INDEX ticket_messages_ticket ON ticket_messages (ticket_id);`,
];

const clip = (s, n) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, n);

/** Only the technical details a ticket may carry, each trimmed. */
function cleanContext(c) {
  if (!c || typeof c !== 'object') return {};
  const out = {};
  for (const k of ['page', 'version', 'browser', 'screen', 'plugin', 'viewAs']) if (c[k] != null) out[k] = clip(c[k], 400);
  if (Array.isArray(c.errors)) out.errors = c.errors.slice(-10).map((e) => clip(e, 500));
  return out;
}

export function supportRoutes({ q, newId, now, bump }) {
  const ticketJson = (t, { admin }) => ({
    id: t.id, n: t.n, kind: t.kind, title: t.title, body: t.body, status: t.status, priority: t.priority,
    org: t.org_name ? { id: t.org_id, name: t.org_name } : null, email: admin ? t.email : undefined, name: t.name,
    context: JSON.parse(t.context || '{}'), createdAt: t.created_at, updatedAt: t.updated_at,
    replies: t.replies ?? undefined, lastFromAdmin: t.last_from_admin != null ? !!t.last_from_admin : undefined,
  });
  const byId = (id) => q('SELECT t.*, o.name AS org_name FROM tickets t LEFT JOIN orgs o ON o.id = t.org_id WHERE t.id = ?').get(id);
  const canSee = (a, t) => a.isSuper || (a.user && t.user_id === a.user.id);
  const ticketUrl = (t, admin) => urlFor(undefined, admin ? `/platform.html#support/${t.id}` : `/help.html#support/${t.id}`);

  async function handle(req, res, a, path) {
    if (!path.startsWith('/api/tickets')) return false;
    const method = req.method;
    if (!a.user) throw new HttpError(401, 'Sign in to use support');
    let m;

    if (path === '/api/tickets' && method === 'POST') {
      bump(`ticket:${a.user.id}`, 10);
      const body = await readJson(req, 200_000);
      const kind = KINDS.includes(body?.kind) ? body.kind : 'other';
      const title = clip(body?.title, 200);
      const text = clip(body?.body, 20_000);
      if (!title) throw new HttpError(400, 'Give it a short title');
      if (!text) throw new HttpError(400, 'Say a little more about it');
      const id = newId('tkt');
      const n = (q('SELECT MAX(n) AS n FROM tickets').get()?.n ?? 0) + 1;
      const stamp = now();
      q(`INSERT INTO tickets (id, n, org_id, user_id, email, name, kind, title, body, status, priority, context, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`).run(
        id, n, a.org?.id ?? null, a.user.id, a.user.email, a.user.name, kind, title, text,
        kind === 'problem' && body?.blocking ? 'high' : 'normal', JSON.stringify(cleanContext(body?.context)), stamp, stamp);
      const t = byId(id);
      const mail = letter({
        greeting: `New ${KIND_LABEL[kind].toLowerCase()} #${n} from ${a.user.name || a.user.email}${a.org ? ` (${a.org.name})` : ''}:`,
        lines: [title, text.length > 1200 ? `${text.slice(0, 1200)}…` : text],
        link: ticketUrl(t, true), linkLabel: 'Open it in Platform admin → Support',
      });
      sendMail({ to: config.supportEmail, subject: `[Dashi #${n}] ${title}`, ...mail, replyTo: a.user.email });
      return json(res, 201, ticketJson(t, { admin: a.isSuper }));
    }

    if (path === '/api/tickets' && method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const all = a.isSuper && url.searchParams.get('all') === '1';
      const status = url.searchParams.get('status');
      const where = [];
      const args = [];
      if (!all) { where.push('t.user_id = ?'); args.push(a.user.id); }
      if (status === 'active') where.push("t.status IN ('new', 'open', 'waiting')");
      else if (STATUSES.includes(status)) { where.push('t.status = ?'); args.push(status); }
      const rows = q(`SELECT t.*, o.name AS org_name,
          (SELECT COUNT(*) FROM ticket_messages mm WHERE mm.ticket_id = t.id AND mm.internal = 0) AS replies,
          (SELECT from_admin FROM ticket_messages mm WHERE mm.ticket_id = t.id AND mm.internal = 0 ORDER BY mm.created_at DESC LIMIT 1) AS last_from_admin
        FROM tickets t LEFT JOIN orgs o ON o.id = t.org_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY CASE t.status WHEN 'new' THEN 0 WHEN 'open' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
                 CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC
        LIMIT 500`).all(...args);
      const counts = a.isSuper ? Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status').all().map((r) => [r.status, r.n])) : undefined;
      return json(res, 200, { tickets: rows.map((t) => ticketJson(t, { admin: a.isSuper })), counts });
    }

    if ((m = path.match(/^\/api\/tickets\/([\w-]+)$/))) {
      const t = byId(m[1]);
      if (!t || !canSee(a, t)) throw new HttpError(404, 'No such ticket');
      if (method === 'GET') {
        const messages = q(`SELECT * FROM ticket_messages WHERE ticket_id = ? ${a.isSuper ? '' : 'AND internal = 0'} ORDER BY created_at`).all(t.id)
          .map((x) => ({ id: x.id, name: x.name, body: x.body, internal: !!x.internal, fromAdmin: !!x.from_admin, mine: x.user_id === a.user.id, at: x.created_at }));
        return json(res, 200, { ticket: ticketJson(t, { admin: a.isSuper }), messages });
      }
      if (method === 'PATCH') {
        const body = await readJson(req, 10_000);
        const patch = {};
        if (a.isSuper) {
          if (STATUSES.includes(body?.status)) patch.status = body.status;
          if (PRIORITIES.includes(body?.priority)) patch.priority = body.priority;
        } else if (['closed', 'open'].includes(body?.status)) patch.status = body.status;
        if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change');
        q(`UPDATE tickets SET ${Object.keys(patch).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...Object.values(patch), now(), t.id);
        return json(res, 200, ticketJson(byId(t.id), { admin: a.isSuper }));
      }
    }

    if ((m = path.match(/^\/api\/tickets\/([\w-]+)\/messages$/)) && method === 'POST') {
      const t = byId(m[1]);
      if (!t || !canSee(a, t)) throw new HttpError(404, 'No such ticket');
      bump(`ticket-reply:${a.user.id}`, 60);
      const body = await readJson(req, 100_000);
      const text = clip(body?.body, 20_000);
      if (!text) throw new HttpError(400, 'Write something first');
      const internal = a.isSuper && !!body?.internal;
      const fromAdmin = a.isSuper && t.user_id !== a.user.id;
      q('INSERT INTO ticket_messages (id, ticket_id, user_id, name, body, internal, from_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(newId('msg'), t.id, a.user.id, a.user.name || a.user.email, text, internal ? 1 : 0, fromAdmin ? 1 : 0, now());
      // An answer waits on the reporter; a reply from the reporter puts it back in the queue.
      const status = internal ? t.status : fromAdmin ? (t.status === 'new' || t.status === 'open' ? 'waiting' : t.status) : (['waiting', 'resolved'].includes(t.status) ? 'open' : t.status);
      q('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), t.id);
      if (!internal && fromAdmin && t.email) {
        sendMail({ to: t.email, subject: `Re: [Dashi #${t.n}] ${t.title}`, ...letter({
          greeting: `Hi ${t.name || ''},`.replace(' ,', ','), lines: [`There’s a reply to your ${KIND_LABEL[t.kind].toLowerCase()} “${t.title}”:`, text],
          link: ticketUrl(t, false), linkLabel: 'See the conversation and reply',
        }) });
      } else if (!internal && !fromAdmin) {
        sendMail({ to: config.supportEmail, subject: `Re: [Dashi #${t.n}] ${t.title}`, ...letter({
          greeting: `${a.user.name || a.user.email} replied on #${t.n}:`, lines: [text], link: ticketUrl(t, true), linkLabel: 'Open it in Platform admin → Support',
        }), replyTo: a.user.email });
      }
      return json(res, 201, { ok: true, status });
    }
    return false;
  }
  return { handle };
}
