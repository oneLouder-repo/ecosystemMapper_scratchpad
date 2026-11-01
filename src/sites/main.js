import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts, loadPages, loadPlanDocs } from '../platform/docs.js';
import { isLivePlan } from '../platform/plandocs.js';
import { applyTheme, paletteById, shapeById } from '../platform/themes.js';
import { Logo } from '../ui/Shell.js';
import { PAGE_KINDS, uniqueSlug, isLive, embedsIn, siteContent } from '../platform/pages.js';
import { published } from '../platform/podcasts.js';
import { pluginOn, staffList } from '../platform/org.js';
import { currentUser } from '../platform/session.js';
import { DashboardView } from '../charts/DashboardView.js';
import { CalculatorView } from '../charts/CalculatorView.js';
import { StoryView } from '../charts/StoryView.js';
import { Markdown } from '../ui/markdown.js';
import { readImage } from '../ui/images.js';
import { EpisodeCard, ShowCard, Player } from '../site/station.js';
import { today, short } from '../strategy/dates.js';
import { PluginHeader } from '../ui/PluginHeader.js';

/**
 * Web views (formerly Sites & Pages): the org's public face in one place.
 * The overview walks through getting the public side working (look,
 * dashboards, the plan, podcasts, pages and news), then shows each site
 * as visitors will meet it, with everything on it and where to change it.
 * Pages and news articles are written here too.
 *
 *   #sites        the overview: steps, then every site and what is on it
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
const docs = { org, strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards(), podcasts: loadPodcasts(), plandocs: loadPlanDocs() };

const app = document.querySelector('#app');
app.classList.add('palette', 'sites-app', 'frame');
let side = h('nav');
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
  const item = (p) => ({
    label: p.title, href: `#${p.id}`, on: r === p.id,
    lead: h('span', { class: 'side-lead' }, h('span', { class: `status-dot ${isLive(p, now) ? 'live' : p.status}`, title: isLive(p, now) ? 'Published' : p.status === 'draft' ? 'Draft' : 'Scheduled' })),
    sub: [org.sites[p.siteId]?.name ?? 'No site', p.kind === 'article' ? short(p.publishedAt) : p.inNav ? 'in menu' : null].filter(Boolean).join(' · '),
  });
  side = swapSide(side, SideNav({ label: 'Web views', sections: [
    { title: 'Web views', items: [
      { label: 'Overview', sub: 'Your sites and what visitors see', icon: 'globe', href: '#sites', on: r === 'sites' },
      { label: 'Dashboards', sub: 'Data Workbench', icon: 'chart', href: 'palette.html#dashboards' },
      { label: 'Strategic plan', sub: 'Plan designer', icon: 'strategy', href: 'plandoc.html' },
      pluginOn(org, 'podcasts') && { label: 'Podcast station', sub: 'Podcasts', icon: 'mic', href: 'podcasts.html#station' },
    ] },
    { title: 'Pages', action: { label: 'New page', onclick: () => newPage('page') }, items: [...list('page').map(item), { label: 'New page', icon: 'plus', onclick: () => newPage('page') }] },
    { title: 'News articles', action: { label: 'New article', onclick: () => newPage('article') }, items: [...list('article').map(item), { label: 'New article', icon: 'plus', onclick: () => newPage('article') }] },
  ] }));
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
  const publicSites = sites.filter((s) => s.visibility === 'public');
  const pages = Object.values(doc().pages);
  const dashes = Object.values(docs.dashboards.dashboards);
  const plans = Object.values(docs.plandocs.docs);
  const hasPods = pluginOn(org, 'podcasts');
  const station = hasPods && org.sites[docs.podcasts.station.siteId];

  // Getting the public side working, step by step.
  const steps = [
    { done: publicSites.length > 0 && !!org.theme?.palette, title: 'Your look and your sites', text: org.theme?.palette ? `${paletteById[org.theme.palette]?.label ?? org.theme.palette} colours, ${shapeById[org.theme.shape]?.label?.toLowerCase() ?? 'rounded'} shapes, ${publicSites.length} public site${publicSites.length === 1 ? '' : 's'}.` : 'Pick your colours and shape, and name your public sites.', href: 'org.html#sites', action: 'Theme and sites' },
    { done: dashes.some((d) => d.visibility === 'public' && d.siteId), title: 'Live dashboards', text: `${dashes.filter((d) => d.visibility === 'public' && d.siteId).length} of ${dashes.length} dashboards are public. Design them as visitors will see them.`, href: 'palette.html#dashboards', action: 'Design dashboards' },
    { done: plans.some(isLivePlan), title: 'Your strategic plan', text: plans.some(isLivePlan) ? 'Your plan is online, and downloads as a PDF.' : 'Turn your strategy into a designed plan to read online or download as a PDF.', href: 'plandoc.html', action: 'Plan designer' },
    hasPods && { done: !!station, title: 'Your podcast station', text: station ? `On ${station.name}, with ${liveEpisodes().length} episodes out.` : 'Put the station on a site so listeners can find it.', href: 'podcasts.html#station', action: 'Station' },
    { done: pages.some((p) => p.kind === 'page' && isLive(p, now)), title: 'Pages and news', text: `${pages.filter((p) => p.kind === 'page' && isLive(p, now)).length} pages and ${pages.filter((p) => p.kind === 'article' && isLive(p, now)).length} articles are live. Say who you are and what’s new.`, onclick: () => newPage('page'), action: 'New page' },
  ].filter(Boolean);
  const doneCount = steps.filter((x) => x.done).length;

  return h('div', { class: 'wv' },
    PluginHeader('pages'),
    h('section', { class: 'wv-steps' },
      h('div', { class: 'wv-steps-head' },
        h('h2', {}, 'Getting your public side working'),
        h('span', { class: 'wv-progress' }, h('span', { style: `width:${(doneCount / steps.length) * 100}%` })),
        h('span', { class: 'muted small' }, `${doneCount} of ${steps.length} done`)),
      h('ol', {}, steps.map((x, i) => h('li', { class: x.done ? 'done' : '' },
        h('span', { class: 'wv-step-num' }, x.done ? '✓' : String(i + 1)),
        h('div', {}, h('strong', {}, x.title), h('p', {}, x.text)),
        x.href ? h('a', { class: `btn btn-sm ${x.done ? 'btn-ghost' : 'btn-primary'}`, href: x.href }, x.action) : h('button', { class: `btn btn-sm ${x.done ? 'btn-ghost' : 'btn-primary'}`, onclick: x.onclick }, x.action))))),
    h('h2', { class: 'wv-h2' }, 'Your sites, as visitors see them'),
    h('div', { class: 'wv-sites' }, sites.map((s) => SiteView(s))));
}

/** One site: a small picture of its front page in its theme, then everything on it and where to change it. */
function SiteView(s) {
  const c = siteContent(doc(), s.id, now);
  const dashes = Object.values(docs.dashboards.dashboards).filter((d) => d.siteId === s.id);
  const plans = Object.values(docs.plandocs.docs).filter((d) => d.siteId === s.id);
  const stories = Object.values(docs.dashboards.stories ?? {}).filter((x) => x.siteId === s.id);
  const calcs = Object.values(docs.dashboards.calculators ?? {}).filter((x) => x.siteId === s.id);
  const station = pluginOn(org, 'podcasts') && docs.podcasts.station.siteId === s.id;
  const drafts = Object.values(doc().pages).filter((p) => p.siteId === s.id && !isLive(p, now));
  const isPublic = s.visibility === 'public';
  const shown = (on) => h('span', { class: `wv-chip ${on ? 'on' : ''}` }, on ? 'Public' : 'Hidden');
  const row = (ic, kind, title, on, href, editLabel = 'Edit') => h('li', {}, icon(ic, 16), h('span', { class: 'wv-kind' }, kind), h('span', { class: 'wv-title' }, title), shown(on), href && h('a', { class: 'link', href }, editLabel));

  const thumb = h('div', { class: 'wv-thumb site-page' },
    h('div', { class: 'wv-thumb-head' }, Logo(org, 18), h('b', {}, org.name),
      h('span', { class: 'wv-thumb-nav' }, 'Home', c.nav.slice(0, 3).map((p) => h('span', {}, p.title)), plans.some(isLivePlan) && h('span', {}, 'Our plan'), station && h('span', {}, docs.podcasts.station.name))),
    h('div', { class: 'wv-thumb-hero' }, h('b', {}, s.name), h('span', {}, org.mission ?? '')),
    h('div', { class: 'wv-thumb-grid' }, dashes.filter((d) => d.visibility === 'public').slice(0, 1).flatMap((d) => d.widgets.slice(0, 4).map((w) => h('span', { class: `wv-thumb-w ${w.size ?? 'wide'} t-${w.type}` }))),
      !dashes.some((d) => d.visibility === 'public') && h('span', { class: 'wv-thumb-w full t-text' })));
  applyTheme(thumb, org.theme);

  return h('article', { class: 'wv-site card' },
    h('header', {},
      h('div', {}, h('strong', {}, s.name), h('span', { class: `badge badge-sm ${isPublic ? 'badge-success' : 'badge-ghost'}` }, s.visibility), s.url && h('small', { class: 'muted' }, s.url)),
      h('div', { class: 'wv-site-actions' },
        isPublic && h('a', { class: 'btn btn-sm btn-primary', href: siteUrl(s.id), target: '_blank', rel: 'noopener' }, icon('globe', 14), 'Open the site'),
        h('a', { class: 'btn btn-sm btn-ghost', href: 'org.html#sites' }, icon('settings', 14), 'Look and visibility'))),
    h('div', { class: 'wv-site-body' },
      h('a', { class: 'wv-thumb-link', href: isPublic ? siteUrl(s.id) : 'org.html#sites', target: isPublic ? '_blank' : null, title: 'The front page, roughly' }, thumb),
      h('ul', { class: 'wv-contents' },
        dashes.map((d) => row('chart', 'Dashboard', d.title, d.visibility === 'public', `palette.html#${d.id}`, 'Design')),
        plans.map((d) => row('strategy', 'Strategic plan', docs.strategy.nodes[d.planId]?.title ?? d.snapshot?.plan?.title ?? 'Plan', isLivePlan(d), `plandoc.html#${d.id}`, 'Design')),
        station && row('mic', 'Podcast station', docs.podcasts.station.name, true, 'podcasts.html#station', 'Settings'),
        stories.map((x) => row('story', 'Data story', x.title, x.visibility === 'public', 'palette.html#stories')),
        calcs.map((x) => row('gift', 'Impact calculator', x.title, x.visibility === 'public', 'palette.html#impact')),
        c.nav.map((p) => row('doc', 'Page', p.title, true, `#${p.id}`)),
        c.articles.length > 0 && row('news', 'News', `${c.articles.length} article${c.articles.length === 1 ? '' : 's'}, newest ${short(c.articles[0].publishedAt)}`, true, `#${c.articles[0].id}`),
        drafts.length > 0 && row('doc', 'Drafts', `${drafts.length} not out yet`, false, `#${drafts[0].id}`),
        !isPublic && h('li', { class: 'muted' }, 'This site is private: only signed-in staff and board members see it.'))));
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
    if (kind === 'calculator') { const c = docs.dashboards.calculators[id]; return c ? CalculatorView(c, docs) : null; }
    if (kind === 'story') { const s = docs.dashboards.stories[id]; return s ? StoryView(s, docs) : null; }
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
      if (kind === 'calculator' || kind === 'story') {
        const x = docs.dashboards[kind === 'story' ? 'stories' : 'calculators'][id];
        return !x ? `No ${kind} “${id}”.` : x.visibility !== 'public' ? `“${x.title}” is private, so the public site leaves it out.` : null;
      }
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
    h('optgroup', { label: 'Impact calculators' }, Object.values(docs.dashboards.calculators).map((c) => h('option', { value: `[[calculator:${c.id}]]` }, `${c.title}${c.visibility === 'public' ? '' : ' (private)'}`))),
    h('optgroup', { label: 'Data stories' }, Object.values(docs.dashboards.stories).map((s) => h('option', { value: `[[story:${s.id}]]` }, `${s.title}${s.visibility === 'public' ? '' : ' (private)'}`))),
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
