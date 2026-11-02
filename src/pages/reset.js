import { h } from '../ui/dom.js';
import { Wordmark } from '../ui/Wordmark.js';

/**
 * Passwords by email.
 *   reset.html                    ask for a link: "Forgot your password?"
 *   reset.html?token=…            set a new password from that link
 *   reset.html?token=…&invite=1   the same, from an invitation to an org
 */
const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const tokenParam = params.get('token');
const invited = params.get('invite') === '1';
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) });
const message = h('p', { class: 'login-error', role: 'alert' });
const box = (...children) => app.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login-box card' }, h('p', { class: 'eyebrow' }, Wordmark(20)), ...children)));

if (tokenParam) {
  // Keep the token out of the address bar (and so out of history and screenshots).
  history.replaceState(null, '', location.pathname + (invited ? '?invite=1' : ''));
  const pw = h('input', { class: 'input w-full', type: 'password', autocomplete: 'new-password', required: true, minlength: 10, 'aria-label': 'New password' });
  const again = h('input', { class: 'input w-full', type: 'password', autocomplete: 'new-password', required: true, 'aria-label': 'The same again' });
  box(
    h('h1', {}, invited ? 'Welcome to Dashi' : 'Set a new password'),
    invited && h('p', {}, 'Choose a password to sign in with. You can change it any time.'),
    h('form', { class: 'login-form', onsubmit: async (e) => {
      e.preventDefault();
      message.textContent = '';
      if (pw.value !== again.value) { message.textContent = 'Those two don’t match.'; return; }
      const res = await post('/api/auth/reset', { token: tokenParam, password: pw.value });
      if (res.ok) location.assign('/');
      else message.textContent = (await res.json().catch(() => ({}))).error ?? 'That didn’t work.';
    } },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'New password (10 characters or more; a few words is good)'), pw),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'The same again'), again),
      message,
      h('button', { class: 'btn btn-primary w-full', type: 'submit' }, invited ? 'Set password and sign in' : 'Save and sign in')));
  pw.focus();
} else {
  const email = h('input', { class: 'input w-full', type: 'email', autocomplete: 'username', required: true, placeholder: 'you@example.org', 'aria-label': 'Email' });
  box(
    h('h1', {}, 'Forgot your password?'),
    h('p', {}, 'Type the email you sign in with. We’ll send a link to set a new password.'),
    h('form', { class: 'login-form', onsubmit: async (e) => {
      e.preventDefault();
      const res = await post('/api/auth/reset/request', { email: email.value });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { message.textContent = out.error ?? 'That didn’t work.'; return; }
      box(h('h1', {}, 'Check your email'),
        h('p', {}, `If ${email.value} has a Dashi account, a link to set a new password is on its way. It works for an hour.`),
        !out.mail && h('p', { class: 'muted small' }, 'This server has no email service set up yet, so the link is in the server’s log.'),
        h('p', {}, h('a', { href: '/login.html' }, 'Back to sign in')));
    } },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Email'), email),
      message,
      h('button', { class: 'btn btn-primary w-full', type: 'submit' }, 'Send me a link'),
      h('p', { class: 'muted small' }, h('a', { href: '/login.html' }, 'Back to sign in'))));
  email.focus();
}
