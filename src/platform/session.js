import { REGISTRY_KEY, readKey, writeKey, setActiveOrg, saveDoc, clearOrg } from './storage.js';
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
 * Accounts are mocked: "signing in" picks a staff record. With a server,
 * sign-in comes from the server and the registry lists the orgs a person
 * may open.
 */
const EXAMPLE_ORGS = {
  'org-example': { id: 'org-example', name: 'Example STEM Outreach Network' },
  'org-riverbend': { id: 'org-riverbend', name: 'Riverbend Community Food Hub' },
};

export function loadRegistry() {
  const reg = readKey(REGISTRY_KEY) ?? { orgs: structuredClone(EXAMPLE_ORGS), currentOrgId: 'org-example', signedIn: {} };
  reg.signedIn ??= {};
  if (!reg.orgs[reg.currentOrgId]) reg.currentOrgId = Object.keys(reg.orgs)[0];
  return reg;
}

const save = (reg) => writeKey(REGISTRY_KEY, reg);

// Make sure the registry exists and storage reads the open org.
const boot = loadRegistry();
save(boot);
setActiveOrg(boot.currentOrgId);

export const currentOrgId = () => loadRegistry().currentOrgId;
export const orgList = () => Object.values(loadRegistry().orgs);

export function switchOrg(id) {
  const reg = loadRegistry();
  if (!reg.orgs[id]) throw new Error(`No org ${id}`);
  reg.currentOrgId = id;
  save(reg);
  setActiveOrg(id);
}

/** Create an empty org and open it. Returns its id. */
export function createOrg(name) {
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
  const reg = loadRegistry();
  if (reg.orgs[id] && reg.orgs[id].name !== name) {
    reg.orgs[id].name = name;
    save(reg);
  }
}

export function deleteOrg(id) {
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

export function signInAs(orgId, staffId) {
  const reg = loadRegistry();
  reg.signedIn[orgId] = staffId;
  save(reg);
}
