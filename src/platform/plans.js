/**
 * Plans (tiers): what each org gets on Free, Basic, Standard or Custom.
 *
 * The values here are the starting point. The platform admin changes them
 * for every org on a tier (Platform admin → Plans, stored as the platform
 * document "plans"), and can give a Custom org limits of its own (the
 * org's `limits` column). The server works out an org's plan from those
 * three layers and puts it on the org document as `platform.plan`, so
 * every page can read it; the server is what enforces it.
 *
 *   Plan { id, label, tagline, price: { monthly, note }, plugins: { [pluginId]: bool },
 *          limits: { [field]: number | null (no limit) },
 *          features: { socialLogin, customDomain, bibliographies, branding } }
 */
export const PLAN_IDS = ['free', 'basic', 'standard', 'custom'];

/** The limits, in the order the admin and the sales page show them. */
export const LIMITS = [
  { id: 'users', label: 'People who can sign in', short: 'people' },
  { id: 'maps', label: 'Ecosystem maps', short: 'maps' },
  { id: 'frameworks', label: 'Strategic frameworks', short: 'frameworks' },
  { id: 'plans', label: 'Strategic plans', short: 'plans' },
  { id: 'dashboards', label: 'Dashboards', short: 'dashboards' },
  { id: 'sites', label: 'Public sites', short: 'sites' },
  { id: 'shows', label: 'Podcast shows', short: 'shows' },
  { id: 'documents', label: 'Documents in the library', short: 'documents' },
  { id: 'storageMb', label: 'Storage', short: 'storage', unit: 'MB' },
  { id: 'uploadMb', label: 'Largest audio file', short: 'per file', unit: 'MB' },
];

export const FEATURES = [
  { id: 'socialLogin', label: 'Sign in with Google, Facebook or Microsoft' },
  { id: 'customDomain', label: 'Your own domain (yourorg.org)' },
  { id: 'bibliographies', label: 'Annotated bibliographies and weekly briefs' },
  { id: 'branding', label: 'No “Made with Dashi” on public sites' },
];

/** Plugins a plan can include. Organisation and Help are always there. */
export const PLAN_PLUGINS = ['mapper', 'strategy', 'studio', 'palette', 'podcasts', 'pages', 'library'];

export const DEFAULT_PLANS = {
  free: {
    id: 'free', label: 'Free', tagline: 'Try Dashi with a small team: a map, a dashboard, a public site and a weekly podcast.',
    price: { monthly: 0, note: 'Free for good' },
    plugins: { mapper: true, strategy: false, studio: false, palette: true, podcasts: true, pages: true, library: true },
    limits: { users: 5, maps: 1, frameworks: 0, plans: 0, dashboards: 1, sites: 1, shows: 1, documents: 50, storageMb: 1024, uploadMb: 10 },
    features: { socialLogin: false, customDomain: false, bibliographies: false, branding: false },
  },
  basic: {
    id: 'basic', label: 'Basic', tagline: 'For a small nonprofit putting its first strategic plan and impact data online.',
    price: { monthly: 19, note: 'a month, billed yearly' },
    plugins: { mapper: true, strategy: true, studio: false, palette: true, podcasts: true, pages: true, library: true },
    limits: { users: 15, maps: 2, frameworks: 1, plans: 2, dashboards: 3, sites: 1, shows: 2, documents: 500, storageMb: 5120, uploadMb: 50 },
    features: { socialLogin: true, customDomain: false, bibliographies: false, branding: false },
  },
  standard: {
    id: 'standard', label: 'Standard', tagline: 'Everything in Dashi, with room for a whole staff team and several programs.',
    price: { monthly: 49, note: 'a month, billed yearly' },
    plugins: { mapper: true, strategy: true, studio: true, palette: true, podcasts: true, pages: true, library: true },
    limits: { users: 50, maps: 5, frameworks: 2, plans: 4, dashboards: 10, sites: 3, shows: 5, documents: 5000, storageMb: 25600, uploadMb: 250 },
    features: { socialLogin: true, customDomain: false, bibliographies: true, branding: true },
  },
  custom: {
    id: 'custom', label: 'Custom', tagline: 'Your own domain, no limits, and a setup shaped around your organisation or network.',
    price: { monthly: null, note: 'Let’s talk' },
    plugins: { mapper: true, strategy: true, studio: true, palette: true, podcasts: true, pages: true, library: true },
    limits: { users: null, maps: null, frameworks: null, plans: null, dashboards: null, sites: null, shows: null, documents: null, storageMb: 102400, uploadMb: 700 },
    features: { socialLogin: true, customDomain: true, bibliographies: true, branding: true },
  },
};

const merge = (base, over) => {
  const out = structuredClone(base);
  for (const part of ['plugins', 'limits', 'features', 'price']) if (over?.[part]) Object.assign(out[part], over[part]);
  for (const k of ['label', 'tagline']) if (over?.[k]) out[k] = over[k];
  return out;
};

/** Every plan, with the platform admin's changes. */
export const allPlans = (overrides = {}) => Object.fromEntries(PLAN_IDS.map((id) => [id, merge(DEFAULT_PLANS[id], overrides[id])]));

/** One org's plan: its tier, the admin's changes to the tier, then the org's own limits. */
export function planFor(tier, overrides = {}, orgLimits = {}) {
  const id = PLAN_IDS.includes(tier) ? tier : 'free';
  return { ...merge(merge(DEFAULT_PLANS[id], overrides[id]), orgLimits), id };
}

/** How much of each limit a set of org documents uses. */
export function usageOf(docs) {
  const nodes = Object.values(docs.strategy?.nodes ?? {});
  return {
    users: Object.values(docs.org?.staff ?? {}).filter((s) => /@/.test(s.email ?? '')).length,
    maps: Object.keys(docs.maps?.maps ?? {}).length,
    frameworks: nodes.filter((n) => n.type === 'framework').length,
    plans: nodes.filter((n) => n.type === 'plan').length,
    dashboards: Object.keys(docs.dashboards?.dashboards ?? {}).length,
    sites: Object.keys(docs.org?.sites ?? {}).length,
    shows: Object.keys(docs.podcasts?.podcasts ?? {}).length,
    documents: Object.keys(docs.library?.items ?? {}).length,
  };
}

/** Which document holds each counted thing. */
export const COUNTED_IN = { org: ['users', 'sites'], maps: ['maps'], strategy: ['frameworks', 'plans'], dashboards: ['dashboards'], podcasts: ['shows'], library: ['documents'] };

/**
 * Whether saving `next` in place of `prev` would go past the plan. Things
 * already over the limit (after a downgrade) can stay; only new ones are
 * refused. Returns a sentence saying why, or null.
 */
export function overLimit(plan, name, prev, next) {
  for (const field of COUNTED_IN[name] ?? []) {
    const max = plan.limits[field];
    if (max == null) continue;
    const before = usageOf({ [name]: prev })[field];
    const after = usageOf({ [name]: next })[field];
    if (after > max && after > before) return limitText(plan, field);
  }
  return null;
}

export function limitText(plan, field) {
  const l = LIMITS.find((x) => x.id === field);
  const max = plan.limits[field];
  const what = max === 0 ? `doesn’t include ${l.label.toLowerCase()}` : `includes ${amount(max, l)} ${max === 1 ? l.label.toLowerCase().replace(/s$/, '') : l.label.toLowerCase()}`;
  return `The ${plan.label} plan ${what}. Ask your platform admin about a larger plan.`;
}

/** "5", "1 GB", "No limit". */
export function amount(v, l) {
  if (v == null) return 'No limit';
  if (l?.unit === 'MB') return v >= 1024 ? `${+(v / 1024).toFixed(1)} GB` : `${v} MB`;
  return String(v);
}

/** Whether the org's plan lets it add one more of `field`, given how many it has (for buttons). */
export function canAdd(org, field, count) {
  const max = org.platform?.plan?.limits?.[field];
  return max == null || count < max;
}
