/** Small helpers for Node's http module, so the server needs no framework. */
import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function send(res, status, body = '', headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

export const json = (res, status, value, headers = {}) =>
  send(res, status, JSON.stringify(value), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });

export const redirect = (res, location, headers = {}) => send(res, 302, '', { location, ...headers });

/** A simple HTML page for messages (sign-in problems and the like). */
export function page(res, status, title, message, link = { href: '/', label: 'Back' }) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  send(res, status, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1d2230}a{color:#2a5bd7}</style>
<h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="${esc(link.href)}">${esc(link.label)}</a></p>`, { 'content-type': 'text/html; charset=utf-8' });
}

export function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new HttpError(413, 'Too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limitBytes) {
  const buf = await readBody(req, limitBytes);
  try {
    return JSON.parse(buf.toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'Not JSON');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure, httpOnly = true } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', httpOnly && 'HttpOnly', secure && 'Secure', maxAge != null && `Max-Age=${maxAge}`]
    .filter(Boolean).join('; ');
}

/** Send a file, honouring Range requests (so audio can be skipped through). */
export function sendFile(req, res, file, { type, cache = 'no-cache', headers = {} } = {}) {
  let stat;
  try {
    stat = statSync(file);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return send(res, 404, 'Not found');
  }
  const base = {
    'content-type': type ?? TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': cache,
    'last-modified': stat.mtime.toUTCString(),
    ...headers,
  };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end || start >= stat.size) return send(res, 416, '', { 'content-range': `bytes */${stat.size}` });
    res.writeHead(206, { ...base, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'content-length': stat.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}
