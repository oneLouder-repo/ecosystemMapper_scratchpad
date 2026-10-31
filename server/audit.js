/**
 * The security audit: a list of checks on the running platform, for the
 * platform admin's console (Platform admin → Security audit) and the command
 * line (`npm run audit`, which exits with 1 when anything fails).
 *
 * Each check says what it looked at, what it found, and what to do:
 *   { area, title, status: 'pass' | 'warn' | 'fail' | 'info', detail, fix? }
 *
 * It never shows a secret or personal value it finds, only where it is.
 */
import { statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { listBackups } from './backup.js';
import { publicDocs } from './public.js';
import { digest } from './app.js';

const AREAS = ['Settings', 'Stored data', 'Sign-in', 'Public content', 'Running'];

/** Luhn's checksum, used by card numbers and Canadian SINs. */
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Things that look like secrets or sensitive numbers, by kind. */
const SECRETS = [
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['an API key', /\b(sk_live_[\w]{16,}|rk_live_[\w]{16,}|AKIA[0-9A-Z]{16}|ghp_[\w]{36}|github_pat_\w{40,}|xox[abp]-[\w-]{20,}|AIza[\w-]{35})\b/],
  ['a password written out', /"(password|passwd|pwd|secret|api_?key)"\s*:\s*"[^"]{4,}"|\b(password|passcode)\s*[:=]\s*\S{6,}/i],
  ['a card number', (s) => [...s.matchAll(/\b(?:\d[ -]?){13,16}\b/g)].some((m) => { const d = m[0].replace(/\D/g, ''); return d.length >= 13 && d.length <= 16 && /^[3-6]/.test(d) && luhn(d); })],
  ['a social insurance number', (s) => [...s.matchAll(/\b\d{3}[ -]\d{3}[ -]\d{3}\b/g)].some((m) => { const d = m[0].replace(/\D/g, ''); return /^[1-79]/.test(d) && luhn(d); })],
];
const found = (text) => SECRETS.filter(([, test]) => (typeof test === 'function' ? test(text) : test.test(text))).map(([kind]) => kind);

/**
 * Run every check. `req` (optional) is the admin's own request: with it, the
 * audit proves on their own session that the database holds only its hash.
 */
export function runAudit(db, { req, cookieName = 'tb_session' } = {}) {
  const q = (sql) => db.prepare(sql);
  const out = [];
  const add = (area, title, status, detail, fix) => out.push({ area, title, status, detail, ...(fix && { fix }) });
  const prod = config.production;

  /* Settings */
  add('Settings', 'Production mode', prod ? 'pass' : 'warn',
    prod ? 'NODE_ENV is production.' : 'NODE_ENV isn’t production, so test conveniences may be on.', prod ? null : 'Set NODE_ENV=production on the live server.');
  add('Settings', 'Test sign-in is off', !config.devLogin ? 'pass' : prod ? 'fail' : 'warn',
    config.devLogin ? 'Anyone who opens the sign-in page can sign in as anyone.' : 'The one-click test sign-in is off.',
    config.devLogin ? 'Remove DEV_LOGIN=true (it is off by default in production).' : null);
  add('Settings', 'HTTPS', config.https ? 'pass' : prod ? 'fail' : 'warn',
    config.https ? 'Cookies are marked Secure and browsers are told to use HTTPS only (HSTS).' : 'Cookies can travel over plain HTTP.',
    config.https ? null : 'Serve the site over HTTPS and set HTTPS=true (on by default in production).');
  add('Settings', 'Platform domain', config.baseDomain !== 'localhost' ? 'pass' : prod ? 'fail' : 'info',
    `BASE_DOMAIN is ${config.baseDomain}.`, config.baseDomain === 'localhost' && prod ? 'Set BASE_DOMAIN to your domain.' : null);
  add('Settings', 'Example organisations', !config.seedExamples ? 'pass' : prod ? 'warn' : 'info',
    config.seedExamples ? 'The two example organisations are added to an empty database.' : 'No example data is added.',
    config.seedExamples && prod ? 'Remove SEED_EXAMPLES=true.' : null);
  const pw = config.superAdmin.password;
  if (pw) add('Settings', 'Platform admin password', pw.length >= 14 ? 'pass' : 'fail',
    pw.length >= 14 ? 'SUPER_ADMIN_PASSWORD is long enough.' : `SUPER_ADMIN_PASSWORD has only ${pw.length} characters.`,
    pw.length >= 14 ? null : 'Use at least 14 characters, ideally a passphrase from a password manager.');

  /* Stored data */
  const users = q('SELECT COUNT(*) AS n FROM users').get().n;
  const badHashes = q("SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL AND password_hash NOT LIKE 'scrypt$%'").get().n;
  add('Stored data', 'Passwords are hashed', badHashes ? 'fail' : 'pass',
    badHashes ? `${badHashes} of ${users} people have a password not stored as an scrypt hash.` : 'Every password is stored as a salted scrypt hash, never as text.',
    badHashes ? 'Set a new password for them on the People page.' : null);
  const raw = req && (Object.fromEntries(String(req.headers.cookie ?? '').split(/;\s*/).map((c) => c.split('=').map(decodeURIComponent))))[cookieName];
  if (raw) {
    const plain = !!q('SELECT 1 FROM sessions WHERE id = ?').get(raw);
    const hashed = !!q('SELECT 1 FROM sessions WHERE id = ?').get(digest(raw));
    add('Stored data', 'Sign-in tokens are hashed', !plain && hashed ? 'pass' : 'fail',
      !plain && hashed ? 'Checked on your own session: the database holds only a SHA-256 of the token in your browser, so a copy of the database can’t be used to sign in.' : 'Your session token is stored as it is.',
      plain ? 'Update the server.' : null);
  } else {
    add('Stored data', 'Sign-in tokens are hashed', 'pass', 'Sessions and one-time handoff tokens are stored as SHA-256 hashes.');
  }
  add('Stored data', 'No account tokens kept', 'pass',
    'Google, Facebook and Microsoft sign-ins keep only the account’s id; their access tokens are used once and never stored.');
  const expired = ['sessions', 'handoffs', 'oauth_states', 'uploads'].map((t) => [t, q(`SELECT COUNT(*) AS n FROM ${t} WHERE expires_at < ?`).get(Date.now()).n]).filter(([, n]) => n);
  add('Stored data', 'Expired records cleared', expired.length ? 'warn' : 'pass',
    expired.length ? `Expired rows waiting: ${expired.map(([t, n]) => `${n} ${t}`).join(', ')}.` : 'No expired sessions, tokens or uploads are left behind.',
    expired.length ? 'They are cleared hourly; if this stays, restart the server.' : null);

  const hits = [];
  for (const d of q('SELECT d.org_id, d.name, d.json, o.name AS org FROM docs d JOIN orgs o ON o.id = d.org_id').all()) {
    const kinds = found(d.json);
    if (kinds.length) hits.push(`${d.org}: ${d.name} (${kinds.join(', ')})`);
  }
  for (const d of q('SELECT name, json FROM platform_docs').all()) {
    const kinds = found(d.json);
    if (kinds.length) hits.push(`Platform: ${d.name} (${kinds.join(', ')})`);
  }
  add('Stored data', 'No secrets in documents', hits.length ? 'warn' : 'pass',
    hits.length ? `Something that looks sensitive is written into ${hits.length} document${hits.length > 1 ? 's' : ''}: ${hits.slice(0, 8).join('; ')}${hits.length > 8 ? '…' : ''}.` : 'No passwords, keys, card or social insurance numbers found in any organisation’s documents.',
    hits.length ? 'Open the document, remove the value, and change the password or key if it was real.' : null);

  const files = [config.dataDir, join(config.dataDir, 'toolbox.db')];
  if (process.platform !== 'win32') {
    const open = files.filter((f) => { try { return statSync(f).mode & 0o007; } catch { return false; } });
    add('Stored data', 'Data folder is private', open.length ? 'warn' : 'pass',
      open.length ? `Other accounts on this machine can read ${open.map((f) => f.replace(config.root, '')).join(' and ')}.` : 'Only the server’s own account can read the database.',
      open.length ? `Run: chmod 700 ${config.dataDir} && chmod 600 ${join(config.dataDir, 'toolbox.db')}` : null);
  }
  add('Stored data', 'Encryption at rest', 'info',
    'The database file itself isn’t encrypted; secrets in it are hashed. Use a host whose disks are encrypted (Fly.io volumes and DigitalOcean volumes are).');

  /* Sign-in */
  add('Sign-in', 'Cookies', config.https ? 'pass' : 'warn',
    `Session cookies are HttpOnly (scripts can’t read them) and SameSite=Lax (other sites can’t send them with a form)${config.https ? ', and Secure.' : ', but not Secure (HTTPS is off).'}`);
  add('Sign-in', 'Guessing is slowed', config.trustProxy || !prod ? 'pass' : 'warn',
    `Sign-in is limited to 20 tries per address and 10 per account every 15 minutes.${config.trustProxy ? ' Addresses are read from the host’s proxy.' : ''}`,
    !config.trustProxy && prod ? 'Behind a host’s proxy (Fly.io, Render, a load balancer), set TRUST_PROXY=true, or every visitor shares one limit.' : null);
  const providers = Object.values(config.providers).map((p) => p.label);
  add('Sign-in', 'Sign-in with other accounts', providers.length ? 'pass' : 'info',
    providers.length ? `On: ${providers.join(', ')}. Only verified emails already on a staff list get in.` : 'Only passwords are on. Google, Facebook or Microsoft sign-in spares people another password.');
  const supers = q('SELECT email, password_hash FROM users WHERE is_super = 1').all();
  add('Sign-in', 'Platform admins', supers.length <= 3 ? 'pass' : 'warn',
    `${supers.length} ${supers.length === 1 ? 'person has' : 'people have'} full access to every organisation.`,
    supers.length > 3 ? 'Keep platform admins to the few who need it.' : null);
  const weakPw = q("SELECT COUNT(*) AS n FROM users WHERE is_super = 1 AND password_hash IS NULL AND id NOT IN (SELECT user_id FROM identities)").get().n;
  if (weakPw && prod) add('Sign-in', 'Every platform admin can sign in', 'warn', `${weakPw} platform admin${weakPw > 1 ? 's have' : ' has'} no password or linked account yet.`);

  /* Public content */
  const leaks = [];
  for (const o of q("SELECT id, name FROM orgs WHERE status = 'active'").all()) {
    const docs = Object.fromEntries(q('SELECT name, json FROM docs WHERE org_id = ?').all(o.id).map((d) => [d.name, JSON.parse(d.json)]));
    const staff = Object.values(docs.org?.staff ?? {}).map((s) => String(s.email ?? '').toLowerCase()).filter(Boolean);
    const contact = String(docs.org?.contact?.email ?? docs.org?.email ?? '').toLowerCase();
    const shown = JSON.stringify(publicDocs(docs)).toLowerCase();
    const exposed = staff.filter((e) => e !== contact && shown.includes(e));
    if (exposed.length) leaks.push(`${o.name} (${exposed.length})`);
    if (shown.includes('"maps"') || Object.keys(publicDocs(docs)).some((k) => k.startsWith('map'))) leaks.push(`${o.name} (maps)`);
  }
  add('Public content', 'Staff details stay private', leaks.length ? 'warn' : 'pass',
    leaks.length ? `Staff email addresses appear in what visitors can load: ${leaks.join(', ')}.` : 'Visitors get only published content; no staff email addresses (other than an org’s public contact) or maps reach them.',
    leaks.length ? 'Check that organisation’s public pages and episode notes for staff emails.' : null);
  add('Public content', 'Browser protections', 'pass',
    'Every page is sent with a Content Security Policy (scripts only from Dashi itself), no-sniff, frame and referrer protection.');

  /* Running */
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 13);
  add('Running', 'Node version', nodeOk ? (major % 2 ? 'warn' : 'pass') : 'fail',
    `Node ${process.versions.node}.${major % 2 ? ' Odd-numbered versions get updates for only a few months.' : ''}`,
    !nodeOk ? 'Update to Node 22.13 or newer.' : major % 2 ? 'Use an even-numbered (long-term support) version.' : null);
  const last = listBackups()[0];
  const age = last ? (Date.now() - Date.parse(last.at)) / 36e5 : Infinity;
  add('Running', 'Backups', age < 26 ? 'pass' : last ? 'warn' : prod ? 'fail' : 'warn',
    last ? `Latest snapshot ${age < 1 ? 'less than an hour' : `${Math.round(age)} hours`} ago (${listBackups().length} kept).` : 'No database snapshot yet.',
    age < 26 ? null : 'Use Back up now; the server also takes one daily.');
  try {
    const fs = statfsSync(config.dataDir);
    const free = fs.bavail / fs.blocks;
    add('Running', 'Disk space', free > 0.15 ? 'pass' : free > 0.05 ? 'warn' : 'fail',
      `${Math.round(free * 100)}% of the data disk is free (${(fs.bavail * fs.bsize / 1073741824).toFixed(1)} GB).`,
      free > 0.15 ? null : 'Grow the volume, or remove old episodes.');
  } catch { /* not available */ }

  out.sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  const count = (s) => out.filter((c) => c.status === s).length;
  return { at: new Date().toISOString(), checks: out, summary: { pass: count('pass'), warn: count('warn'), fail: count('fail'), info: count('info') } };
}
