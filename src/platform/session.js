import { REGISTRY_KEY, readKey, writeKey, setActiveOrg, saveDoc, clearOrg, session } from './storage.js';
import { blankOrg } from './org.js';
import { blankStrategy } from './strategySeed.js';
import { uid } from '../core/ops.js';

/**
 * The session: which orgs this platform holds, which one is open, and who
 * is signed in to each. Every page loads the open org's documents, so
 * switching org is "change the registry, reload the page".
 *
 * registry { orgs: { [id]: { id, name } }, currentOrgId, signedIn: { [orgId]: staffId } }
 *
 * Local: accounts are mocked, and "signing in" picks a staff record.
 * Hosted: the server says who is signed in and which orgs they may open;
 * each org is its own address, so opening one means going there. The
 * platform admin can "view as" any staff member to see what they see.
 */
const EXAMPLE_ORGS = {
  'org-example': { id: 'org-example', name: 'Example STEM Outreach Network' },
  'org-riverbend': { id: 'org-riverbend', name: 'Riverbend Community Food Hub' },
};

const hosted = session();

export function loadRegistry() {
  if (hosted) {
    return {
      orgs: Object.fromEntries(hosted.orgs.map((o) => [o.id, o])),
      currentOrgId: hosted.org?.id ?? null,
      signedIn: hosted.org ? { [hosted.org.id]: hosted.staffId } : {},
    };
  }
  const reg = readKey(REGISTRY_KEY) ?? { orgs: structuredClone(EXAMPLE_ORGS), currentOrgId: 'org-example', signedIn: {} };
  reg.signedIn ??= {};
  if (!reg.orgs[reg.currentOrgId]) reg.currentOrgId = Object.keys(reg.orgs)[0];
  return reg;
}

const save = (reg) => !hosted && writeKey(REGISTRY_KEY, reg);

// Make sure the registry exists and storage reads the open org.
if (!hosted && typeof localStorage !== 'undefined') {
  const boot = loadRegistry();
  save(boot);
  setActiveOrg(boot.currentOrgId);
}

/** What the signed-in person may do here (hosted), or everything (local). */
export const can = {
  switchOrgs: () => !hosted || hosted.orgs.length > 1,
  manageOrgs: () => !hosted || !!hosted.user?.isSuper,
  viewAs: () => !hosted || !!hosted.canViewAs,
  signOut: () => !!hosted?.user,
  editHelp: () => !hosted || !!hosted.canEditHelp,
};
export const signedInUser = () => hosted?.user ?? null;
/** The platform admin page (hosted), where orgs are made and removed. */
export const platformUrl = () => hosted?.platformUrl ?? null;

/** Open another org, on a given page. Hosted, that org has its own address. */
export function openOrg(id, page = 'index.html') {
  if (hosted) return location.assign(`/auth/switch?org=${encodeURIComponent(id)}&next=${encodeURIComponent(`/${page}`)}`);
  switchOrg(id);
  location.assign(page);
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-toolbox': '1' } });
  location.assign('/');
}

export const currentOrgId = () => loadRegistry().currentOrgId;
export const orgList = () => Object.values(loadRegistry().orgs);

export function switchOrg(id) {
  if (hosted) return openOrg(id);
  const reg = loadRegistry();
  if (!reg.orgs[id]) throw new Error(`No org ${id}`);
  reg.currentOrgId = id;
  save(reg);
  setActiveOrg(id);
}

/** Create an empty org and open it. Returns its id. */
export function createOrg(name) {
  if (hosted) throw new Error('Make new organisations from the platform admin page.');
  const reg = loadRegistry();
  const id = uid('org');
  reg.orgs[id] = { id, name };
  reg.currentOrgId = id;
  reg.signedIn[id] = 's-admin';
  save(reg);
  setActiveOrg(id);
  saveDoc('org', blankOrg({ id, name }));
  saveDoc('strategy', blankStrategy(name));
  return id;
}

/** Keep the registry's copy of an org's name in step with its profile. */
export function renameOrg(id, name) {
  if (hosted) return; // The server keeps its copy in step when the org document is saved.
  const reg = loadRegistry();
  if (reg.orgs[id] && reg.orgs[id].name !== name) {
    reg.orgs[id].name = name;
    save(reg);
  }
}

export function deleteOrg(id) {
  if (hosted) throw new Error('Remove organisations from the platform admin page.');
  const reg = loadRegistry();
  if (Object.keys(reg.orgs).length < 2) throw new Error('The platform needs at least one org');
  delete reg.orgs[id];
  delete reg.signedIn[id];
  if (reg.currentOrgId === id) reg.currentOrgId = Object.keys(reg.orgs)[0];
  save(reg);
  clearOrg(id);
  setActiveOrg(reg.currentOrgId);
}

/** The signed-in person's staff record: whoever signed in, else the org's first admin. */
export function currentUser(org) {
  const id = loadRegistry().signedIn[org.id];
  return org.staff[id] ?? Object.values(org.staff).find((s) => s.roleId === 'admin') ?? Object.values(org.staff)[0] ?? null;
}

/** See the platform as this staff member. Hosted, only the platform admin (or dev sign-in) can. */
export async function signInAs(orgId, staffId) {
  if (hosted) {
    const res = await fetch('/api/view-as', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify({ staffId }) });
    if (!res.ok) throw new Error('Only the platform admin can view as someone else.');
    return;
  }
  const reg = loadRegistry();
  reg.signedIn[orgId] = staffId;
  save(reg);
}
