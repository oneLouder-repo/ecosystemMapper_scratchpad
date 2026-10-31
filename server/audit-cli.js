/**
 * `npm run audit`: the security audit from the command line, with the same
 * settings (.env) as the server. Exits with 1 if any check fails, so it can
 * run in a deploy pipeline.
 */
import { config } from './config.js';
import { openDb } from './db.js';
import { runAudit } from './audit.js';

const db = openDb(config.dataDir);
const { checks, summary } = runAudit(db);
db.close();
const MARK = { pass: '\x1b[32m✓\x1b[0m', warn: '\x1b[33m!\x1b[0m', fail: '\x1b[31m✗\x1b[0m', info: '\x1b[36mi\x1b[0m' };
let area = '';
for (const c of checks) {
  if (c.area !== area) console.log(`\n${(area = c.area)}`);
  console.log(`  ${MARK[c.status]} ${c.title}: ${c.detail}`);
  if (c.fix) console.log(`      → ${c.fix}`);
}
console.log(`\n${summary.pass} passed, ${summary.warn} to look at, ${summary.fail} failed.`);
process.exit(summary.fail ? 1 : 0);
