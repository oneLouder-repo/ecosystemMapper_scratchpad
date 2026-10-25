import { h, options } from './dom.js';
import { staffList } from '../platform/org.js';
import { Avatar } from './Shell.js';

/** A dialog for a map's title, description, owner and members. */
export function MapDetails(ctx) {
  const entry = ctx.index.maps[ctx.mapId];
  const staff = staffList(ctx.org);
  const members = new Set(entry.memberIds);
  const title = h('input', { class: 'input input-sm w-full', name: 'title', value: entry.title });
  const description = h('textarea', { class: 'textarea textarea-sm w-full', name: 'description', rows: 3 }, entry.description ?? '');
  const owner = h('select', { class: 'select select-sm w-full', name: 'owner' }, h('option', { value: '' }, 'No owner'), options(staff.map((s) => ({ id: s.id, label: s.name })), entry.ownerId));

  const dialog = h('dialog', { class: 'modal' },
    h('form', { class: 'modal-box map-details', method: 'dialog', onsubmit: () => {
      ctx.actions.updateEntry({ title: title.value.trim() || entry.title, description: description.value, ownerId: owner.value || null, memberIds: [...members] });
      document.querySelector('.map-picker option:checked').textContent = title.value.trim() || entry.title;
    } },
      h('h3', {}, 'Map details'),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Title'), title),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Description'), description),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Owner'), owner),
      h('fieldset', { class: 'fieldset' }, h('legend', { class: 'fieldset-legend' }, 'Members (can edit this map)'),
        h('div', { class: 'member-grid' }, staff.map((s) =>
          h('label', { class: 'member' },
            h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: members.has(s.id), onchange: (e) => (e.target.checked ? members.add(s.id) : members.delete(s.id)) }),
            Avatar(s, 22), s.name)))),
      h('p', { class: 'muted' }, `Created ${entry.createdAt} · last changed ${entry.updatedAt}`),
      h('div', { class: 'modal-action' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn btn-sm btn-primary' }, 'Save'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
