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
import { createWriteStream, mkdirSync, rmSync, renameSync, unlinkSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { config, urlFor, orgHost } from './config.js';
import { now } from './db.js';
import { HttpError, send, json, redirect, page, readJson, parseCookies, cookie, sendFile } from './http.js';
import { publicDocs, mediaIsPublic } from './public.js';
import { uploadRoutes } from './uploads.js';
import { PROVIDERS, authorizeUrl, finish } from './oauth.js';
import { blankOrg, migrateOrg } from '../src/platform/org.js';
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

export function createApp(db) {
  const q = (sql) => db.prepare(sql);

  /* ------------------------------------------------------------------ data */

  const orgById = (id) => q('SELECT * FROM orgs WHERE id = ?').get(id);
  const userById = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
  const userByEmail = (email) => q('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  const membership = (userId, orgId) => q('SELECT * FROM memberships WHERE user_id = ? AND org_id = ?').get(userId, orgId);
  const hostOf = (org) => q('SELECT host FROM domains WHERE org_id = ? ORDER BY host LIMIT 1').get(org.id)?.host ?? orgHost(org.slug);

  /** What the platform admin decides for an org, carried on its org document (read only for the org). */
  const platformPart = (orgId) => {
    const o = orgById(orgId);
    return { plan: o?.plan ?? 'free', paused: JSON.parse(o?.paused_plugins || '{}') };
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
    const custom = q('SELECT org_id FROM domains WHERE host = ?').get(host);
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
    const s = q('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!s || s.expires_at < Date.now()) return null;
    const user = userById(s.user_id);
    return user ? { ...s, user, viewAs: JSON.parse(s.view_as || '{}') } : null;
  }

  function startSession(res, userId) {
    const id = token();
    q('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(id, userId, Date.now() + config.sessionDays * 864e5, now());
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
    q('INSERT INTO handoffs (token, user_id, host, expires_at) VALUES (?, ?, ?, ?)').run(t, userId, host, Date.now() + 60_000);
    redirect(res, urlFor(host, `/auth/handoff?${new URLSearchParams({ token: t, next })}`));
  }
  const knownHost = (host) => host === config.baseDomain || !!q('SELECT 1 FROM domains WHERE host = ?').get(host)
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

  const uploads = uploadRoutes({ q, newId });
  uploads.sweep();
  setInterval(uploads.sweep, 3600_000).unref();

  /* Sign-in attempts, per address, to slow down guessing. */
  const attempts = new Map();
  function throttle(req) {
    const key = req.socket.remoteAddress ?? '?';
    const a = attempts.get(key) ?? { n: 0, until: Date.now() + 15 * 60_000 };
    if (a.until < Date.now()) { a.n = 0; a.until = Date.now() + 15 * 60_000; }
    a.n += 1;
    attempts.set(key, a);
    if (a.n > 20) throw new HttpError(429, 'Too many tries. Wait a few minutes.');
  }

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
        limits: { uploadMb: config.maxUploadMb },
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
    if (path === '/api/auth/options' && method === 'GET') {
      const dev = config.devLogin
        ? q('SELECT id, email, name, is_super FROM users ORDER BY is_super DESC, name').all().map((u) => ({
            ...userJson(u),
            orgs: q('SELECT o.name, m.role FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY o.name').all(u.id).map((r) => `${r.name} (${r.role})`),
          }))
        : null;
      const providers = Object.values(config.providers).map((x) => ({ id: x.id, label: x.label }));
      return json(res, 200, { providers, google: !!config.providers.google, password: true, dev, org: a.org && { name: a.org.name } });
    }
    if (path === '/api/auth/password' && method === 'POST') {
      throttle(req);
      const { email, password } = await readJson(req, 10_000);
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
            return { ...o, paused_plugins: undefined, paused, chosen, url: urlFor(hostOf(o), '/') };
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
          q('UPDATE orgs SET name = ?, slug = ?, plan = ?, status = ? WHERE id = ?').run(
            body.name ?? org.name, body.slug ?? org.slug, body.plan ?? org.plan, ['active', 'suspended'].includes(body.status) ? body.status : org.status, org.id);
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
      const row = q('SELECT * FROM handoffs WHERE token = ?').get(p.get('token') ?? '');
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
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
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

  return { handle, createOrg, deleteOrg, ensureUser, syncStaff, writeDoc, readDocs, hostOf };
}
