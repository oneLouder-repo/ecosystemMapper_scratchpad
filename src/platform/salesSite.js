/**
 * The words on Dashi's own public site (the root domain): the home page,
 * the details page and the pricing page. These are the defaults; the
 * platform admin edits them (Platform admin → Sales site), stored as the
 * platform document "site". Plans and prices come from plans.js.
 */
export const DEFAULT_SITE = {
  hero: {
    eyebrow: 'For nonprofits and the networks around them',
    title: 'Plan, map, measure and tell your story, in one place',
    text: 'Dashi brings a small organisation’s strategy, ecosystem map, impact data, documents, podcast and public website together, so the work and the story of the work stay in step.',
    cta: 'Start free',
  },
  points: [
    { title: 'See your ecosystem', text: 'Map the partners, funders, communities and relationships around your work, and the gaps in them.', plugin: 'mapper' },
    { title: 'Plan together', text: 'Build a strategic plan with your team and board: a shared SOAR whiteboard, objectives, goals and workplans.', plugin: 'studio' },
    { title: 'Keep the work moving', text: 'Workplans, tasks and timelines that roll up to the goals they serve.', plugin: 'strategy' },
    { title: 'Show your impact', text: 'Dashboards, data stories and impact calculators from your own program data, private or public.', plugin: 'palette' },
    { title: 'Keep what you know', text: 'A document library with proper references, annotated bibliographies and weekly briefs.', plugin: 'library' },
    { title: 'Find your voice', text: 'A podcast station for your community, with a feed for every podcast app.', plugin: 'podcasts' },
    { title: 'Publish it all', text: 'A public website in your colours that updates itself as the work does.', plugin: 'pages' },
  ],
  trust: [
    { title: 'Hosted in Canada', text: 'Your data lives on servers in Toronto.' },
    { title: 'Private by default', text: 'Nothing is public until you publish it. Passwords and sign-in tokens are never stored as text.' },
    { title: 'Built for small teams', text: 'No consultants needed. If you can use a spreadsheet, you can use Dashi.' },
  ],
  about: {
    title: 'About Dashi',
    intro: 'Dashi is a platform for small nonprofits, social enterprises and the networks they belong to. It started from a simple frustration: the strategy lives in one document, the data in a spreadsheet, the partners in someone’s head, and the website is always out of date.',
    sections: [
      { title: 'How it works', text: 'Each organisation gets its own space at its own address, such as riverbend.dashi.ca, or on the Custom plan its own domain. Staff sign in to plan and work; visitors see only what the organisation publishes: its site, its dashboards and its podcast.' },
      { title: 'Plugins', text: 'Dashi is made of plugins: the ecosystem mapper, strategy and work, the planning studio, the data workbench, the document library, podcasts and public sites. Each plan includes a set of them, and an organisation can switch off what it doesn’t use.' },
      { title: 'Security and privacy', text: 'Passwords are stored as salted hashes, sign-in tokens as one-way hashes, and every page is protected against the common web attacks. The platform runs a security audit on itself and takes a backup every day. Data is hosted in Canada and never sold or shared.' },
      { title: 'Who runs it', text: 'Dashi is run as a social enterprise. Revenue from paid plans keeps the free plan free for the smallest groups.' },
    ],
    faq: [
      { q: 'Is the free plan really free?', a: 'Yes. It has limits (five people, one map, one dashboard, one podcast show) but no time limit and no card needed.' },
      { q: 'Can we move up or down a plan?', a: 'Any time. Nothing is deleted if you move down; you just can’t add more than the smaller plan allows.' },
      { q: 'Can we use our own domain?', a: 'On the Custom plan. You keep managing your own DNS; Dashi tells you exactly which two records to add and checks them for you.' },
      { q: 'Can we get our data out?', a: 'Yes. Program data exports as CSV, documents as Word, PDF or Markdown, and podcasts as standard feeds and zip archives.' },
    ],
  },
  pricingNote: 'Start free and move up when you need more. Prices are in Canadian dollars.',
  contact: { email: 'hello@dashi.ca', note: 'We usually answer within two working days.' },
};

/** The admin's saved words over the defaults, section by section. */
export function siteContent(saved = {}) {
  const out = structuredClone(DEFAULT_SITE);
  for (const [k, v] of Object.entries(saved ?? {})) if (k in out && v != null) out[k] = typeof v === 'object' && !Array.isArray(v) ? { ...out[k], ...v } : v;
  return out;
}
