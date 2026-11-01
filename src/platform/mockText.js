/**
 * Made-up words and pictures for the test platform (platform/mockOrgs.js):
 * a seeded random generator, names, lorem ipsum, annotation-like prose,
 * and SVG portraits and logos as data URLs. Everything is fictional.
 */

/** A seeded random number generator (mulberry32), so test orgs are the same every time. */
export function rng(seedText) {
  let a = 1779033703;
  for (const ch of String(seedText)) a = Math.imul(a ^ ch.charCodeAt(0), 3432918353) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (xs) => xs[Math.floor(next() * xs.length)];
  next.chance = (p) => next() < p;
  next.some = (xs, n) => { const c = [...xs]; const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(next() * c.length), 1)[0]); return out; };
  return next;
}

export const FIRST = ['Amara', 'Jordan', 'Priya', 'Mateo', 'Hana', 'Owen', 'Leila', 'Tanis', 'Ben', 'Sofia', 'Grace', 'Noah', 'Aisha', 'Liam', 'Mei', 'Kwame', 'Chloé', 'Rajesh', 'Fatima', 'Ethan', 'Nia', 'Gabriel', 'Ayesha', 'Lucas', 'Yuki', 'Darius', 'Elena', 'Malik', 'Isabelle', 'Tomás', 'Zara', 'Kai', 'Esi', 'Arjun', 'Maëlle', 'Diego', 'Ngozi', 'Samir', 'Ingrid', 'Wei', 'Olivia', 'Kofi', 'Ananya', 'Jamal', 'Camille', 'Hiroshi', 'Adaeze', 'Mikael', 'Rosa', 'Tariq', 'Sienna', 'Mohammed', 'Freya', 'Andrés', 'Imani', 'Pierre', 'Lakshmi', 'Connor', 'Amina', 'Raven', 'Jun', 'Beatriz', 'Emeka', 'Hannah', 'Nadia', 'Ravi', 'Talia', 'Felix', 'Marisol', 'Desmond'];
export const LAST = ['Okafor', 'Lee', 'Sharma', 'Rivera', 'Kim', 'Tremblay', 'Haddad', 'Cardinal', 'Murphy', 'Rossi', 'Chen', 'Bergeron', 'Mensah', 'Gagnon', 'Nguyen', 'Singh', 'Roy', 'Wong', 'Patel', 'Côté', 'Ibrahim', 'Martin', 'Bouchard', 'Achebe', 'Kowalski', 'Ahmed', 'Fraser', 'Morin', 'Tanaka', 'Osei', 'Larsen', 'Dubois', 'Hussain', 'Campbell', 'Yamamoto', 'Pelletier', 'Adeyemi', 'MacLeod', 'Bernard', 'Sato', 'Laboucan', 'Petrov', 'Grant', 'Ali', 'Fontaine', 'Mwangi', 'Sinclair', 'Ortiz', 'Choi', 'Bear', 'Lindqvist', 'Asante', 'Desrosiers', 'Kaur', 'Whitehorse', 'Novak', 'Abara', 'Leblanc', 'Huang', 'Castillo'];

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis et commodo pharetra est eros bibendum elit nec luctus magna felis sollicitudin mauris integer in mauris eu nibh euismod gravida duis ac tellus et risus vulputate vehicula donec lobortis risus a elit etiam tempor ut ullamcorper ligula eu tempor congue eros est euismod turpis id tincidunt sapien risus a quam maecenas fermentum consequat mi donec fermentum pellentesque malesuada nulla a mi duis sapien sem aliquet nec commodo eget consequat quis neque aliquam faucibus elit ut dictum aliquet felis nisl adipiscing sapien sed malesuada diam lacus eget erat cras mollis scelerisque nunc nullam arcu aliquam consequat'.split(' ');

/** A lorem ipsum sentence or paragraph. */
export function lorem(r, words = 12) {
  const out = [];
  let i = r.int(0, LOREM.length - 1);
  while (out.length < words) { out.push(LOREM[i % LOREM.length]); i += r.int(1, 7); }
  const s = out.join(' ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}
export const loremPara = (r, sentences = 5) => Array.from({ length: sentences }, () => lorem(r, r.int(8, 18))).join(' ');

const fill = (r, template, vocab) => template.replace(/\{(\w+)\}/g, (_, k) => (vocab[k] ? r.pick(vocab[k]) : k));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Prose that reads like an annotation of a source: what it is, what it
 * finds, how sound it is, why it matters here. `vocab` comes from a sector
 * (mockOrgs.js) with topic, place, method, finding, limit and why lists.
 */
export function annotationText(r, vocab, { kind = 'study', tags = [], minWords = 220, maxWords = 480 } = {}) {
  const target = r.int(minWords, maxWords);
  const summary = [
    `This ${kind} examines {topic} in {place}, drawing on {method}.`,
    'It sets out to explain why {topic} has proved so hard to shift, and what organisations on the ground can do about it.',
    'The authors place their work within a growing literature on {topic}, and are explicit about the questions they leave open.',
    `The ${kind} covers the period from ${r.int(2008, 2016)} to ${r.int(2018, 2025)}, with most of the evidence gathered in the later years.`,
  ];
  const findings = [
    'The central finding is that {finding}.',
    'A second, more tentative finding is that {finding}.',
    'The evidence also suggests that {finding}, although the effect is smaller and varies by site.',
    'Perhaps the most useful contribution is the observation that {finding}.',
    'Interviews with practitioners add texture: several describe how {finding}.',
  ];
  const assess = [
    'The method is careful and well documented, although {limit}.',
    'Readers should note that {limit}, which the authors acknowledge.',
    'The argument is persuasive but rests heavily on a small number of cases, and {limit}.',
    'As a piece of evidence it is strongest on description and weaker on cause; {limit}.',
  ];
  const why = [
    `For this collection the ${kind} matters because {why}.`,
    'It is a useful counterpoint to sources that assume {why}.',
    'It should inform how we frame the next brief, since {why}.',
    tags.length ? `It speaks most directly to ${tags.slice(0, 2).join(' and ')}, and is worth reading alongside the other sources tagged that way.` : 'It is worth reading alongside the other sources in this group.',
  ];
  const paras = [summary, findings, assess, why].map((pool) => r.some(pool, r.int(2, Math.min(3, pool.length))).map((t) => cap(fill(r, t, vocab))).join(' '));
  let text = paras.join('\n\n');
  const extra = [...findings, ...assess];
  let guard = 0;
  while (text.split(/\s+/).length < target && guard++ < 20) text += ` ${cap(fill(r, r.pick(extra), vocab))}`;
  return text;
}

const SKIN = ['#f6d7c3', '#eac0a2', '#d9a27e', '#c68a62', '#a86b45', '#8a5234', '#6b3d25', '#4f2c1b'];
const HAIR = ['#1f1a17', '#3b2a20', '#5a3b26', '#8a5a33', '#b07a45', '#d8b26e', '#9a9a9a', '#e8e1d5', '#7a2f1f', '#2d2340'];
const BG = ['#dbe7f8', '#f8e1d6', '#d9f0e6', '#f6ecd0', '#e8def5', '#f3dbe6', '#dcecef', '#e9e9e2'];
const SHIRT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#6a4fb5', '#c43c6b', '#2f4858', '#8a8a8a', '#0f7c8c', '#b5523b'];

const svgUrl = (svg) => `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : Buffer.from(svg).toString('base64')}`;

/** A simple head-and-shoulders portrait, as a profile photo stand-in. */
export function portrait(r) {
  const skin = r.pick(SKIN);
  const hair = r.pick(HAIR);
  const style = r.int(0, 5);
  const hairPath = [
    'M30 44 Q30 18 50 17 Q70 18 70 44 Q66 30 50 29 Q34 30 30 44Z',
    'M27 52 Q24 16 50 15 Q76 16 73 52 Q72 66 68 74 L66 46 Q60 30 50 30 Q40 30 34 46 L32 74 Q28 66 27 52Z',
    'M31 40 Q33 20 50 19 Q67 20 69 40 Q60 33 50 34 Q40 33 31 40Z',
    'M29 46 Q27 14 50 14 Q73 14 71 46 Q69 28 50 26 Q31 28 29 46Z M44 13 Q50 4 57 13Z',
    'M30 42 Q31 22 50 21 Q69 22 70 42 Q50 28 30 42Z',
    'M25 48 Q22 12 50 12 Q78 12 75 48 Q78 60 72 70 Q70 52 66 40 Q50 24 34 40 Q30 52 28 70 Q22 60 25 48Z',
  ][style];
  const glasses = r.chance(0.25) ? '<g fill="none" stroke="#2b2b2b" stroke-width="1.6"><circle cx="43" cy="46" r="5.5"/><circle cx="57" cy="46" r="5.5"/><path d="M48.5 46h3"/></g>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${r.pick(BG)}"/>`
    + `<path d="M14 100 Q16 74 50 72 Q84 74 86 100Z" fill="${r.pick(SHIRT)}"/><rect x="44" y="58" width="12" height="16" rx="5" fill="${skin}"/>`
    + `<ellipse cx="50" cy="45" rx="17" ry="20" fill="${skin}"/><path d="${hairPath}" fill="${hair}"/>`
    + `<circle cx="43.5" cy="46" r="1.6" fill="#2b2b2b"/><circle cx="56.5" cy="46" r="1.6" fill="#2b2b2b"/><path d="M45 55 Q50 ${r.chance(0.7) ? 59 : 57} 55 55" stroke="#6b3a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>${glasses}</svg>`;
  return svgUrl(svg);
}

/** A logo mark: a shape in the org's colour with its initials or a motif. */
export function logo(name, color, motif = 'circle') {
  const initials = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join('');
  const shapes = {
    circle: `<circle cx="50" cy="50" r="46" fill="${color}"/>`,
    house: `<path d="M8 50 L50 10 L92 50 L82 50 L82 92 L18 92 L18 50Z" fill="${color}"/>`,
    leaf: `<path d="M50 6 C86 18 92 56 50 94 C8 56 14 18 50 6Z" fill="${color}"/>`,
    wave: `<rect x="4" y="4" width="92" height="92" rx="22" fill="${color}"/><path d="M4 66 Q27 52 50 66 T96 66 L96 74 Q73 60 50 74 T4 74Z" fill="#fff" opacity=".35"/>`,
    star: `<path d="M50 4 L61 37 L96 37 L68 58 L79 92 L50 71 L21 92 L32 58 L4 37 L39 37Z" fill="${color}"/>`,
    hex: `<path d="M50 4 L90 27 L90 73 L50 96 L10 73 L10 27Z" fill="${color}"/>`,
  };
  const y = motif === 'house' ? 72 : motif === 'star' ? 64 : 62;
  const size = initials.length > 1 ? (motif === 'star' ? 22 : 32) : 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes[motif] ?? shapes.circle}<text x="50" y="${y}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}" fill="#fff">${initials}</text></svg>`;
  return svgUrl(svg);
}
