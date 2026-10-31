import { h, options } from '../ui/dom.js';
import { icon, ICONS } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { Markdown } from '../ui/markdown.js';
import { loadOrg } from '../platform/docs.js';
import { can } from '../platform/session.js';
import { loadHelp, saveHelp, resetHelp, helpId } from '../platform/help.js';
import { PLUGINS } from '../plugins.js';
import { loadLenses } from '../lenses/index.js';
import { crosswalk } from '../lenses/crosswalk.js';
import { lensAlignment, dataModelDiagram } from './diagrams.js';

/**
 * Help: a library of sections, each with pages, written in light markdown.
 *
 *   #                     every section
 *   #<section>            a section and its pages
 *   #<section>/<page>     a page
 *
 * The platform admin can edit the library here (Edit help): add, rename,
 * reorder and remove sections and pages, with a live preview. Diagrams go
 * in with shortcodes like [[diagram:lenses]] (see help/library.js).
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'help', org });
const lenses = await loadLenses();
let { doc, custom } = await loadHelp();
const ORDER = ['micro-meso-macro', 'water-of-systems-change', 'spheres-of-systems-change', 'leverage-points', 'theory-of-system-change'];
const lensName = (id) => lenses.get(id)?.name ?? id;
// Older links to the single help page.
const OLD = { start: '', lenses: 'ecosystem-mapping/lenses', data: 'adding/data-model', extend: 'adding/extending' };

const state = { editing: false, dirty: false, saving: false, preview: true };
const app = document.querySelector('#app');

/* Diagrams that pages can embed. */
const fig = (diagram, caption) => h('figure', { class: 'help-figure' }, h('div', { class: 'diagram-scroll' }, diagram), caption && h('figcaption', {}, caption));
const DIAGRAMS = {
  lenses: () => fig(lensAlignment(lenses, { order: ORDER }), 'Each lens as a column on the same scale. The dashed lines are the edges of the micro, meso and macro tiers.'),
  'lens-table': () => h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm list help-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Micro / Meso / Macro'), ORDER.slice(1).map((id) => h('th', {}, lensName(id))))),
    h('tbody', {}, crosswalk(lenses).map((row) => h('tr', {},
      h('th', { scope: 'row' }, h('strong', {}, row.region.label), h('div', { class: 'muted' }, row.region.hint)),
      ORDER.slice(1).map((id) => h('td', {}, h('ul', {}, row.matches[id].map((r) => h('li', {}, r.label, r.hint && h('div', { class: 'muted' }, r.hint))))))))))),
  'data-model': () => fig(dataModelDiagram(), 'The documents of one organisation, and the ids that connect them.'),
  plugins: () => h('div', { class: 'cards help-cards' }, PLUGINS.filter((p) => p.id !== 'help').map((p) =>
    h('a', { class: 'card', href: p.href }, h('h3', {}, icon(p.icon, 22), p.name), h('p', {}, p.blurb)))),
};
const body = (text) => Markdown(text, {
  embeds: ['diagram'],
  embed: ({ id }) => DIAGRAMS[id]?.() ?? null,
});

function route() {
  let hash = decodeURIComponent(location.hash.slice(1));
  if (hash in OLD) hash = OLD[hash];
  const [sid, pid] = hash.split('/');
  const section = doc.sections.find((s) => s.id === sid) ?? null;
  const page = section?.pages.find((p) => p.id === pid) ?? null;
  return { section, page };
}
const go = (hash) => { if (location.hash.slice(1) !== hash) location.hash = hash; else render(); };
const changed = () => { state.dirty = true; render(); };

function render() {
  const { section, page } = route();
  const scroll = window.scrollY;
  const focused = app.contains(document.activeElement) ? document.activeElement.name : null;
  app.replaceChildren(h('div', { class: `page help-page${state.editing ? ' editing' : ''}` },
    PluginHeader('help', {
      blurb: 'Guides to each part of Dashi, by section.',
      actions: can.editHelp() && (state.editing ? EditBar() : h('button', { class: 'btn btn-sm', onclick: () => { state.editing = true; render(); } }, icon('doc', 14), 'Edit help')),
    }),
    h('div', { class: 'help-layout' },
      Nav(section, page),
      h('article', { class: 'help-body' },
        page ? (state.editing ? PageEditor(section, page) : PageView(section, page))
        : section ? (state.editing ? SectionEditor(section) : SectionView(section))
        : Home()))));
  if (focused) app.querySelector(`[name="${focused}"]`)?.focus();
  window.scrollTo(0, scroll);
}

function EditBar() {
  return [
    h('span', { class: 'muted small' }, state.dirty ? 'Unsaved changes' : custom ? 'Saved' : 'Built-in library'),
    h('button', { class: 'btn btn-sm btn-primary', disabled: !state.dirty || state.saving, onclick: async () => {
      state.saving = true;
      try { await saveHelp(doc); custom = true; state.dirty = false; } catch (err) { alert(`Not saved: ${err.message}`); }
      state.saving = false;
      render();
    } }, state.saving ? 'Saving…' : 'Save changes'),
    h('button', { class: 'btn btn-sm', onclick: async () => {
      if (state.dirty && !confirm('Throw away your unsaved changes?')) return;
      ({ doc, custom } = await loadHelp());
      state.editing = false;
      state.dirty = false;
      render();
    } }, state.dirty ? 'Discard' : 'Done'),
    custom && h('button', { class: 'btn btn-sm btn-ghost', title: 'Go back to the help that comes with Dashi', onclick: async () => {
      if (!confirm('Replace the whole help library with the one that comes with Dashi? Your edits are lost.')) return;
      try { doc = await resetHelp(); custom = false; state.dirty = false; go(''); } catch (err) { alert(err.message); }
    } }, 'Reset to built-in'),
  ];
}

/* Reading. */

function Nav(current, currentPage) {
  const move = (list, i, by) => { const [x] = list.splice(i, 1); list.splice(i + by, 0, x); changed(); };
  const tools = (list, i, label, onDelete) => state.editing && h('span', { class: 'help-nav-tools' },
    h('button', { class: 'btn btn-ghost btn-xs', disabled: i === 0, 'aria-label': `Move ${label} up`, onclick: () => move(list, i, -1) }, '↑'),
    h('button', { class: 'btn btn-ghost btn-xs', disabled: i === list.length - 1, 'aria-label': `Move ${label} down`, onclick: () => move(list, i, 1) }, '↓'),
    h('button', { class: 'btn btn-ghost btn-xs', 'aria-label': `Delete ${label}`, onclick: onDelete }, '✕'));

  return h('nav', { class: 'help-toc', 'aria-label': 'Help sections' },
    h('a', { href: '#', class: `help-nav-home${!current ? ' on' : ''}` }, 'All sections'),
    h('ul', { class: 'help-nav' }, doc.sections.map((s, i) => h('li', {},
      h('div', { class: 'help-nav-row' },
        h('a', { href: `#${s.id}`, class: `help-nav-section${s === current && !currentPage ? ' on' : ''}` }, icon(s.icon || 'help', 16), s.title),
        tools(doc.sections, i, s.title, () => {
          if (!confirm(`Delete the section “${s.title}” and its ${s.pages.length} pages?`)) return;
          doc.sections.splice(i, 1);
          state.dirty = true;
          go('');
        })),
      (s === current || state.editing) && h('ul', {}, s.pages.map((p, j) => h('li', { class: 'help-nav-row' },
        h('a', { href: `#${s.id}/${p.id}`, class: p === currentPage ? 'on' : '' }, p.title),
        tools(s.pages, j, p.title, () => {
          if (!confirm(`Delete the page “${p.title}”?`)) return;
          s.pages.splice(j, 1);
          state.dirty = true;
          go(s.id);
        }))),
        state.editing && h('li', {}, h('button', { class: 'btn btn-ghost btn-xs help-add', onclick: () => addPage(s) }, icon('plus', 12), 'Add page')))))),
    state.editing && h('button', { class: 'btn btn-sm help-add', onclick: addSection }, icon('plus', 14), 'Add section'));
}

function Home() {
  return h('div', {},
    h('div', { class: 'cards help-sections' }, doc.sections.map((s) => h('a', { class: 'card', href: `#${s.id}` },
      h('h3', {}, icon(s.icon || 'help', 22), s.title),
      h('p', {}, s.blurb ?? ''),
      h('div', { class: 'stat-line' }, `${s.pages.length} page${s.pages.length === 1 ? '' : 's'}`)))),
    !doc.sections.length && h('p', { class: 'empty' }, 'No help sections yet.'));
}

function SectionView(s) {
  return h('div', {},
    h('h2', { class: 'help-title' }, s.title),
    s.blurb && h('p', { class: 'lede' }, s.blurb),
    h('ol', { class: 'help-page-list' }, s.pages.map((p) => h('li', {},
      h('a', { href: `#${s.id}/${p.id}` }, h('strong', {}, p.title)),
      h('p', { class: 'muted' }, firstLine(p.body))))),
    !s.pages.length && h('p', { class: 'empty' }, 'No pages in this section yet.'));
}

const firstLine = (text = '') => text.split('\n').find((l) => l.trim() && !/^(#|\[\[|>|[-*\d])/.test(l.trim()))?.replace(/[*_`]/g, '').slice(0, 180) ?? '';

function PageView(s, p) {
  const i = s.pages.indexOf(p);
  const prev = s.pages[i - 1];
  const next = s.pages[i + 1];
  return h('div', {},
    h('p', { class: 'help-crumb' }, h('a', { href: `#${s.id}` }, s.title)),
    h('h2', { class: 'help-title' }, p.title),
    body(p.body),
    h('nav', { class: 'help-pager', 'aria-label': 'More in this section' },
      prev ? h('a', { href: `#${s.id}/${prev.id}` }, `← ${prev.title}`) : h('span'),
      next ? h('a', { href: `#${s.id}/${next.id}` }, `${next.title} →`) : h('span')));
}

/* Editing (platform admin). */

function addSection() {
  const title = prompt('Name of the new section');
  if (!title?.trim()) return;
  const id = helpId(title, doc.sections.map((s) => s.id));
  doc.sections.push({ id, title: title.trim(), icon: 'help', blurb: '', pages: [] });
  state.dirty = true;
  go(id);
}

function addPage(s) {
  const title = prompt(`Title of the new page in “${s.title}”`);
  if (!title?.trim()) return;
  const id = helpId(title, s.pages.map((p) => p.id));
  s.pages.push({ id, title: title.trim(), body: '' });
  state.dirty = true;
  go(`${s.id}/${id}`);
}

function SectionEditor(s) {
  const field = (label, el) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), el);
  return h('div', { class: 'help-editor' },
    h('h2', { class: 'help-title' }, 'Section'),
    field('Title', h('input', { class: 'input input-sm w-full', name: 'section-title', value: s.title, oninput: (e) => { s.title = e.target.value; state.dirty = true; }, onchange: () => render() })),
    field('What it covers', h('input', { class: 'input input-sm w-full', name: 'section-blurb', value: s.blurb ?? '', oninput: (e) => { s.blurb = e.target.value; state.dirty = true; }, onchange: () => render() })),
    field('Icon', h('select', { class: 'select select-sm', name: 'section-icon', onchange: (e) => { s.icon = e.target.value; changed(); } },
      options(Object.keys(ICONS).map((k) => ({ id: k, label: k })), s.icon || 'help'))),
    h('p', { class: 'muted small' }, `Its address is help.html#${s.id}. Use the arrows beside it on the left to reorder, and Add page to add to it.`),
    SectionView(s));
}

function PageEditor(s, p) {
  const preview = h('div', { class: 'help-preview' }, body(p.body));
  let timer;
  const text = h('textarea', { class: 'textarea w-full help-source', name: 'page-body', rows: 24, spellcheck: true, oninput: (e) => {
    p.body = e.target.value;
    if (!state.dirty) { state.dirty = true; app.querySelector('.help-page .plugin-header-actions .muted').textContent = 'Unsaved changes'; app.querySelector('.help-page .btn-primary').disabled = false; }
    clearTimeout(timer);
    timer = setTimeout(() => preview.replaceChildren(body(p.body)), 200);
  } }, p.body);
  const insert = (snippet) => {
    const at = text.selectionStart ?? text.value.length;
    text.setRangeText(`\n${snippet}\n`, at, text.selectionEnd ?? at, 'end');
    text.dispatchEvent(new Event('input'));
    text.focus();
  };
  return h('div', { class: 'help-editor' },
    h('p', { class: 'help-crumb' }, h('a', { href: `#${s.id}` }, s.title)),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Page title'),
      h('input', { class: 'input w-full', name: 'page-title', value: p.title, oninput: (e) => { p.title = e.target.value; state.dirty = true; }, onchange: () => render() })),
    h('div', { class: 'editor-bar' },
      h('span', { class: 'muted small' }, 'Insert a diagram:'),
      Object.keys(DIAGRAMS).map((id) => h('button', { class: 'btn btn-xs', onclick: () => insert(`[[diagram:${id}]]`) }, id)),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted small' }, '# heading · **bold** · _italic_ · - list · 1. steps · > note · [link](https://…)')),
    h('div', { class: 'help-split' },
      h('div', {}, h('span', { class: 'fieldset-legend' }, 'Text'), text),
      h('div', {}, h('span', { class: 'fieldset-legend' }, 'Preview'), preview)));
}

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
render();
