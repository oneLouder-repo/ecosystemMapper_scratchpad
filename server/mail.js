/**
 * Email: password resets, invitations, and support-ticket notes. Sent
 * through a transactional email service's HTTP API, so there is nothing to
 * install:
 *
 *   MAIL_PROVIDER=postmark  MAIL_API_KEY=<server token>   (postmarkapp.com)
 *   MAIL_PROVIDER=resend    MAIL_API_KEY=<api key>        (resend.com)
 *   MAIL_FROM="Dashi <hello@yourdomain.ca>"               a sender the service has verified
 *
 * With no key, messages are printed to the server log instead (and kept in
 * `outbox` for tests), so sign-in links still work on a test server: copy
 * them from `fly logs` or the terminal.
 *
 * Sending never throws: a failed send is logged and reported as { ok: false }.
 */
import { config } from './config.js';

/** Messages "sent" without a provider, newest last (tests read these). */
export const outbox = [];

export const mailEnabled = () => !!(config.mail.provider && config.mail.apiKey);

export async function sendMail({ to, subject, text, html, replyTo }) {
  const msg = { to: String(to), subject: String(subject), text: String(text), html, replyTo };
  if (!mailEnabled()) {
    outbox.push(msg);
    if (outbox.length > 50) outbox.shift();
    if (!config.quietMail) console.log(`\n[mail, not sent: no MAIL_API_KEY] To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
    return { ok: true, logged: true };
  }
  try {
    const res = config.mail.provider === 'resend'
      ? await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${config.mail.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: config.mail.from, to: [msg.to], subject: msg.subject, text: msg.text, ...(html && { html }), ...(replyTo && { reply_to: replyTo }) }),
          signal: AbortSignal.timeout(10_000),
        })
      : await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'x-postmark-server-token': config.mail.apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ From: config.mail.from, To: msg.to, Subject: msg.subject, TextBody: msg.text, ...(html && { HtmlBody: html }), ...(replyTo && { ReplyTo: replyTo }), MessageStream: 'outbound' }),
          signal: AbortSignal.timeout(10_000),
        });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    return { ok: true };
  } catch (err) {
    console.error(`Email to ${msg.to} (“${msg.subject}”) failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

/** A plain, readable email: a greeting, a few lines, one link. */
export function letter({ greeting, lines = [], link, linkLabel, footer }) {
  const text = [greeting, '', ...lines, ...(link ? ['', `${linkLabel}: ${link}`] : []), '', footer ?? '— Dashi'].join('\n');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<div style="font:16px/1.5 system-ui,sans-serif;max-width:560px;color:#222">
<p>${esc(greeting)}</p>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;background:#1f6f5c;color:#fff;border-radius:8px;text-decoration:none">${esc(linkLabel)}</a></p><p style="font-size:13px;color:#666">Or paste this address into your browser: ${esc(link)}</p>` : ''}
<p style="color:#666">${esc(footer ?? '— Dashi')}</p></div>`;
  return { text, html };
}
