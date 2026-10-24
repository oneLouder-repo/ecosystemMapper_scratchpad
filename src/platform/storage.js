/**
 * Local persistence for each tool's document. Later this becomes the
 * server API (accounts, permissions, sync); the calls stay the same shape.
 */
const PREFIX = 'org-toolbox:v1:';

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
