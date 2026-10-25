import { isHosted, readKey, writeKey } from './storage.js';
import { HELP_SEED } from '../help/library.js';

/**
 * The help library: { version, sections: [{ id, title, icon, blurb, pages: [{ id, title, body }] }] }.
 * It belongs to the platform, not an org. On a server it is kept there and
 * only the platform admin may change it; locally it is kept in this browser.
 * Until someone edits it, the built-in library (help/library.js) is used.
 */
const KEY = 'org-toolbox:v3:help';
const copy = (doc) => JSON.parse(JSON.stringify(doc));

export async function loadHelp() {
  if (isHosted()) {
    try {
      const res = await fetch('/api/help');
      const doc = res.ok ? await res.json() : null;
      if (doc?.sections) return { doc, custom: true };
    } catch { /* fall back to the built-in library */ }
    return { doc: copy(HELP_SEED), custom: false };
  }
  const doc = readKey(KEY);
  return doc?.sections ? { doc, custom: true } : { doc: copy(HELP_SEED), custom: false };
}

export async function saveHelp(doc) {
  if (!isHosted()) {
    if (!writeKey(KEY, doc)) throw new Error('This browser would not save it (storage is full or off).');
    return;
  }
  const res = await fetch('/api/help', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(doc) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `The server said ${res.status}`);
}

/** Go back to the built-in library. */
export async function resetHelp() {
  const doc = copy(HELP_SEED);
  await saveHelp(doc);
  return doc;
}

/** A short id from a title, unique among `taken`. */
export function helpId(title, taken) {
  const base = (title || 'page').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40) || 'page';
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}
