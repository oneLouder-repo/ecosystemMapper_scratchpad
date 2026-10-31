import { h } from '../ui/dom.js';
import { Wordmark } from '../ui/Wordmark.js';
import { initials } from '../platform/org.js';

/**
 * Sign in to the hosted platform: with Google, with an email and password,
 * or (on a test server with dev sign-in on) as anyone, to see the platform
 * as they do. Afterwards it goes back to ?next=.
 */
const app = document.querySelector('#app');
const next = new URLSearchParams(location.search).get('next') || '/';
const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) });

let options;
try {
  const res = await fetch('/api/auth/options');
  if (!res.ok) throw new Error();
  options = await res.json();
} catch {
  app.replaceChildren(h('div', { class: 'login-box card' },
    h('h1', {}, 'Sign-in needs the server'),
    h('p', {}, 'This copy is running without the platform server, so there are no accounts. Everything still works in your browser: ', h('a', { href: 'index.html' }, 'open the dashboard'), '.')));
  throw new Error('No server');
}

/** A letter in each provider's colour, beside its name (no logos to license). */
const MARKS = { google: 'G', facebook: 'f', microsoft: '⊞' };

const message = h('p', { class: 'login-error', role: 'alert' });
const email = h('input', { class: 'input w-full', type: 'email', name: 'email', autocomplete: 'username', required: true, placeholder: 'you@example.org' });
const password = h('input', { class: 'input w-full', type: 'password', name: 'password', autocomplete: 'current-password', required: true });

app.replaceChildren(h('div', { class: 'login-wrap' },
  h('div', { class: 'login-box card' },
    h('p', { class: 'eyebrow' }, Wordmark(20)),
    h('h1', {}, options.org ? `Sign in to ${options.org.name}` : 'Sign in'),
    (options.providers ?? []).map((p) => h('a', { class: `btn w-full provider-btn provider-${p.id}`, href: `/auth/${p.id}?next=${encodeURIComponent(safeNext)}` },
      h('span', { class: 'provider-mark', 'aria-hidden': 'true' }, MARKS[p.id] ?? p.label[0]), `Continue with ${p.label}`)),
    options.providers?.length > 0 && h('div', { class: 'divider' }, 'or'),
    h('form', { class: 'login-form', onsubmit: async (e) => {
      e.preventDefault();
      message.textContent = '';
      const res = await post('/api/auth/password', { email: email.value, password: password.value });
      if (res.ok) location.assign(safeNext);
      else message.textContent = (await res.json().catch(() => ({}))).error ?? 'That didn’t work.';
    } },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Email'), email),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Password'), password),
      message,
      h('button', { class: 'btn btn-primary w-full', type: 'submit' }, 'Sign in')),
    h('p', { class: 'muted small' }, 'No account? Your organisation’s admin adds you to its staff list in Organisation settings.')),
  options.dev && h('section', { class: 'login-box card dev-login' },
    h('h2', {}, 'Test sign-in'),
    h('p', { class: 'muted small' }, 'Dev sign-in is on, so you can be anyone. Turn it off on a live server (DEV_LOGIN=false).'),
    h('ul', { class: 'dev-users' }, options.dev.map((u) =>
      h('li', {}, h('button', { class: 'dev-user', onclick: async () => {
        const res = await post('/api/auth/dev', { userId: u.id });
        if (res.ok) location.assign(safeNext);
      } },
        h('span', { class: 'avatar-initials', style: 'width:30px;height:30px;font-size:12px' }, initials(u.name)),
        h('span', {}, h('strong', {}, u.name, u.isSuper && h('span', { class: 'badge badge-sm badge-primary', style: 'margin-left:6px' }, 'platform admin')),
          h('small', {}, [u.email, ...u.orgs].join(' · ')))))))),
));
email.focus();
