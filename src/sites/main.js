import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts, loadPages } from '../platform/docs.js';
import { PAGE_KINDS, uniqueSlug, isLive, embedsIn, siteContent } from '../platform/pages.js';
import { published } from '../platform/podcasts.js';
import { pluginOn, staffList } from '../platform/org.js';
import { currentUser } from '../platform/session.js';
import { DashboardView } from '../charts/DashboardView.js';
import { Markdown } from '../ui/markdown.js';
import { readImage } from '../ui/images.js';
import { EpisodeCard, ShowCard, Player } from '../site/station.js';
import { today, short } from '../strategy/dates.js';
import { PluginHeader } from '../ui/PluginHeader.js';

/**
 * Sites & Pages: the admin for an org's public sites. One place to see
 * what each site shows (dashboards from the Workbench, the podcast
 * station, pages and news), and to write the pages and articles.
 *
 *   #sites        every site and what is on it
 *   #<page id>    edit a page or article, with a live preview
 *
 * Bodies are light markdown with shortcodes for live embeds
 * ([[dashboard:id]], [[episode:id]], [[show:id]]); see platform/pages.js.
 */
const org = loadOrg();
const store = new Store(loadPages(), applyCollectionOp);
autosaveDoc('pages', store, 250);
Shell(document.querySelector('#shell'), { current: 'pages', org });
// Other plugins' content, for embeds and the site overview.
const docs = { org, strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards(), podcasts: loadPodcasts() };

const app = document.querySelector('#app');
app.classList.add('palette', 'sites-app');
const side = h('nav', { class: 'palette-side', 'aria-label': 'Sites and pages' });
const main = h('section', { class: 'palette-main' });
const player = Player(() => docs.podcasts);
player.el.classList.add('admin-player');
app.replaceChildren(side, main, player.el);

const now = today();
const route = () => decodeURIComponent(location.hash.slice(1)) || 'sites';
const doc = () => store.doc;
const siteUrl = (siteId, extra = {}) => `site.html?${new URLSearchParams({ site: siteId, ...extra })}`;
const ctx = { doc: docs.podcasts, org, today: now, player, link: () => '#' };
const publicDashboards = () => Object.values(docs.dashboards.dashboards).filter((d) => d.visibility === 'public');
const liveEpisodes = () => Object.values(docs.podcasts.episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

function renderSide() {
  const r = route();
  const list = (kind) => Object.values(doc().pages).filter((p) => p.kind === kind)
    .sort((a, b) => (kind === 'article' ? b.publishedAt.localeCompare(a.publishedAt) : (a.siteId ?? '').localeCompare(b.siteId ?? '') || a.order - b.order));
  const item = (p) => h('button', { class: `mini-tool${r === p.id ? ' on' : ''}`, onclick: () => (location.hash = p.id) },
    h('span', { class: `status-dot ${isLive(p, now) ? 'live' : p.status}`, title: isLive(p, now) ? 'Published' : p.status === 'draft' ? 'Draft' : 'Scheduled' }),
    h('span', {}, p.title, h('small', {}, [org.sites[p.siteId]?.name ?? 'No site', p.kind === 'article' ? short(p.publishedAt) : p.inNav ? 'in menu' : null].filter(Boolean).join(' · '))));
  side.replaceChildren(
    h('div', { class: 'mini-tools' },
      h('button', { class: `mini-tool${r === 'sites' ? ' on' : ''}`, onclick: () => (location.hash = 'sites') },
        icon('globe', 20), h('span', {}, 'Your sites', h('small', {}, 'What each one shows')))),
    h('h2', {}, 'Pages'),
    h('div', { class: 'mini-tools' }, list('page').map(item),
      h('button', { class: 'mini-tool', onclick: () => newPage('page') }, icon('plus', 20), h('span', {}, 'New page'))),
    h('h2', {}, 'News articles'),
    h('div', { class: 'mini-tools' }, list('article').map(item),
      h('button', { class: 'mini-tool', onclick: () => newPage('article') }, icon('plus', 20), h('span', {}, 'New article'))),
  );
}

function render() {
  renderSide();
  const p = doc().pages[route()];
  main.replaceChildren(p ? Editor(p) : Sites());
}

function newPage(kind) {
  const siteId = Object.values(org.sites).find((s) => s.visibility === 'public')?.id ?? Object.keys(org.sites)[0] ?? null;
  const title = kind === 'article' ? 'Untitled article' : 'Untitled page';
  const op = store.apply(col.add('pages', {
    kind, title, slug: uniqueSlug(doc(), title, siteId), summary: '', body: '', cover: null, siteId,
    status: 'draft', publishedAt: now, authorId: currentUser(org)?.id ?? null, inNav: kind === 'page',
    order: Object.values(doc().pages).filter((x) => x.kind === 'page' && x.siteId === siteId).length,
  }));
  location.hash = op.id;
}

function Sites() {
  const sites = Object.values(org.sites);
  return h('div', {},
    PluginHeader('pages'),
    h('h2', {}, 'Your sites'),
    h('p', { class: 'muted' }, 'Each public site can carry dashboards, information pages, news and your podcast station. They all wear your organisation’s theme.'),
    h('div', { class: 'site-cards' }, sites.map((s) => {
      const c = siteContent(doc(), s.id, now);
      const dashes = publicDashboards().filter((d) => d.siteId === s.id);
      const station = pluginOn(org, 'podcasts') && docs.podcasts.station.siteId === s.id;
      const drafts = Object.values(doc().pages).filter((p) => p.siteId === s.id && !isLive(p, now)).length;
      const row = (ic, label, n, href, hint) => h('li', {}, icon(ic, 16), h('span', {}, label), h('strong', {}, n), href && h('a', { href, class: 'link' }, hint));
      return h('article', { class: 'site-card card' },
        h('header', {},
          h('strong', {}, s.name),
          h('span', { class: `badge badge-sm ${s.visibility === 'public' ? 'badge-success' : 'badge-ghost'}` }, s.visibility),
          s.url && h('small', { class: 'muted' }, s.url)),
        h('ul', { class: 'site-contents' },
          row('chart', 'Dashboards', dashes.length, 'palette.html#publish', 'Workbench'),
          row('doc', 'Pages in the menu', c.nav.length),
          row('news', 'News articles', c.articles.length),
          drafts > 0 && row('doc', 'Drafts and scheduled', drafts),
          pluginOn(org, 'podcasts') && row('mic', 'Podcast station', station ? 'Yes' : 'No', 'podcasts.html#station', station ? 'Station settings' : 'Put it here')),
        h('div', { class: 'site-card-actions' },
          s.visibility === 'public'
            ? h('a', { class: 'btn btn-sm btn-primary', href: siteUrl(s.id), target: '_blank', rel: 'noopener' }, icon('globe', 14), 'View site')
            : h('span', { class: 'muted' }, 'Private: only staff and the board see it.'),
          h('a', { class: 'btn btn-sm', href: 'org.html#sites' }, icon('settings', 14), 'Theme and visibility')));
    })),
    h('section', { class: 'panel castopod-note' },
      h('h2', {}, 'How a site is put together'),
      h('ul', { class: 'help-list' },
        h('li', {}, h('strong', {}, 'Home: '), 'the site’s public dashboards, with the latest news and the newest episode above them.'),
        h('li', {}, h('strong', {}, 'Menu: '), 'pages marked “In the menu”, then News and the podcast station when the site has them.'),
        h('li', {}, h('strong', {}, 'Embeds: '), 'put a line like ', h('code', {}, '[[dashboard:dash-equity]]'), ' or ', h('code', {}, '[[episode:ep-sv-3]]'), ' in a page to show live content. Use the Insert menu in the editor.'),
        h('li', {}, h('strong', {}, 'Look: '), 'colour palette and shape come from Organisation settings; the station adds its own player and cover art style.'))));
}

function Editor(p) {
  const save = (patch) => store.apply(col.update('pages', p.id, patch));
  const cur = () => doc().pages[p.id];
  const preview = h('div', { class: 'page-preview site-page-preview' });
  const warnings = h('div', { class: 'embed-warnings' });

  const embed = ({ kind, id }) => {
    if (kind === 'dashboard') { const d = docs.dashboards.dashboards[id]; return d ? DashboardView(d, docs) : null; }
    if (kind === 'episode') { const e = docs.podcasts.episodes[id]; return e ? EpisodeCard(ctx, e, { embed: true }) : null; }
    if (kind === 'show') { const s = docs.podcasts.podcasts[id]; return s ? ShowCard(ctx, s) : null; }
    return null;
  };
  const drawPreview = () => {
    const pg = cur();
    preview.replaceChildren(
      h('article', { class: `site-article ${pg.kind}` },
        h('header', {}, h('h1', {}, pg.title), pg.kind === 'article' && pg.summary && h('p', { class: 'lede' }, pg.summary)),
        pg.cover && h('img', { class: 'article-cover', src: pg.cover, alt: '' }),
        Markdown(pg.body, { embed })));
    // Embeds that won't show on the public site.
    const notes = embedsIn(pg.body).map(({ kind, id }) => {
      if (kind === 'dashboard') { const d = docs.dashboards.dashboards[id]; return !d ? `No dashboard “${id}”.` : d.visibility !== 'public' ? `“${d.title}” is private, so the public site leaves it out.` : null; }
      if (kind === 'episode') { const e = docs.podcasts.episodes[id]; return !e ? `No episode “${id}”.` : !published(e, now) ? `“${e.title}” isn’t published yet, so the public site leaves it out.` : null; }
      if (kind === 'show') return docs.podcasts.podcasts[id] ? null : `No show “${id}”.`;
      return null;
    }).filter(Boolean);
    warnings.replaceChildren(...notes.map((n) => h('div', { role: 'status', class: 'alert alert-warning alert-soft' }, n)));
  };

  let timer;
  const body = h('textarea', { class: 'textarea page-body', name: 'page-body', rows: 18, 'aria-label': 'Body', spellcheck: true,
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => { save({ body: body.value }); drawPreview(); }, 250); } }, p.body);
  const insert = (text) => {
    const at = body.selectionStart ?? body.value.length;
    const before = body.value.slice(0, at).replace(/\n*$/, '');
    const after = body.value.slice(at).replace(/^\n*/, '');
    body.value = `${before}${before ? '\n\n' : ''}${text}\n\n${after}`;
    save({ body: body.value });
    drawPreview();
    body.focus();
  };
  const wrap = (mark, placeholder) => {
    const [a, b] = [body.selectionStart, body.selectionEnd];
    const sel = body.value.slice(a, b) || placeholder;
    body.setRangeText(`${mark}${sel}${mark}`, a, b, 'end');
    save({ body: body.value });
    drawPreview();
    body.focus();
  };
  const linkIt = () => {
    const url = prompt('Link to (https://…, mailto:…, or a page like site.html?site=site-main&view=station)');
    if (!url) return;
    const [a, b] = [body.selectionStart, body.selectionEnd];
    body.setRangeText(`[${body.value.slice(a, b) || 'link text'}](${url.trim()})`, a, b, 'end');
    save({ body: body.value });
    drawPreview();
  };
  const embedMenu = h('select', { class: 'select select-sm', 'aria-label': 'Insert live content', onchange: (e) => { if (e.target.value) insert(e.target.value); e.target.value = ''; } },
    h('option', { value: '' }, 'Insert…'),
    h('optgroup', { label: 'Dashboards' }, Object.values(docs.dashboards.dashboards).map((d) => h('option', { value: `[[dashboard:${d.id}]]` }, `${d.title}${d.visibility === 'public' ? '' : ' (private)'}`))),
    pluginOn(org, 'podcasts') && h('optgroup', { label: 'Podcast episodes' }, liveEpisodes().map((e) => h('option', { value: `[[episode:${e.id}]]` }, `${docs.podcasts.podcasts[e.podcastId]?.title}: ${e.title}`))),
    pluginOn(org, 'podcasts') && h('optgroup', { label: 'Podcast shows' }, Object.values(docs.podcasts.podcasts).map((s) => h('option', { value: `[[show:${s.id}]]` }, s.title))));

  const statusSel = h('select', { class: 'select select-sm', name: 'page-status', 'aria-label': 'Status', onchange: (e) => { save({ status: e.target.value }); render(); } },
    options([{ id: 'draft', label: 'Draft' }, { id: 'published', label: 'Published' }], p.status));
  const live = isLive(p, now);
  const viewHref = siteUrl(p.siteId, { page: p.slug });

  const fields = h('div', { class: 'page-fields' },
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Kind'),
      h('select', { class: 'select select-sm', name: 'page-kind', onchange: (e) => { save({ kind: e.target.value, inNav: e.target.value === 'page' }); render(); } }, options(PAGE_KINDS, p.kind))),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Site'),
      h('select', { class: 'select select-sm', name: 'page-site', onchange: (e) => { save({ siteId: e.target.value, slug: uniqueSlug(doc(), cur().title, e.target.value, p.id) }); render(); } },
        options(Object.values(org.sites).map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), p.siteId))),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Status'), statusSel),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, p.kind === 'article' ? 'Date' : 'Publish from'),
      h('input', { class: 'input input-sm', type: 'date', name: 'page-date', value: p.publishedAt, onchange: (e) => { save({ publishedAt: e.target.value || now }); render(); } })),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Author'),
      h('select', { class: 'select select-sm', name: 'page-author', onchange: (e) => save({ authorId: e.target.value || null }) },
        h('option', { value: '' }, 'No byline'), options(staffList(org).map((s) => ({ id: s.id, label: s.name })), p.authorId))),
    p.kind === 'page' && h('label', { class: 'fieldset feature-toggle' },
      h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', name: 'page-nav', checked: p.inNav, onchange: (e) => save({ inNav: e.target.checked }) }), 'In the site menu'),
    h('label', { class: 'fieldset span-all' }, h('span', { class: 'fieldset-legend' }, 'Address'),
      h('div', { class: 'slug-row' }, h('span', { class: 'muted' }, `${org.sites[p.siteId]?.url || 'site'}/`),
        h('input', { class: 'input input-sm', name: 'page-slug', value: p.slug, onchange: (e) => { save({ slug: uniqueSlug(doc(), e.target.value, p.siteId, p.id) }); render(); } }))));

  drawPreview();
  return h('div', { class: 'page-editor' },
    h('div', { class: 'page-editor-head' },
      h('input', { class: 'title-input station-name', name: 'page-title', value: p.title, 'aria-label': 'Title', onchange: (e) => {
        const title = e.target.value.trim() || 'Untitled';
        // Keep the address in step with the title until the page goes live.
        save({ title, ...(p.status === 'draft' ? { slug: uniqueSlug(doc(), title, p.siteId, p.id) } : {}) });
        render();
      } }),
      h('span', { class: `badge ${live ? 'badge-success' : p.status === 'draft' ? 'badge-ghost' : 'badge-warning'}` }, live ? 'Published' : p.status === 'draft' ? 'Draft' : `Goes live ${short(p.publishedAt)}`),
      live && org.sites[p.siteId]?.visibility === 'public' && h('a', { class: 'btn btn-sm', href: viewHref, target: '_blank', rel: 'noopener' }, icon('globe', 14), 'View on site'),
      p.status === 'draft' && h('button', { class: 'btn btn-sm btn-primary', onclick: () => { save({ status: 'published' }); render(); } }, 'Publish'),
      h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: () => { if (confirm(`Delete “${p.title}”?`)) { store.apply(col.remove('pages', p.id)); location.hash = 'sites'; } } }, 'Delete')),
    fields,
    h('div', { class: 'page-columns' },
      h('div', { class: 'page-write' },
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, p.kind === 'article' ? 'Summary (shown in the news list)' : 'Summary'),
          h('input', { class: 'input input-sm', name: 'page-summary', value: p.summary, onchange: (e) => { save({ summary: e.target.value }); drawPreview(); } })),
        h('div', { class: 'cover-row' },
          h('label', { class: 'btn btn-sm' }, icon('media', 14), p.cover ? 'Change cover image' : 'Add a cover image',
            h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (e) => { try { save({ cover: await readImage(e.target.files[0], 1200) }); render(); } catch (err) { alert(err.message); } } })),
          p.cover && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { save({ cover: null }); render(); } }, 'Remove cover')),
        h('div', { class: 'md-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
          h('button', { class: 'btn btn-xs', title: 'Bold', onclick: () => wrap('**', 'bold text') }, h('strong', {}, 'B')),
          h('button', { class: 'btn btn-xs', title: 'Italic', onclick: () => wrap('_', 'italic text') }, h('em', {}, 'I')),
          h('button', { class: 'btn btn-xs', title: 'Heading', onclick: () => insert('## Heading') }, 'H'),
          h('button', { class: 'btn btn-xs', title: 'List', onclick: () => insert('- First\n- Second') }, '• List'),
          h('button', { class: 'btn btn-xs', title: 'Quote', onclick: () => insert('> A quote') }, '“ Quote'),
          h('button', { class: 'btn btn-xs', title: 'Link', onclick: linkIt }, icon('link', 12), 'Link'),
          embedMenu),
        body,
        h('p', { class: 'muted md-help' }, '## Heading · **bold** · _italic_ · - list · 1. numbered · > quote · [text](https://…) · a blank line starts a new paragraph.'),
        warnings),
      h('div', { class: 'page-preview-wrap' }, h('span', { class: 'fieldset-legend' }, 'Preview'), preview)));
}

store.addEventListener('change', renderSide);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
render();
window.sites = { store, docs };
