import { h, options } from './dom.js';
import { icon } from './icons.js';
import { uid } from '../core/ops.js';
import { ASSET_KINDS, assetKey } from '../platform/assets.js';
import { NODE_TYPES } from '../platform/strategy.js';

/**
 * A pop-up for adding assets to a task or workplan. One picker per asset
 * kind; each calls pick(asset). The dialog stays open so several things
 * can be added, and items already added show as added.
 *
 *   openAssetChooser({ docs: { maps, mapContents, org, strategy }, node, current: () => assets, onPick })
 *
 * To add a kind, add a picker to PICKERS with the same id as in ASSET_KINDS.
 */
export function openAssetChooser({ docs, node, current, onPick, kind = 'actor' }) {
  const dialog = h('dialog', { class: 'chooser', 'aria-labelledby': 'chooser-title' });
  const pane = h('div', { class: 'chooser-pane' });
  const kinds = h('div', { class: 'chooser-kinds', role: 'tablist', 'aria-orientation': 'vertical' });
  const used = () => new Set(current().map(assetKey));
  const pick = (asset) => {
    onPick({ id: uid('as'), ...asset });
    show(kind);
  };

  function show(k) {
    kind = k;
    kinds.replaceChildren(...ASSET_KINDS.map((x) =>
      h('button', { role: 'tab', class: x.id === kind ? 'on' : '', 'aria-selected': String(x.id === kind), onclick: () => show(x.id) }, icon(x.icon, 18), x.label)));
    const focused = pane.contains(document.activeElement) ? document.activeElement.name : null;
    pane.replaceChildren(...[PICKERS[kind]({ docs, node, used: used(), pick })].flat());
    (focused && pane.querySelector(`[name="${focused}"]`) || pane.querySelector('input, select, button'))?.focus();
  }

  dialog.append(
    h('div', { class: 'chooser-head' },
      h('strong', { id: 'chooser-title' }, `Add to the toolbox for “${node.title}”`),
      h('button', { class: 'btn btn-sm', onclick: () => dialog.close() }, 'Done')),
    h('div', { class: 'chooser-body' }, kinds, pane));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  show(kind);
  return dialog;
}

/** A searchable list of things to pick, in optional groups. */
function pickList({ items, used, pick, placeholder, name }) {
  const search = h('input', { type: 'search', name, placeholder, 'aria-label': placeholder });
  const list = h('ul', { class: 'pick-list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    let group = null;
    const rows = [];
    for (const it of items) {
      if (q && !`${it.label} ${it.sub ?? ''}`.toLowerCase().includes(q)) continue;
      if (it.group && it.group !== group) rows.push(h('li', { class: 'pick-group' }, (group = it.group)));
      const added = used.has(assetKey(it.asset));
      rows.push(h('li', {}, h('button', { disabled: added, onclick: () => pick(it.asset) },
        h('span', {}, it.label, it.sub && h('small', {}, ` · ${it.sub}`)), h('small', {}, added ? 'Added' : 'Add'))));
    }
    list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'pick-group' }, 'Nothing matches.')]));
  };
  search.addEventListener('input', draw);
  draw();
  return [search, list];
}

/** A small form; `fields` are [name, label, attrs]. */
function form(fields, submit, button = 'Add') {
  const inputs = Object.fromEntries(fields.map(([name, , attrs = {}]) => [name, attrs.options
    ? h('select', { name }, options(attrs.options))
    : h('input', { name, ...attrs })]));
  return h('form', { class: 'chooser-form', onsubmit: (e) => {
    e.preventDefault();
    const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()]));
    if (submit(values) !== false) e.target.reset();
  } },
    fields.map(([name, label]) => h('label', {}, label, inputs[name])),
    h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, button));
}

const PICKERS = {
  actor: ({ docs, used, pick }) => {
    // Every map's actors, grouped by map.
    const items = Object.values(docs.maps?.maps ?? {}).flatMap((entry) =>
      Object.values(docs.mapContents?.[entry.id]?.actors ?? {}).sort((a, b) => a.label.localeCompare(b.label)).map((a) => ({
        group: entry.title,
        label: a.label,
        sub: `${a.kind === 'agent' ? 'Agent' : 'Actor'} · ${a.category.replace(/-/g, ' ')}`,
        asset: { kind: 'actor', mapId: entry.id, ref: a.id, label: a.label },
      })));
    if (!items.length) return h('p', { class: 'muted' }, 'Your ecosystem maps have no actors yet. ', h('a', { href: 'mapper.html' }, 'Open the mapper'), '.');
    return [
      h('p', { class: 'muted' }, 'Actors and agents from your ecosystem maps. Renaming one on its map renames it here.'),
      ...pickList({ name: 'q-actor', used, pick, placeholder: 'Search your maps…', items }),
    ];
  },

  staff: ({ docs, node, used, pick }) => {
    const on = new Set([...(node.assigneeIds ?? []), ...(node.staffIds ?? [])]);
    const staff = Object.values(docs.org.staff).sort((a, b) => (on.has(b.id) - on.has(a.id)) || a.name.localeCompare(b.name));
    return pickList({ name: 'q-staff', used, pick, placeholder: 'Search staff…',
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
      h('p', { class: 'muted' }, 'Someone outside your staff: a partner, Elder, volunteer, funder or expert.'),
      form([['label', 'Name'], ['detail', 'Role or organisation']], ({ label, detail }) => (label ? pick({ kind: 'person', label, detail: detail || undefined }) : false)),
      known.size > 0 && h('h3', { class: 'pick-group' }, 'People already named in your strategy'),
      known.size > 0 && pickList({ name: 'q-person', used, pick, placeholder: 'Search people…',
        items: [...known.values()].map((a) => ({ label: a.label, sub: a.detail, asset: { kind: 'person', label: a.label, detail: a.detail } })) }),
    ];
  },

  plan: ({ docs, node, used, pick }) =>
    pickList({ name: 'q-plan', used, pick, placeholder: 'Search the strategy…',
      items: Object.values(docs.strategy.nodes)
        .filter((n) => n.id !== node.id)
        .map((n) => ({ label: n.title, sub: NODE_TYPES[n.type].label, asset: { kind: 'plan', ref: n.id, label: n.title } })) }),

  document: ({ pick }) => {
    const MAX = 300 * 1024;
    const file = h('input', { type: 'file', name: 'file' });
    const note = h('p', { class: 'muted' }, 'Small files (under 300 KB) are kept with the strategy for now. For bigger files, add a link to where they live (Drive, SharePoint, HubSpot).');
    return [
      note,
      h('label', {}, 'Upload a file', file),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
        const f = file.files[0];
        if (!f) return;
        const detail = `${f.type || 'File'} · ${Math.ceil(f.size / 1024)} KB`;
        if (f.size > MAX) {
          note.textContent = `${f.name} is too big to keep here. Add a link to it instead.`;
          return;
        }
        const reader = new FileReader();
        reader.onload = () => pick({ kind: 'document', label: f.name, detail, dataUrl: reader.result });
        reader.readAsDataURL(f);
      } }, 'Add file'),
      h('h3', { class: 'pick-group' }, 'Or link to a document'),
      form([['label', 'Title'], ['url', 'Link', { type: 'url', placeholder: 'https://…' }]],
        ({ label, url }) => (url ? pick({ kind: 'document', label: label || url, url, detail: 'Linked document' }) : false)),
    ];
  },

  link: ({ pick }) =>
    form([['url', 'Link', { type: 'url', placeholder: 'https://…', required: true }], ['label', 'Title'], ['detail', 'Why it matters']],
      ({ url, label, detail }) => (url ? pick({ kind: 'link', url, label: label || url, detail: detail || undefined }) : false)),

  literature: ({ pick }) => [
    h('p', { class: 'muted' }, 'Research, reports and evaluations that inform this work.'),
    form([['label', 'Citation or title', { required: true }], ['year', 'Year', { inputmode: 'numeric', maxlength: 4 }], ['url', 'Link or DOI', { placeholder: 'https://doi.org/…' }]],
      ({ label, year, url }) => (label ? pick({ kind: 'literature', label, year: year || undefined, url: url || undefined }) : false)),
  ],

  media: ({ pick }) =>
    form([['label', 'Title', { required: true }], ['detail', 'Type', { options: ['Video', 'Photo', 'Audio', 'Podcast', 'Slides'].map((x) => ({ id: x, label: x })) }], ['url', 'Link', { type: 'url', placeholder: 'https://…' }]],
      ({ label, detail, url }) => (label ? pick({ kind: 'media', label, detail, url: url || undefined }) : false)),
};
