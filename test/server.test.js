import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A throwaway server with its own data folder and the example orgs.
const dataDir = mkdtempSync(join(tmpdir(), 'toolbox-test-'));
Object.assign(process.env, { DATA_DIR: dataDir, DEV_LOGIN: 'true', SEED_EXAMPLES: 'true', BASE_DOMAIN: 'localhost', NODE_ENV: 'test' });
let srv;
before(async () => { srv = await (await import('../server/index.js')).start({ port: 0, quiet: true }); });
after(() => { srv.server.closeAllConnections?.(); srv.server.close(); srv.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

/** A request to the test server, as if to `host`. */
function call(host, method, path, { body, cookie, headers = {}, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = request({ host: '127.0.0.1', port: srv.port, method, path, headers: {
      host, ...(cookie && { cookie }), ...(data && !Buffer.isBuffer(body) && { 'content-type': 'application/json' }),
      ...(method !== 'GET' && { 'x-toolbox': '1' }), ...headers,
    } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text, raw: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const EX = 'example.localhost';
const RB = 'riverbend.localhost';
async function signIn(email, host = EX) {
  const opts = await call(host, 'GET', '/api/auth/options');
  const user = opts.json.dev.find((u) => u.email === email);
  const res = await call(host, 'POST', '/api/auth/dev', { body: { userId: user.id } });
  return res.headers['set-cookie'][0].split(';')[0];
}

test('each org lives at its own subdomain; unknown ones say so', async () => {
  const ex = await call(EX, 'GET', '/api/session');
  assert.equal(ex.json.org.id, 'org-example');
  assert.equal((await call(RB, 'GET', '/api/session')).json.org.id, 'org-riverbend');
  assert.equal((await call('localhost', 'GET', '/api/session')).json.org, null, 'the root domain is the platform itself');
  assert.equal((await call('nope.localhost', 'GET', '/api/session')).json.org, null);
  assert.equal((await call('elsewhere.example.com', 'GET', '/')).status, 404);
});

test('visitors get only what is published', async () => {
  const { json: s } = await call(EX, 'GET', '/api/session');
  assert.equal(s.user, null);
  assert.equal(s.canEdit, false);
  assert.ok(!s.docs.maps && !s.docs['map/map-ecosystem'], 'no maps');
  assert.ok(!Object.values(s.docs.pages.pages).some((p) => p.status === 'draft'), 'no drafts');
  assert.ok(!Object.values(s.docs.podcasts.episodes).some((e) => e.status === 'scheduled'), 'no future episodes');
  assert.ok(Object.values(s.docs.dashboards.dashboards).every((d) => d.visibility === 'public'));
  assert.ok(Object.keys(s.docs.org.staff).length < 12, 'only people the public content names');
  assert.ok(Object.values(s.docs.org.staff).every((p) => !('email' in p) && !('roleId' in p)));
  assert.ok(!s.docs.org.sites['site-board'], 'private sites stay private');
  assert.ok(Object.values(s.docs.strategy.nodes).every((n) => !n.assigneeIds && !n.assets && n.notes === ''), 'strategy items carry titles and status only');
  assert.equal((await call(EX, 'GET', '/api/docs/maps')).status, 404);
});

test('saving needs a signed-in member, the x-toolbox header, and the right role', async () => {
  const anon = await call(EX, 'PUT', '/api/docs/strategy', { body: { nodes: {} } });
  assert.equal(anon.status, 403);
  const amara = await signIn('amara@example.org');
  const noHeader = await call(EX, 'PUT', '/api/docs/test-doc', { body: { a: 1 }, cookie: amara, headers: { 'x-toolbox': '' } });
  assert.equal(noHeader.status, 403, 'other sites can’t post on your behalf');
  assert.equal((await call(EX, 'PUT', '/api/docs/test-doc', { body: { a: 1 }, cookie: amara })).status, 200);
  assert.deepEqual((await call(EX, 'GET', '/api/docs/test-doc', { cookie: amara })).json, { a: 1 });
  assert.equal((await call(RB, 'GET', '/api/session', { cookie: amara })).json.member, false, 'not a member of another org');
  assert.equal((await call(RB, 'PUT', '/api/docs/test-doc', { body: { a: 1 }, cookie: amara })).status, 403);

  const ben = await signIn('ben@example.org');
  const org = (await call(EX, 'GET', '/api/docs/org', { cookie: ben })).json;
  assert.equal((await call(EX, 'PUT', '/api/docs/org', { body: org, cookie: ben })).status, 403, 'only admins change the org’s settings');
  assert.equal((await call(EX, 'PUT', '/api/docs/../x', { body: {}, cookie: ben })).status, 404);
});

test('the staff list decides who can sign in, and as what', async () => {
  const amara = await signIn('amara@example.org');
  const org = (await call(EX, 'GET', '/api/docs/org', { cookie: amara })).json;
  org.staff['s-new'] = { id: 's-new', name: 'New Person', roleId: 'viewer', email: 'New@Person.example', teamIds: [] };
  org.staff['s-comms'].email = 'maya@riverbend.example'; // Maya now also works here.
  assert.equal((await call(EX, 'PUT', '/api/docs/org', { body: org, cookie: amara })).status, 200);
  const viewer = await signIn('new@person.example');
  const s = (await call(EX, 'GET', '/api/session', { cookie: viewer })).json;
  assert.equal(s.member, true);
  assert.equal(s.canEdit, false, 'viewers read only');
  assert.equal((await call(EX, 'PUT', '/api/docs/strategy', { body: { nodes: {} }, cookie: viewer })).status, 403);
  const maya = await signIn('maya@riverbend.example', RB);
  const orgs = (await call(RB, 'GET', '/api/session', { cookie: maya })).json.orgs.map((o) => o.id).sort();
  assert.deepEqual(orgs, ['org-example', 'org-riverbend'], 'one person, two orgs');
});

test('switching org hands the sign-in over with a one-time token', async () => {
  const maya = await signIn('maya@riverbend.example', RB);
  const sw = await call(RB, 'GET', '/auth/switch?org=org-example&next=/podcasts.html', { cookie: maya });
  assert.equal(sw.status, 302);
  const to = new URL(sw.headers.location);
  assert.equal(to.hostname, EX);
  const first = await call(EX, 'GET', `${to.pathname}${to.search}`);
  assert.equal(first.status, 302);
  assert.equal(first.headers.location, '/podcasts.html');
  const cookie = first.headers['set-cookie'][0].split(';')[0];
  assert.equal((await call(EX, 'GET', '/api/session', { cookie })).json.user.email, 'maya@riverbend.example');
  assert.equal((await call(EX, 'GET', `${to.pathname}${to.search}`)).status, 400, 'a token works once');
  const amara = await signIn('amara@example.org');
  assert.equal((await call(EX, 'GET', '/auth/switch?org=org-riverbend', { cookie: amara })).status, 403, 'only to your own orgs');
});

test('audio uploads: members upload; the public hears only published episodes; range requests work', async () => {
  const amara = await signIn('amara@example.org');
  const audio = Buffer.alloc(5000, 7);
  const up = await call(EX, 'POST', '/api/media', { body: audio, cookie: amara, headers: { 'content-type': 'audio/mpeg', 'x-filename': 'ep.mp3' } });
  assert.equal(up.status, 201);
  const id = up.json.id;
  assert.equal((await call(EX, 'POST', '/api/media', { body: audio, headers: { 'content-type': 'audio/mpeg' } })).status, 403);
  assert.equal((await call(EX, 'POST', '/api/media', { body: audio, cookie: amara, headers: { 'content-type': 'text/html', 'x-filename': 'x.html' } })).status, 415);
  assert.equal((await call(EX, 'GET', `/media/${id}`)).status, 404, 'not public until an episode is out');
  const part = await call(EX, 'GET', `/media/${id}`, { cookie: amara, headers: { range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.raw.length, 100);
  assert.equal(part.headers['content-range'], 'bytes 100-199/5000');

  const pods = (await call(EX, 'GET', '/api/docs/podcasts', { cookie: amara })).json;
  pods.episodes['ep-up'] = { ...pods.episodes['ep-sv-4'], id: 'ep-up', number: 9, publishedAt: '2026-01-01', status: 'published', audio: { mediaId: id, duration: 1, mimetype: 'audio/mpeg' } };
  await call(EX, 'PUT', '/api/docs/podcasts', { body: pods, cookie: amara });
  assert.equal((await call(EX, 'GET', `/media/${id}`)).status, 200, 'public once published');
  assert.equal((await call(RB, 'GET', `/media/${id}`)).status, 404, 'and only at its own org');
});

test('only the app’s own files are served', async () => {
  for (const path of ['/server/app.js', '/package.json', '/data/toolbox.db', '/test/server.test.js', '/.env', '/src/../server/config.js']) {
    assert.equal((await call(EX, 'GET', path)).status, 404, path);
  }
  assert.equal((await call(EX, 'GET', '/src/plugins.js')).status, 200);
  assert.match((await call(EX, 'GET', '/')).text, /src\/pages\/site\.js/, 'visitors land on the public site');
  const amara = await signIn('amara@example.org');
  assert.match((await call(EX, 'GET', '/', { cookie: amara })).text, /src\/pages\/dashboard\.js/, 'members land on the dashboard');
});

test('the platform admin makes and suspends orgs; everyone else can’t', async () => {
  const amara = await signIn('amara@example.org');
  assert.equal((await call('localhost', 'POST', '/api/admin/orgs', { body: { name: 'X', slug: 'x' }, cookie: amara })).status, 403);
  const admin = await signIn('admin@localhost', 'localhost');
  const made = await call('localhost', 'POST', '/api/admin/orgs', { body: { name: 'Northside Arts', slug: 'northside', adminEmail: 'jo@northside.example', adminName: 'Jo' }, cookie: admin });
  assert.equal(made.status, 201);
  assert.equal((await call('localhost', 'POST', '/api/admin/orgs', { body: { name: 'Again', slug: 'northside' }, cookie: admin })).status, 409);
  assert.equal((await call('localhost', 'POST', '/api/admin/orgs', { body: { name: 'Bad', slug: 'www' }, cookie: admin })).status, 400);
  const jo = await signIn('jo@northside.example', 'northside.localhost');
  assert.equal((await call('northside.localhost', 'GET', '/api/session', { cookie: jo })).json.canAdmin, true);
  await call('localhost', 'PATCH', `/api/admin/orgs/${made.json.id}`, { body: { status: 'suspended' }, cookie: admin });
  assert.equal((await call('northside.localhost', 'GET', '/api/session', { cookie: jo })).json.org, null, 'a suspended org is closed');
});

test('passwords are hashed and checked', async () => {
  const admin = await signIn('admin@localhost', 'localhost');
  const user = (await call('localhost', 'GET', '/api/admin/users', { cookie: admin })).json.find((u) => u.email === 'ben@example.org');
  assert.equal((await call('localhost', 'POST', `/api/admin/users/${user.id}/password`, { body: { password: 'short' }, cookie: admin })).status, 400);
  await call('localhost', 'POST', `/api/admin/users/${user.id}/password`, { body: { password: 'correct horse battery' }, cookie: admin });
  const row = srv.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  assert.match(row.password_hash, /^scrypt\$/);
  assert.equal((await call(EX, 'POST', '/api/auth/password', { body: { email: 'ben@example.org', password: 'wrong' } })).status, 401);
  assert.equal((await call(EX, 'POST', '/api/auth/password', { body: { email: 'BEN@example.org', password: 'correct horse battery' } })).status, 200);
});

test('the platform admin switches plugins on for an org, or pauses them', async () => {
  const admin = await signIn('admin@localhost', 'localhost');
  const amara = await signIn('amara@example.org');
  const plugins = (id, body, cookie = admin) => call('localhost', 'POST', `/api/admin/orgs/${id}/plugins`, { body, cookie });
  assert.equal((await plugins('org-riverbend', { plugin: 'podcasts', on: true }, amara)).status, 403);
  // Riverbend had switched podcasts off; switching it on from the console turns it on in their settings too.
  await plugins('org-riverbend', { plugin: 'podcasts', on: true });
  const orgs = (await call('localhost', 'GET', '/api/admin/orgs', { cookie: admin })).json;
  assert.equal(orgs.find((o) => o.id === 'org-riverbend').chosen.podcasts, true);
  // Pausing keeps the content but hides it, from members and the public.
  await plugins('org-example', { plugin: 'pages', on: false });
  const member = (await call(EX, 'GET', '/api/session', { cookie: amara })).json;
  assert.equal(member.docs.org.platform.paused.pages, true);
  assert.ok(Object.keys(member.docs.pages.pages).length > 0, 'the pages are still there');
  assert.equal(Object.keys((await call(EX, 'GET', '/api/session')).json.docs.pages.pages).length, 0, 'but not on the public site');
  // An org can't unpause itself by writing its own org doc.
  const doc = { ...member.docs.org, platform: { paused: {} } };
  assert.equal((await call(EX, 'PUT', '/api/docs/org', { body: doc, cookie: amara })).status, 200);
  assert.equal((await call(EX, 'GET', '/api/session', { cookie: amara })).json.docs.org.platform.paused.pages, true);
  await plugins('org-example', { plugin: 'pages', on: true });
  assert.ok(Object.keys((await call(EX, 'GET', '/api/session')).json.docs.pages.pages).length > 0);
});

test('only the platform admin edits the help library', async () => {
  const admin = await signIn('admin@localhost', 'localhost');
  const amara = await signIn('amara@example.org');
  assert.equal((await call(EX, 'GET', '/api/help')).json, null, 'the built-in library until someone edits it');
  assert.equal((await call(EX, 'GET', '/api/session', { cookie: amara })).json.canEditHelp, false);
  const lib = { version: 1, sections: [{ id: 'podcasting', title: 'Podcasting', icon: 'mic', pages: [{ id: 'start', title: 'Start', body: 'Hello' }] }] };
  assert.equal((await call(EX, 'PUT', '/api/help', { body: lib, cookie: amara })).status, 403);
  assert.equal((await call('localhost', 'PUT', '/api/help', { body: { nope: 1 }, cookie: admin })).status, 400);
  assert.equal((await call('localhost', 'PUT', '/api/help', { body: lib, cookie: admin })).status, 200);
  assert.deepEqual((await call(RB, 'GET', '/api/help')).json, lib, 'one library for every org');
});

test('large uploads arrive in chunks, resume after a gap, and are checked before they become media', async () => {
  const amara = await signIn('amara@example.org');
  const CHUNK = 8 * 1048576;
  const size = CHUNK * 2 + 12345;
  const file = Buffer.alloc(size, 7);
  Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1').copy(file);
  assert.equal((await call(EX, 'POST', '/api/uploads', { body: { filename: 'ep.mp3', size } })).status, 403, 'members only');
  assert.equal((await call(EX, 'POST', '/api/uploads', { body: { filename: 'x.exe', size, type: 'application/x-msdownload' }, cookie: amara })).status, 415);
  assert.equal((await call(EX, 'POST', '/api/uploads', { body: { filename: 'big.mp3', size: 10 * 1024 * 1048576 }, cookie: amara })).status, 413);
  const start = await call(EX, 'POST', '/api/uploads', { body: { filename: 'long episode.mp3', size, type: 'audio/mpeg' }, cookie: amara });
  assert.equal(start.status, 201);
  const { id, chunkSize } = start.json;
  assert.equal(chunkSize, CHUNK);
  const put = (offset, buf) => call(EX, 'PUT', `/api/uploads/${id}?offset=${offset}`, { body: buf, cookie: amara, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal((await put(0, file.subarray(0, CHUNK))).json.received, CHUNK);
  // A repeated chunk (the browser didn't hear back) is refused with where to carry on.
  const again = await put(0, file.subarray(0, CHUNK));
  assert.equal(again.status, 409);
  assert.equal(again.json.received, CHUNK);
  assert.equal((await call(EX, 'POST', `/api/uploads/${id}/complete`, { cookie: amara })).status, 409, 'not all here yet');
  assert.equal((await call(EX, 'GET', `/api/uploads/${id}`, { cookie: amara })).json.received, CHUNK);
  assert.equal((await put(CHUNK, file.subarray(CHUNK, CHUNK * 3))).status, 413, 'a chunk can’t be bigger than a chunk');
  assert.equal((await call(EX, 'GET', `/api/uploads/${id}`, { cookie: amara })).json.received, CHUNK, 'a refused chunk leaves nothing behind');
  await put(CHUNK, file.subarray(CHUNK, CHUNK * 2));
  await put(CHUNK * 2, file.subarray(CHUNK * 2));
  const done = await call(EX, 'POST', `/api/uploads/${id}/complete`, { cookie: amara });
  assert.equal(done.status, 201);
  assert.equal(done.json.size, size);
  assert.equal(done.json.mimetype, 'audio/mpeg');
  const back = await call(EX, 'GET', `/media/${done.json.id}`, { cookie: amara });
  assert.ok(back.raw.equals(file), 'the file comes back byte for byte');
  assert.equal((await call(RB, 'GET', `/api/uploads/${id}`, { cookie: amara })).status, 403, 'another org can’t see it');

  // Something that isn't audio is refused at the end, and removed.
  const fake = await call(EX, 'POST', '/api/uploads', { body: { filename: 'fake.mp3', size: 10 }, cookie: amara });
  await call(EX, 'PUT', `/api/uploads/${fake.json.id}?offset=0`, { body: Buffer.from('<html>hi</'), cookie: amara, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal((await call(EX, 'POST', `/api/uploads/${fake.json.id}/complete`, { cookie: amara })).status, 415);
  assert.equal((await call(EX, 'GET', `/api/uploads/${fake.json.id}`, { cookie: amara })).status, 404);
});
