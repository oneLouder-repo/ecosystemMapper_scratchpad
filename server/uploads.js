/**
 * Large uploads (podcast audio up to several hundred MB), in resumable chunks.
 *
 *   POST   /api/uploads                 { filename, size, type } → { id, chunkSize, received }
 *   GET    /api/uploads/:id             → { received }  (to resume after a dropped connection)
 *   PUT    /api/uploads/:id?offset=N    the next chunk, appended at N (must equal received)
 *   POST   /api/uploads/:id/complete    checks the file and turns it into media → { id, size, mimetype }
 *   DELETE /api/uploads/:id             gives up and removes the part file
 *
 * The browser sends 8 MB at a time, so a dropped connection costs one chunk,
 * not the whole file, and no single request is big enough to trip a proxy's
 * body limit. Part files live in data/uploads/<org>/ and are swept after a day.
 */
import { createWriteStream, mkdirSync, openSync, readSync, closeSync, renameSync, rmSync, statSync, truncateSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { config } from './config.js';
import { now } from './db.js';
import { HttpError, json, readJson } from './http.js';

export const CHUNK = 8 * 1048576;
const DAY = 864e5;

/** What a file's first bytes say it is: 'audio/mpeg', 'audio/wav' or null. */
export function sniffAudio(buf) {
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.length >= 3 && buf.toString('latin1', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return null;
}

export function uploadRoutes({ q, newId }) {
  const dirOf = (orgId) => join(config.dataDir, 'uploads', orgId);
  const partOf = (u) => join(dirOf(u.org_id), `${u.id}.part`);
  const limit = () => config.maxUploadMb * 1048576;

  /** Bytes an org already keeps: its media plus uploads in progress. */
  const used = (orgId) => (q('SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE org_id = ?').get(orgId).n)
    + (q('SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE org_id = ?').get(orgId).n);

  function find(a, id) {
    const u = q('SELECT * FROM uploads WHERE id = ? AND org_id = ?').get(id, a.org.id);
    if (!u) throw new HttpError(404, 'That upload has expired. Start it again.');
    return u;
  }

  /** Remove uploads nobody finished within a day. */
  function sweep() {
    for (const u of q('SELECT * FROM uploads WHERE expires_at < ?').all(Date.now())) {
      rmSync(partOf(u), { force: true });
      q('DELETE FROM uploads WHERE id = ?').run(u.id);
    }
    // Part files with no row (a crash between steps).
    let orgs = [];
    try { orgs = readdirSync(join(config.dataDir, 'uploads')); } catch { return; }
    for (const org of orgs) {
      let files = [];
      try { files = readdirSync(join(config.dataDir, 'uploads', org)); } catch { continue; }
      for (const f of files) if (!q('SELECT 1 FROM uploads WHERE id = ?').get(f.replace(/\.part$/, ''))) rmSync(join(config.dataDir, 'uploads', org, f), { force: true });
    }
  }

  async function handle(req, res, a, path) {
    const method = req.method;
    let m;
    if (path === '/api/uploads' && method === 'POST') {
      if (!a.canEdit) throw new HttpError(403, 'You can’t upload here');
      const body = await readJson(req, 10_000);
      const size = Number(body?.size);
      const filename = String(body?.filename ?? 'upload').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'upload';
      if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, 'How big is the file?');
      if (size > limit()) throw new HttpError(413, `Files can be up to ${config.maxUploadMb} MB.`);
      if (!/\.(mp3|wav)$/i.test(filename) && !/^audio\/(mpeg|mp3|wav|x-wav|wave|vnd\.wave)$/.test(String(body?.type ?? ''))) throw new HttpError(415, 'Upload an .mp3 or .wav file');
      if (used(a.org.id) + size > config.orgStorageMb * 1048576) throw new HttpError(507, `Your organisation’s storage (${config.orgStorageMb / 1024} GB) is full. Remove old episodes or ask about a larger plan.`);
      const id = newId('up');
      mkdirSync(dirOf(a.org.id), { recursive: true });
      q('INSERT INTO uploads (id, org_id, filename, size, received, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)')
        .run(id, a.org.id, filename, size, a.user.id, now(), Date.now() + DAY);
      createWriteStream(join(dirOf(a.org.id), `${id}.part`)).end();
      return json(res, 201, { id, chunkSize: CHUNK, received: 0 });
    }
    if ((m = path.match(/^\/api\/uploads\/(up_[\w-]+)$/))) {
      if (!a.canEdit) throw new HttpError(403, 'You can’t upload here');
      const u = find(a, m[1]);
      if (method === 'GET') return json(res, 200, { id: u.id, received: u.received, size: u.size });
      if (method === 'DELETE') {
        rmSync(partOf(u), { force: true });
        q('DELETE FROM uploads WHERE id = ?').run(u.id);
        return json(res, 200, { ok: true });
      }
      if (method === 'PUT') {
        const offset = Number(new URL(req.url, 'http://x').searchParams.get('offset'));
        if (offset !== u.received) return json(res, 409, { error: 'Out of step', received: u.received });
        const room = Math.min(CHUNK, u.size - u.received);
        let got = 0;
        const counter = new Transform({ transform(chunk, _e, cb) { got += chunk.length; cb(got > room ? new HttpError(413, 'Chunk too large') : null, chunk); } });
        try {
          await pipeline(req, counter, createWriteStream(partOf(u), { flags: 'a' }));
        } catch (err) {
          // Cut back to the last good byte, so the next try starts clean.
          try { truncateSync(partOf(u), u.received); } catch { /* gone */ }
          throw err instanceof HttpError ? err : new HttpError(400, 'The chunk didn’t arrive');
        }
        const received = u.received + got;
        q('UPDATE uploads SET received = ?, expires_at = ? WHERE id = ?').run(received, Date.now() + DAY, u.id);
        return json(res, 200, { received });
      }
    }
    if ((m = path.match(/^\/api\/uploads\/(up_[\w-]+)\/complete$/)) && method === 'POST') {
      if (!a.canEdit) throw new HttpError(403, 'You can’t upload here');
      const u = find(a, m[1]);
      const part = partOf(u);
      const size = statSync(part).size;
      if (size !== u.size || u.received !== u.size) return json(res, 409, { error: 'The file isn’t all here yet', received: u.received });
      const head = Buffer.alloc(16);
      const fd = openSync(part, 'r');
      readSync(fd, head, 0, 16, 0);
      closeSync(fd);
      const mimetype = sniffAudio(head);
      if (!mimetype) {
        rmSync(part, { force: true });
        q('DELETE FROM uploads WHERE id = ?').run(u.id);
        throw new HttpError(415, 'That doesn’t look like an .mp3 or .wav file.');
      }
      const id = newId('media');
      const dir = join(config.dataDir, 'media', a.org.id);
      mkdirSync(dir, { recursive: true });
      renameSync(part, join(dir, id));
      q('INSERT INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, a.org.id, u.filename, mimetype, size, now(), a.user.id);
      q('DELETE FROM uploads WHERE id = ?').run(u.id);
      return json(res, 201, { id, size, mimetype });
    }
    return false;
  }

  return { handle, sweep };
}
