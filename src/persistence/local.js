// Bump the version when the saved shape changes enough that old maps should not load by default.
const KEY = 'ecosystem-mapper:v3:current-map';

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocal(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage can be unavailable (private mode, quota). The map still works in memory.
  }
}

/** Save to local storage shortly after each change. */
export function autosave(store, delay = 400) {
  let timer;
  store.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveLocal(store.map), delay);
  });
}
