/**
 * Sign-in with another account (Google, Facebook, Microsoft…), all through
 * one flow:
 *
 *   /auth/<provider>            → the provider's consent page (state saved for 10 minutes)
 *   /auth/<provider>/callback   ← back here on the root domain with a code;
 *                                 swap it for a token, read the verified email,
 *                                 find the person, hand the sign-in to the org's address
 *
 * A provider is switched on by setting its two environment variables.
 * Adding one is an entry in PROVIDERS: where to send people, where to swap
 * the code, and how to read { sub, email, name, verified } from its
 * profile. Nobody gets an account by signing in: their email has to be on
 * an org's staff list first (or be the platform admin's).
 */
import { createHmac } from 'node:crypto';

const FB = 'https://graph.facebook.com/v21.0';

export const PROVIDERS = {
  google: {
    label: 'Google',
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    extra: { prompt: 'select_account' },
    async profile(tok) {
      const info = await getJson('https://openidconnect.googleapis.com/v1/userinfo', { authorization: `Bearer ${tok.access_token}` });
      return { sub: info.sub, email: info.email, name: info.name, verified: info.email_verified !== false };
    },
  },
  facebook: {
    label: 'Facebook',
    env: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    authorize: 'https://www.facebook.com/v21.0/dialog/oauth',
    token: `${FB}/oauth/access_token`,
    scope: 'email public_profile',
    extra: { auth_type: 'rerequest' },
    async profile(tok, creds) {
      // appsecret_proof ties the call to this app, so a stolen token is no use elsewhere.
      const proof = createHmac('sha256', creds.secret).update(tok.access_token).digest('hex');
      const info = await getJson(`${FB}/me?${new URLSearchParams({ fields: 'id,name,email', access_token: tok.access_token, appsecret_proof: proof })}`);
      // Facebook only shares an email address the person has confirmed.
      return { sub: info.id, email: info.email, name: info.name, verified: !!info.email };
    },
  },
  // Ready for Microsoft 365 and Outlook accounts: set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.
  microsoft: {
    label: 'Microsoft',
    env: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'openid email profile',
    extra: { prompt: 'select_account' },
    async profile(tok) {
      const info = await getJson('https://graph.microsoft.com/oidc/userinfo', { authorization: `Bearer ${tok.access_token}` });
      // Work and school accounts' emails are managed by the organisation; personal ones are verified by Microsoft.
      return { sub: info.sub, email: info.email, name: info.name, verified: !!info.email };
    },
  },
};

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${new URL(url).host} said ${res.status}`);
  return res.json();
}

/** The providers switched on by the environment: { id: { ...provider, creds: { id, secret } } }. */
export function enabledProviders(env = process.env) {
  const out = {};
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const [cid, secret] = p.env.map((k) => env[k]);
    if (cid && secret) out[id] = { ...p, id, creds: { id: cid, secret } };
  }
  return out;
}

/** Where to send someone to sign in. */
export function authorizeUrl(p, { redirectUri, state }) {
  return `${p.authorize}?${new URLSearchParams({ client_id: p.creds.id, redirect_uri: redirectUri, response_type: 'code', scope: p.scope, state, ...p.extra })}`;
}

/** Swap the code for a token and read who it is. */
export async function finish(p, { code, redirectUri }) {
  const res = await fetch(p.token, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ code, client_id: p.creds.id, client_secret: p.creds.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`${p.label} didn’t confirm the sign-in (${res.status})`);
  return p.profile(await res.json(), p.creds);
}
