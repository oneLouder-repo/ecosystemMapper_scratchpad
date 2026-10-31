/**
 * Uploaded media files (podcast audio). Callers only see
 * putMedia(file) → id and mediaUrl(id) → a URL to play.
 *
 * Hosted, files go to the server in chunks (/api/uploads) and play from
 * /media/<id>, which streams with range requests so listeners can skip
 * ahead. Locally, they are kept in the browser's IndexedDB per org.
 */
import { activeOrg, isHosted, hostedLimits } from './storage.js';

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

/** The largest upload this server takes, in MB (local preview: what a browser can comfortably keep). */
export const maxUploadMb = () => hostedLimits()?.uploadMb ?? 1024;

/**
 * Store a file; returns its id. On a server it goes up in chunks (8 MB),
 * each retried a few times, and a dropped connection resumes where it
 * stopped. onProgress(fraction) reports as it goes.
 */
export async function putMedia(file, { onProgress = () => {} } = {}) {
  if (isHosted()) return uploadInChunks(file, onProgress);
  const id = `media_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await tx('readwrite', (s) => s.put({ blob: file, name: file.name, type: file.type, size: file.size }, keyOf(id)));
  onProgress(1);
  return id;
}

const HEADERS = { 'x-toolbox': '1' };
async function api(method, url, body, headers = {}) {
  const res = await fetch(url, { method, body, headers: { ...HEADERS, ...headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `The upload failed (${res.status}).`); err.status = res.status; err.data = data; throw err; }
  return data;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadInChunks(file, onProgress) {
  const start = await api('POST', '/api/uploads', JSON.stringify({ filename: file.name, size: file.size, type: file.type }), { 'content-type': 'application/json' });
  const { id, chunkSize } = start;
  let received = start.received;
  onProgress(0);
  try {
    let failures = 0;
    while (received < file.size) {
      const chunk = file.slice(received, Math.min(file.size, received + chunkSize));
      try {
        received = (await api('PUT', `/api/uploads/${id}?offset=${received}`, chunk, { 'content-type': 'application/octet-stream' })).received;
        failures = 0;
      } catch (err) {
        // Out of step: the server says where it got to, so carry on from there.
        if (err.status === 409 && Number.isFinite(err.data?.received)) { received = err.data.received; continue; }
        const retry = !err.status || err.status >= 500 || err.status === 408 || err.status === 429;
        if (!retry || ++failures > 5) throw err;
        await wait(1000 * 2 ** failures);
        // The connection may have dropped mid-chunk: ask how much arrived.
        try { received = (await api('GET', `/api/uploads/${id}`)).received; } catch { /* send the chunk again */ }
      }
      onProgress(received / file.size);
    }
    const done = await api('POST', `/api/uploads/${id}/complete`);
    onProgress(1);
    return done.id;
  } catch (err) {
    if (err.status !== 409) fetch(`/api/uploads/${id}`, { method: 'DELETE', headers: HEADERS }).catch(() => {});
    throw err;
  }
}

export const deleteMedia = (id) => (isHosted()
  ? fetch(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-toolbox': '1' } })
  : tx('readwrite', (s) => s.delete(keyOf(id))));

const urls = new Map();
/** A playable URL for stored media, or null if it is gone. */
export async function mediaUrl(id) {
  if (isHosted()) return `/media/${encodeURIComponent(id)}`;
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
