/**
 * Start the platform: open (or create) the database, make sure the
 * platform admin exists, add the example orgs on a fresh install, and
 * listen. See DEPLOY.md for running it on a host.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { config, urlFor, orgHost } from './config.js';
import { openDb } from './db.js';
import { createApp, hashPassword } from './app.js';
import { exampleDocs } from '../src/platform/seeds.js';
import { MOCK_ORGS, mockDocs, mockFiles } from '../src/platform/mockOrgs.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduleBackups } from './backup.js';

export async function start({ port = config.port, quiet = false, resolver } = {}) {
  const db = openDb(config.dataDir);
  const app = createApp(db, { resolver });
  const log = quiet ? () => {} : (...a) => console.log(...a);

  // The platform admin: you.
  const admin = app.ensureUser({ email: config.superAdmin.email, name: config.superAdmin.name, isSuper: true });
  if (config.superAdmin.password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(config.superAdmin.password), admin.id);
  } else if (!admin.password_hash && !config.devLogin) {
    // No way in yet: make a password and show it once.
    const pw = randomBytes(12).toString('base64url');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(pw), admin.id);
    log(`\nPlatform admin: ${config.superAdmin.email}\nPassword (shown once, change it with SUPER_ADMIN_PASSWORD): ${pw}\n`);
  }

  // The test platform, to try everything out. A database from an earlier
  // version gets the test orgs it doesn't have yet; nothing already there changes.
  if (config.seedExamples) {
    const added = await seedTestPlatform(db, app);
    if (added.length) log(`Added test organisations: ${added.join(', ')}.`);
  }

  // A database snapshot now if there's none from today, then daily.
  const backups = scheduleBackups(db, log);

  // /healthz answers the host's health checks without touching sessions.
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      try { db.prepare('SELECT 1').get(); res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); } catch { res.writeHead(503).end('database unavailable'); }
      return;
    }
    // Caddy (deploy/Caddyfile) asks before getting a certificate for an address: is it ours?
    if (req.url.startsWith('/tls-ask?')) {
      const domain = new URL(req.url, 'http://x').searchParams.get('domain') ?? '';
      res.writeHead(app.knownHost(domain.toLowerCase()) ? 200 : 404).end();
      return;
    }
    app.handle(req, res);
  });
  // Hosts stop the app with SIGTERM when deploying: finish what's in flight, close the database cleanly.
  const stop = (signal) => {
    log(`\n${signal}: stopping.`);
    clearInterval(backups);
    server.close(() => { try { db.close(); } catch { /* closed */ } process.exit(0); });
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  if (!quiet) for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => stop(sig));
  await new Promise((resolve) => server.listen(port, resolve));
  const actual = server.address().port;
  if (!quiet) {
    const orgs = db.prepare('SELECT slug, name FROM orgs ORDER BY name').all();
    log(`\nDashi is running.\n  Platform:      ${urlFor()}`);
    for (const o of orgs) log(`  ${o.name.padEnd(30).slice(0, 30)} ${urlFor(orgHost(o.slug))}`);
    log(config.devLogin ? '\nDev sign-in is on: the sign-in page lets you be anyone.' : '');
  }
  return { server, db, app, port: actual };
}

/**
 * A fresh database gets the test platform (src/platform/mockOrgs.js): six
 * example orgs on all four plans, with their documents, library files and,
 * for one, a custom domain waiting for its DNS records.
 */
async function seedTestPlatform(db, app) {
  const stamp = new Date().toISOString();
  const added = [];
  const writeFiles = (orgId, made) => {
    const dir = join(config.dataDir, 'media', orgId);
    mkdirSync(dir, { recursive: true });
    for (const f of made) {
      writeFileSync(join(dir, f.mediaId), f.bytes);
      db.prepare('INSERT OR IGNORE INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(f.mediaId, orgId, f.name, f.mimetype, f.bytes.length, stamp, null);
    }
  };
  const fitSizes = (library, made) => {
    const sizes = Object.fromEntries(made.map((f) => [f.mediaId, f]));
    for (const it of Object.values(library.items)) {
      const f = it.file && sizes[it.file.mediaId];
      if (f) Object.assign(it.file, { size: f.bytes.length, type: f.mimetype.split(';')[0] });
    }
  };
  for (const spec of MOCK_ORGS) {
    const existing = db.prepare('SELECT id FROM orgs WHERE id = ? OR slug = ?').get(spec.id, spec.slug);
    if (existing) {
      // A test org from before the library: give it the test documents.
      const lib = db.prepare("SELECT json FROM docs WHERE org_id = ? AND name = 'library'").get(spec.id);
      if (existing.id !== spec.id || Object.keys(JSON.parse(lib?.json ?? '{}').items ?? {}).length) continue;
      const { docs, files } = mockDocs(spec, spec.existing ? exampleDocs(spec.id) : null);
      const made = await mockFiles(files, spec.name);
      fitSizes(docs.library, made);
      app.writeDoc(spec.id, 'library', docs.library);
      writeFiles(spec.id, made);
      added.push(`${spec.name} (documents)`);
      continue;
    }
    added.push(spec.name);
    const { docs, files, domain } = mockDocs(spec, spec.existing ? exampleDocs(spec.id) : null);
    const made = await mockFiles(files, spec.name);
    fitSizes(docs.library, made);
    app.createOrg({ id: spec.id, slug: spec.slug, name: spec.name, plan: spec.plan, docs });
    writeFiles(spec.id, made);
    if (domain) {
      db.prepare('INSERT OR IGNORE INTO domains (host, org_id, status, token, is_primary, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(domain, spec.id, 'pending', randomBytes(12).toString('hex'), Date.now());
    }
  }
  return added;
}
