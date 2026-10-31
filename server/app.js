/**
 * The platform server: every request, in one handler.
 *
 * Addresses. The platform's own domain (config.baseDomain) is the root
 * site: sign-in and the platform admin page. Each org has a subdomain,
 * <slug>.<baseDomain>, which serves both its staff app and its public
 * site: a signed-in member landing on / gets the dashboard; anyone else
 * gets the public site. A `domains` table can map any other host name to
 * an org too, so custom domains later need no change here.
 *
 * Sign-in. A session cookie belongs to one host. To carry a sign-in to
 * another host (switching org, or coming back from Google, whose callback
 * is on the root domain), the server issues a one-time handoff token that
 * the other host exchanges for its own cookie. That works the same for
 * subdomains and for custom domains.
 *
 * Roles (memberships.role, from the org's staff list): admin (everything,
 * including the org's settings), lead and staff (edit), viewer (read
 * only). The platform admin (users.is_super) can open and change any org,
 * and can "view as" any staff member.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { createWriteStream, createReadStream, mkdirSync, rmSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { config, urlFor, orgHost } from './config.js';
import { now } from './db.js';
import { HttpError, send, json, redirect, page, readJson, parseCookies, cookie, sendFile, clientIp, securityHeaders } from './http.js';
import { publicDocs, mediaIsPublic } from './public.js';
import { uploadRoutes } from './uploads.js';
import { domainRoutes } from './domains.js';
import { runAudit } from './audit.js';
import { backupNow, listBackups } from './backup.js';
import { PROVIDERS, authorizeUrl, finish } from './oauth.js';
import { zipStream, zipSize } from '../src/core/zip.js';
import { showArchive } from '../src/platform/showArchive.js';
import { blankOrg, migrateOrg } from '../src/platform/org.js';
import { planFor, allPlans, overLimit, usageOf, PLAN_IDS } from '../src/platform/plans.js';
import { siteContent } from '../src/platform/salesSite.js';
import { blankStrategy } from '../src/platform/strategySeed.js';

const scrypt = promisify(scryptCb);
const COOKIE = 'tb_session';
const ROLES = ['admin', 'lead', 'staff', 'viewer'];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set(['www', 'api', 'admin', 'app', 'auth', 'mail', 'static', 'platform']);
const DOC_NAME = /^[\w-]{1,64}(\/[\w-]{1,64})?$/;
const today = () => new Date().toISOString().slice(0, 10);
export const newId = (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`;
const token = () => randomBytes(32).toString('base64url');
/**
 * Session and handoff tokens are kept as their SHA-256 in the database, so a
 * copy of the database (a backup, a leak) holds nothing anyone can sign in with.
 */
export const digest = (t) => createHash('sha256').update(String(t)).digest('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function checkPassword(password, stored) {
  if (!stored?.startsWith('scrypt$')) return false;
  const [, salt, key] = stored.split('$');
  const want = Buffer.from(key, 'base64url');
  const got = await scrypt(password, Buffer.from(salt, 'base64url'), want.length);
  return timingSafeEqual(want, got);
}

export function createApp(db, options = {}) {
  const q = (sql) => db.prepare(sql);

  /* ------------------------------------------------------------------ data */

  const orgById = (id) => q('SELECT * FROM orgs WHERE id = ?').get(id);
  const userById = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
  const userByEmail = (email) => q('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  const membership = (userId, orgId) => q('SELECT * FROM memberships WHERE user_id = ? AND org_id = ?').get(userId, orgId);
  const hostOf = (org) => q("SELECT host FROM domains WHERE org_id = ? AND status = 'active' ORDER BY is_primary DESC, host LIMIT 1").get(org.id)?.host ?? orgHost(org.slug);

  /** The platform admin's changes to the plans (Platform admin → Plans). */
  const planOverrides = () => JSON.parse(q("SELECT json FROM platform_docs WHERE name = 'plans'").get()?.json ?? '{}');
  /** An org's plan: its tier, the admin's changes to it, and its own limits. */
  const orgPlan = (o) => planFor(o?.plan, planOverrides(), JSON.parse(o?.limits || '{}'));
  /** What the platform admin decides for an org, carried on its org document (read only for the org). */
  const platformPart = (orgId) => {
    const o = orgById(orgId);
    const plan = orgPlan(o);
    // A plugin the plan doesn't include is paused, as if the admin had paused it.
    const paused = { ...JSON.parse(o?.paused_plugins || '{}') };
    for (const [id, on] of Object.entries(plan.plugins)) if (!on) paused[id] = true;
    return { tier: plan.id, plan, paused };
  };
  const withPlatform = (orgId, name, doc) => (name === 'org' && doc ? { ...doc, platform: platformPart(orgId) } : doc);
  function readDocs(orgId) {
    const docs = {};
    for (const row of q('SELECT name, json FROM docs WHERE org_id = ?').all(orgId)) docs[row.name] = withPlatform(orgId, row.name, JSON.parse(row.json));
    return docs;
  }
  const readDoc = (orgId, name) => {
    const row = q('SELECT json FROM docs WHERE org_id = ? AND name = ?').get(orgId, name);
    return row ? withPlatform(orgId, name, JSON.parse(row.json)) : null;
  };
  function writeDoc(orgId, name, doc, userId = null) {
    if (name === 'org' && doc?.platform) { doc = { ...doc }; delete doc.platform; }
    q(`INSERT INTO docs (org_id, name, json, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT (org_id, name) DO UPDATE SET json = excluded.json, version = version + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .run(orgId, name, JSON.stringify(doc), now(), userId);
  }

  function ensureUser({ email, name = '', isSuper = false }) {
    email = String(email).trim().toLowerCase();
    let user = userByEmail(email);
    if (!user) {
      const id = newId('user');
      q('INSERT INTO users (id, email, name, is_super, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, name || email.split('@')[0], isSuper ? 1 : 0, now());
      user = userById(id);
    } else if (isSuper && !user.is_super) {
      q('UPDATE users SET is_super = 1 WHERE id = ?').run(user.id);
      user = userById(user.id);
    }
    return user;
  }

  /**
   * Keep memberships in step with an org's staff list: everyone with an
   * email can sign in, with their staff record's role. Removing someone
   * from the staff list removes their access.
   */
  function syncStaff(orgId, orgDoc) {
    const staff = Object.values(orgDoc.staff ?? {}).filter((s) => /^[^@\s]+@[^@\s]+$/.test(s.email ?? ''));
    const keep = new Set();
    for (const s of staff) {
      const user = ensureUser({ email: s.email, name: s.name });
      keep.add(user.id);
      const role = ROLES.includes(s.roleId) ? s.roleId : 'staff';
      q(`INSERT INTO memberships (user_id, org_id, staff_id, role) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, org_id) DO UPDATE SET staff_id = excluded.staff_id, role = excluded.role`).run(user.id, orgId, s.id, role);
    }
    for (const m of q('SELECT user_id FROM memberships WHERE org_id = ?').all(orgId)) {
      if (!keep.has(m.user_id)) q('DELETE FROM memberships WHERE user_id = ? AND org_id = ?').run(m.user_id, orgId);
    }
  }

  /** Make an org, with its first documents (an example org's, or blank ones). */
  function createOrg({ id = newId('org'), slug, name, plan = 'free', docs, admin }) {
    slug = String(slug).toLowerCase();
    if (!SLUG.test(slug) || RESERVED.has(slug)) throw new HttpError(400, 'The address must be 1 to 40 letters, numbers or dashes, and not a reserved word.');
    if (q('SELECT 1 FROM orgs WHERE slug = ?').get(slug)) throw new HttpError(409, 'That address is taken.');
    q('INSERT INTO orgs (id, slug, name, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, slug, name, plan, 'active', now());
    if (!docs) {
      const org = blankOrg({ id, name, adminName: admin?.name || 'Admin' });
      org.staff['s-admin'].email = admin?.email?.toLowerCase() ?? '';
      docs = { org, strategy: blankStrategy(name) };
    }
    for (const [docName, doc] of Object.entries(docs)) writeDoc(id, docName, doc);
    syncStaff(id, docs.org);
    return orgById(id);
  }

  /** Bytes an org keeps: audio, library files and uploads in progress. */
  const storageUsed = (orgId) => q('SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE org_id = ?').get(orgId).n
    + q('SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE org_id = ?').get(orgId).n;

  function deleteOrg(id) {
    q('DELETE FROM orgs WHERE id = ?').run(id);
    rmSync(join(config.dataDir, 'media', id), { recursive: true, force: true });
    rmSync(join(config.dataDir, 'uploads', id), { recursive: true, force: true });
  }

  /* ------------------------------------------------------------- requests */

  /** Which org (if any) an address belongs to. */
  function tenant(req) {
    const host = String(req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
    if (host === config.baseDomain || host === `www.${config.baseDomain}` || host === '127.0.0.1' || host === '[::1]') return { host, root: true };
    const custom = q("SELECT org_id FROM domains WHERE host = ? AND status = 'active'").get(host);
    if (custom) return { host, org: orgById(custom.org_id) };
    if (host.endsWith(`.${config.baseDomain}`)) {
      const slug = host.slice(0, -config.baseDomain.length - 1);
      return { host, org: q('SELECT * FROM orgs WHERE slug = ?').get(slug) ?? null, slug };
    }
    return { host, unknown: true };
  }

  function sessionOf(req) {
    const id = parseCookies(req.headers.cookie)[COOKIE];
    if (!id) return null;
    const s = q('SELECT * FROM sessions WHERE id = ?').get(digest(id));
    if (!s || s.expires_at < Date.now()) return null;
    const user = userById(s.user_id);
    return user ? { ...s, user, viewAs: JSON.parse(s.view_as || '{}') } : null;
  }

  function startSession(res, userId) {
    const id = token();
    q('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(digest(id), userId, Date.now() + config.sessionDays * 864e5, now());
    res.setHeader('set-cookie', cookie(COOKIE, id, { maxAge: config.sessionDays * 86400, secure: config.https }));
  }

  /** Everything a request may do, worked out once. */
  function access(req) {
    const t = tenant(req);
    const s = sessionOf(req);
    const user = s?.user ?? null;
    const isSuper = !!user?.is_super;
    const org = t.org && (t.org.status === 'active' || isSuper) ? t.org : null;
    const m = user && org ? membership(user.id, org.id) : null;
    const role = isSuper ? 'admin' : m?.role ?? null;
    return {
      t, s, user, isSuper, org, role,
      member: !!(org && (m || isSuper)),
      canEdit: !!(org && (isSuper || (m && m.role !== 'viewer'))),
      canAdmin: !!(org && (isSuper || m?.role === 'admin')),
      staffId: (org && (s?.viewAs?.[org.id] ?? m?.staff_id)) ?? null,
      tag: s ? createHash('sha256').update(s.id).digest('base64url').slice(0, 12) : null,
    };
  }

  const userJson = (u) => u && { id: u.id, email: u.email, name: u.name, isSuper: !!u.is_super };
  function orgsFor(user) {
    if (!user) return [];
    const rows = user.is_super
      ? q('SELECT * FROM orgs ORDER BY name').all()
      : q("SELECT o.* FROM orgs o JOIN memberships m ON m.org_id = o.id WHERE m.user_id = ? AND o.status = 'active' ORDER BY o.name").all(user.id);
    return rows.map((o) => ({ id: o.id, slug: o.slug, name: o.name, plan: o.plan, status: o.status, url: urlFor(hostOf(o), '/') }));
  }

  /** Hand a sign-in to another host: a one-time token, good for a minute. */
  function handoff(res, userId, host, next = '/') {
    const t = token();
    q('INSERT INTO handoffs (token, user_id, host, expires_at) VALUES (?, ?, ?, ?)').run(digest(t), userId, host, Date.now() + 60_000);
    redirect(res, urlFor(host, `/auth/handoff?${new URLSearchParams({ token: t, next })}`));
  }
  const knownHost = (host) => host === config.baseDomain || !!q("SELECT 1 FROM domains WHERE host = ? AND status = 'active'").get(host)
    || (host.endsWith(`.${config.baseDomain}`) && !!q('SELECT 1 FROM orgs WHERE slug = ?').get(host.slice(0, -config.baseDomain.length - 1)));
  const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/');

  /* Live updates: each open page listens for "this document changed". */
  const listeners = new Map(); // orgId → Set of { res, member }
  function announce(orgId, name, by) {
    for (const l of listeners.get(orgId) ?? []) {
      // Visitors only hear about documents that can change what they see.
      if (!l.member && name.startsWith('map')) continue;
      l.res.write(`event: doc\ndata: ${JSON.stringify({ name, by })}\n\n`);
    }
  }

  const uploads = uploadRoutes({ q, newId, limitsOf: (org) => orgPlan(org).limits });
  const domains = domainRoutes({ q, planOf: orgPlan, announce: (...x) => announce(...x), resolver: options.resolver });
  setInterval(() => domains.sweep().catch(() => {}), 3600_000).unref();
  uploads.sweep();
  setInterval(uploads.sweep, 3600_000).unref();

  /*
   * Sign-in attempts, to slow down guessing: 20 per address and 10 per
   * account every 15 minutes. The per-account limit stops one person being
   * targeted from many addresses.
   */
  const attempts = new Map();
  function bump(key, max) {
    const a = attempts.get(key) ?? { n: 0, until: Date.now() + 15 * 60_000 };
    if (a.until < Date.now()) { a.n = 0; a.until = Date.now() + 15 * 60_000; }
    a.n += 1;
    attempts.set(key, a);
    if (a.n > max) throw new HttpError(429, 'Too many tries. Wait a few minutes.');
  }
  function throttle(req, email) {
    bump(`ip:${clientIp(req)}`, 20);
    if (email) bump(`email:${String(email).toLowerCase()}`, 10);
  }
  setInterval(() => { for (const [k, a] of attempts) if (a.until < Date.now()) attempts.delete(k); }, 15 * 60_000).unref();
  /* Expired sessions, handoffs and sign-in states, cleared hourly. */
  function clearExpired() {
    for (const t of ['sessions', 'handoffs', 'oauth_states']) q(`DELETE FROM ${t} WHERE expires_at < ?`).run(Date.now());
  }
  clearExpired();
  setInterval(clearExpired, 3600_000).unref();

  /* ---------------------------------------------------------------- routes */

  async function api(req, res, a, path, url) {
    const method = req.method;
    const mutating = method !== 'GET' && method !== 'HEAD';
    // Pages on this platform add this header; other sites' forms can't.
    if (mutating && req.headers['x-toolbox'] !== '1') throw new HttpError(403, 'Missing x-toolbox header');
    const needOrg = () => { if (!a.org) throw new HttpError(404, 'No organisation at this address'); };
    const needSuper = () => { if (!a.isSuper) throw new HttpError(403, 'Platform admin only'); };

    if (path === '/api/session' && method === 'GET') {
      const docs = a.org ? (a.member ? readDocs(a.org.id) : publicDocs(readDocs(a.org.id), today())) : {};
      return json(res, 200, {
        user: userJson(a.user),
        org: a.org && { id: a.org.id, slug: a.org.slug, name: a.org.name, plan: a.org.plan, status: a.org.status },
        role: a.role, staffId: a.staffId, member: a.member, canEdit: a.canEdit, canAdmin: a.canAdmin,
        canViewAs: a.member && (a.isSuper || config.devLogin),
        canEditHelp: a.isSuper,
        orgs: orgsFor(a.user),
        platformUrl: a.isSuper ? '/auth/root' : null,
        sessionTag: a.tag,
        limits: { uploadMb: a.org ? Math.min(config.maxUploadMb, orgPlan(a.org).limits.uploadMb ?? config.maxUploadMb) : config.maxUploadMb },
        docs,
      });
    }

    let m;
    if ((m = path.match(/^\/api\/docs\/(.+)$/))) {
      needOrg();
      const name = decodeURIComponent(m[1]);
      if (!DOC_NAME.test(name)) throw new HttpError(400, 'Bad document name');
      if (method === 'GET') {
        const doc = a.member ? readDoc(a.org.id, name) : publicDocs(readDocs(a.org.id), today())[name];
        return doc ? json(res, 200, doc) : json(res, 404, { error: 'No such document' });
      }
      if (method === 'PUT') {
        if (!a.canEdit || (name === 'org' && !a.canAdmin)) throw new HttpError(403, 'You can’t change this');
        const doc = await readJson(req, config.maxJsonMb * 1048576);
        if (!doc || typeof doc !== 'object') throw new HttpError(400, 'Not a document');
        // The plan: nothing new past its limits (what's already there can stay).
        const why = overLimit(orgPlan(a.org), name, readDoc(a.org.id, name), doc);
        if (why) throw new HttpError(403, why);
        if (name === 'org') {
          doc.id = a.org.id;
          migrateOrg(doc);
          syncStaff(a.org.id, doc);
          if (doc.name && doc.name !== a.org.name) q('UPDATE orgs SET name = ? WHERE id = ?').run(String(doc.name).slice(0, 200), a.org.id);
        }
        writeDoc(a.org.id, name, doc, a.user.id);
        announce(a.org.id, name, a.tag);
        return json(res, 200, { ok: true });
      }
    }

    // The org's plan and how much of it is used (Organisation → Plan).
    if (path === '/api/plan' && method === 'GET') {
      needOrg();
      if (!a.member) throw new HttpError(403, 'Members only');
      return json(res, 200, { plan: orgPlan(a.org), usage: { ...usageOf(readDocs(a.org.id)), storageMb: Math.round(storageUsed(a.org.id) / 1048576) }, plans: allPlans(planOverrides()) });
    }

    if (path === '/api/events' && method === 'GET') {
      needOrg();
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 5000\n\n');
      const l = { res, member: a.member };
      if (!listeners.has(a.org.id)) listeners.set(a.org.id, new Set());
      listeners.get(a.org.id).add(l);
      const beat = setInterval(() => res.write(': still here\n\n'), 25_000);
      req.on('close', () => { clearInterval(beat); listeners.get(a.org.id)?.delete(l); });
      return;
    }

    if (path.startsWith('/api/domains') && (await domains.handle(req, res, a, path)) !== false) return;
    if (path.startsWith('/api/uploads')) {
      needOrg();
      if ((await uploads.handle(req, res, a, path)) !== false) return;
    }
    if (path === '/api/media' && method === 'POST') {
      needOrg();
      if (!a.canEdit) throw new HttpError(403, 'You can’t upload here');
      const type = String(req.headers['content-type'] ?? '').split(';')[0];
      const filename = decodeURIComponent(String(req.headers['x-filename'] ?? 'upload')).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
      if (!/^audio\/(mpeg|mp3|wav|x-wav|wave|vnd\.wave)$/.test(type) && !/\.(mp3|wav)$/i.test(filename)) throw new HttpError(415, 'Upload an .mp3 or .wav file');
      const id = newId('media');
      const dir = join(config.dataDir, 'media', a.org.id);
      mkdirSync(dir, { recursive: true });
      const tmp = join(dir, `${id}.part`);
      let size = 0;
      const limit = config.maxUploadMb * 1048576;
      const counter = new Transform({ transform(chunk, _e, cb) { size += chunk.length; cb(size > limit ? new HttpError(413, 'Too large') : null, chunk); } });
      try {
        await pipeline(req, counter, createWriteStream(tmp));
      } catch (err) {
        try { unlinkSync(tmp); } catch { /* already gone */ }
        throw err instanceof HttpError ? err : new HttpError(400, 'The upload stopped');
      }
      renameSync(tmp, join(dir, id));
      const mimetype = /\.wav$/i.test(filename) || /wav/.test(type) ? 'audio/wav' : 'audio/mpeg';
      q('INSERT INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, a.org.id, filename, mimetype, size, now(), a.user.id);
      return json(res, 201, { id, size, mimetype });
    }
    if ((m = path.match(/^\/api\/media\/([\w-]+)$/)) && method === 'DELETE') {
      needOrg();
      if (!a.canEdit) throw new HttpError(403, 'You can’t delete this');
      const row = q('SELECT * FROM media WHERE id = ? AND org_id = ?').get(m[1], a.org.id);
      if (row) {
        q('DELETE FROM media WHERE id = ?').run(row.id);
        rmSync(join(config.dataDir, 'media', a.org.id, row.id), { force: true });
      }
      return json(res, 200, { ok: true });
    }

    if (path === '/api/view-as' && method === 'POST') {
      needOrg();
      if (!a.s || !a.member || !(a.isSuper || config.devLogin)) throw new HttpError(403, 'Only the platform admin can view as someone else');
      const { staffId } = await readJson(req, 10_000);
      const org = readDoc(a.org.id, 'org');
      if (staffId && !org?.staff?.[staffId]) throw new HttpError(400, 'No such person');
      const viewAs = { ...a.s.viewAs, [a.org.id]: staffId || undefined };
      q('UPDATE sessions SET view_as = ? WHERE id = ?').run(JSON.stringify(viewAs), a.s.id);
      return json(res, 200, { ok: true });
    }

    /* The help library: everyone reads it; the platform admin edits it. */
    if (path === '/api/help') {
      if (method === 'GET') {
        const row = q("SELECT json FROM platform_docs WHERE name = 'help'").get();
        // Null until the platform admin first edits it: the app then shows its built-in library.
        return json(res, 200, row ? JSON.parse(row.json) : null);
      }
      if (method === 'PUT') {
        needSuper();
        const doc = await readJson(req, config.maxJsonMb * 1048576);
        if (!Array.isArray(doc?.sections)) throw new HttpError(400, 'Not a help library');
        q(`INSERT INTO platform_docs (name, json, updated_at, updated_by) VALUES ('help', ?, ?, ?)
           ON CONFLICT (name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(JSON.stringify(doc), now(), a.user.id);
        return json(res, 200, { ok: true });
      }
    }

    /* Signing in. */
    /* Dashi's own public site: plans, prices and its words; sign-up; messages. */
    const platformDoc = (name) => JSON.parse(q('SELECT json FROM platform_docs WHERE name = ?').get(name)?.json ?? 'null');
    const savePlatformDoc = (name, doc) => q(`INSERT INTO platform_docs (name, json, updated_at, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(name, JSON.stringify(doc), now(), a.user?.id ?? null);
    const request = (kind, { orgId = null, email = null, name = null, data = {} } = {}) => {
      const id = newId('req');
      q('INSERT INTO requests (id, kind, org_id, email, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, kind, orgId, email, name, JSON.stringify(data), now());
      return id;
    };
    if (path === '/api/platform' && method === 'GET') {
      return json(res, 200, { plans: allPlans(planOverrides()), site: siteContent(platformDoc('site')), signup: config.openSignup, baseDomain: config.baseDomain });
    }
    if (path === '/api/signup' && method === 'POST') {
      if (!a.t.root) throw new HttpError(404, 'Sign up on the platform’s own site');
      if (!config.openSignup) throw new HttpError(403, 'Sign-up is closed for now. Write to us instead.');
      bump(`signup:${clientIp(req)}`, 5);
      const body = await readJson(req, 10_000);
      if (body?.website) throw new HttpError(400, 'Something went wrong'); // a field only robots fill in
      const orgName = String(body?.orgName ?? '').trim().slice(0, 120);
      const email = String(body?.email ?? '').trim().toLowerCase();
      const name = String(body?.name ?? '').trim().slice(0, 120);
      const plan = PLAN_IDS.includes(body?.plan) ? body.plan : 'free';
      if (!orgName) throw new HttpError(400, 'What is your organisation called?');
      let user = a.user;
      if (!user) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Give an email address you can sign in with');
        if (userByEmail(email)) throw new HttpError(409, 'There’s already an account with that email. Sign in first, then add your organisation.');
        if (String(body?.password ?? '').length < 10) throw new HttpError(400, 'Choose a password of at least 10 characters');
      }
      const org = createOrg({ slug: body?.slug, name: orgName, plan: 'free', admin: { email: user?.email ?? email, name: user?.name ?? name } });
      user ??= userByEmail(email);
      if (!a.user) {
        q('UPDATE users SET password_hash = ?, name = ? WHERE id = ?').run(await hashPassword(String(body.password)), name || user.name, user.id);
        startSession(res, user.id);
      }
      request('signup', { orgId: org.id, email: user.email, name: user.name, data: { plan, note: String(body?.note ?? '').slice(0, 2000) } });
      return json(res, 201, { org: { id: org.id, name: org.name, url: urlFor(hostOf(org), '/') }, plan, open: `/auth/switch?org=${encodeURIComponent(org.id)}&next=/` });
    }
    if (path === '/api/contact' && method === 'POST') {
      bump(`contact:${clientIp(req)}`, 10);
      const body = await readJson(req, 20_000);
      if (body?.website) throw new HttpError(400, 'Something went wrong');
      const message = String(body?.message ?? '').trim().slice(0, 5000);
      if (!message || !/@/.test(body?.email ?? '')) throw new HttpError(400, 'Add your email and a message');
      request('contact', { email: String(body.email).slice(0, 200), name: String(body?.name ?? '').slice(0, 200), data: { org: String(body?.org ?? '').slice(0, 200), message, plan: body?.plan ?? null } });
      return json(res, 201, { ok: true });
    }
    if (path === '/api/plan/request' && method === 'POST') {
      needOrg();
      if (!a.canAdmin) throw new HttpError(403, 'Only the organisation’s admin can change its plan');
      const body = await readJson(req, 10_000);
      if (!PLAN_IDS.includes(body?.plan)) throw new HttpError(400, 'Which plan?');
      request('upgrade', { orgId: a.org.id, email: a.user.email, name: a.user.name, data: { from: a.org.plan, plan: body.plan, note: String(body?.note ?? '').slice(0, 2000) } });
      return json(res, 201, { ok: true });
    }

    if (path === '/api/auth/options' && method === 'GET') {
      const dev = config.devLogin
        ? q('SELECT id, email, name, is_super FROM users ORDER BY is_super DESC, name').all().map((u) => ({
            ...userJson(u),
            orgs: q('SELECT o.name, m.role FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name').all(u.id).map((r) => `${r.name} (${r.role})`),
          }))
        : null;
      // Sign-in with other accounts comes with Basic and up; the platform's own site always has it.
      const social = !a.org || orgPlan(a.org).features.socialLogin;
      const providers = social ? Object.values(config.providers).map((x) => ({ id: x.id, label: x.label })) : [];
      return json(res, 200, { providers, google: social && !!config.providers.google, password: true, dev, org: a.org && { name: a.org.name } });
    }
    if (path === '/api/auth/password' && method === 'POST') {
      const { email, password } = await readJson(req, 10_000);
      throttle(req, email);
      const user = email && userByEmail(email);
      if (!user || !(await checkPassword(String(password ?? ''), user.password_hash))) throw new HttpError(401, 'That email and password don’t match.');
      startSession(res, user.id);
      return json(res, 200, { ok: true });
    }
    if (path === '/api/auth/dev' && method === 'POST') {
      if (!config.devLogin) throw new HttpError(404, 'Not here');
      const { userId } = await readJson(req, 10_000);
      const user = userById(userId);
      if (!user) throw new HttpError(404, 'No such user');
      startSession(res, user.id);
      return json(res, 200, { ok: true });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      if (a.s) q('DELETE FROM sessions WHERE id = ?').run(a.s.id);
      res.setHeader('set-cookie', cookie(COOKIE, '', { maxAge: 0, secure: config.https }));
      return json(res, 200, { ok: true });
    }

    /* The platform admin's console. */
    if (path.startsWith('/api/admin/')) {
      needSuper();
      if (path === '/api/admin/orgs' && method === 'GET') {
        return json(res, 200, q('SELECT o.*, (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) AS members FROM orgs o ORDER BY o.name').all()
          .map((o) => {
            const paused = JSON.parse(o.paused_plugins || '{}');
            const chosen = readDoc(o.id, 'org')?.plugins ?? {};
            return { ...o, paused_plugins: undefined, limits: JSON.parse(o.limits || '{}'), included: orgPlan(o).plugins, paused, chosen, url: urlFor(hostOf(o), '/'),
              usage: { ...usageOf(readDocs(o.id)), storageMb: Math.round(storageUsed(o.id) / 1048576) }, domains: q('SELECT host, status FROM domains WHERE org_id = ?').all(o.id) };
          }));
      }
      if (path === '/api/admin/orgs' && method === 'POST') {
        const body = await readJson(req, 10_000);
        if (!body?.name?.trim()) throw new HttpError(400, 'Give the organisation a name');
        const org = createOrg({ slug: body.slug, name: body.name.trim(), plan: body.plan || 'free', admin: body.adminEmail ? { email: body.adminEmail, name: body.adminName } : null });
        return json(res, 201, { ...org, url: urlFor(hostOf(org), '/') });
      }
      if ((m = path.match(/^\/api\/admin\/orgs\/([\w-]+)\/plugins$/)) && method === 'POST') {
        // Switch a plugin on for an org (and in its own settings), or pause it.
        const org = orgById(m[1]);
        if (!org) throw new HttpError(404, 'No such organisation');
        const { plugin, on } = await readJson(req, 10_000);
        if (!/^[\w-]{1,40}$/.test(plugin ?? '')) throw new HttpError(400, 'Which plugin?');
        const paused = JSON.parse(org.paused_plugins || '{}');
        if (on) delete paused[plugin]; else paused[plugin] = true;
        q('UPDATE orgs SET paused_plugins = ? WHERE id = ?').run(JSON.stringify(paused), org.id);
        const doc = readDoc(org.id, 'org');
        if (doc && on && doc.plugins?.[plugin] === false) writeDoc(org.id, 'org', { ...doc, plugins: { ...doc.plugins, [plugin]: true } }, a.user.id);
        announce(org.id, 'org', null);
        return json(res, 200, { paused });
      }
      if ((m = path.match(/^\/api\/admin\/orgs\/([\w-]+)$/))) {
        const org = orgById(m[1]);
        if (!org) throw new HttpError(404, 'No such organisation');
        if (method === 'PATCH') {
          const body = await readJson(req, 10_000);
          if (body.slug && body.slug !== org.slug) {
            if (!SLUG.test(body.slug) || RESERVED.has(body.slug)) throw new HttpError(400, 'Not a valid address');
            if (q('SELECT 1 FROM orgs WHERE slug = ?').get(body.slug)) throw new HttpError(409, 'That address is taken');
          }
          if (body.plan && !PLAN_IDS.includes(body.plan)) throw new HttpError(400, 'No such plan');
          q('UPDATE orgs SET name = ?, slug = ?, plan = ?, status = ?, limits = ? WHERE id = ?').run(
            body.name ?? org.name, body.slug ?? org.slug, body.plan ?? org.plan, ['active', 'suspended'].includes(body.status) ? body.status : org.status,
            body.limits && typeof body.limits === 'object' ? JSON.stringify(body.limits) : org.limits, org.id);
          announce(org.id, 'org', null);
          if (body.name && body.name !== org.name) {
            const doc = readDoc(org.id, 'org');
            if (doc) writeDoc(org.id, 'org', { ...doc, name: body.name });
          }
          return json(res, 200, orgById(org.id));
        }
        if (method === 'DELETE') {
          deleteOrg(org.id);
          return json(res, 200, { ok: true });
        }
      }
      if (path.startsWith('/api/admin/domains') && (await domains.admin(req, res, path)) !== false) return;
      if (path === '/api/admin/site' && method === 'PUT') {
        const body = await readJson(req, 200_000);
        if (!body || typeof body !== 'object') throw new HttpError(400, 'Not the site’s words');
        savePlatformDoc('site', body);
        return json(res, 200, siteContent(body));
      }
      if (path === '/api/admin/requests' && method === 'GET') {
        return json(res, 200, q('SELECT r.*, o.name AS org_name, o.plan AS org_plan FROM requests r LEFT JOIN orgs o ON o.id = r.org_id ORDER BY r.created_at DESC LIMIT 200').all()
          .map((r) => ({ ...r, data: JSON.parse(r.data) })));
      }
      if ((m = path.match(/^\/api\/admin\/requests\/([\w-]+)$/)) && method === 'PATCH') {
        const { status } = await readJson(req, 2000);
        if (!['open', 'done', 'declined'].includes(status)) throw new HttpError(400, 'Which status?');
        q('UPDATE requests SET status = ? WHERE id = ?').run(status, m[1]);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/admin/plans' && method === 'GET') return json(res, 200, { plans: allPlans(planOverrides()), overrides: planOverrides() });
      if (path === '/api/admin/plans' && method === 'PUT') {
        const body = await readJson(req, 100_000);
        const clean = {};
        for (const id of PLAN_IDS) if (body?.[id] && typeof body[id] === 'object') clean[id] = body[id];
        q(`INSERT INTO platform_docs (name, json, updated_at, updated_by) VALUES ('plans', ?, ?, ?)
           ON CONFLICT (name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).run(JSON.stringify(clean), now(), a.user.id);
        for (const o of q('SELECT id FROM orgs').all()) announce(o.id, 'org', null);
        return json(res, 200, { plans: allPlans(clean) });
      }
      if (path === '/api/admin/audit' && method === 'GET') return json(res, 200, runAudit(db, { req, cookieName: COOKIE }));
      if (path === '/api/admin/backups' && method === 'GET') return json(res, 200, listBackups());
      if (path === '/api/admin/backups' && method === 'POST') return json(res, 201, backupNow(db));
      if (path === '/api/admin/users' && method === 'GET') {
        return json(res, 200, q('SELECT id, email, name, is_super, password_hash IS NOT NULL AS has_password, created_at FROM users ORDER BY name').all().map((u) => ({
          ...u,
          memberships: q('SELECT o.id, o.name, m.role FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ?').all(u.id),
          google: !!q("SELECT 1 FROM identities WHERE user_id = ? AND provider = 'google'").get(u.id),
          providers: q('SELECT provider FROM identities WHERE user_id = ?').all(u.id).map((r) => PROVIDERS[r.provider]?.label ?? r.provider),
        })));
      }
      if (path === '/api/admin/users' && method === 'POST') {
        const body = await readJson(req, 10_000);
        if (!/^[^@\s]+@[^@\s]+$/.test(body?.email ?? '')) throw new HttpError(400, 'Give an email address');
        const user = ensureUser({ email: body.email, name: body.name, isSuper: !!body.isSuper });
        if (body.password) q('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(String(body.password)), user.id);
        return json(res, 201, userJson(userById(user.id)));
      }
      if ((m = path.match(/^\/api\/admin\/users\/([\w-]+)\/password$/)) && method === 'POST') {
        const { password } = await readJson(req, 10_000);
        if (String(password ?? '').length < 10) throw new HttpError(400, 'Use at least 10 characters');
        q('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(String(password)), m[1]);
        return json(res, 200, { ok: true });
      }
    }
    throw new HttpError(404, 'Not found');
  }

  async function auth(req, res, a, path, url) {
    const p = url.searchParams;
    let m;
    if (path === '/auth/handoff') {
      const row = q('SELECT * FROM handoffs WHERE token = ?').get(digest(p.get('token') ?? ''));
      if (row) q('DELETE FROM handoffs WHERE token = ?').run(row.token);
      if (!row || row.expires_at < Date.now() || row.host !== a.t.host) return page(res, 400, 'That sign-in link has expired', 'Sign in again.', { href: '/login.html', label: 'Sign in' });
      startSession(res, row.user_id);
      return redirect(res, safeNext(p.get('next')));
    }
    if (path === '/auth/switch') {
      if (!a.user) return redirect(res, `/login.html?next=${encodeURIComponent(`${path}${url.search}`)}`);
      const org = orgById(p.get('org') ?? '');
      if (!org || !(a.isSuper || (membership(a.user.id, org.id) && org.status === 'active'))) return page(res, 403, 'Not available', 'You aren’t a member of that organisation.');
      return handoff(res, a.user.id, hostOf(org), safeNext(p.get('next')));
    }
    if (path === '/auth/root') {
      // Back to the platform's own site (the admin page), signed in.
      if (!a.user) return redirect(res, urlFor(config.baseDomain, '/login.html'));
      return handoff(res, a.user.id, config.baseDomain, '/');
    }
    if ((m = path.match(/^\/auth\/(\w+)(\/callback)?$/)) && PROVIDERS[m[1]]) {
      const id = m[1];
      const provider = config.providers[id];
      if (!provider) return page(res, 404, `${PROVIDERS[id].label} sign-in is not set up`, `Ask the platform admin to add ${PROVIDERS[id].env.join(' and ')}.`);
      const redirectUri = urlFor(config.baseDomain, `/auth/${id}/callback`);
      if (!m[2]) {
        if (a.org && !orgPlan(a.org).features.socialLogin) return page(res, 403, `${PROVIDERS[id].label} sign-in isn’t on this plan`, `${a.org.name} signs in with a password.`, { href: '/login.html', label: 'Sign in' });
        const state = token();
        q('INSERT INTO oauth_states (state, data, expires_at) VALUES (?, ?, ?)').run(state, JSON.stringify({ host: a.t.host, next: safeNext(p.get('next')), provider: id }), Date.now() + 10 * 60_000);
        return redirect(res, authorizeUrl(provider, { redirectUri, state }));
      }
      const st = q('SELECT * FROM oauth_states WHERE state = ?').get(p.get('state') ?? '');
      if (st) q('DELETE FROM oauth_states WHERE state = ?').run(st.state);
      const saved = st ? JSON.parse(st.data) : null;
      if (!st || st.expires_at < Date.now() || !p.get('code') || (saved.provider ?? 'google') !== id) return page(res, 400, 'Sign-in didn’t finish', 'Try again.', { href: '/login.html', label: 'Sign in' });
      let info;
      try {
        info = await finish(provider, { code: p.get('code'), redirectUri });
      } catch (err) {
        console.warn(`Sign-in with ${provider.label} failed:`, err.message);
        return page(res, 502, `${provider.label} didn’t confirm the sign-in`, 'Try again in a moment.', { href: '/login.html', label: 'Sign in' });
      }
      if (!info.sub || !info.email || !info.verified) return page(res, 400, 'No verified email', `${provider.label} didn’t share a verified email address. Sign in another way, or check the email on that account.`);
      const linked = q('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(id, String(info.sub));
      let user = linked ? userById(linked.user_id) : userByEmail(info.email);
      if (!user && info.email.toLowerCase() === config.superAdmin.email) user = ensureUser({ email: info.email, name: info.name, isSuper: true });
      if (!user) return page(res, 403, `No account for ${info.email}`, 'Ask your organisation’s admin to add you, with this email, to the staff list in Organisation settings.');
      if (!linked) q('INSERT OR IGNORE INTO identities (provider, subject, user_id) VALUES (?, ?, ?)').run(id, String(info.sub), user.id);
      return handoff(res, user.id, knownHost(saved.host) ? saved.host : config.baseDomain, saved.next);
    }
    throw new HttpError(404, 'Not found');
  }

  /**
   * A featured show as a .zip to listen to offline (see src/platform/showArchive.js).
   * Anyone can download a featured show that is on the public station;
   * members can download any show. Audio streams straight from disk into
   * the archive, so even a show of several GB needs no extra memory.
   */
  async function showZip(req, res, a, showId) {
    if (!a.org) return send(res, 404, 'Not found');
    const all = readDocs(a.org.id);
    const docs = a.member ? all : publicDocs(all, today());
    const pods = docs.podcasts;
    const show = pods?.podcasts?.[showId];
    if (!show || (!a.member && !show.featured)) return send(res, 404, 'Not found');
    const fileOf = (e) => {
      if (e.audio?.mediaId) {
        const row = q('SELECT id FROM media WHERE id = ? AND org_id = ?').get(e.audio.mediaId, a.org.id);
        return row ? join(config.dataDir, 'media', a.org.id, row.id) : null;
      }
      const rel = normalize(String(e.audio?.url ?? '')).replace(/^([/\\])+/, '');
      const file = join(config.root, rel);
      return rel.startsWith(`media${sep}`) && file.startsWith(join(config.root, 'media') + sep) ? file : null;
    };
    const sizes = new Map();
    const sizeOf = (e) => {
      if (!sizes.has(e.id)) { const f = fileOf(e); let n = -1; try { n = f ? statSync(f).size : -1; } catch { /* missing */ } sizes.set(e.id, n); }
      return sizes.get(e.id);
    };
    const plan = showArchive({ doc: pods, org: docs.org, showId, today: today(), audioSize: sizeOf, sourceUrl: urlFor(a.t.host, `/?site#show=${showId}`) });
    const enc = new TextEncoder();
    const entries = [
      ...plan.texts.map((t) => { const data = enc.encode(t.text); return { name: t.name, size: data.length, data }; }),
      ...plan.binaries.map((b) => ({ name: b.name, size: b.bytes.length, data: b.bytes })),
      // Episodes whose audio is missing are left out rather than breaking the download.
      ...plan.audio.filter((x) => x.size >= 0).map((x) => ({ name: x.name, size: x.size, data: createReadStream(fileOf(x.episode), { highWaterMark: 1 << 20 }) })),
    ];
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-length': zipSize(entries),
      'content-disposition': `attachment; filename="${plan.filename}"`,
      'cache-control': a.member ? 'private, no-store' : 'public, max-age=600',
    });
    if (req.method === 'HEAD') return res.end();
    try {
      await pipeline(Readable.from(zipStream(entries, { crc: zlibCrc32 })), res);
    } catch (err) {
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.warn('Show download stopped:', err.message);
      for (const e of entries) e.data.destroy?.();
    }
  }

  /* Files: the app's pages and modules, and uploaded media. */
  const PUBLIC_DIRS = ['src/', 'vendor/', 'media/'];
  function files(req, res, a, path) {
    let m;
    if ((m = path.match(/^\/media\/(media_[\w-]+)$/))) {
      const row = a.org && q('SELECT * FROM media WHERE id = ? AND org_id = ?').get(m[1], a.org.id);
      if (!row) return send(res, 404, 'Not found');
      if (!a.member && !mediaIsPublic(readDocs(a.org.id), row.id, today())) return send(res, 404, 'Not found');
      return sendFile(req, res, join(config.dataDir, 'media', a.org.id, row.id), {
        type: row.mimetype, cache: a.member ? 'private, max-age=3600' : 'public, max-age=3600',
        headers: { 'content-disposition': `inline; filename="${row.filename.replace(/"/g, '')}"` },
      });
    }
    if ((m = path.match(/^\/podcasts\/([\w-]+)\.zip$/))) return showZip(req, res, a, m[1]);
    if (path === '/favicon.ico') return send(res, 204);
    if (path === '/') {
      // The root site is the platform's own page; an org's address is its app (for members) or its public site.
      if (a.t.root) return sendFile(req, res, join(config.root, 'platform.html'));
      if (!a.org) return page(res, 404, 'Nothing here yet', `There is no organisation at ${a.t.host}.`, { href: urlFor(config.baseDomain, '/'), label: 'Go to the platform' });
      const site = new URL(req.url, 'http://x').searchParams.has('site');
      return sendFile(req, res, join(config.root, a.member && !site ? 'index.html' : 'site.html'));
    }
    const rel = path.slice(1);
    const allowed = (/^[\w-]+\.(html|css)$/.test(rel) && rel !== 'index.html') || rel === 'index.html' || PUBLIC_DIRS.some((d) => rel.startsWith(d));
    if (!allowed) return send(res, 404, 'Not found');
    const file = normalize(join(config.root, rel));
    if (!file.startsWith(config.root.endsWith(sep) ? config.root : config.root + sep)) return send(res, 404, 'Not found');
    return sendFile(req, res, file);
  }

  async function handle(req, res) {
    securityHeaders(res);
    const url = new URL(req.url, 'http://x');
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, 'Bad address');
    }
    try {
      const a = access(req);
      if (a.t.unknown) return page(res, 404, 'Unknown address', `This platform doesn’t serve ${a.t.host}.`);
      if (path.startsWith('/api/')) return await api(req, res, a, path, url);
      if (path.startsWith('/auth/')) return await auth(req, res, a, path, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return files(req, res, a, path);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.end();
      return path.startsWith('/api/') ? json(res, status, { error: status === 500 ? 'Something went wrong' : err.message }) : page(res, status, 'Something went wrong', status === 500 ? 'Try again in a moment.' : err.message);
    }
  }

  return { handle, createOrg, deleteOrg, ensureUser, syncStaff, writeDoc, readDocs, hostOf, knownHost };
}
