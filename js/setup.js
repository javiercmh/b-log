// setup.js — the Setup screen: draw and name walls, size the grid, define ordered colours.

import * as store from './store.js';
import { createMap } from './map.js';
import { snapToGrid, snapToWall, wallExtent } from './geometry.js';
import { $, h, toast, attempt } from './dom.js';
import { save, share } from './bridge.js';
import { BUILT_IN_GYMS } from './gyms.js';

let map = null;
let mode = 'idle';       // 'idle' | 'draw' | 'name' (new wall) | 'edit' (existing wall)
let draft = [];
let drawing = 'wall';    // what 'draw' mode is drawing: 'wall' | 'outline'
let selectedId = null;

export function init() {
  map = createMap($('setup-map'), handleTap);

  $('wall-add').onclick = () => { mode = 'draw'; drawing = 'wall'; draft = []; selectedId = null; render(); };
  $('outline-draw').onclick = () => { mode = 'draw'; drawing = 'outline'; draft = []; selectedId = null; render(); };
  $('outline-remove').onclick = () => saveOutline(null);
  $('draw-undo').onclick = () => { draft.pop(); render(); };
  $('draw-cancel').onclick = reset;
  $('draw-done').onclick = () => {
    if (drawing === 'outline') {
      if (draft.length < 3) { toast('Place at least three corners.'); return; }
      saveOutline(draft);
      return;
    }
    if (draft.length < 2) { toast('Place at least two points.'); return; }
    mode = 'name';
    $('wall-name').value = '';
    render();
    $('wall-name').focus();
  };
  $('wall-name-cancel').onclick = () => {
    if (mode === 'name') { mode = 'draw'; render(); } else reset();
  };
  $('wall-name-save').onclick = saveWall;
  $('wall-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveWall(); });
  $('wall-delete').onclick = deleteWall;

  for (const stepper of document.querySelectorAll('.stepper')) {
    stepper.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) resize(stepper.dataset.dim, Number(btn.dataset.step));
    });
  }

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

function reset() {
  mode = 'idle';
  draft = [];
  selectedId = null;
  render();
}

function handleTap(p) {
  if (mode === 'draw') {
    const pt = snapToGrid(p, store.gym.cols, store.gym.rows);
    const last = draft[draft.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) draft.push(pt);
    render();
    return;
  }
  if (mode === 'name') return;
  const hit = snapToWall(p, store.activeWalls(), 0.8);
  if (!hit) { if (mode === 'edit') reset(); return; }
  selectedId = hit.wallId;
  mode = 'edit';
  $('wall-name').value = store.wall(selectedId)?.name || '';
  render();
}

function saveWall() {
  const name = $('wall-name').value.trim();
  if (!name) { toast('Give the wall a name.'); $('wall-name').focus(); return; }
  const ok = mode === 'name'
    ? attempt(() => store.addWall(name, draft))
    : attempt(() => store.renameWall(selectedId, name));
  if (!ok) return;
  $('wall-name').blur();
 
  reset();
}

function saveOutline(points) {
  let previous = null;
  if (!attempt(() => { previous = store.setOutline(points); })) return;
  reset();
  toast(points ? 'Outline saved' : 'Outline removed', 'Undo', () => {
    if (attempt(() => store.setOutline(previous))) render();
  });
}

function deleteWall() {
  const w = store.wall(selectedId);
  if (!w) return;
  const kept = store.wallSendCount(w.id) > 0;
  let previous = null;
  if (!attempt(() => { previous = store.removeWall(w.id); })) return;
  reset();
  toast(kept ? `${w.name} removed · its boulders stay in your history` : `${w.name} deleted`, 'Undo', () => {
    if (attempt(() => store.restoreWalls(previous))) render();
  });
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

function checkHasWalls() {
  if (store.activeWalls().length || store.gym.outline) return true;
  toast('Draw a wall or the outline first.');
  return false;
}

async function saveLayout() {
  if (!checkHasWalls()) return;
  if (!save.available) {
    // Browser preview: a normal download.
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
  if (!checkHasWalls()) return;
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
  reset();
  const kept = result.retired
    ? ` · ${result.retired} old wall${result.retired === 1 ? '' : 's'} kept for your history`
    : '';
  const walls = result.added ? ` · ${result.added} wall${result.added === 1 ? '' : 's'}` : '';
  toast(`${layout.name || 'Layout'} loaded${walls}${kept}`, 'Undo', () => {
    if (attempt(() => store.restoreLayout(result.previous))) render();
  });
}

function resize(dim, step) {
  const ext = wallExtent([...store.activeWalls(), { points: store.gym.outline || [] }]);
  const min = Math.max(store.MIN_GRID, dim === 'cols' ? ext.cols : ext.rows);
  const next = Math.max(min, Math.min(store.MAX_GRID, store.gym[dim] + step));
  if (next === store.gym[dim]) {
    if (step < 0 && next === min && min > store.MIN_GRID) toast('A wall or the outline is in the way.');
    return;
  }
  const cols = dim === 'cols' ? next : store.gym.cols;
  const rows = dim === 'rows' ? next : store.gym.rows;
  if (attempt(() => store.resizeGrid(cols, rows))) render();
}

export function render() {
  $('tools-idle').hidden = mode !== 'idle';
  $('tools-draw').hidden = mode !== 'draw';
  $('tools-name').hidden = mode !== 'name' && mode !== 'edit';
  const needed = drawing === 'outline' ? 3 : 2;
  $('draw-done').disabled = draft.length < needed;
  $('draw-hint').textContent = drawing === 'outline'
    ? 'Tap the corners of the building in order. Done closes the shape. Boulders cannot be logged on the outline.'
    : 'Tap grid points to place the corners of the wall.';
  $('outline-remove').hidden = !(mode === 'draw' && drawing === 'outline' && store.gym.outline);
  $('outline-draw').textContent = store.gym.outline ? 'Redraw outline' : '+ Outline';
  $('draw-undo').disabled = draft.length === 0;
  $('wall-delete').hidden = mode !== 'edit';

  if (mode === 'edit') {
    const count = store.wallSendCount(selectedId);
    $('wall-delete').textContent = count > 0 ? 'Remove' : 'Delete';
    $('wall-hint').textContent = count > 0
      ? `${count} logged boulder${count === 1 ? '' : 's'} on this wall. Removing it takes it off the map; older days still show it with its boulders.`
      : '';
  } else {
    $('wall-hint').textContent = '';
  }

  if (document.activeElement !== $('gym-name')) $('gym-name').value = store.gym.name || '';
  $('grid-size-chip').textContent = `${store.gym.cols} × ${store.gym.rows}`;
  for (const stepper of document.querySelectorAll('.stepper')) {
    stepper.querySelector('output').textContent = store.gym[stepper.dataset.dim];
  }

  map.render({
    cols: store.gym.cols,
    rows: store.gym.rows,
    outline: store.gym.outline,
    walls: store.activeWalls(),
    pins: [],
    selectedWallId: selectedId,
    draft: mode === 'draw' || mode === 'name' ? draft : null,
    draftClosed: drawing === 'outline',
    label: 'Gym map editor'
  });

  renderColours('grades');
  renderColours('holds');
}

const LISTS = {
  grades: { list: 'grade-list', add: 'grade-add', up: 'easier', down: 'harder' },
  holds: { list: 'hold-list', add: 'hold-add', up: 'up', down: 'down' }
};

/** Editable colour list, shared by grades (difficulty order) and hold colours. */
function renderColours(kind) {
  const items = store.gym[kind];
  const { list, up, down } = LISTS[kind];
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
        onclick: () => { if (attempt(() => store.moveColour(kind, c.id, -1))) rerender(); } }),
      h('button', { class: 'icon-btn', 'aria-label': `Move ${c.name} ${down}`, disabled: i === items.length - 1, text: '↓',
        onclick: () => { if (attempt(() => store.moveColour(kind, c.id, 1))) rerender(); } }),
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
