/**
 * The database: one SQLite file, using the SQLite built into Node (22.13+),
 * so there is nothing to install or run beside the app. Back it up by
 * copying the data folder.
 *
 *   users        everyone who can sign in (is_super: the platform admin)
 *   identities   sign-in methods linked to a user (google subject ids)
 *   orgs         each org: its subdomain slug, plan and status
 *   domains      extra host names for an org (custom domains, later)
 *   memberships  who belongs to which org, as which staff record and role
 *   docs         each org's documents (org, strategy, maps, podcasts...), as JSON
 *   media        uploaded files (podcast audio), stored in data/media/
 *   uploads      chunked uploads still arriving, in data/uploads/
 *   platform_docs  the platform's own documents (the help library)
 *   sessions     signed-in browsers; handoffs: one-time tokens to carry a
 *                sign-in to another of the platform's hosts
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
     password_hash TEXT, is_super INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE identities (
     provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     PRIMARY KEY (provider, subject))`,
  `CREATE TABLE orgs (
     id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
     plan TEXT NOT NULL DEFAULT 'free', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
  `CREATE TABLE domains (host TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE)`,
  `CREATE TABLE memberships (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
     staff_id TEXT, role TEXT NOT NULL DEFAULT 'staff', PRIMARY KEY (user_id, org_id))`,
  `CREATE TABLE docs (
     org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, name TEXT NOT NULL, json TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY (org_id, name))`,
  `CREATE TABLE media (
     id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, filename TEXT NOT NULL,
     mimetype TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL, created_by TEXT)`,
  `CREATE TABLE sessions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     view_as TEXT NOT NULL DEFAULT '{}', expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE handoffs (
     token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     host TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE oauth_states (state TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  // Plugins the platform admin has paused for an org, e.g. {"podcasts": true}.
  `ALTER TABLE orgs ADD COLUMN paused_plugins TEXT NOT NULL DEFAULT '{}'`,
  // Documents that belong to the platform, not an org (the help library).
  `CREATE TABLE platform_docs (name TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  // Chunked uploads in progress (server/uploads.js).
  `CREATE TABLE uploads (
     id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, filename TEXT NOT NULL,
     size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  // Session and handoff tokens are now kept hashed (SHA-256); older plain ones are cleared, so everyone signs in once more.
  `DELETE FROM sessions; DELETE FROM handoffs; DELETE FROM oauth_states;`,
];

export function openDb(dataDir) {
  mkdirSync(join(dataDir, 'media'), { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'toolbox.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  // Schema versions: add new statements to SCHEMA; each runs once.
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (n INTEGER NOT NULL)');
  const done = db.prepare('SELECT n FROM schema_version').get()?.n ?? 0;
  if (!done) db.prepare('INSERT INTO schema_version (n) VALUES (0)').run();
  for (let i = done; i < SCHEMA.length; i++) {
    db.exec(SCHEMA[i]);
    db.prepare('UPDATE schema_version SET n = ?').run(i + 1);
  }
  return db;
}

export const now = () => new Date().toISOString();
