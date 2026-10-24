import { applyCollectionOp } from '../core/collections.js';
import { strategyOps } from './strategy.js';

/**
 * Example strategy for the example org (staff and team ids match org.js).
 * A master plan holding a dated Year 1 plan, three objectives, goals,
 * workplans and twenty-odd tasks around October 2026.
 */
const T = (title, start, end, status, assigneeIds, events = []) => ({ type: 'task', title, start, end, status, assigneeIds, events });

const TREE = {
  type: 'framework',
  title: 'Strategic framework',
  mission: 'Every young person in Canada can see themselves in STEM.',
  vision: 'A national STEM ecosystem that bends to serve youth, especially those furthest from opportunity.',
  values: 'Equity · Curiosity · Reciprocity · Learning in public',
  notes: 'Built on the ecosystem mapping sessions (Micro / Meso / Macro).',
  children: [
    {
      type: 'plan',
      title: 'Strategic Plan 2026–2030: From pipelines to systems',
      start: '2026-04-01',
      end: '2030-03-31',
      theme: 'Systems change',
      children: [
        {
          type: 'plan',
          title: 'Year 1 plan: Foundations',
          start: '2026-04-01',
          end: '2027-03-31',
          theme: 'Foundations',
          children: [
            {
              type: 'objective',
              title: 'Deepen equity and inclusion in every program',
              measures: [{ name: 'Youth from equity-deserving groups', target: '60', unit: '%' }],
              children: [
                {
                  type: 'goal',
                  title: 'Instructors are trained in culturally responsive practice',
                  measures: [{ name: 'Instructors completing training', target: '1000', unit: 'people' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Instructor training refresh',
                      start: '2026-09-01',
                      end: '2027-02-28',
                      staffIds: ['s-train', 's-prog', 's-indig'],
                      teamIds: ['t-prog'],
                      children: [
                        T('Review current training modules', '2026-09-01', '2026-09-30', 'done', ['s-train'], [
                          { id: 'e1', date: '2026-09-01', kind: 'status', text: 'active' },
                          { id: 'e2', date: '2026-09-18', kind: 'note', text: 'Gaps found in land-based learning content' },
                          { id: 'e3', date: '2026-09-29', kind: 'status', text: 'done' },
                        ]),
                        T('Co-design sessions with Indigenous partners', '2026-10-01', '2026-11-30', 'active', ['s-indig', 's-train'], [
                          { id: 'e4', date: '2026-10-01', kind: 'status', text: 'active' },
                          { id: 'e5', date: '2026-10-15', kind: 'milestone', text: 'First session held in Treaty 6' },
                        ]),
                        T('Draft new modules', '2026-11-01', '2026-12-20', 'planned', ['s-train']),
                        T('Pilot with three network members', '2027-01-06', '2027-02-14', 'planned', ['s-train', 's-pc1', 's-pc2']),
                        T('Evaluate pilot and revise', '2027-02-01', '2027-02-28', 'planned', ['s-eval', 's-train']),
                      ],
                    },
                  ],
                },
                {
                  type: 'goal',
                  title: 'Programs reach more girls and gender-diverse youth',
                  measures: [{ name: 'Girls & gender-diverse participants', target: '50', unit: '%' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Girls in STEM outreach',
                      start: '2026-09-15',
                      end: '2027-03-31',
                      staffIds: ['s-pc1', 's-pc2', 's-comms'],
                      teamIds: ['t-prog', 't-part'],
                      children: [
                        T('Map current reach by region', '2026-09-15', '2026-10-15', 'done', ['s-data']),
                        T('Recruit role models and mentors', '2026-10-01', '2026-12-15', 'active', ['s-pc1', 's-pc2']),
                        T('Launch winter club series', '2027-01-10', '2027-03-20', 'planned', ['s-pc1', 's-pc2']),
                        T('Story campaign with participants', '2026-11-15', '2027-02-15', 'blocked', ['s-comms'], [
                          { id: 'e6', date: '2026-11-15', kind: 'status', text: 'active' },
                          { id: 'e7', date: '2026-10-20', kind: 'note', text: 'Waiting on consent process update' },
                        ]),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'objective',
              title: 'Strengthen the ecosystem we steward',
              measures: [{ name: 'Active partnerships', target: '120', unit: 'orgs' }],
              children: [
                {
                  type: 'goal',
                  title: 'Map and tend our change ecosystem',
                  children: [
                    {
                      type: 'workplan',
                      title: 'Ecosystem mapping and partner check-ins',
                      start: '2026-08-15',
                      end: '2027-01-31',
                      staffIds: ['s-ed', 's-part', 's-indig'],
                      teamIds: ['t-lead', 't-part'],
                      children: [
                        T('Ecosystem mapping workshop', '2026-08-15', '2026-08-30', 'done', ['s-ed', 's-eval']),
                        T('Publish ecosystem map internally', '2026-09-01', '2026-10-10', 'done', ['s-eval']),
                        T('Partner check-in conversations', '2026-10-01', '2026-12-31', 'active', ['s-part', 's-indig']),
                        T('Refresh map with partner feedback', '2027-01-05', '2027-01-31', 'planned', ['s-eval', 's-part']),
                      ],
                    },
                  ],
                },
                {
                  type: 'goal',
                  title: 'Advocate for STEM equity in federal policy',
                  children: [
                    {
                      type: 'workplan',
                      title: 'Pre-budget advocacy',
                      start: '2026-07-01',
                      end: '2027-02-28',
                      staffIds: ['s-ed', 's-part', 's-comms'],
                      teamIds: ['t-lead'],
                      children: [
                        T('Pre-budget submission', '2026-07-01', '2026-08-01', 'done', ['s-ed', 's-part']),
                        T('Hill meetings', '2026-10-20', '2026-11-30', 'active', ['s-ed']),
                        T('Policy brief on systems change', '2026-11-01', '2027-01-15', 'planned', ['s-eval', 's-comms']),
                        T('Coalition sign-on letter', '2027-01-15', '2027-02-28', 'planned', ['s-part']),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'objective',
              title: 'Learn in public with shared data',
              measures: [{ name: 'Public dashboard views', target: '5000', unit: 'per year' }],
              children: [
                {
                  type: 'goal',
                  title: 'One MEL framework across all programs',
                  children: [
                    {
                      type: 'workplan',
                      title: 'MEL framework and dashboards',
                      start: '2026-06-01',
                      end: '2027-03-31',
                      staffIds: ['s-eval', 's-data', 's-ops'],
                      teamIds: ['t-mel'],
                      children: [
                        T('Agree core indicators', '2026-06-01', '2026-07-15', 'done', ['s-eval']),
                        T('Data sharing agreements', '2026-07-15', '2026-10-31', 'active', ['s-ops', 's-indig']),
                        T('Build internal dashboard', '2026-09-01', '2026-12-15', 'active', ['s-data']),
                        T('Public impact dashboard', '2027-01-05', '2027-03-15', 'planned', ['s-data', 's-comms']),
                        T('Annual learning review', '2027-03-01', '2027-03-31', 'planned', ['s-eval', 's-ed']),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export function seedStrategy() {
  const doc = { id: 'strategy-example', nodes: {} };
  const add = (spec, parentId = null) => {
    const { children = [], ...data } = spec;
    const op = strategyOps.addNode(doc, { ...data, parentId });
    applyCollectionOp(doc, op);
    for (const child of children) add(child, op.id);
  };
  add(TREE);
  return doc;
}
