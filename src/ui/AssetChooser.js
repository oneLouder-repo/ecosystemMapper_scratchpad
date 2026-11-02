import { h, options } from './dom.js';
import { icon } from './icons.js';
import { uid } from '../core/ops.js';
import { ASSET_KINDS, assetKey } from '../platform/assets.js';
import { NODE_TYPES } from '../platform/strategy.js';
import { typeOf } from '../platform/library.js';

/**
 * A pop-up for adding assets to a task or workplan. One picker per asset
 * kind; each calls pick(asset). The dialog stays open so several things
 * can be added, and items already added show as added.
 *
 *   openAssetChooser({ docs: { maps, mapContents, org, strategy, library }, node, current: () => assets, onPick })
 *
 * To add a kind, add a picker to PICKERS with the same id as in ASSET_KINDS,
 * and a line about it to ABOUT.
 */
const ABOUT = {
  map: 'A whole ecosystem map, live in the Mapper, or a map file kept in the library.',
  actor: 'Actors and agents from your ecosystem maps. Renaming one on its map renames it here.',
  staff: 'People on your staff who work on this or know it well.',
  person: 'Someone outside your staff: a partner, Elder, volunteer, funder or expert.',
  plan: 'Another part of your strategy that this work depends on or feeds.',
  document: 'A file from your library, a small file kept with the strategy, or a link to where it lives.',
  link: 'A web page, tool or dataset this work uses.',
  literature: 'Research, reports and evaluations that inform this work: from your library, or typed in.',
  media: 'A video, photo, recording or slide deck.',
};

export function openAssetChooser({ docs, node, current, onPick, kind = 'actor' }) {
  const dialog = h('dialog', { class: 'chooser', 'aria-labelledby': 'chooser-title' });
  const pane = h('div', { class: 'chooser-pane' });
  const kinds = h('div', { class: 'chooser-kinds', role: 'tablist', 'aria-orientation': 'vertical' });
  const status = h('span', { class: 'chooser-status', role: 'status' });
  const used = () => new Set(current().map(assetKey));
  const pick = (asset) => {
    onPick({ id: uid('as'), ...asset });
    status.textContent = `Added “${asset.label}”.`;
    show(kind);
  };

  function show(k) {
    kind = k;
    const counts = {};
    for (const a of current()) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
    kinds.replaceChildren(...ASSET_KINDS.map((x) =>
      h('button', { role: 'tab', class: x.id === kind ? 'on' : '', 'aria-selected': String(x.id === kind), onclick: () => { status.textContent = ''; show(x.id); } },
        icon(x.icon, 18), h('span', {}, x.label), counts[x.id] ? h('span', { class: 'chooser-count', title: `${counts[x.id]} added` }, counts[x.id]) : null)));
    const focused = pane.contains(document.activeElement) ? document.activeElement.name : null;
    const k0 = ASSET_KINDS.find((x) => x.id === kind);
    pane.replaceChildren(
      h('div', { class: 'chooser-intro' }, h('h3', {}, k0.label), h('p', {}, ABOUT[kind] ?? '')),
      ...[PICKERS[kind]({ docs, node, used: used(), pick })].flat(Infinity).filter(Boolean));
    (focused && pane.querySelector(`[name="${focused}"]`) || pane.querySelector('input, select, button'))?.focus();
  }

  const typeLabel = NODE_TYPES[node.type]?.label?.toLowerCase() ?? 'item';
  dialog.append(
    h('div', { class: 'chooser-head' },
      h('div', { class: 'chooser-title' },
        h('h2', { id: 'chooser-title' }, 'Add assets'),
        h('span', { title: node.title }, `To the ${typeLabel} “${node.title}”`)),
      h('button', { class: 'icon-button', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    h('div', { class: 'chooser-body' }, kinds, pane),
    h('div', { class: 'chooser-foot' }, status, h('button', { class: 'btn btn-sm btn-primary', onclick: () => dialog.close() }, 'Done')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  show(kind);
  return dialog;
}

/** A searchable list of things to pick, in optional groups. */
function pickList({ items, used, pick, placeholder, name, empty = 'Nothing matches.' }) {
  const search = h('input', { type: 'search', class: 'input input-sm chooser-search', name, placeholder, 'aria-label': placeholder });
  const list = h('ul', { class: 'pick-list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    let group = null;
    const rows = [];
    for (const it of items) {
      if (q && !`${it.label} ${it.sub ?? ''}`.toLowerCase().includes(q)) continue;
      if (it.group && it.group !== group) rows.push(h('li', { class: 'pick-group' }, (group = it.group)));
      const added = used.has(assetKey(it.asset));
      rows.push(h('li', {}, h('button', { class: 'pick-row', disabled: added, 'aria-label': `${added ? 'Added' : 'Add'}: ${it.label}`, onclick: () => pick(it.asset) },
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-label' }, it.label), it.sub && h('small', {}, it.sub)),
        added ? h('span', { class: 'pick-added' }, '✓ Added') : h('span', { class: 'pick-add' }, icon('plus', 14), 'Add'))));
    }
    list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'pick-empty' }, items.length ? 'Nothing matches.' : empty)]));
  };
  search.addEventListener('input', draw);
  draw();
  return items.length > 6 ? [search, list] : [list];
}

/**
 * A small form. `fields` are [name, label, attrs]; attrs.options makes a
 * select, attrs.wide spans both columns.
 */
function form(fields, submit, button = 'Add') {
  const inputs = Object.fromEntries(fields.map(([name, , attrs = {}]) => {
    const { options: opts, wide, ...rest } = attrs;
    return [name, opts
      ? h('select', { name, class: 'select select-sm' }, options(opts))
      : h('input', { name, class: 'input input-sm', ...rest })];
  }));
  return h('form', { class: 'chooser-form', onsubmit: (e) => {
    e.preventDefault();
    const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
    if (submit(values) !== false) { e.target.reset(); e.target.querySelector('input')?.focus(); }
  } },
    fields.map(([name, label, attrs = {}]) => h('label', { class: `chooser-field${attrs.wide ? ' wide' : ''}` }, h('span', {}, label, attrs.required && h('em', { 'aria-hidden': 'true' }, ' *')), inputs[name])),
    h('div', { class: 'chooser-actions' }, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, icon('plus', 14), button)));
}

const section = (title, ...children) => h('section', { class: 'chooser-section' }, h('h4', {}, title), ...children);

/** Library items for document or literature assets. */
function libraryItems(docs, kind) {
  const items = Object.values(docs.library?.items ?? {});
  const SCHOLARLY = ['article-journal', 'book', 'chapter', 'paper-conference', 'thesis', 'article-magazine', 'article-newspaper'];
  const fits = kind === 'literature'
    ? (it) => ['ref', 'link'].includes(it.kind) || (it.kind === 'file' && (SCHOLARLY.includes(it.meta.type) || it.meta.DOI))
    : (it) => ['file', 'doc', 'gdoc'].includes(it.kind);
  return items
    .filter(fits)
    .sort((a, b) => String(a.meta.title).localeCompare(String(b.meta.title)))
    .map((it) => {
      const who = it.meta.creators?.[0];
      const year = String(it.meta.issued ?? '').slice(0, 4);
      const kindLabel = kind === 'literature' ? typeOf(it.meta.type).label : { file: (it.file?.name.split('.').pop() ?? 'file').toUpperCase(), doc: 'Dashi doc', gdoc: 'Google file' }[it.kind];
      return {
        label: it.meta.title || 'Untitled',
        sub: [kindLabel, who && (who.literal ?? who.family) + (it.meta.creators.length > 1 ? ' et al.' : ''), year].filter(Boolean).join(' · '),
        asset: { kind, libraryId: it.id, label: it.meta.title || 'Untitled', year: year || undefined },
      };
    });
}

const PICKERS = {
  map: ({ docs, used, pick }) => {
    const live = Object.values(docs.maps?.maps ?? {}).sort((a, b) => a.title.localeCompare(b.title)).map((entry) => ({
      group: 'Maps in the Mapper',
      label: entry.title,
      sub: `${Object.keys(docs.mapContents?.[entry.id]?.actors ?? {}).length} actors${entry.description ? ` · ${entry.description}` : ''}`,
      asset: { kind: 'map', ref: entry.id, label: entry.title },
    }));
    const files = Object.values(docs.library?.items ?? {}).filter((it) => it.kind === 'file' && /\.dashi-map\.json$/i.test(it.file?.name ?? '')).map((it) => ({
      group: 'Map files in the library',
      label: it.meta.title || it.file.name,
      sub: it.file.name,
      asset: { kind: 'map', libraryId: it.id, label: it.meta.title || it.file.name },
    }));
    const items = [...live, ...files];
    if (!items.length) return h('p', { class: 'pick-empty' }, 'No ecosystem maps yet. ', h('a', { href: 'mapper.html' }, 'Open the mapper'), '.');
    return pickList({ name: 'q-map', used, pick, placeholder: 'Search maps', items });
  },

  actor: ({ docs, used, pick }) => {
    // Every map's actors, grouped by map.
    const items = Object.values(docs.maps?.maps ?? {}).flatMap((entry) =>
      Object.values(docs.mapContents?.[entry.id]?.actors ?? {}).sort((a, b) => a.label.localeCompare(b.label)).map((a) => ({
        group: entry.title,
        label: a.label,
        sub: `${a.kind === 'agent' ? 'Agent' : 'Actor'} · ${a.category.replace(/-/g, ' ')}`,
        asset: { kind: 'actor', mapId: entry.id, ref: a.id, label: a.label },
      })));
    if (!items.length) return h('p', { class: 'pick-empty' }, 'Your ecosystem maps have no actors yet. ', h('a', { href: 'mapper.html' }, 'Open the mapper'), '.');
    return pickList({ name: 'q-actor', used, pick, placeholder: 'Search your maps', items });
  },

  staff: ({ docs, node, used, pick }) => {
    const on = new Set([...(node.assigneeIds ?? []), ...(node.staffIds ?? [])]);
    const staff = Object.values(docs.org.staff).sort((a, b) => (on.has(b.id) - on.has(a.id)) || a.name.localeCompare(b.name));
    return pickList({ name: 'q-staff', used, pick, placeholder: 'Search staff',
      items: staff.map((s) => ({
        group: on.has(s.id) ? 'Already on this work' : 'Everyone else',
        label: s.name, sub: s.title,
        asset: { kind: 'staff', ref: s.id, label: s.name },
      })) });
  },

  person: ({ docs, used, pick }) => {
    // People outside the org already named somewhere in the strategy, so they can be reused.
    const known = new Map();
    for (const n of Object.values(docs.strategy.nodes)) for (const a of n.assets ?? []) if (a.kind === 'person') known.set(assetKey(a), a);
    return [
      form([['label', 'Name', { required: true }], ['detail', 'Role or organisation']], ({ label, detail }) => (label ? pick({ kind: 'person', label, detail: detail || undefined }) : false)),
      known.size > 0 && section('People already named in your strategy',
        pickList({ name: 'q-person', used, pick, placeholder: 'Search people',
          items: [...known.values()].map((a) => ({ label: a.label, sub: a.detail, asset: { kind: 'person', label: a.label, detail: a.detail } })) })),
    ];
  },

  plan: ({ docs, node, used, pick }) =>
    pickList({ name: 'q-plan', used, pick, placeholder: 'Search the strategy',
      items: Object.values(docs.strategy.nodes)
        .filter((n) => n.id !== node.id)
        .map((n) => ({ group: NODE_TYPES[n.type].label + 's', label: n.title, asset: { kind: 'plan', ref: n.id, label: n.title } }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)) }),

  document: ({ docs, used, pick }) => {
    const MAX = 300 * 1024;
    const lib = libraryItems(docs, 'document');
    const file = h('input', { type: 'file', name: 'file', class: 'file-input file-input-sm' });
    const note = h('p', { class: 'chooser-hint' }, 'Up to 300 KB. Bigger files belong in the library, or add a link.');
    return [
      lib.length > 0 && section('From your library', pickList({ name: 'q-doc', used, pick, placeholder: 'Search the library', items: lib })),
      section('Upload a small file',
        h('div', { class: 'chooser-upload' }, file,
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
            const f = file.files[0];
            if (!f) { note.textContent = 'Choose a file first.'; return; }
            const detail = `${f.type || 'File'} · ${Math.ceil(f.size / 1024)} KB`;
            if (f.size > MAX) { note.textContent = `${f.name} is too big to keep here. Put it in the library, or add a link to it.`; return; }
            const reader = new FileReader();
            reader.onload = () => pick({ kind: 'document', label: f.name, detail, dataUrl: reader.result });
            reader.readAsDataURL(f);
          } }, icon('upload', 14), 'Add file')),
        note),
      section('Link to a document',
        form([['url', 'Link', { type: 'url', placeholder: 'https://', required: true }], ['label', 'Title']],
          ({ label, url }) => (url ? pick({ kind: 'document', label: label || url, url, detail: 'Linked document' }) : false))),
    ];
  },

  link: ({ pick }) =>
    form([['url', 'Link', { type: 'url', placeholder: 'https://', required: true, wide: true }], ['label', 'Title'], ['detail', 'Why it matters']],
      ({ url, label, detail }) => (url ? pick({ kind: 'link', url, label: label || url, detail: detail || undefined }) : false)),

  literature: ({ docs, used, pick }) => {
    const lib = libraryItems(docs, 'literature');
    return [
      lib.length > 0 && section('From your library', pickList({ name: 'q-lit', used, pick, placeholder: 'Search references', items: lib })),
      section(lib.length ? 'Or type one in' : 'Type one in',
        form([['label', 'Citation or title', { required: true, wide: true }], ['year', 'Year', { inputmode: 'numeric', maxlength: 4, placeholder: '2024' }], ['url', 'Link or DOI', { placeholder: 'https://doi.org/' }]],
          ({ label, year, url }) => (label ? pick({ kind: 'literature', label, year: year || undefined, url: url || undefined }) : false))),
    ];
  },

  media: ({ pick }) =>
    form([['label', 'Title', { required: true, wide: true }], ['detail', 'Type', { options: ['Video', 'Photo', 'Audio', 'Podcast', 'Slides'].map((x) => ({ id: x, label: x })) }], ['url', 'Link', { type: 'url', placeholder: 'https://' }]],
      ({ label, detail, url }) => (label ? pick({ kind: 'media', label, detail, url: url || undefined }) : false)),
};
