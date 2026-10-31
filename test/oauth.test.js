import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { enabledProviders, authorizeUrl, finish } from '../server/oauth.js';

test('a provider is on only when both of its keys are set', () => {
  assert.deepEqual(Object.keys(enabledProviders({})), []);
  assert.deepEqual(Object.keys(enabledProviders({ FACEBOOK_APP_ID: '1' })), []);
  const on = enabledProviders({ GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'gs', FACEBOOK_APP_ID: 'f', FACEBOOK_APP_SECRET: 'fs', MICROSOFT_CLIENT_ID: 'm', MICROSOFT_CLIENT_SECRET: 'ms' });
  assert.deepEqual(Object.keys(on), ['google', 'facebook', 'microsoft']);
  const url = new URL(authorizeUrl(on.facebook, { redirectUri: 'https://dashi.test/auth/facebook/callback', state: 'abc' }));
  assert.equal(url.host, 'www.facebook.com');
  assert.equal(url.searchParams.get('client_id'), 'f');
  assert.equal(url.searchParams.get('state'), 'abc');
  assert.equal(url.searchParams.get('scope'), 'email public_profile');
});

test('Facebook: the code becomes a verified email, with an app secret proof', async () => {
  const fb = enabledProviders({ FACEBOOK_APP_ID: 'f', FACEBOOK_APP_SECRET: 'shh' }).facebook;
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'TOKEN' }));
    return new Response(JSON.stringify({ id: '42', name: 'Ama', email: 'ama@example.org' }));
  };
  try {
    const who = await finish(fb, { code: 'CODE', redirectUri: 'https://dashi.test/auth/facebook/callback' });
    assert.deepEqual(who, { sub: '42', email: 'ama@example.org', name: 'Ama', verified: true });
    assert.match(calls[0].opts.body.toString(), /code=CODE/);
    const me = new URL(calls[1].url);
    assert.equal(me.searchParams.get('appsecret_proof'), createHmac('sha256', 'shh').update('TOKEN').digest('hex'));
    // No email shared: not verified, so no sign-in.
    globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('access_token?') || String(url).endsWith('access_token') ? { access_token: 'T' } : { id: '7', name: 'No Email' }));
    assert.equal((await finish(fb, { code: 'C', redirectUri: 'x' })).verified, false);
  } finally {
    globalThis.fetch = real;
  }
});
