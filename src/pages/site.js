import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { onDocChange, session, isHosted } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts, loadPages } from '../platform/docs.js';
import { migrateStrategy } from '../platform/strategy.js';
import { migratePodcasts, published } from '../platform/podcasts.js';
import { migratePages, siteContent } from '../platform/pages.js';
import { pluginOn } from '../platform/org.js';
import { dashboardMonths } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';
import { CalculatorView } from '../charts/CalculatorView.js';
import { StoryView } from '../charts/StoryView.js';
import { migrateDashboards } from '../platform/dashboards.js';
import { applyTheme } from '../platform/themes.js';
import { Logo, Avatar } from '../ui/Shell.js';
import { Markdown } from '../ui/markdown.js';
import { StationHome, ShowPage, EpisodePage, EpisodeCard, ShowCard, Player, lookClasses } from '../site/station.js';
import { today, short } from '../strategy/dates.js';

/**
 * A sample public site: site.html?site=<id>, with its own pages:
 *
 *   ?site=x                   home: the site's public dashboards, calculators and stories, latest news, latest episode
 *   ?site=x&story=<id>        a data story (Workbench)
 *   ?site=x&page=<slug>       an information page or article (Sites & Pages plugin)
 *   ?site=x&view=news         every article, newest first
 *   ?site=x&view=station      the podcast station, if this site hosts it (Podcasts plugin)
 *   ?site=x&show=<id>         a show, by season
 *   ?site=x&episode=<id>      an episode
 *
 * Links inside the site change the page without reloading, so the
 * podcast player keeps playing. It reads live data: when staff change
 * anything in another tab, the page redraws.
 *
 * In production this is served by the Node app (or a HubSpot module) from
 * a published snapshot holding only public content.
 */
const docs = {
  org: loadOrg(), strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards(),
  podcasts: loadPodcasts(), pages: loadPages(),
};
const root = document.querySelector('#site');
const now = today();
const player = Player(() => docs.podcasts);
// Outside the redrawn part of the page, so redraws never interrupt it.
document.body.append(player.el);
// Where each dashboard's player is, so a live update doesn't rewind it.
const asOf = {};

const params = () => Object.fromEntries(new URLSearchParams(location.search));
// Without ?site=, the org's first public site.
const firstSite = () => Object.values(docs.org.sites).find((s) => s.visibility === 'public')?.id ?? Object.keys(docs.org.sites)[0];
const siteId = () => params().site ?? firstSite();
const staffView = !isHosted() || !!session()?.member;
const link = (p) => `?${new URLSearchParams({ site: siteId(), ...p })}`;
player.setLink(link);

function dashboard(d) {
  const months = dashboardMonths(d, docs.data);
  // Follow new data when the reader is on the latest month.
  const at = asOf[d.id] && asOf[d.id] !== asOf[`${d.id}:last`] ? asOf[d.id] : months.at(-1);
  const view = DashboardView(d, docs, { asOf: at });
  view.id = d.id;
  asOf[`${d.id}:last`] = months.at(-1);
  new MutationObserver(() => { asOf[d.id] = view.dataset.asOf; }).observe(view, { attributes: true, attributeFilter: ['data-as-of'] });
  return view;
}

function render() {
  const { org } = docs;
  const id = siteId();
  const site = org.sites[id];
  const p = params();
  const pod = docs.podcasts;
  const hasStation = pluginOn(org, 'podcasts') && pod.station.siteId === id;
  const content = pluginOn(org, 'pages') ? siteContent(docs.pages, id, now) : { nav: [], articles: [], bySlug: () => null };
  const publicSites = Object.values(org.sites).filter((s) => s.visibility === 'public');
  const ctx = { doc: pod, org, today: now, player, link };
  player.setLook(pod.station.look);

  // The org's palette and look and feel (Organisation → Public sites and theme), then the station's look.
  applyTheme(document.documentElement, org.theme);
  document.body.className = `site-page ${lookClasses(pod.station.look)}`;

  // Embeds in pages: only public content of this org.
  const embed = ({ kind, id: ref }) => {
    if (kind === 'dashboard') { const d = docs.dashboards.dashboards[ref]; return d?.visibility === 'public' ? dashboard(d) : null; }
    if (kind === 'episode') { const e = pod.episodes[ref]; return e && published(e, now) && pluginOn(org, 'podcasts') ? EpisodeCard(ctx, e, { embed: true }) : null; }
    if (kind === 'show') { const s = pod.podcasts[ref]; return s && pluginOn(org, 'podcasts') ? ShowCard(ctx, s) : null; }
    if (kind === 'calculator') { const c = docs.dashboards.calculators[ref]; return c?.visibility === 'public' ? CalculatorView(c, docs) : null; }
    if (kind === 'story') { const s = docs.dashboards.stories[ref]; return s?.visibility === 'public' ? StoryView(s, docs) : null; }
    return null;
  };

  let current = 'home';
  let title = site?.name;
  let body;
  if (!site) body = h('p', { class: 'empty' }, 'There is no site here.');
  else if (site.visibility === 'private') body = h('p', { class: 'empty' }, `${site.name} is private. Staff and board members sign in to see it.`);
  else if (p.page) {
    const pg = content.bySlug(p.page);
    current = pg?.kind === 'article' ? 'news' : `page:${p.page}`;
    title = pg?.title ?? 'Not found';
    body = pg ? Article(pg, embed) : h('p', { class: 'empty' }, 'That page is not here.');
  } else if (p.story) {
    const s = docs.dashboards.stories[p.story];
    const ok = s?.visibility === 'public' && s.siteId === id;
    title = ok ? s.title : 'Not found';
    body = ok ? h('div', { class: 'story-page' }, StoryView(s, docs)) : h('p', { class: 'empty' }, 'That story is not here.');
  } else if (p.episode && hasStation) {
    const e = pod.episodes[p.episode];
    current = 'station';
    title = e?.title;
    body = e && published(e, now) ? EpisodePage(ctx, e) : h('p', { class: 'empty' }, 'That episode is not here.');
  } else if (p.show && hasStation) {
    const s = pod.podcasts[p.show];
    current = 'station';
    title = s?.title;
    body = s ? ShowPage(ctx, s) : h('p', { class: 'empty' }, 'That show is not here.');
  } else if (p.view === 'station' && hasStation) {
    current = 'station';
    title = pod.station.name;
    body = StationHome(ctx);
  } else if (p.view === 'news') {
    current = 'news';
    title = 'News';
    body = h('div', {}, h('section', { class: 'site-hero' }, h('h1', {}, 'News')), NewsList(content.articles));
  } else body = Home(site, content, hasStation, ctx);

  document.title = `${title ?? 'Site'} · ${org.name}`;
  const navLink = (key, href, label) => h('a', { href, 'aria-current': current === key ? 'page' : null }, label);

  root.replaceChildren(
    // replaceChildren would print a bare false, so an empty string when there's no banner.
    !staffView ? '' : h('div', { class: 'preview-banner' }, isHosted() ? 'You’re signed in, so this is the public site as visitors see it. ' : 'Sample public site, made by Dashi from live data. ', h('a', { href: 'pages.html' }, 'Back to Dashi')),
    h('header', { class: 'site-head' },
      h('div', { class: 'inner' },
        h('a', { class: 'site-brand', href: link({}) }, Logo(org, 36), h('strong', {}, org.name)),
        site?.visibility === 'public' && h('nav', { 'aria-label': site.name },
          navLink('home', link({}), 'Home'),
          content.nav.map((pg) => navLink(`page:${pg.slug}`, link({ page: pg.slug }), pg.title)),
          content.articles.length > 0 && navLink('news', link({ view: 'news' }), 'News'),
          hasStation && navLink('station', link({ view: 'station' }), pod.station.name)),
        publicSites.length > 1 && h('details', { class: 'dropdown dropdown-end site-switch' },
          h('summary', { class: 'btn btn-ghost btn-sm' }, icon('globe', 16), h('span', { class: 'sr-only' }, 'Our sites')),
          h('ul', { class: 'menu dropdown-content bg-base-100 rounded-box shadow' },
            publicSites.map((s) => h('li', {}, h('a', { href: `?site=${s.id}` }, s.name))))))),
    h('main', { class: 'site-main' }, body),
    h('footer', { class: 'site-foot' },
      h('div', {}, h('strong', {}, org.name), org.description && h('p', {}, org.description)),
      h('address', {},
        org.contact.address && h('div', {}, org.contact.address),
        org.contact.email && h('div', {}, h('a', { href: `mailto:${org.contact.email}` }, org.contact.email)),
        org.contact.phone && h('div', {}, org.contact.phone)),
      h('p', { class: 'site-small' }, 'Every chart has a table view for screen readers and printing.',
        isHosted() && !staffView && [' · ', h('a', { href: '/login.html?next=/index.html' }, 'Staff sign in')])),
  );
}

function Home(site, content, hasStation, ctx) {
  const shown = Object.values(docs.dashboards.dashboards).filter((d) => d.siteId === site.id && d.visibility === 'public');
  const mine = (coll) => Object.values(docs.dashboards[coll] ?? {}).filter((x) => x.siteId === site.id && x.visibility === 'public');
  const calcs = mine('calculators');
  const stories = mine('stories');
  const latest = hasStation ? Object.values(ctx.doc.episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] : null;
  return h('div', {},
    h('section', { class: 'site-hero' },
      h('h1', {}, site.name),
      h('p', {}, docs.org.mission, site.shows ? ` This site shares ${site.shows.charAt(0).toLowerCase()}${site.shows.slice(1)}.` : ''),
      shown.length > 0 && h('p', { class: 'live-dot', style: 'margin-top:12px' }, 'Live program data. Press Play on a dashboard to watch the year change.')),
    (content.articles.length > 0 || latest) && h('section', { class: 'home-teasers' },
      content.articles.length > 0 && h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Latest news'), h('a', { href: link({ view: 'news' }) }, 'All news')),
        NewsList(content.articles.slice(0, 3))),
      latest && h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'New on the station'), h('a', { href: link({ view: 'station' }) }, 'All shows')),
        EpisodeCard(ctx, latest, { embed: true }))),
    stories.length > 0 && h('section', { class: 'story-teasers' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Stories from the data')),
      h('div', { class: 'news-list' }, stories.map((s) => h('a', { class: 'news-card story-card', href: link({ story: s.id }) },
        h('small', { class: 'muted' }, `${s.steps.length} steps${s.steps.some((st) => st.audio) ? ' · with audio' : ''}`),
        h('strong', {}, s.title), s.summary && h('span', {}, s.summary))))),
    shown.map(dashboard),
    calcs.map((c) => { const v = CalculatorView(c, docs); v.id = c.id; return v; }),
    !shown.length && !calcs.length && !stories.length && !content.articles.length && !latest && h('p', { class: 'empty' }, 'Nothing is published here yet.'));
}

function NewsList(articles) {
  if (!articles.length) return h('p', { class: 'empty' }, 'No news yet.');
  return h('div', { class: 'news-list' }, articles.map((a) =>
    h('a', { class: 'news-card', href: link({ page: a.slug }) },
      a.cover && h('img', { src: a.cover, alt: '' }),
      h('small', { class: 'muted' }, short(a.publishedAt)),
      h('strong', {}, a.title),
      a.summary && h('span', {}, a.summary))));
}

function Article(pg, embed) {
  const author = docs.org.staff[pg.authorId];
  return h('article', { class: `site-article ${pg.kind}` },
    h('header', {},
      pg.kind === 'article' && h('p', { class: 'crumbs' }, h('a', { href: link({ view: 'news' }) }, 'News')),
      h('h1', {}, pg.title),
      pg.kind === 'article' && h('p', { class: 'byline' }, author && Avatar(author, 24), author?.name, author && ' · ', short(pg.publishedAt)),
      pg.summary && pg.kind === 'article' && h('p', { class: 'lede' }, pg.summary)),
    pg.cover && h('img', { class: 'article-cover', src: pg.cover, alt: '' }),
    Markdown(pg.body, { embed }));
}

// Move between the site's pages without a reload, so the player keeps playing.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.download || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.search) return;
  e.preventDefault();
  history.pushState(null, '', url);
  render();
  scrollTo(0, 0);
});
window.addEventListener('popstate', render);

onDocChange('dashboards', (doc) => { docs.dashboards = migrateDashboards(doc); render(); });
onDocChange('data', (doc) => { docs.data = doc; render(); });
onDocChange('strategy', (doc) => { docs.strategy = migrateStrategy(doc); render(); });
onDocChange('org', (doc) => { docs.org = doc; render(); });
onDocChange('podcasts', (doc) => { docs.podcasts = migratePodcasts(doc); render(); });
onDocChange('pages', (doc) => { docs.pages = migratePages(doc); render(); });
render();
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
window.site = { docs, player, render };
