/**
 * The organisation document: who the org is, its people, teams, roles and
 * public sites. Every tool reads it (e.g. to assign staff to workplans).
 *
 * { name, mission, staff: {id: Staff}, teams: {id: Team}, sites: {id: Site}, roles: [...] }
 *   Staff  { name, title, roleId, teamIds: [] }
 *   Team   { name, color }
 *   Site   { name, url, visibility: 'public' | 'unlisted' | 'private', shows }
 */
export const ROLES = [
  { id: 'admin', label: 'Admin', can: 'Manage the org, people, roles and what is public' },
  { id: 'lead', label: 'Lead', can: 'Edit plans and dashboards for their teams' },
  { id: 'staff', label: 'Staff', can: 'Edit their workplans and tasks, use sandboxes' },
  { id: 'viewer', label: 'Viewer', can: 'Read only, e.g. board members and funders' },
];

const STAFF = [
  ['s-ed', 'Amara Okafor', 'Executive Director', 'admin', ['t-lead']],
  ['s-ops', 'Jordan Lee', 'Director of Operations', 'lead', ['t-lead', 't-ops']],
  ['s-prog', 'Priya Sharma', 'Director of Programs', 'lead', ['t-lead', 't-prog']],
  ['s-eval', 'Mateo Rivera', 'Evaluation & Learning Lead', 'lead', ['t-mel']],
  ['s-data', 'Hana Kim', 'Data Analyst', 'staff', ['t-mel']],
  ['s-pc1', 'Owen Tremblay', 'Program Coordinator, West', 'staff', ['t-prog']],
  ['s-pc2', 'Leila Haddad', 'Program Coordinator, East', 'staff', ['t-prog']],
  ['s-indig', 'Tanis Cardinal', 'Indigenous Partnerships Manager', 'lead', ['t-prog', 't-part']],
  ['s-part', 'Ben Murphy', 'Partnerships & Funding Manager', 'staff', ['t-part']],
  ['s-comms', 'Sofia Rossi', 'Communications Officer', 'staff', ['t-part']],
  ['s-fin', 'Grace Chen', 'Finance & Admin', 'staff', ['t-ops']],
  ['s-train', 'Noah Bergeron', 'Instructor Training Lead', 'staff', ['t-prog']],
];

const TEAMS = [
  ['t-lead', 'Leadership', '#3d63dd'],
  ['t-prog', 'Programs', '#2a9d8f'],
  ['t-mel', 'Monitoring, Evaluation & Learning', '#7a4fb5'],
  ['t-part', 'Partnerships & Communications', '#b8860b'],
  ['t-ops', 'Operations', '#59607a'],
];

export function seedOrg() {
  return {
    id: 'org-example',
    name: 'Example STEM Outreach Network',
    mission: 'Every young person in Canada can see themselves in STEM.',
    staff: Object.fromEntries(STAFF.map(([id, name, title, roleId, teamIds]) => [id, { id, name, title, roleId, teamIds }])),
    teams: Object.fromEntries(TEAMS.map(([id, name, color]) => [id, { id, name, color }])),
    sites: {
      'site-main': { id: 'site-main', name: 'Public website', url: 'https://example.org', visibility: 'public', shows: 'Mission, programs, annual impact dashboard' },
      'site-impact': { id: 'site-impact', name: 'Impact dashboard', url: 'https://example.org/impact', visibility: 'public', shows: 'Reach, participation and equity KPIs' },
      'site-board': { id: 'site-board', name: 'Board portal', url: 'https://example.org/board', visibility: 'private', shows: 'Strategic plan progress, finances' },
    },
  };
}

export const staffList = (org) => Object.values(org.staff).sort((a, b) => a.name.localeCompare(b.name));
export const teamList = (org) => Object.values(org.teams).sort((a, b) => a.name.localeCompare(b.name));
export const membersOf = (org, teamId) => staffList(org).filter((s) => s.teamIds.includes(teamId));
