/**
 * Pages and news: the simple web pages and blog-style articles that sit on
 * an org's public sites, next to its dashboards and podcast station.
 *
 * { id: 'pages', pages: { [id]: Page } }
 * Page { kind: 'page' | 'article', title, slug, summary, body (light markdown),
 *        cover, siteId, status: 'draft' | 'published', publishedAt, authorId,
 *        inNav (pages: listed in the site's menu), order }
 *
 * Bodies are a small, safe subset of markdown (see parseMarkdown). A line
 * that is only a shortcode embeds live content from another plugin:
 *   [[dashboard:<id>]]   a public dashboard
 *   [[episode:<id>]]     a podcast episode with a player
 *   [[show:<id>]]        a podcast show card
 */
import { loadOrSeed } from './storage.js';

export const PAGE_KINDS = [
  { id: 'page', label: 'Page', blurb: 'An information page in the site menu' },
  { id: 'article', label: 'Article', blurb: 'A dated news or blog post' },
];
export const EMBEDS = ['dashboard', 'episode', 'show'];

export const slugify = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') || 'page';

/** A slug no other page on the same site uses. */
export function uniqueSlug(doc, title, siteId, exceptId) {
  const base = slugify(title);
  const taken = new Set(Object.values(doc.pages).filter((p) => p.siteId === siteId && p.id !== exceptId).map((p) => p.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

const page = (id, kind, siteId, title, publishedAt, summary, body, more = {}) => ({
  id, kind, siteId, title, slug: slugify(title), summary, body, cover: null,
  status: 'published', publishedAt, authorId: null, inNav: kind === 'page', order: 0, ...more,
});

export function seedPages() {
  return migratePages({
    id: 'pages',
    pages: Object.fromEntries([
      page('pg-about', 'page', 'site-main', 'About us', '2025-01-15', 'Who we are and how the network works.',
        `We are a national network of university and college **STEM outreach programs**, reaching young people in every province and territory.

## What we do

- Run camps, clubs and school workshops
- Train outreach instructors
- Co-design programs with Indigenous communities

## How we measure it

We share our numbers openly. See [our impact dashboard](site.html?site=site-impact) for reach and equity, updated as programs report.

> Every young person in Canada can see themselves in STEM.`, { authorId: 's-comms', order: 0 }),
      page('pg-involved', 'page', 'site-main', 'Get involved', '2025-01-15', 'Volunteer, partner or fund a program.',
        `There are three ways to help:

1. **Volunteer** as a mentor or instructor
2. **Partner** with us as a school, library or community group
3. **Fund** a program in your region

Write to us at [hello@example.org](mailto:hello@example.org).`, { authorId: 's-part', order: 1 }),
      page('pg-news-equity', 'article', 'site-main', 'Our reach and equity numbers for 2026', '2026-10-01',
        'Halfway through the year, here is who our programs reached.',
        `We promised to share our numbers as they come in. Here they are, live from program reports.

[[dashboard:dash-equity]]

The share of participants from **equity-deserving groups** is up on last year. There is more to do in the North, and our next co-design sessions start there.`, { authorId: 's-eval' }),
      page('pg-news-podcast', 'article', 'site-main', 'New season of STEM Voices', '2026-09-24',
        'Season 2 asks what keeps young people in STEM.',
        `Season 2 of _STEM Voices_ is here. This season asks what keeps young people in STEM, and what pushes them out.

[[episode:ep-sv-3]]

New episodes every few weeks. Find every show on [our podcast station](site.html?site=site-main&view=station).`, { authorId: 's-comms' }),
      page('pg-news-draft', 'article', 'site-main', 'Learning with the Land: what we heard', '2026-11-01',
        'Notes from the first co-design session.', 'Draft notes, not ready to share.', { status: 'draft', authorId: 's-indig' }),
    ].map((p) => [p.id, p])),
  });
}

export function seedRiverbendPages() {
  return migratePages({
    id: 'pages',
    pages: {
      'pg-about': page('pg-about', 'page', 'site-main', 'About the hub', '2025-05-01', 'A community kitchen, a good food box and a youth growing program.',
        `We are a neighbourhood food hub in Winnipeg.

[[dashboard:dash-meals]]

Drop in to the kitchen Tuesday to Saturday.`, { authorId: 'r-lead' }),
    },
  });
}

export const blankPages = () => ({ id: 'pages', pages: {} });

export function migratePages(doc) {
  doc.pages ??= {};
  for (const p of Object.values(doc.pages)) {
    p.status ??= 'draft';
    p.summary ??= '';
    p.body ??= '';
    p.cover ??= null;
    p.inNav ??= p.kind === 'page';
    p.order ??= 0;
  }
  return doc;
}

const SEEDS = { 'org-example': seedPages, 'org-riverbend': seedRiverbendPages };
/** The open org's pages (see docs.js; the org id picks the example seed). */
export const loadPages = (orgId) => migratePages(loadOrSeed('pages', SEEDS[orgId] ?? blankPages));

export const isLive = (p, today) => p.status === 'published' && p.publishedAt <= today;

/** What a public site shows: menu pages in order, and articles newest first. */
export function siteContent(doc, siteId, today) {
  const live = Object.values(doc.pages).filter((p) => p.siteId === siteId && isLive(p, today));
  return {
    nav: live.filter((p) => p.kind === 'page' && p.inNav).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    articles: live.filter((p) => p.kind === 'article').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    bySlug: (slug) => live.find((p) => p.slug === slug) ?? null,
  };
}

/* ------------------------------------------------------------------ markdown */

/**
 * Parse the light markdown that page bodies use into a small tree. Nothing
 * here makes HTML, so a body can never inject markup; ui/markdown.js turns
 * the tree into DOM nodes.
 *
 * Blocks:  { t: 'h', level, c } { t: 'p', c } { t: 'ul' | 'ol', items: [c] }
 *          { t: 'quote', c } { t: 'hr' } { t: 'embed', kind, id }
 * Inline:  { t: 'text', v } { t: 'b' | 'i', c } { t: 'code', v } { t: 'a', href, c }
 */
export function parseMarkdown(src = '') {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) }); para = []; };
  const flushList = () => { if (list) blocks.push(list); list = null; };
  const flush = () => { flushPara(); flushList(); };

  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flush(); continue; }
    if ((m = line.match(/^\[\[(\w+):([\w-]+)\]\]$/)) && EMBEDS.includes(m[1])) { flush(); blocks.push({ t: 'embed', kind: m[1], id: m[2] }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); blocks.push({ t: 'h', level: m[1].length + 1, c: parseInline(m[2]) }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ t: 'quote', c: parseInline(m[1]) }); continue; }
    if ((m = line.match(/^([-*]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const t = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list?.t !== t) { flushList(); list = { t, items: [] }; }
      list.items.push(parseInline(m[2]));
      continue;
    }
    flushList();
    para.push(line);
  }
  flush();
  return blocks;
}

/** Links may go to the web, email, or another page of the site; nothing else (no javascript: URLs). */
export const safeHref = (href) => (/^(https?:|mailto:)/i.test(href) || /^[\w./?#=&%-]+$/.test(href) && !/^\w+:/.test(href) ? href : null);

export function parseInline(s) {
  const out = [];
  const text = (v) => { if (!v) return; const last = out.at(-1); if (last?.t === 'text') last.v += v; else out.push({ t: 'text', v }); };
  const re = /`([^`]+)`|\*\*(.+?)\*\*|(?:^|(?<=[\s(]))[_*](?![\s_*])(.+?)(?<!\s)[_*](?=$|[\s.,;:!?)])|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let i = 0;
  let m;
  while ((m = re.exec(s))) {
    text(s.slice(i, m.index));
    if (m[1] != null) out.push({ t: 'code', v: m[1] });
    else if (m[2] != null) out.push({ t: 'b', c: parseInline(m[2]) });
    else if (m[3] != null) out.push({ t: 'i', c: parseInline(m[3]) });
    else {
      const href = safeHref(m[5]);
      if (href) out.push({ t: 'a', href, c: parseInline(m[4]) });
      else text(m[4]);
    }
    i = m.index + m[0].length;
  }
  text(s.slice(i));
  return out;
}

/** Shortcodes a body uses, e.g. to warn about embeds that are not public. */
export const embedsIn = (body) => parseMarkdown(body).filter((b) => b.t === 'embed');

/** Plain text of a body, for summaries and search. */
export function plainText(body) {
  const walk = (nodes) => nodes.map((n) => n.v ?? walk(n.c ?? [])).join('');
  return parseMarkdown(body).map((b) => (b.c ? walk(b.c) : b.items ? b.items.map(walk).join(' ') : '')).filter(Boolean).join(' ');
}
