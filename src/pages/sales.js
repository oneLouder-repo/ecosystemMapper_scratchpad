import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Wordmark } from '../ui/Wordmark.js';
import { PLUGINS } from '../plugins.js';
import { LIMITS, FEATURES, PLAN_IDS, PLAN_PLUGINS, amount, allPlans } from '../platform/plans.js';
import { siteContent } from '../platform/salesSite.js';

/**
 * Dashi's own public site, on the root domain: the home page (for anyone
 * not signed in), Plans and pricing, About, Sign up and Contact. One
 * address for everyone: visitors find out and sign up, members sign in
 * and are sent to their org, and the platform admin runs it all.
 *
 *   salesPage(root, page)   page: 'home' | 'pricing' | 'about' | 'signup' | 'contact'
 *
 * The words come from the platform document "site" (edited in Platform
 * admin → Sales site), the plans and prices from "plans".
 */
const pluginOf = (id) => PLUGINS.find((p) => p.id === id);
const fmtPrice = (p) => (p.price.monthly == null ? 'Let’s talk' : p.price.monthly === 0 ? 'Free' : `$${p.price.monthly}`);

async function platformInfo() {
  try {
    const res = await fetch('/api/platform');
    if (res.ok) return await res.json();
  } catch { /* the local prototype has no server */ }
  return { plans: allPlans(), site: siteContent(), signup: true, baseDomain: 'dashi.ca' };
}

function Header(page, user) {
  const link = (href, label, id) => h('a', { href, class: page === id ? 'on' : '', 'aria-current': page === id ? 'page' : null }, label);
  return h('header', { class: 'sales-head' },
    h('a', { href: '/', class: 'platform-brand', 'aria-label': 'Dashi home' }, Wordmark(24)),
    h('nav', { class: 'sales-nav', 'aria-label': 'Dashi' },
      link('/pricing.html', 'Plans and pricing', 'pricing'), link('/about.html', 'About', 'about'), link('/contact.html', 'Contact', 'contact')),
    h('span', { class: 'spacer' }),
    user
      ? h('a', { class: 'btn btn-sm', href: '/' }, 'Your organisations')
      : [h('a', { class: 'btn btn-sm btn-ghost', href: '/login.html?next=/' }, 'Sign in'), h('a', { class: 'btn btn-sm btn-primary', href: '/signup.html' }, 'Start free')]);
}

function Footer(site) {
  return h('footer', { class: 'sales-foot' },
    h('div', {}, Wordmark(18), h('p', { class: 'muted small' }, 'A social enterprise. Hosted in Canada.')),
    h('nav', {}, h('a', { href: '/pricing.html' }, 'Plans and pricing'), h('a', { href: '/about.html' }, 'About'), h('a', { href: '/about.html#security' }, 'Security'), h('a', { href: '/contact.html' }, 'Contact'), h('a', { href: '/login.html?next=/' }, 'Sign in')),
    h('p', { class: 'muted small' }, site.contact.email));
}

/* -------------------------------------------------------------- home */
function Home({ site, plans }) {
  const { hero } = site;
  return [
    h('section', { class: 'sales-hero' },
      h('div', {},
        h('p', { class: 'eyebrow' }, hero.eyebrow),
        h('h1', {}, hero.title),
        h('p', { class: 'lede' }, hero.text),
        h('div', { class: 'cta-row' },
          h('a', { class: 'btn btn-primary', href: '/signup.html' }, hero.cta),
          h('a', { class: 'btn', href: '/pricing.html' }, 'See plans'))),
      HeroArt()),
    h('section', { class: 'sales-points' },
      site.points.map((pt) => {
        const p = pluginOf(pt.plugin);
        return h('article', { class: 'sales-point', style: p?.tone ? `--tone:${p.tone}` : '' },
          h('span', { class: 'tone-tile' }, icon(p?.icon ?? 'star', 22)),
          h('h3', {}, pt.title), h('p', {}, pt.text));
      })),
    h('section', { class: 'sales-trust' }, site.trust.map((t) => h('div', {}, icon('check', 18), h('strong', {}, t.title), h('p', {}, t.text)))),
    h('section', { class: 'sales-plans-band' },
      h('h2', {}, 'A plan for every size'),
      PlanCards(plans, { compact: true }),
      h('p', { class: 'center' }, h('a', { href: '/pricing.html' }, 'Compare everything in each plan →'))),
  ];
}

/** A little picture of Dashi: tiles in the plugins' colours. */
function HeroArt() {
  const tiles = ['mapper', 'strategy', 'palette', 'podcasts', 'library', 'pages'].map(pluginOf).filter(Boolean);
  return h('div', { class: 'hero-art', 'aria-hidden': 'true' },
    tiles.map((p, i) => h('div', { class: `hero-tile t${i}`, style: `--tone:${p.tone}` }, icon(p.icon, 26), h('span', {}, p.short ?? p.name))));
}

/* ----------------------------------------------------------- pricing */
function PlanCards(plans, { compact = false } = {}) {
  return h('div', { class: 'plan-cards' }, PLAN_IDS.map((id) => {
    const p = plans[id];
    const NOUNS = { users: ['person', 'people'], plans: ['strategic plan', 'strategic plans'], dashboards: ['dashboard', 'dashboards'], maps: ['ecosystem map', 'ecosystem maps'] };
    const line = (k) => {
      const v = p.limits[k];
      if (k === 'storageMb') return `${amount(v, { unit: 'MB' })} of storage`;
      if (v === 0) return null;
      return v == null ? `Unlimited ${NOUNS[k][1]}` : `${v} ${NOUNS[k][v === 1 ? 0 : 1]}`;
    };
    const key = ['users', 'maps', 'plans', 'dashboards', 'storageMb'].map(line).filter(Boolean);
    return h('article', { class: `plan-card ${id === 'standard' ? 'featured' : ''}` },
      id === 'standard' && h('span', { class: 'badge badge-primary badge-sm plan-flag' }, 'Most chosen'),
      h('h3', {}, p.label),
      h('p', { class: 'plan-price' }, h('strong', {}, fmtPrice(p)), p.price.monthly ? h('span', {}, ` ${p.price.note}`) : null),
      h('p', { class: 'plan-tag' }, p.tagline),
      !compact && h('ul', { class: 'plan-list' },
        key.map((t) => h('li', {}, icon('check', 14), t)),
        p.features.socialLogin && h('li', {}, icon('check', 14), 'Google, Facebook and Microsoft sign-in'),
        p.features.customDomain && h('li', {}, icon('check', 14), 'Your own domain')),
      h('a', { class: `btn btn-sm ${id === 'standard' ? 'btn-primary' : ''}`, href: id === 'custom' ? '/contact.html?plan=custom' : `/signup.html?plan=${id}` }, id === 'custom' ? 'Talk to us' : id === 'free' ? 'Start free' : `Start with ${p.label}`));
  }));
}

function Pricing({ plans, site }) {
  const yes = h('span', { class: 'yes' }, icon('check', 16), h('span', { class: 'sr-only' }, 'Included'));
  const no = () => h('span', { class: 'no', 'aria-label': 'Not included' }, '—');
  return [
    h('section', { class: 'sales-section' },
      h('h1', {}, 'Plans and pricing'),
      h('p', { class: 'lede' }, site.pricingNote),
      PlanCards(plans)),
    h('section', { class: 'sales-section' },
      h('h2', {}, 'Everything in each plan'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'compare-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), PLAN_IDS.map((id) => h('th', { scope: 'col' }, plans[id].label)))),
        h('tbody', {},
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Plugins')),
          PLAN_PLUGINS.map((pid) => h('tr', {}, h('th', { scope: 'row' }, pluginOf(pid)?.name ?? pid), PLAN_IDS.map((id) => h('td', {}, plans[id].plugins[pid] ? yes.cloneNode(true) : no())))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'How much')),
          LIMITS.map((l) => h('tr', {}, h('th', { scope: 'row' }, l.label), PLAN_IDS.map((id) => h('td', {}, plans[id].limits[l.id] === 0 ? no() : amount(plans[id].limits[l.id], l))))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Features')),
          h('tr', {}, h('th', { scope: 'row' }, 'Address'), PLAN_IDS.map((id) => h('td', {}, plans[id].features.customDomain ? 'Your own domain, and yourorg.dashi.ca' : 'yourorg.dashi.ca'))),
          FEATURES.filter((f) => f.id !== 'customDomain').map((f) => h('tr', {}, h('th', { scope: 'row' }, f.label), PLAN_IDS.map((id) => h('td', {}, plans[id].features[f.id] ? yes.cloneNode(true) : no())))))))),
  ];
}

/* ------------------------------------------------------------- about */
function About({ site }) {
  const a = site.about;
  return [
    h('section', { class: 'sales-section narrow' },
      h('h1', {}, a.title),
      h('p', { class: 'lede' }, a.intro),
      a.sections.map((s) => h('div', { class: 'about-block', id: /security/i.test(s.title) ? 'security' : null }, h('h2', {}, s.title), h('p', {}, s.text))),
      h('h2', {}, 'Questions'),
      h('div', { class: 'faq' }, a.faq.map((f) => h('details', {}, h('summary', {}, f.q), h('p', {}, f.a))))),
  ];
}

/* ------------------------------------------------------------ sign-up */
function Signup({ plans, signup, baseDomain }, user) {
  if (!signup) return [h('section', { class: 'sales-section narrow' }, h('h1', {}, 'Sign-up is closed for now'), h('p', {}, 'We’re opening Dashi to a few organisations at a time. ', h('a', { href: '/contact.html' }, 'Write to us'), ' and we’ll be in touch.'))];
  const params = new URLSearchParams(location.search);
  const want = PLAN_IDS.includes(params.get('plan')) ? params.get('plan') : 'free';
  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40);
  const f = {
    orgName: h('input', { class: 'input', name: 'orgName', required: true, placeholder: 'Riverbend Community Food Hub', autocomplete: 'organization' }),
    slug: h('input', { class: 'input', name: 'slug', required: true, pattern: '[a-z0-9-]+', placeholder: 'riverbend' }),
    name: h('input', { class: 'input', name: 'name', required: !user, autocomplete: 'name' }),
    email: h('input', { class: 'input', name: 'email', type: 'email', required: !user, autocomplete: 'email' }),
    password: h('input', { class: 'input', name: 'password', type: 'password', minlength: 10, required: !user, autocomplete: 'new-password' }),
    plan: h('select', { class: 'select', name: 'plan' }, PLAN_IDS.filter((id) => id !== 'custom').map((id) => h('option', { value: id, selected: id === want }, `${plans[id].label} (${fmtPrice(plans[id])}${plans[id].price.monthly ? ' a month' : ''})`))),
    website: h('input', { name: 'website', tabindex: -1, autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' }),
  };
  let edited = false;
  f.orgName.addEventListener('input', () => { if (!edited) f.slug.value = slugify(f.orgName.value); });
  f.slug.addEventListener('input', () => { edited = true; });
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint && h('small', { class: 'muted' }, hint));
  const form = h('form', { class: 'signup-form', onsubmit: async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    try {
      const res = await fetch('/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That didn’t work. Try again.');
      form.replaceWith(h('div', { class: 'signup-done' },
        h('h2', {}, `${out.org.name} is ready`),
        h('p', {}, `Its address is ${out.org.url.replace(/^https?:\/\//, '')}. `, out.plan !== 'free' ? `It starts on Free; we’ll be in touch about ${plans[out.plan].label} within two working days.` : ''),
        h('a', { class: 'btn btn-primary', href: out.open }, 'Open it')));
    } catch (err) { msg.textContent = err.message; }
  } },
    field('Organisation', f.orgName),
    field('Address', h('span', { class: 'slug-field' }, f.slug, h('span', { class: 'muted' }, `.${baseDomain}`)), 'Letters, numbers and dashes. You can add your own domain on the Custom plan.'),
    !user && [field('Your name', f.name), field('Email', f.email, 'You’ll sign in with this.'), field('Password', f.password, 'At least 10 characters; a short sentence works well.')],
    user && h('p', { class: 'muted' }, `You’re signed in as ${user.email}; you’ll be the new organisation’s admin.`),
    field('Plan', f.plan, 'Every organisation starts on Free. If you choose a paid plan, we’ll set it up with you.'),
    f.website, msg,
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create our space'),
    h('p', { class: 'muted small' }, 'Already on Dashi? ', h('a', { href: '/login.html?next=/' }, 'Sign in'), '.'));
  return [h('section', { class: 'sales-section signup' },
    h('div', {}, h('h1', {}, 'Start with Dashi'), h('p', { class: 'lede' }, 'Your organisation gets its own space in a minute. No card needed.'),
      h('ul', { class: 'plan-list' }, ['Your own address and public site', 'Invite your team by email', 'Move up a plan any time'].map((t) => h('li', {}, icon('check', 14), t)))),
    form)];
}

/* ------------------------------------------------------------ contact */
function Contact({ site }) {
  const plan = new URLSearchParams(location.search).get('plan');
  const f = {
    name: h('input', { class: 'input', name: 'name', autocomplete: 'name' }),
    email: h('input', { class: 'input', name: 'email', type: 'email', required: true, autocomplete: 'email' }),
    org: h('input', { class: 'input', name: 'org', autocomplete: 'organization' }),
    message: h('textarea', { class: 'textarea', name: 'message', rows: 6, required: true }, plan === 'custom' ? 'We’re interested in the Custom plan. ' : ''),
    website: h('input', { name: 'website', tabindex: -1, autocomplete: 'off', class: 'hp', 'aria-hidden': 'true' }),
  };
  const msg = h('p', { class: 'form-msg', role: 'alert' });
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
  const form = h('form', { class: 'signup-form', onsubmit: async (e) => {
    e.preventDefault();
    const body = { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), plan };
    const res = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) form.replaceWith(h('div', { class: 'signup-done' }, h('h2', {}, 'Thank you'), h('p', {}, site.contact.note)));
    else msg.textContent = (await res?.json().catch(() => null))?.error ?? 'That didn’t send. Try again, or email us.';
  } }, field('Your name', f.name), field('Email', f.email), field('Organisation', f.org), field('Message', f.message), f.website, msg, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send'));
  return [h('section', { class: 'sales-section signup' },
    h('div', {}, h('h1', {}, 'Talk to us'), h('p', { class: 'lede' }, 'About the Custom plan, a network of organisations, or anything else.'), h('p', {}, `Or email ${site.contact.email}. ${site.contact.note}`)),
    form)];
}

const PAGES = { home: Home, pricing: Pricing, about: About, signup: Signup, contact: Contact };
const TITLES = { home: 'Dashi', pricing: 'Plans and pricing · Dashi', about: 'About · Dashi', signup: 'Start free · Dashi', contact: 'Contact · Dashi' };

export async function salesPage(root, page, user = null) {
  const info = await platformInfo();
  document.body.className = 'sales-page';
  document.title = TITLES[page];
  root.replaceChildren(Header(page, user), h('main', { class: 'sales-main' }, PAGES[page](info, user)), Footer(info.site));
}

// Opened as its own page (pricing.html and the rest): the page says which.
const own = document.body?.dataset.salesPage;
if (own) {
  let user = null;
  try { user = (await (await fetch('/api/session')).json()).user; } catch { /* no server */ }
  salesPage(document.querySelector('#app'), own, user);
}
