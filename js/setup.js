// setup.js — the Setup screen: load/upload/share gym layouts and define ordered colours.

import * as store from './store.js';
import { createMap, renderMapLegend } from './map.js';
import { $, h, toast, attempt } from './dom.js';
import { save, share } from './bridge.js';
import { BUILT_IN_GYMS } from './gyms.js';

let map = null;

export function init() {
  map = createMap($('setup-map'), null);

  $('layout-upload').onclick = () => {
    const input = $('layout-file');
    input.value = '';   // choosing the same file again must still fire `change`
    input.click();
  };
  $('layout-file').onchange = uploadLayout;
  $('gym-name').onchange = (e) => {
    if (attempt(() => store.setGymName(e.target.value))) render();
  };
  $('gym-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('builtin-gyms').replaceChildren(...BUILT_IN_GYMS.map((g) => h('li', {},
    h('span', {}, h('span', { class: 'name', text: g.name }), ' ',
      h('span', { class: 'muted', text: `${g.cols} × ${g.rows}${g.walls.length ? ` · ${g.walls.length} walls` : ' · outline'}` })),
    h('button', { class: 'btn ghost', text: 'Load', 'aria-label': `Load ${g.name}`, onclick: () => loadLayout(JSON.stringify(g)) }))));
  $('layout-save').onclick = saveLayout;
  $('layout-share').onclick = shareLayout;
  $('layout-share').hidden = !share.available;

  for (const kind of Object.keys(LISTS)) {
    $(LISTS[kind].add).onclick = () => {
      let c = null;
      if (!attempt(() => { c = store.addColour(kind, 'New colour', '#a855f7'); })) return;
      renderColours(kind);
      const input = document.querySelector(`[data-colour-name="${c.id}"]`);
      if (input) { input.focus(); input.select(); }
    };
  }
}

// --- Layout files ---

/** File name from the gym name: "Rocktown" → rocktown-b-log-layout.json. */
function layoutName() {
  const slug = (store.gym.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug ? `${slug}-` : ''}b-log-layout.json`;
}

function layoutText() {
  return JSON.stringify(store.layoutFile(), null, 2);
}

function checkHasLayout() {
  if (store.activeWalls().length || store.gym.outline) return true;
  toast('Load or upload a gym layout first.');
  return false;
}

async function saveLayout() {
  if (!checkHasLayout()) return;
  if (!save.available) {
    const url = URL.createObjectURL(new Blob([layoutText()], { type: 'application/json' }));
    h('a', { href: url, download: layoutName() }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  try {
    const r = await save.text({ name: layoutName(), mimeType: 'application/json', content: layoutText() });
    if (r && r.saved) toast(`Saved ${r.name || layoutName()}`);
  } catch (err) {
    console.error(err);
    toast(err.code === 'busy' || err.code === 'not_foreground' ? 'App² is busy. Try again in a moment.' : 'Could not save the file.');
  }
}

async function shareLayout() {
  if (!checkHasLayout()) return;
  try {
    await share.file({ name: layoutName(), mimeType: 'application/json', content: layoutText() });
  } catch (err) {
    console.error(err);
    toast(err.code === 'busy' || err.code === 'not_foreground' ? 'App² is busy. Try again in a moment.' : 'Could not share the file.');
  }
}

async function uploadLayout() {
  const file = $('layout-file').files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) { toast('This file is too large for a layout.'); return; }
  let text;
  try { text = await file.text(); } catch { toast('Could not read the file.'); return; }
  loadLayout(text);
}

/** Validates a layout file's text and replaces the current layout with it, offering Undo. */
function loadLayout(text) {
  let layout;
  try { layout = store.parseLayout(text); } catch (err) { toast(err.message); return; }
  let result = null;
  if (!attempt(() => { result = store.importLayout(layout); })) return;
  render();
  const kept = result.retired
    ? ` · ${result.retired} old wall${result.retired === 1 ? '' : 's'} kept for your history`
    : '';
  const walls = result.added ? ` · ${result.added} wall${result.added === 1 ? '' : 's'}` : '';
  toast(`${layout.name || 'Layout'} loaded${walls}${kept}`, 'Undo', () => {
    if (attempt(() => store.restoreLayout(result.previous))) render();
  });
}

export function render() {
  if (document.activeElement !== $('gym-name')) $('gym-name').value = store.gym.name || '';
  $('grid-size-chip').textContent = `${store.gym.cols} × ${store.gym.rows}`;

  const walls = store.activeWalls();
  map.render({
    cols: store.gym.cols,
    rows: store.gym.rows,
    outline: store.gym.outline,
    zones: store.gym.zones,
    walls,
    pins: [],
    label: 'Gym map preview'
  });
  renderMapLegend($('setup-legend'), { walls, zones: store.gym.zones });

  renderColours('grades');
  renderColours('holds');
}

const LISTS = {
  // Grades are stored easiest → hardest in store.js, but shown hardest → easiest in Setup
  // (easiest at the bottom, like most gym boards).
  grades: { list: 'grade-list', add: 'grade-add', up: 'harder', down: 'easier', reverse: true },
  holds: { list: 'hold-list', add: 'hold-add', up: 'up', down: 'down', reverse: false }
};

/** Editable colour list, shared by grades (hardest → easiest in UI) and hold colours. */
function renderColours(kind) {
  const { list, up, down, reverse } = LISTS[kind];
  const items = reverse ? [...store.gym[kind]].reverse() : store.gym[kind];
  const stepUp = reverse ? 1 : -1;
  const stepDown = reverse ? -1 : 1;
  const rerender = () => renderColours(kind);
  $(list).replaceChildren(...items.map((c, i) => {
    const used = store.colourSendCount(kind, c.id);
    return h('li', { class: 'grade-item' },
      h('input', {
        type: 'color',
        value: c.color,
        'aria-label': `${c.name} colour`,
        onchange: (e) => attempt(() => store.updateColour(kind, c.id, { color: e.target.value }))
      }),
      h('input', {
        class: 'field',
        value: c.name,
        maxlength: '24',
        'data-colour-name': c.id,
        'aria-label': 'Colour name',
        onchange: (e) => {
          const name = e.target.value.trim();
          if (!name) { e.target.value = c.name; return; }
          attempt(() => store.updateColour(kind, c.id, { name }));
        }
      }),
      h('button', { class: 'icon-btn', 'aria-label': `Move ${c.name} ${up}`, disabled: i === 0, text: '↑',
        onclick: () => { if (attempt(() => store.moveColour(kind, c.id, stepUp))) rerender(); } }),
      h('button', { class: 'icon-btn', 'aria-label': `Move ${c.name} ${down}`, disabled: i === items.length - 1, text: '↓',
        onclick: () => { if (attempt(() => store.moveColour(kind, c.id, stepDown))) rerender(); } }),
      h('button', {
        class: 'icon-btn',
        'aria-label': `Delete ${c.name}`,
        title: used ? 'Used by logged boulders' : 'Delete',
        disabled: used > 0,
        text: '✕',
        onclick: () => { if (attempt(() => store.removeColour(kind, c.id))) rerender(); }
      }));
  }));
}
