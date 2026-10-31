import { createMap, ops, applyOp } from './core/ops.js';
import { unproject } from './lenses/index.js';

/**
 * The example test map: a national STEM outreach ecosystem with about
 * thirty actors, a spread of relationship types and a few groups. Places
 * are { depth, spread }: depth 0 is the structural surface, 1 the deep,
 * personal end; spread runs around the rings or across the bands.
 * Reload it any time with the Example button.
 */
const ACTORS = [
  // key, label, category, depth, spread, kind
  ['ised', 'Federal government (ISED)', 'resource', 0.07, -0.45],
  ['nserc', 'NSERC PromoScience', 'resource', 0.16, -0.3],
  ['corporate', 'Corporate funders', 'resource', 0.25, -0.15],
  ['foundations', 'Private foundations', 'resource', 0.12, -0.6],
  ['ministries', 'Provincial education ministries', 'problem', 0.09, 0.3],
  ['policy-net', 'National STEM policy network', 'ally', 0.22, 0.5],
  ['media', 'Media & public narrative', 'other', 0.06, 0.75],
  ['indig-gov', 'Indigenous governments & organisations', 'community', 0.17, -0.8],
  ['regulators', 'Post-secondary funding councils', 'gatekeeper', 0.27, 0.05],

  ['actua', 'Actua national office', 'ally', 0.5, -0.1, 'agent'],
  ['universities', 'University & college partners', 'ally', 0.42, -0.28],
  ['mentors', 'Industry volunteers & mentors', 'resource', 0.56, -0.45],
  ['community-orgs', 'Community organisations', 'ally', 0.47, -0.65],
  ['indig-comm', 'Indigenous communities', 'community', 0.55, -0.85],
  ['boards', 'School boards', 'gatekeeper', 0.4, 0.28],
  ['teachers', 'Teachers', 'community', 0.55, 0.45],
  ['parents', 'Parents & caregivers', 'community', 0.6, 0.62],
  ['researchers', 'Research & evaluation partners', 'other', 0.4, 0.08],
  ['outreach-orgs', 'Other STEM outreach orgs', 'other', 0.38, 0.85],

  ['instructors', 'STEM instructors', 'ally', 0.72, -0.25, 'agent'],
  ['coordinators', 'Program coordinators', 'ally', 0.75, -0.05],
  ['youth', 'Youth participants', 'community', 0.73, 0.15, 'agent'],
  ['girls', 'Girls & gender-diverse youth', 'community', 0.71, 0.35],
  ['indig-youth', 'Indigenous youth', 'community', 0.74, 0.55],
  ['alumni', 'Youth leaders & alumni', 'ally', 0.72, -0.65],
  ['champions', 'Equity champions on staff', 'ally', 0.74, -0.45, 'agent'],
  ['volunteers', 'Volunteer instructors', 'other', 0.71, -0.85],
  ['skeptics', 'Skeptical educators', 'problem', 0.8, 0.8],
];

const CONNECTIONS = [
  // from, to, type, label, strength (1–5, default 3)
  ['ised', 'actua', 'resource-flow', 'core funding', 5],
  ['nserc', 'universities', 'resource-flow', 'grants', 4],
  ['corporate', 'actua', 'resource-flow', 'sponsorship', 3],
  ['foundations', 'community-orgs', 'resource-flow', ''],
  ['actua', 'universities', 'relationship', 'network members'],
  ['universities', 'instructors', 'relationship', 'hire & host', 4],
  ['actua', 'instructors', 'learning', 'training', 5],
  ['instructors', 'youth', 'relationship', 'programs', 5],
  ['instructors', 'girls', 'relationship', 'programs', 5],
  ['coordinators', 'instructors', 'information', 'coaching', 4],
  ['youth', 'coordinators', 'feedback', 'surveys', 2],
  ['coordinators', 'actua', 'feedback', 'impact data', 3],
  ['actua', 'ised', 'feedback', 'reporting', 3],
  ['actua', 'policy-net', 'relationship', 'convenes'],
  ['policy-net', 'ministries', 'power', 'advocacy', 2],
  ['ministries', 'boards', 'power', 'curriculum', 5],
  ['boards', 'teachers', 'power', ''],
  ['teachers', 'youth', 'relationship', 'classroom', 5],
  ['actua', 'teachers', 'learning', 'PD workshops', 2],
  ['skeptics', 'teachers', 'power', 'resistance', 2],
  ['parents', 'youth', 'relationship', ''],
  ['indig-gov', 'indig-comm', 'relationship', ''],
  ['indig-comm', 'actua', 'relationship', 'partnership', 4],
  ['indig-comm', 'indig-youth', 'relationship', 'land-based learning', 5],
  ['researchers', 'actua', 'information', 'evaluation', 3],
  ['mentors', 'instructors', 'learning', 'mentoring', 2],
  ['alumni', 'volunteers', 'relationship', 'become'],
  ['volunteers', 'instructors', 'relationship', ''],
  ['champions', 'actua', 'learning', 'equity practice', 3],
  ['media', 'parents', 'information', 'narratives', 1],
  ['regulators', 'universities', 'power', ''],
  ['outreach-orgs', 'actua', 'relationship', 'peers', 1],
  ['girls', 'champions', 'feedback', 'lived experience', 3],
];

const GROUPS = [
  ['Funders', ['ised', 'nserc', 'corporate', 'foundations'], 'Public and private money behind the programs, and the reporting it asks for.'],
  ['Delivery network', ['instructors', 'coordinators', 'champions'], 'The people who run programs with youth, day to day.'],
  ['School system', ['boards', 'teachers', 'parents'], 'Where most youth meet STEM first: classrooms, and the families around them.'],
];

export function seedMap() {
  const map = createMap({ name: 'Example: national STEM outreach ecosystem' });
  const layerId = map.layers[0].id;
  const ids = {};
  for (const [key, label, category, depth, spread, kind = 'actor'] of ACTORS) {
    // Stable ids so other tools (e.g. task assets) can point at example actors.
    const op = ops.addActor({ id: `actor-${key}`, label, category, kind, place: { depth, spread }, layerId });
    applyOp(map, op);
    ids[key] = op.id;
  }
  for (const [from, to, type, label, strength = 3] of CONNECTIONS) {
    applyOp(map, ops.addConnector({ from: { actorId: ids[from] }, to: { actorId: ids[to] }, type, label, strength, layerId }));
  }
  for (const [label, members, description] of GROUPS) {
    applyOp(map, ops.addGroup({ label, description, memberIds: members.map((k) => ids[k]), layerId }));
  }
  return map;
}

/** Bring a saved or imported map up to date with the current data model. */
export function migrateMap(map, lenses) {
  if (!map) return null;
  map.groups ??= {};
  const lens = lenses.get(map.lensId) ?? lenses.values().next().value;
  for (const a of Object.values(map.actors)) {
    a.kind ??= 'actor';
    if (!a.place) {
      a.place = unproject(lens, a.x ?? 0, a.y ?? 0);
      delete a.x;
      delete a.y;
    }
  }
  for (const c of Object.values(map.connectors)) c.strength ??= 3;
  for (const g of Object.values(map.groups)) g.description ??= '';
  return map;
}
