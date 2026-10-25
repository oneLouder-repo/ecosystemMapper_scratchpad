import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { loadOrg } from '../platform/docs.js';
import { PLUGINS } from '../plugins.js';
import { loadLenses } from '../lenses/index.js';
import { crosswalk } from '../lenses/crosswalk.js';
import { lensAlignment, dataModelDiagram } from './diagrams.js';

/**
 * Help: a short user guide, how the systems lenses line up, and the data
 * model. The lens diagram and table are built from the lens files, so
 * they follow any change to a lens.
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'help', org });
const lenses = await loadLenses();
const ORDER = ['micro-meso-macro', 'water-of-systems-change', 'spheres-of-systems-change', 'leverage-points', 'theory-of-system-change'];
const lensName = (id) => lenses.get(id)?.name ?? id;

const SECTIONS = [
  ['start', 'Getting started'],
  ['lenses', 'How the lenses line up'],
  ['data', 'The data model'],
  ['extend', 'Adding to the platform'],
];

const p = (...c) => h('p', {}, ...c);
const fig = (diagram, caption) => h('figure', { class: 'help-figure' }, h('div', { class: 'diagram-scroll' }, diagram), h('figcaption', {}, caption));

const rows = crosswalk(lenses);
const lensTable = h('table', { class: 'table table-sm list help-table' },
  h('thead', {}, h('tr', {}, h('th', {}, 'Micro / Meso / Macro'), ORDER.slice(1).map((id) => h('th', {}, lensName(id))))),
  h('tbody', {}, rows.map((row) =>
    h('tr', {},
      h('th', { scope: 'row' }, h('strong', {}, row.region.label), h('div', { class: 'muted' }, row.region.hint)),
      ORDER.slice(1).map((id) => h('td', {}, h('ul', {}, row.matches[id].map((r) => h('li', {}, r.label, r.hint && h('div', { class: 'muted' }, r.hint))))))))));

const page = h('div', { class: 'help-layout' },
  h('nav', { class: 'help-toc', 'aria-label': 'On this page' },
    h('ul', { class: 'menu' }, SECTIONS.map(([id, label]) => h('li', {}, h('a', { href: `#${id}` }, label))))),
  h('article', { class: 'help-body' },
    h('h1', {}, 'Help'),
    h('p', { class: 'lede' }, 'Org Toolbox is one platform for an organisation’s planning, ecosystem mapping, data and storytelling. Each tool is a plugin; they share one set of people, one strategy and one data model, so work in one shows up in the others.'),

    h('section', { id: 'start' },
      h('h2', {}, 'Getting started'),
      h('ol', { class: 'steps' },
        h('li', {}, h('strong', {}, 'Pick your organisation. '), 'The menu at the top left switches between organisations on this platform, or makes a new one. Each has its own people, plugins and data.'),
        h('li', {}, h('strong', {}, 'See it as anyone. '), 'Accounts are mocked for now: the menu under your picture (top right) signs you in as any staff member, so you can see their tasks and dashboards. ', h('a', { href: 'me.html' }, 'My profile'), ' gathers everything that is yours.'),
        h('li', {}, h('strong', {}, 'Set up the org. '), h('a', { href: 'org.html' }, 'Organisation settings'), ' hold your profile, contact details, logo, people and teams, your public sites and their theme, and which plugins you use.'),
        h('li', {}, h('strong', {}, 'Plan the work. '), 'In Strategy & Work, build from mission down to tasks. Give objectives and goals measures; give tasks a toolbox of assets (map actors, people, documents, research, media).'),
        h('li', {}, h('strong', {}, 'Map the ecosystem. '), 'The Ecosystem Mapper holds as many maps as you need, each with an owner and members. Switch lens at any time; actors keep their meaning.'),
        h('li', {}, h('strong', {}, 'Share the data. '), 'Press Create dashboard on an objective, shape it in the Workbench, make it public and pick a site. Press Play to watch the year change.'),
        h('li', {}, h('strong', {}, 'Tell the story. '), 'Podcasts runs your own station: shows organised by season, episodes uploaded as .mp3 or .wav, featured shows, and an RSS feed for each show.'),
        h('li', {}, h('strong', {}, 'Run your sites. '), 'Sites & Pages shows what each public site carries, and is where you write its information pages and news. A line like ', h('code', {}, '[[dashboard:dash-equity]]'), ' in a page shows that dashboard, live. Sites wear the theme from Organisation settings, and the station adds its own look.')),
      h('div', { class: 'cards help-cards' }, PLUGINS.map((pl) =>
        h('a', { class: 'card', href: pl.href }, h('h3', {}, icon(pl.icon, 22), pl.name), h('p', {}, pl.blurb))))),

    h('section', { id: 'lenses' },
      h('h2', {}, 'How the lenses line up'),
      p('The Ecosystem Mapper draws one of five systems models behind your map. They look different (rings, a triangle, bands, a grid) but they all describe the same thing: how deep a change goes. So the platform puts them on one shared scale.'),
      p(h('strong', {}, 'One depth scale. '), 'Every actor stores a depth from 0 to 1. At 0 is the surface: what is explicit, structural and collective, like policies, budgets and resource flows. At 1 is the deep end: what is implicit and personal, like mindsets, beliefs and paradigms. Each lens divides that scale into its own regions. When you switch lens, an actor keeps its depth and lands in whichever region of the new lens sits at that depth.'),
      fig(lensAlignment(lenses, { order: ORDER }), 'Each lens as a column on the same scale. The dashed lines are the edges of the micro, meso and macro tiers.'),
      h('h3', {}, 'Micro, meso and macro as the reference'),
      p('Micro / Meso / Macro has three equal tiers, so it is the easiest way to read across. The table lists, for each tier, the regions of the other lenses that sit within it (a region counts when its middle falls inside the tier).'),
      h('div', { class: 'table-scroll' }, lensTable),
      h('h3', {}, 'Reading each lens against the tiers'),
      h('dl', { class: 'lens-notes' },
        h('dt', {}, lensName('water-of-systems-change')),
        h('dd', {}, 'Lines up one to one. Structural change (policies, practices, resource flows) is macro; relational change (relationships, power) is meso; transformative change (mental models) is micro. Its six conditions sit inside those three bands.'),
        h('dt', {}, lensName('spheres-of-systems-change')),
        h('dd', {}, 'NPC already groups its eight spheres as micro, meso and macro, and the platform keeps those groups: cultural and political spheres are macro; infrastructural and collective are meso; organisational, relational, behavioural and internal are micro.'),
        h('dt', {}, lensName('leverage-points')),
        h('dd', {}, 'Meadows’ twelve places to intervene run from shallow (12, numbers) to deep (1, transcending paradigms), in twelve equal steps. Points 12 to 9 (parameters and delays) are macro, 8 to 5 (feedback loops, information flows, rules) are meso, and 4 to 1 (power over structure, goals, paradigms) are micro. Her four groups (parameters, feedbacks, design, intent) don’t split evenly into three tiers, so point 9 sits at the macro edge and point 4 at the micro edge.'),
        h('dt', {}, lensName('theory-of-system-change')),
        h('dd', {}, 'Its iceberg rows run from events (macro), through patterns and structures (meso), to beliefs and mental models (micro). Its columns (adopt, adapt, expand, respond) are breadth, not depth: they use the map’s other direction, so switching to this lens spreads actors left to right by how far a change has spread.')),
      h('p', { class: 'note' }, 'Why is the “deep” end micro? The scale runs from explicit to implicit, not from small to large. Policy and budgets are visible and collective (macro, structural); mindsets live in people (micro, transformative). This alignment is a modelling choice the platform makes so maps can move between lenses. The original authors don’t all claim these exact equivalences, so treat the edges as soft.')),

    h('section', { id: 'data' },
      h('h2', {}, 'The data model'),
      p('Everything belongs to an organisation. The platform registry lists the organisations, which one is open and who is signed in. Each organisation then has a handful of documents, each a plain JSON object that one plugin owns. Plugins point at each other’s things by id, never by copying.'),
      fig(dataModelDiagram(), 'The documents of one organisation, and the ids that connect them.'),
      h('table', { class: 'table table-sm list help-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Document'), h('th', {}, 'Owned by'), h('th', {}, 'Points at'))),
        h('tbody', {}, [
          ['org', 'Organisation', 'nothing: everything else points here (staff, teams, sites)'],
          ['strategy', 'Strategy & Work', 'staff and teams (who does the work); map actors, staff and strategy items (task assets)'],
          ['data', 'Workbench · Program data', 'strategy measures, by measure id'],
          ['dashboards', 'Workbench · Dashboards', 'measures and strategy nodes (widgets), a site (publishing), staff (who made it)'],
          ['maps, map/<id>', 'Ecosystem Mapper', 'staff (owner and members); each map holds its own actors, connectors, groups and layers'],
          ['podcasts', 'Podcasts', 'staff (hosts and people in episodes), a site (the station page); audio files by media id'],
          ['pages', 'Sites & Pages', 'a site, staff (author); dashboards, episodes and shows (embeds)'],
        ].map(([d, o, pts]) => h('tr', {}, h('td', {}, h('code', {}, d)), h('td', {}, o), h('td', {}, pts))))),
      h('h3', {}, 'Every change is an operation'),
      p('Plugins never edit a document directly. They send small operations (add, update, remove, move) to a store, which applies them and keeps their inverses. That gives undo and redo everywhere, and it is what a server will receive later to sync between people and check permissions.'),
      h('h3', {}, 'Where it is stored'),
      p('For now, in your browser (local storage), under the organisation’s id. Logos, pictures and small files are kept as data inside the documents; podcast audio, which is bigger, goes in the browser’s IndexedDB. With the Node server, the same documents and operations move to the server, and uploads go to file storage that streams audio to listeners.')),

    h('section', { id: 'extend' },
      h('h2', {}, 'Adding to the platform'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'A plugin: '), 'make a page and its module, then add an entry to ', h('code', {}, 'src/plugins.js'), '. It appears on the dashboard, in the header and in Organisation → Plugins.'),
        h('li', {}, h('strong', {}, 'A lens: '), 'add a JSON file to ', h('code', {}, 'src/lenses/'), ' with regions on the 0 to 1 depth scale, and list it in ', h('code', {}, 'LENS_FILES'), '. It shows up in this guide’s diagram and table by itself.'),
        h('li', {}, h('strong', {}, 'A palette: '), 'add a DaisyUI theme to ', h('code', {}, 'src/platform/themes.js'), ' and its CSS to ', h('code', {}, 'vendor/daisyui/themes.css'), '.'),
        h('li', {}, h('strong', {}, 'A widget, asset kind or mini-tool: '), 'see ', h('code', {}, 'ARCHITECTURE.md'), ' for where each one plugs in.')))));

document.querySelector('#app').replaceChildren(h('div', { class: 'page help-page' }, page));
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
