import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { loadOrg, loadStrategy, loadData, loadMaps, loadLibrary, loadPlanDocs } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { rootOf } from '../platform/strategy.js';
import { resolveAsset, kindById, ASSET_KINDS, assetsUnder, groupAssets } from '../platform/assets.js';
import { mapPicture, strategyPicture, dataCardPicture, plansIn, measuresWithData } from '../platform/dashiObjects.js';

/**
 * Three Dashi tools for the doc editor's toolbar:
 *
 *   Asset link     a link to anything in the asset manager: the actors,
 *                  people, documents, links and literature your strategy uses
 *   Dashi object   a picture of Dashi data: an ecosystem map, the strategic
 *                  plan out to its goals as an infographic, or a data card
 *   Strategic plan a link to a plan document from the Plan designer: its web
 *                  view, which downloads as PDF
 *
 *   dashiToolbarItems(() => editor) → Toast UI toolbar items
 */
export function dashiToolbarItems(getEditor) {
  const button = (label, iconName, title, onclick) => {
    const b = h('button', { type: 'button', class: 'toastui-editor-toolbar-icons dashi-tool', title, 'aria-label': title, onclick: () => onclick(getEditor()) }, icon(iconName, 16), h('span', {}, label));
    return { name: `dashi-${iconName}`, tooltip: title, el: b };
  };
  return [
    button('Asset', 'link', 'Insert a link to an asset from the asset manager', AssetLinkChooser),
    button('Dashi', 'chart', 'Insert a Dashi object: an ecosystem map, the plan infographic or a data card', DashiObjectChooser),
    button('Plan', 'strategy', 'Insert a link to a strategic plan document (web and PDF)', PlanDocChooser),
  ];
}

const docs = () => {
  const maps = loadMaps();
  return { org: loadOrg(), strategy: loadStrategy(), data: loadData(), maps, mapContents: loadAllMaps(maps), library: loadLibrary(), plandocs: loadPlanDocs() };
};

function Dialog(title, intro, ...body) {
  const dialog = h('dialog', { class: 'modal dashi-chooser' },
    h('div', { class: 'modal-box' },
      h('h3', {}, title),
      intro && h('p', { class: 'muted' }, intro),
      ...body,
      h('div', { class: 'modal-action' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dialog.close() }, 'Cancel'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

const absolute = (href) => (href && !/^(https?:|mailto:|data:)/.test(href) ? new URL(href, location.href).href : href);

function insertLink(editor, text, url) {
  if (!editor) return;
  editor.exec('addLink', { linkText: text, linkUrl: absolute(url) });
  editor.focus();
}

/* ---------- Asset links ---------- */

export function AssetLinkChooser(editor) {
  const d = docs();
  const root = rootOf(d.strategy);
  const used = root ? groupAssets(assetsUnder(d.strategy, root.id)) : [];
  // Assets with no page of their own (a person outside the staff, a citation) link to where the strategy uses them.
  const rows = used.map(({ asset, from }) => { const r = resolveAsset(asset, d); return { asset, from, r: { ...r, href: r.href ?? `strategy.html#${from[0].id}` } }; }).filter((x) => !x.r.missing);
  const search = h('input', { class: 'input input-sm w-full', placeholder: 'Search assets', autofocus: true });
  const kindSel = h('select', { class: 'select select-sm' }, h('option', { value: '' }, 'Every kind'), options(ASSET_KINDS.map((k) => ({ id: k.id, label: k.label })), ''));
  const list = h('div', { class: 'dashi-list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter((x) => (!kindSel.value || x.asset.kind === kindSel.value) && (!q || `${x.r.label} ${x.r.sub}`.toLowerCase().includes(q)));
    list.replaceChildren(...(shown.length ? shown.map((x) => h('button', { type: 'button', class: 'dashi-row', disabled: !x.r.href, title: x.r.href ? '' : 'This asset has no page to link to',
      onclick: () => { insertLink(editor, x.r.label, x.r.href); dialog.close(); } },
      icon(kindById[x.asset.kind]?.icon ?? 'link', 18),
      h('span', { class: 'dashi-row-text' }, h('b', {}, x.r.label), h('small', {}, [x.r.sub, `used in ${x.from.map((n) => n.title).slice(0, 2).join(', ')}${x.from.length > 2 ? ` and ${x.from.length - 2} more` : ''}`].filter(Boolean).join(' · '))),
      h('span', { class: 'dashi-row-go' }, x.r.href ? 'Insert' : '—'))) : [h('p', { class: 'muted' }, rows.length ? 'Nothing matches.' : 'No assets yet. Add them to workplans and tasks in Strategy & Work.')]));
  };
  search.addEventListener('input', draw);
  kindSel.addEventListener('change', draw);
  const dialog = Dialog('Link to an asset', 'Actors, people, documents, links and literature from the asset manager in Strategy & Work.', h('div', { class: 'dashi-filters' }, search, kindSel), list);
  draw();
}

/* ---------- Dashi objects ---------- */

const OBJECTS = [
  { id: 'map', label: 'Ecosystem map', icon: 'mapper', blurb: 'A map as it looks in the mapper, with its lens.' },
  { id: 'plan', label: 'Strategic plan infographic', icon: 'strategy', blurb: 'Mission, vision, objectives and goals with their measures, on one dense page.' },
  { id: 'card', label: 'Data card', icon: 'chart', blurb: 'One measure from the Data Workbench: its latest value, target and trend.' },
];

export function DashiObjectChooser(editor) {
  const d = docs();
  let kind = 'map';
  let png = null;
  const kinds = h('div', { class: 'dashi-kinds', role: 'tablist' });
  const controls = h('div', { class: 'dashi-controls' });
  const preview = h('div', { class: 'dashi-preview' });
  const insert = h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: true }, 'Insert');
  let alt = '';
  let busy = 0;

  async function make(fn, text) {
    const mine = ++busy;
    png = null;
    insert.disabled = true;
    preview.replaceChildren(h('span', { class: 'loading loading-spinner' }), h('span', { class: 'muted' }, ' Drawing…'));
    try {
      const url = await fn();
      if (mine !== busy) return;
      png = url;
      alt = text;
      preview.replaceChildren(h('img', { src: url, alt: text }));
      insert.disabled = false;
    } catch (err) {
      if (mine === busy) preview.replaceChildren(h('p', { class: 'muted' }, `Couldn’t draw it: ${err.message}`));
    }
  }

  function show(k) {
    kind = k;
    kinds.replaceChildren(...OBJECTS.map((o) => h('button', { type: 'button', role: 'tab', class: o.id === kind ? 'on' : '', 'aria-selected': String(o.id === kind), onclick: () => show(o.id) },
      icon(o.icon, 20), h('b', {}, o.label), h('small', {}, o.blurb))));
    if (k === 'map') {
      const list = Object.values(d.maps.maps);
      if (!list.length) { controls.replaceChildren(h('p', { class: 'muted' }, 'No ecosystem maps yet.')); preview.replaceChildren(); return; }
      const sel = h('select', { class: 'select select-sm', onchange: () => draw() }, options(list.map((m) => ({ id: m.id, label: m.title })), list[0].id));
      const draw = () => make(() => mapPicture(sel.value), `Ecosystem map: ${d.maps.maps[sel.value].title}`);
      controls.replaceChildren(h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Map'), sel));
      draw();
    } else if (k === 'plan') {
      const plans = plansIn(d.strategy);
      if (!plans.length) { controls.replaceChildren(h('p', { class: 'muted' }, 'No strategic plans yet.')); preview.replaceChildren(); return; }
      const sel = h('select', { class: 'select select-sm', onchange: () => draw() }, options(plans.map((p) => ({ id: p.id, label: p.title })), plans[0].id));
      const draw = () => make(() => strategyPicture(d.strategy, sel.value, d.org, d.data), `${d.strategy.nodes[sel.value].title}: objectives and goals`);
      controls.replaceChildren(h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Plan, out to its goals'), sel));
      draw();
    } else {
      const ms = measuresWithData(d.strategy, d.data);
      if (!ms.length) { controls.replaceChildren(h('p', { class: 'muted' }, 'No measures with data yet. Add program data in the Data Workbench.')); preview.replaceChildren(); return; }
      const sel = h('select', { class: 'select select-sm', onchange: () => draw() }, options(ms.map((m) => ({ id: m.id, label: m.name })), ms[0].id));
      const style = h('select', { class: 'select select-sm', onchange: () => draw() }, options([{ id: 'bold', label: 'Bold' }, { id: 'light', label: 'Light' }], 'bold'));
      const draw = () => make(() => dataCardPicture(sel.value, d, d.org, { style: style.value }), `Data card: ${ms.find((m) => m.id === sel.value).name}`);
      controls.replaceChildren(
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Measure'), sel),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Style'), style));
      draw();
    }
  }

  insert.addEventListener('click', () => {
    if (!png || !editor) return;
    editor.exec('addImage', { imageUrl: png, altText: alt });
    editor.focus();
    dialog.close();
  });
  const dialog = Dialog('Insert a Dashi object', 'A picture made from your live Dashi data. It’s kept in the doc as it is now, and exports with it to Word and PDF.',
    h('div', { class: 'dashi-object' }, kinds, h('div', { class: 'dashi-object-main' }, controls, preview, h('div', { class: 'dashi-insert' }, insert))));
  dialog.querySelector('.modal-box').classList.add('dashi-wide');
  show(kind);
}

/* ---------- Strategic plan documents ---------- */

export function PlanDocChooser(editor) {
  const d = docs();
  const list = Object.values(d.plandocs.docs).map((pd) => {
    const plan = d.strategy.nodes[pd.planId];
    const site = d.org.sites?.[pd.siteId];
    const live = pd.status === 'published' && site;
    return { pd, title: plan?.title ?? pd.snapshot?.plan?.title ?? 'Strategic plan', live, site,
      url: live ? `site.html?site=${site.id}&plan=${pd.id}` : `plandoc.html#${pd.id}`,
      pdf: live ? `site.html?site=${site.id}&plan=${pd.id}&pdf=1` : null };
  });
  const rows = h('div', { class: 'dashi-list' }, list.length ? list.map((x) => h('div', { class: 'dashi-row static' },
    icon('doc', 20),
    h('span', { class: 'dashi-row-text' }, h('b', {}, x.title), h('small', {}, x.live ? `Published on ${x.site.name} ${x.pd.publishedAt ?? ''}` : 'Draft: the link only works for staff until it’s published')),
    h('span', { class: 'dashi-row-actions' },
      h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { insertLink(editor, x.title, x.url); dialog.close(); } }, x.live ? 'Web view' : 'Link'),
      x.pdf && h('button', { type: 'button', class: 'btn btn-xs btn-primary', title: 'Opens the plan ready to save as PDF', onclick: () => { insertLink(editor, `${x.title} (PDF)`, x.pdf); dialog.close(); } }, 'PDF')))) : [h('p', { class: 'muted' }, 'No plan documents yet.')]);
  const dialog = Dialog('Link to a strategic plan', 'Designed plan documents from the Plan designer. The web view can be read online and downloaded as a PDF.',
    rows, h('a', { class: 'btn btn-sm btn-ghost', href: 'plandoc.html', target: '_blank' }, icon('plus', 15), 'Design a plan document'));
}
