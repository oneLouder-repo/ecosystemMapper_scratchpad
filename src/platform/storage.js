/**
 * Local persistence. Later this becomes the server API (accounts,
 * permissions, sync); the calls stay the same shape.
 *
 * Keys:
 *   org-toolbox:v3:registry              which orgs exist, which is open, who is signed in
 *   org-toolbox:v3:<orgId>/<docName>     one document of one org (org, strategy, data, map/<id>, ...)
 *
 * Every document belongs to an org, so the platform can load any org on
 * command and nothing leaks between them.
 */
// Bump the version when the example data changes shape, so everyone starts fresh.
const ROOT = 'org-toolbox:v3:';
export const REGISTRY_KEY = `${ROOT}registry`;

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
let activeOrgId = readKey(REGISTRY_KEY)?.currentOrgId ?? 'org-example';
export const setActiveOrg = (id) => { activeOrgId = id; };
export const activeOrg = () => activeOrgId;

export const docKey = (name, orgId = activeOrgId) => `${ROOT}${orgId}/${name}`;
export const loadDoc = (name, orgId) => readKey(docKey(name, orgId));
export const saveDoc = (name, doc, orgId) => writeKey(docKey(name, orgId), doc);

/** Remove every document of an org. */
export function clearOrg(orgId) {
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
 * Call fn(doc) when another tab saves this document, e.g. so a public site
 * updates live while staff edit dashboards or program data.
 */
export function onDocChange(name, fn) {
  window.addEventListener('storage', (e) => {
    if (e.key !== docKey(name) || !e.newValue) return;
    try {
      fn(JSON.parse(e.newValue));
    } catch {
      // Ignore a half-written value; the next save brings a whole one.
    }
  });
}
