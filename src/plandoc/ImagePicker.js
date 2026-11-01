import { h } from '../ui/dom.js';
import { ART_STYLES, artUrl } from '../ui/art.js';
import { readImage } from '../ui/images.js';
import { paletteColours } from './render.js';

/**
 * Choose a picture for a plan document: art made in your colours, an
 * openly licensed photo from Openverse (with its credit kept), your own
 * upload, or a web address.
 *
 *   ImagePicker({ current, seed, palette, slotLabel, onPick(image) })
 */
export function ImagePicker({ current, seed = 1, palette, slotLabel = 'this picture', onPick }) {
  const colours = paletteColours(palette);
  const body = h('div', { class: 'ip-body' });
  const tabs = [['art', 'Made for you'], ['open', 'Open photos'], ['upload', 'Upload'], ['url', 'Web address']];
  let tab = current?.kind === 'url' ? 'open' : 'art';
  const tabBar = h('div', { role: 'tablist', class: 'tabs tabs-border ip-tabs' });
  const pick = (img) => { onPick(img); dialog.close(); };

  function show(t) {
    tab = t;
    tabBar.replaceChildren(...tabs.map(([id, label]) => h('button', { role: 'tab', type: 'button', class: `tab${id === tab ? ' tab-active' : ''}`, onclick: () => show(id) }, label)));
    if (t === 'art') {
      body.replaceChildren(
        h('p', { class: 'muted' }, 'Abstract pictures drawn in this document’s colours. They’re yours to use anywhere, with nothing to credit.'),
        h('div', { class: 'ip-grid' }, ART_STYLES.map((a) => h('button', { type: 'button', class: `ip-tile${current?.kind !== 'url' && current?.art === a.id ? ' on' : ''}`, onclick: () => pick({ kind: 'art', art: a.id }) },
          h('img', { src: artUrl(a.id, colours, seed + 1, 600, 400), alt: '' }), h('span', {}, a.label)))));
    } else if (t === 'open') {
      const q = h('input', { class: 'input input-sm grow', name: 'ip-q', placeholder: 'Search: community garden, river, youth, prairie…', value: '' });
      const results = h('div', { class: 'ip-grid' });
      const status = h('p', { class: 'muted small' }, 'Openly licensed photos from Openverse (Creative Commons and public domain). The credit stays with the picture.');
      const search = async () => {
        if (!q.value.trim()) return;
        status.textContent = 'Searching…';
        results.replaceChildren();
        try {
          const res = await fetch(`/api/images?q=${encodeURIComponent(q.value.trim())}`, { headers: { 'x-toolbox': '1' } });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'The search didn’t work');
          status.textContent = data.results.length ? `${data.results.length} pictures. Pick one.` : 'Nothing found. Try other words.';
          results.replaceChildren(...data.results.map((r) => h('button', { type: 'button', class: 'ip-tile', title: r.title, onclick: () => pick({ kind: 'url', url: r.url, alt: r.title, credit: `“${r.title}” by ${r.creator || 'unknown'} · ${r.license}`, license: r.license, source: r.source }) },
            h('img', { src: r.thumbnail || r.url, alt: r.title, loading: 'lazy' }), h('span', {}, r.creator || r.title))));
        } catch (err) {
          status.textContent = `${err.message}. You can still upload a picture or paste a web address.`;
        }
      };
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
      body.replaceChildren(h('div', { class: 'join w-full' }, q, h('button', { type: 'button', class: 'btn btn-sm btn-primary join-item', onclick: search }, 'Search')), status, results);
      setTimeout(() => q.focus());
    } else if (t === 'upload') {
      const status = h('p', { class: 'muted small' }, 'A JPEG or PNG. Big pictures are shrunk to 1800 pixels wide.');
      body.replaceChildren(
        h('input', { type: 'file', accept: 'image/*', class: 'file-input file-input-sm', onchange: async (e) => {
          try { pick({ kind: 'url', url: await readImage(e.target.files[0], 1800), alt: '', credit: '' }); } catch (err) { status.textContent = err.message; }
        } }), status);
    } else {
      const url = h('input', { class: 'input input-sm w-full', placeholder: 'https://…', value: current?.kind === 'url' && !current.url.startsWith('data:') ? current.url : '' });
      const credit = h('input', { class: 'input input-sm w-full', placeholder: 'Photo by … (licence)', value: current?.credit ?? '' });
      body.replaceChildren(
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Picture address'), url),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Credit (shown on the picture)'), credit),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => url.value.startsWith('https://') && pick({ kind: 'url', url: url.value, credit: credit.value }) }, 'Use this picture'));
    }
  }

  const dialog = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box ip-box' },
      h('h3', { class: 'text-lg font-bold' }, `A picture for ${slotLabel}`),
      tabBar, body,
      h('div', { class: 'modal-action' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dialog.close() }, 'Cancel'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  show(tab);
  dialog.showModal();
}
