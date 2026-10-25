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

export async function start({ port = config.port, quiet = false } = {}) {
  const db = openDb(config.dataDir);
  const app = createApp(db);
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

  // A fresh database gets the two example orgs, to try everything out.
  if (config.seedExamples && !db.prepare('SELECT 1 FROM orgs LIMIT 1').get()) {
    app.createOrg({ id: 'org-example', slug: 'example', name: 'Example STEM Outreach Network', docs: exampleDocs('org-example') });
    app.createOrg({ id: 'org-riverbend', slug: 'riverbend', name: 'Riverbend Community Food Hub', docs: exampleDocs('org-riverbend') });
    log('Added the example organisations.');
  }

  const server = createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(port, resolve));
  const actual = server.address().port;
  if (!quiet) {
    const orgs = db.prepare('SELECT slug, name FROM orgs ORDER BY name').all();
    log(`\nOrg Toolbox is running.\n  Platform:      ${urlFor()}`);
    for (const o of orgs) log(`  ${o.name.padEnd(30).slice(0, 30)} ${urlFor(orgHost(o.slug))}`);
    log(config.devLogin ? '\nDev sign-in is on: the sign-in page lets you be anyone.' : '');
  }
  return { server, db, app, port: actual };
}
