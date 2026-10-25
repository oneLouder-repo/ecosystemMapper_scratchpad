/**
 * Uploaded media files (podcast audio, which is too big for local
 * storage), kept in the browser's IndexedDB per org. Later the Node
 * server stores them and this becomes upload / URL calls; callers only
 * see putMedia → id and mediaUrl(id) → a URL to play.
 */
import { activeOrg } from './storage.js';

const DB = 'org-toolbox-media';
let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('files', mode);
    const out = fn(t.objectStore('files'));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
};

const keyOf = (id) => `${activeOrg()}/${id}`;

/** Store a file; returns its id. */
export async function putMedia(file) {
  const id = `media_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await tx('readwrite', (s) => s.put({ blob: file, name: file.name, type: file.type, size: file.size }, keyOf(id)));
  return id;
}

export const deleteMedia = (id) => tx('readwrite', (s) => s.delete(keyOf(id)));

const urls = new Map();
/** A playable URL for stored media, or null if it is gone. */
export async function mediaUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await tx('readonly', (s) => s.get(keyOf(id)));
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, url);
  return url;
}

/** The URL to play an episode's audio: a bundled file or an upload. */
export const audioSrc = (audio) => (audio.mediaId ? mediaUrl(audio.mediaId) : Promise.resolve(audio.url));

/** Read an audio file's length in seconds. */
export function audioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? Math.round(a.duration) : 0); URL.revokeObjectURL(url); };
    a.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    a.src = url;
  });
}
