/**
 * Database backups: a consistent snapshot of the SQLite file, taken while
 * the server runs (VACUUM INTO), once a day and whenever the platform admin
 * asks. Snapshots go to data/backups/ and are kept for BACKUP_DAYS days.
 *
 * Snapshots sit on the same disk as the database, so they guard against
 * mistakes (a deleted org, a bad import), not a lost disk. For that, use the
 * host's volume snapshots (Fly.io takes them daily) or copy data/backups
 * somewhere else; DEPLOY.md shows how.
 *
 * Uploaded audio (data/media) isn't in the snapshot: it is large and never
 * changes once uploaded, so the volume snapshots cover it.
 */
import { mkdirSync, readdirSync, statSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

const DIR = () => join(config.dataDir, 'backups');
const NAME = /^toolbox-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d(-\d{3})?)\.db$/;

/** The snapshots there are, newest first: [{ name, size, at }]. */
export function listBackups() {
  let names = [];
  try { names = readdirSync(DIR()); } catch { return []; }
  return names.filter((n) => NAME.test(n)).map((name) => {
    const st = statSync(join(DIR(), name));
    return { name, size: st.size, at: st.mtime.toISOString() };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

/** Take a snapshot now, then remove ones older than BACKUP_DAYS. */
export function backupNow(db) {
  mkdirSync(DIR(), { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().slice(0, 23).replace(/[:.]/g, '-');
  const file = join(DIR(), `toolbox-${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  try { chmodSync(file, 0o600); } catch { /* not on this system */ }
  const cutoff = Date.now() - config.backupDays * 864e5;
  const all = listBackups();
  // Always keep the newest three, however old.
  for (const b of all.slice(3)) if (Date.parse(b.at) < cutoff) rmSync(join(DIR(), b.name), { force: true });
  return listBackups()[0];
}

/** A snapshot whenever the newest is more than a day old; checked hourly. */
export function scheduleBackups(db, log = () => {}) {
  const check = () => {
    const last = listBackups()[0];
    if (last && Date.now() - Date.parse(last.at) < 864e5 - 5 * 60_000) return;
    try { log(`Backed up the database: ${backupNow(db).name}`); } catch (err) { console.error('Backup failed:', err); }
  };
  check();
  return setInterval(check, 3600_000).unref();
}
