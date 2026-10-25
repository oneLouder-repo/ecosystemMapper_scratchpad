/**
 * Where documents live. Two modes, with the same calls:
 *
 * Hosted (the Node server in server/): the page asks /api/session who is
 * signed in and which org this address belongs to, and gets that org's
 * documents with the answer. Reads come from that copy; saves go back to
 * the server. A visitor who isn't signed in gets only what the org has
 * published (the server filters it), and can't save.
 *
 * Local (no server: opened from a static host or the prototype): the
 * browser's local storage, keyed by org.
 *   org-toolbox:v3:registry              which orgs exist, which is open, who is signed in
 *   org-toolbox:v3:<orgId>/<docName>     one document of one org (org, strategy, data, map/<id>, ...)
 *
 * Every document belongs to an org, so nothing leaks between them.
 */
// Bump the version when the example data changes shape, so everyone starts fresh.
const ROOT = 'org-toolbox:v3:';
export const REGISTRY_KEY = `${ROOT}registry`;

const inBrowser = typeof window !== 'undefined' && typeof location !== 'undefined';

/** The server's answer to "who am I, and where am I?", or null when running locally. */
let hosted = null;
if (inBrowser && location.protocol.startsWith('http')) {
  try {
    const res = await fetch('/api/session', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) hosted = await res.json();
  } catch {
    // No server here: run locally.
  }
}
export const session = () => hosted;
export const isHosted = () => !!hosted;

// Hosted pages for staff need someone signed in; public site pages don't.
if (hosted && inBrowser) {
  const publicPage = document.body?.classList.contains('site-page');
  const target = !hosted.org ? '/' : !hosted.user && !publicPage ? `/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}` : null;
  if (target && location.pathname !== '/' && location.pathname !== '/platform.html') {
    location.replace(target);
    await new Promise(() => {}); // Stop this page here while the browser moves on.
  }
}

export function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage can be unavailable (private mode, quota). The tool still works in memory.
    return false;
  }
}

/** The org whose documents are read and written; set by session.js. */
let activeOrgId = hosted?.org?.id ?? (inBrowser ? readKey(REGISTRY_KEY)?.currentOrgId : null) ?? 'org-example';
export const setActiveOrg = (id) => { if (!hosted) activeOrgId = id; };
export const activeOrg = () => activeOrgId;

export const docKey = (name, orgId = activeOrgId) => `${ROOT}${orgId}/${name}`;

/* Hosted: documents come with the session; saves are sent, one at a time per document. */
const cache = hosted?.docs ?? {};
const sending = {};
async function send(name) {
  const job = sending[name];
  if (!job || job.busy) return;
  job.busy = true;
  while (job.next) {
    const doc = job.next;
    job.next = null;
    try {
      // No keepalive here: browsers cap keepalive requests at 64 KB in total, so
      // a big document (a map) or a few saves in a row would fail outright.
      const res = await fetch(`/api/docs/${encodeURIComponent(name)}`, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(doc),
      });
      if (!res.ok) saveProblem(name, res.status === 403 ? 'You can’t change this here.' : `The server said ${res.status}.`);
      job.retries = 0;
    } catch (err) {
      console.warn(`Saving ${name}: the request failed`, err);
      job.next ??= doc;
      // Try again shortly (2s, 4s, 8s… up to a minute); the next change also retries.
      job.retries = (job.retries ?? 0) + 1;
      if (job.retries > 2) saveProblem(name, 'The server could not be reached. Your changes will be saved when it’s back.');
      clearTimeout(job.timer);
      job.timer = setTimeout(() => send(name), Math.min(60000, 1000 * 2 ** job.retries));
      break;
    }
  }
  job.busy = false;
}
// Leaving the page: send whatever is still waiting, if it's small enough to go with keepalive.
if (hosted) window.addEventListener('pagehide', () => {
  for (const [name, job] of Object.entries(sending)) {
    if (!job.next) continue;
    const body = JSON.stringify(job.next);
    if (new Blob([body]).size > 60000) continue;
    fetch(`/api/docs/${encodeURIComponent(name)}`, { method: 'PUT', keepalive: true, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body }).catch(() => {});
  }
});
function saveProblem(name, why) {
  console.warn(`Saving ${name} failed: ${why}`);
  window.dispatchEvent(new CustomEvent('toolbox:save-failed', { detail: { name, why } }));
}

export function loadDoc(name, orgId) {
  if (hosted) return orgId && orgId !== activeOrgId ? null : (cache[name] ? structuredClone(cache[name]) : null);
  return readKey(docKey(name, orgId));
}

export function saveDoc(name, doc, orgId) {
  if (hosted) {
    if (orgId && orgId !== activeOrgId) return false;
    cache[name] = structuredClone(doc);
    if (!hosted.canEdit) return false;
    (sending[name] ??= {}).next = cache[name];
    send(name);
    return true;
  }
  return writeKey(docKey(name, orgId), doc);
}

/** Remove every document of an org (local only; the server deletes hosted orgs). */
export function clearOrg(orgId) {
  if (hosted) return;
  const prefix = `${ROOT}${orgId}/`;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** Save a store's document shortly after each change. */
export function autosaveDoc(name, store, delay = 400) {
  let timer;
  const orgId = activeOrgId;
  store.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveDoc(name, store.doc, orgId), delay);
  });
}

/** Load a document, or create it from a seed function the first time. */
export function loadOrSeed(name, seed, orgId) {
  const doc = loadDoc(name, orgId);
  if (doc) return doc;
  const fresh = seed();
  saveDoc(name, fresh, orgId);
  return fresh;
}

/**
 * Call fn(doc) when someone else saves this document: another tab, or
 * (hosted) another person. A public site uses it to update live while
 * staff edit dashboards or program data.
 */
const listeners = {};
let events = null;
export function onDocChange(name, fn) {
  if (hosted) {
    (listeners[name] ??= []).push(fn);
    events ??= listen();
    return;
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== docKey(name) || !e.newValue) return;
    try {
      fn(JSON.parse(e.newValue));
    } catch {
      // Ignore a half-written value; the next save brings a whole one.
    }
  });
}

/** Hosted: the server announces which documents changed; fetch the ones someone is listening for. */
function listen() {
  const source = new EventSource('/api/events');
  source.addEventListener('doc', async (e) => {
    const { name, by } = JSON.parse(e.data);
    if (by && by === hosted.sessionTag) return; // Our own save coming back.
    if (!listeners[name]) return;
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(name)}`, { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      const doc = await res.json();
      cache[name] = doc;
      for (const fn of listeners[name]) fn(structuredClone(doc));
    } catch {
      // Missed one; the next change brings it.
    }
  });
  return source;
}
