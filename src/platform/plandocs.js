import { uid } from '../core/ops.js';
import { childrenOf, rootOf } from './strategy.js';
import { measureFacts, seriesOf } from './data.js';

/**
 * Strategic plan documents: a designed, themable plan made from the org's
 * own strategy (mission, vision, values, objectives, goals, measures and
 * their latest data), edited in place in the Plan designer, printed or
 * saved as PDF, and published to a public web view.
 *
 * { id: 'plandocs', docs: { [id]: PlanDoc } }
 * PlanDoc {
 *   id, planId, template: 'modern' | 'bold' | 'editorial', palette (a theme id, or '' for the org's),
 *   text: { [key]: string }      words changed from what the strategy says (see textKeys)
 *   hidden: { [sectionId]: true } sections left out
 *   images: { [slot]: Image }     slot is 'cover' or 'obj:<objectiveId>'
 *   siteId, status: 'draft' | 'published', publishedAt,
 *   snapshot                      the plan as it was published (what visitors see)
 *   createdAt, updatedAt
 * }
 * Image { kind: 'art' | 'url', art?, url?, credit?, license?, source? }
 *
 * Words come from the strategy until someone types over them; "Reset"
 * drops what was typed. Visitors only ever see the published snapshot, so
 * nothing else in the strategy leaves the server.
 */
export const TEMPLATES = [
  { id: 'modern', label: 'Modern', blurb: 'Clean, airy pages with a big cover picture' },
  { id: 'bold', label: 'Bold', blurb: 'Strong colour blocks and large numbers' },
  { id: 'editorial', label: 'Editorial', blurb: 'Serif headings, like a printed report' },
];

export const SECTIONS = [
  { id: 'cover', label: 'Cover' },
  { id: 'letter', label: 'A message from us' },
  { id: 'foundations', label: 'Vision, mission and values' },
  { id: 'glance', label: 'The plan at a glance' },
  { id: 'objectives', label: 'A page for each objective' },
  { id: 'numbers', label: 'By the numbers' },
  { id: 'closing', label: 'Get in touch' },
];

export const blankPlanDocs = () => ({ id: 'plandocs', docs: {} });

export function newPlanDoc(planId, more = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('pd'), planId, template: 'modern', palette: '', text: {}, hidden: {},
    images: { cover: { kind: 'art', art: 'waves' } }, siteId: null, status: 'draft', publishedAt: null, snapshot: null,
    createdAt: now, updatedAt: now, ...more,
  };
}

/** The plan's content from the strategy and program data, as a plan document shows it. */
export function planSnapshot(strategy, data, planId, org) {
  const root = rootOf(strategy) ?? {};
  const plan = strategy.nodes[planId];
  if (!plan) return null;
  const factsOf = (m) => (data ? measureFacts(m, seriesOf(m.id, data)) : null);
  const measures = (n) => (n.measures ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit ?? '', target: m.target ?? '', facts: factsOf(m) }));
  const objectivesUnder = (id) => childrenOf(strategy, id).flatMap((n) => (n.type === 'objective' ? [n] : n.type === 'plan' ? objectivesUnder(n.id) : []));
  const workplansUnder = (id) => childrenOf(strategy, id).flatMap((n) => (n.type === 'workplan' ? [n] : workplansUnder(n.id)));
  return {
    takenAt: new Date().toISOString().slice(0, 10),
    org: { name: org?.name ?? '', contact: org?.contact ?? {}, logo: org?.logo ?? null },
    framework: { mission: root.mission ?? '', vision: root.vision ?? '', values: root.values ?? '' },
    plan: { id: plan.id, title: plan.title, start: plan.start, end: plan.end, theme: plan.theme ?? '', notes: plan.notes ?? '' },
    objectives: objectivesUnder(plan.id).map((o) => ({
      id: o.id, title: o.title, notes: o.notes ?? '', measures: measures(o),
      goals: childrenOf(strategy, o.id).filter((g) => g.type === 'goal').map((g) => ({
        id: g.id, title: g.title, notes: g.notes ?? '', measures: measures(g),
        workplans: workplansUnder(g.id).map((w) => ({ id: w.id, title: w.title, start: w.start, end: w.end })),
      })),
    })),
  };
}

const years = (p) => [p?.start, p?.end].filter(Boolean).map((d) => String(d).slice(0, 4)).filter((y, i, a) => a.indexOf(y) === i).join('–');

/** What each editable piece of text says before anyone changes it. */
export function defaultText(snap, key) {
  if (!snap) return '';
  const [kind, id, field] = key.split(':');
  const obj = (oid) => snap.objectives.find((o) => o.id === oid);
  const goal = (gid) => snap.objectives.flatMap((o) => o.goals).find((g) => g.id === gid);
  switch (kind) {
    case 'title': return snap.plan.title;
    case 'subtitle': return [snap.org.name, years(snap.plan)].filter(Boolean).join(' · ');
    case 'tagline': return snap.plan.theme || snap.framework.vision || '';
    case 'letterTitle': return 'Where we are going, together';
    case 'letter': {
      const n = snap.objectives.length;
      const g = snap.objectives.reduce((s, o) => s + o.goals.length, 0);
      return snap.plan.notes || `This plan sets out how ${snap.org.name || 'we'} will work toward our vision${years(snap.plan) ? ` from ${years(snap.plan).replace('–', ' to ')}` : ''}. It was shaped with our staff, partners and the communities we serve. It names ${n} strategic objective${n === 1 ? '' : 's'} and ${g} goal${g === 1 ? '' : 's'}, each with measures we will report on openly, so everyone can see how we are doing.`;
    }
    case 'letterSign': return `The team at ${snap.org.name || 'our organisation'}`;
    case 'vision': return snap.framework.vision;
    case 'mission': return snap.framework.mission;
    case 'values': return snap.framework.values;
    case 'glanceIntro': return 'Our objectives, and the goals that will get us there.';
    case 'numbersTitle': return 'By the numbers';
    case 'numbersIntro': return `Where things stand as of ${snap.takenAt}.`;
    case 'closingTitle': return 'Get in touch';
    case 'closing': return 'We would love to hear from you: partners, funders, neighbours and anyone who shares this vision.';
    case 'obj':
      if (field === 'title') return obj(id)?.title ?? '';
      if (field === 'intro') return obj(id)?.notes || '';
      return '';
    case 'goal':
      if (field === 'title') return goal(id)?.title ?? '';
      if (field === 'notes') return goal(id)?.notes ?? '';
      return '';
    default: return '';
  }
}

export const textOf = (pd, snap, key) => (pd.text?.[key] ?? defaultText(snap, key));

/** Measures across the plan that have data, for "By the numbers". */
export function headlineMeasures(snap, max = 6) {
  return snap.objectives.flatMap((o) => [...o.measures, ...o.goals.flatMap((g) => g.measures)]).filter((m) => m.facts).slice(0, max);
}

export function migratePlanDocs(doc) {
  doc.docs ??= {};
  for (const pd of Object.values(doc.docs)) {
    pd.text ??= {};
    pd.hidden ??= {};
    pd.images ??= {};
    pd.status ??= 'draft';
  }
  return doc;
}

/** A published plan doc is on a public site. */
export const isLivePlan = (pd) => pd.status === 'published' && !!pd.snapshot;

/** A first plan document for an org's first plan; published to its first public site when `publish`. */
export function seedPlanDocs(strategy, data, org, { publish = true, art = 'hills' } = {}) {
  const doc = blankPlanDocs();
  const plan = Object.values(strategy?.nodes ?? {}).filter((n) => n.type === 'plan').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  if (!plan) return doc;
  const site = Object.values(org?.sites ?? {}).find((s) => s.visibility === 'public');
  const pd = newPlanDoc(plan.id, { images: { cover: { kind: 'art', art } } });
  if (publish && site) Object.assign(pd, { siteId: site.id, status: 'published', publishedAt: new Date().toISOString().slice(0, 10), snapshot: planSnapshot(strategy, data, plan.id, org) });
  doc.docs[pd.id] = pd;
  return doc;
}
