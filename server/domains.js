/**
 * Custom domains: an org on a plan with `customDomain` serves its app and
 * public site at its own address (riverbend.org) as well as its Dashi one.
 * The org manages its own DNS; Dashi says what to set and checks it.
 *
 *   1. The org admin adds the domain (Organisation → Domain). It starts as
 *      `pending`, with a random token.
 *   2. They add two DNS records at their registrar:
 *        TXT   _dashi.<domain>   dashi-verify=<token>     proves the domain is theirs
 *        CNAME <domain>          <DNS_TARGET>             sends visitors here
 *        (a bare domain, riverbend.org, can't have a CNAME: A/AAAA records
 *         to the platform's addresses instead, or the registrar's ALIAS)
 *   3. "Check now" (and an hourly check for a week) looks them up. With the
 *      TXT record the domain is `verified`; once it also points here it is
 *      `active`, and only then does the server answer for it.
 *   4. HTTPS: Caddy (deploy/Caddyfile) gets a certificate on the first
 *      visit, after asking /tls-ask, which only says yes to active domains.
 *      On Fly.io, set FLY_API_TOKEN and the certificate is requested for you.
 *
 * Removing a domain stops it at once. The platform admin sees every domain
 * and can switch one on by hand (Platform admin → Organisations).
 */
import { promises as dnsp } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { HttpError, json, readJson } from './http.js';

const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const WEEK = 7 * 864e5;

/** Where custom domains should point: DNS_TARGET, or the platform's own domain. */
export const dnsTarget = () => config.dnsTarget || config.baseDomain;

/** A bare domain (riverbend.org) rather than a subdomain (www.riverbend.org). Rough, but right for common endings. */
export const isApex = (host) => {
  const parts = host.split('.');
  const twoPart = /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(host);
  return parts.length === (twoPart ? 3 : 2);
};

/** The DNS records an org should set for a domain. */
export async function recordsFor(host, token, resolver = dnsp) {
  const records = [{ type: 'TXT', name: `_dashi.${host}`, value: `dashi-verify=${token}`, why: 'Proves the domain is yours.' }];
  if (isApex(host)) {
    const v4 = await resolver.resolve4(dnsTarget()).catch(() => []);
    const v6 = await resolver.resolve6(dnsTarget()).catch(() => []);
    for (const ip of v4) records.push({ type: 'A', name: host, value: ip, why: 'Sends visitors to Dashi.' });
    for (const ip of v6) records.push({ type: 'AAAA', name: host, value: ip, why: 'Sends visitors to Dashi (IPv6).' });
    if (!v4.length && !v6.length) records.push({ type: 'ALIAS', name: host, value: dnsTarget(), why: 'Sends visitors to Dashi. If your registrar has no ALIAS or ANAME record, use www instead.' });
  } else {
    records.push({ type: 'CNAME', name: host, value: dnsTarget(), why: 'Sends visitors to Dashi.' });
  }
  return records;
}

/** Look the domain up: { owned, pointed, found: [what DNS says] }. */
export async function checkDomain(host, token, resolver = dnsp) {
  const found = [];
  const txt = (await resolver.resolveTxt(`_dashi.${host}`).catch(() => [])).map((parts) => parts.join(''));
  if (txt.length) found.push(`TXT _dashi.${host}: ${txt.join(', ')}`);
  const owned = txt.includes(`dashi-verify=${token}`);
  const target = dnsTarget();
  const cname = await resolver.resolveCname(host).catch(() => []);
  if (cname.length) found.push(`CNAME ${host}: ${cname.join(', ')}`);
  let pointed = cname.some((c) => c.replace(/\.$/, '').toLowerCase() === target || c.toLowerCase().endsWith(`.${config.baseDomain}`));
  if (!pointed) {
    const [mine, theirs] = await Promise.all([resolver.resolve4(target).catch(() => []), resolver.resolve4(host).catch(() => [])]);
    if (theirs.length) found.push(`A ${host}: ${theirs.join(', ')}`);
    pointed = theirs.length > 0 && theirs.every((ip) => mine.includes(ip));
  }
  return { owned, pointed, found };
}

/** Ask Fly.io for a certificate, when the platform runs there with FLY_API_TOKEN set. */
async function flyCertificate(host) {
  if (!process.env.FLY_API_TOKEN || !process.env.FLY_APP_NAME) return null;
  const res = await fetch('https://api.fly.io/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.FLY_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'mutation($appId: ID!, $hostname: String!) { addCertificate(appId: $appId, hostname: $hostname) { certificate { hostname } } }', variables: { appId: process.env.FLY_APP_NAME, hostname: host } }),
  }).catch(() => null);
  return res?.ok ? 'requested' : 'failed';
}

export function domainRoutes({ q, now, planOf, announce, resolver = dnsp }) {
  const rowsOf = (orgId) => q('SELECT * FROM domains WHERE org_id = ? ORDER BY is_primary DESC, host').all(orgId);
  const shape = async (d) => ({
    host: d.host, status: d.status, primary: !!d.is_primary, checkedAt: d.checked_at, note: d.note,
    records: d.status === 'active' ? [] : await recordsFor(d.host, d.token, resolver),
  });

  /** Check one domain and move it on: pending → verified → active. */
  async function check(d) {
    const r = await checkDomain(d.host, d.token, resolver);
    const status = r.owned && r.pointed ? 'active' : r.owned ? 'verified' : d.status === 'active' ? 'active' : 'pending';
    let note = r.found.length ? `Found ${r.found.join('; ')}.` : 'No records found yet. DNS changes can take an hour or two to show.';
    if (status === 'active' && d.status !== 'active') {
      const cert = await flyCertificate(d.host);
      note = cert === 'requested' ? 'Working. A certificate has been requested; HTTPS starts in a few minutes.' : 'Working. HTTPS starts on the first visit.';
    }
    q('UPDATE domains SET status = ?, checked_at = ?, note = ? WHERE host = ?').run(status, Date.now(), note, d.host);
    if (status !== d.status) announce?.(d.org_id, 'org', null);
    return { ...d, status, note, checked_at: Date.now() };
  }

  /** Every hour, check domains added in the last week that aren't working yet. */
  async function sweep() {
    for (const d of q("SELECT * FROM domains WHERE status != 'active' AND created_at > ?").all(Date.now() - WEEK)) await check(d).catch(() => {});
  }

  async function handle(req, res, a, path) {
    const method = req.method;
    let m;
    if (!path.startsWith('/api/domains')) return false;
    if (!a.org || !a.canAdmin) throw new HttpError(403, 'Only the organisation’s admin manages its domains');
    if (path === '/api/domains' && method === 'GET') {
      return json(res, 200, { target: dnsTarget(), allowed: !!planOf(a.org).features.customDomain, domains: await Promise.all(rowsOf(a.org.id).map(shape)) });
    }
    if (path === '/api/domains' && method === 'POST') {
      if (!planOf(a.org).features.customDomain) throw new HttpError(403, 'Your own domain comes with the Custom plan.');
      const host = String((await readJson(req, 2000))?.host ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
      if (!HOST.test(host)) throw new HttpError(400, 'That isn’t a domain name. Write it like riverbend.org or www.riverbend.org.');
      if (host === config.baseDomain || host.endsWith(`.${config.baseDomain}`)) throw new HttpError(400, `Addresses on ${config.baseDomain} come with Dashi already.`);
      if (q('SELECT 1 FROM domains WHERE host = ?').get(host)) throw new HttpError(409, 'That domain is already on Dashi.');
      if (rowsOf(a.org.id).length >= 5) throw new HttpError(400, 'An organisation can have up to five domains.');
      q('INSERT INTO domains (host, org_id, status, token, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(host, a.org.id, 'pending', randomBytes(12).toString('hex'), rowsOf(a.org.id).length ? 0 : 1, Date.now());
      return json(res, 201, await shape(q('SELECT * FROM domains WHERE host = ?').get(host)));
    }
    if ((m = path.match(/^\/api\/domains\/([a-z0-9.-]+)(\/check|\/primary)?$/))) {
      const d = q('SELECT * FROM domains WHERE host = ? AND org_id = ?').get(m[1], a.org.id);
      if (!d) throw new HttpError(404, 'No such domain');
      if (m[2] === '/check' && method === 'POST') return json(res, 200, await shape(await check(d)));
      if (m[2] === '/primary' && method === 'POST') {
        q('UPDATE domains SET is_primary = (host = ?) WHERE org_id = ?').run(d.host, a.org.id);
        return json(res, 200, { ok: true });
      }
      if (!m[2] && method === 'DELETE') {
        q('DELETE FROM domains WHERE host = ?').run(d.host);
        announce?.(a.org.id, 'org', null);
        return json(res, 200, { ok: true });
      }
    }
    return false;
  }

  /** The platform admin: every domain, and switching one on by hand. */
  async function admin(req, res, path) {
    let m;
    if (path === '/api/admin/domains' && req.method === 'GET') {
      return json(res, 200, q('SELECT d.host, d.status, d.is_primary, d.checked_at, d.note, o.name AS org, o.id AS org_id FROM domains d JOIN orgs o ON o.id = d.org_id ORDER BY o.name, d.host').all());
    }
    if ((m = path.match(/^\/api\/admin\/domains\/([a-z0-9.-]+)\/(activate|check)$/)) && req.method === 'POST') {
      const d = q('SELECT * FROM domains WHERE host = ?').get(m[1]);
      if (!d) throw new HttpError(404, 'No such domain');
      if (m[2] === 'check') return json(res, 200, await shape(await check(d)));
      q("UPDATE domains SET status = 'active', note = 'Switched on by the platform admin.', checked_at = ? WHERE host = ?").run(Date.now(), d.host);
      announce?.(d.org_id, 'org', null);
      return json(res, 200, { ok: true });
    }
    return false;
  }

  return { handle, admin, sweep, check };
}
