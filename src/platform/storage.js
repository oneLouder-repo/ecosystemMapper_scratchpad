/**
 * Local persistence for each tool's document. Later this becomes the
 * server API (accounts, permissions, sync); the calls stay the same shape.
 */
// Bump the version when the example data changes shape, so everyone starts fresh.
const PREFIX = 'org-toolbox:v2:';

export function loadDoc(name) {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDoc(name, doc) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(doc));
  } catch {
    // Storage can be unavailable (private mode, quota). The tool still works in memory.
  }
}

/** Save a store's document shortly after each change. */
export function autosaveDoc(name, store, delay = 400) {
  let timer;
  store.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveDoc(name, store.doc), delay);
  });
}

/** Load a document, or create it from a seed function the first time. */
export function loadOrSeed(name, seed) {
  const doc = loadDoc(name);
  if (doc) return doc;
  const fresh = seed();
  saveDoc(name, fresh);
  return fresh;
}

/**
 * Call fn(doc) when another tab saves this document, e.g. so a public site
 * updates live while staff edit dashboards or program data.
 */
export function onDocChange(name, fn) {
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFIX + name || !e.newValue) return;
    try {
      fn(JSON.parse(e.newValue));
    } catch {
      // Ignore a half-written value; the next save brings a whole one.
    }
  });
}
