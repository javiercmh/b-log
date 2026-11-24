// setup.js — the Setup screen: draw and name walls, size the grid, define ordered colours.

import * as store from './store.js';
import { createMap } from './map.js';
import { snapToGrid, snapToWall, wallExtent } from './geometry.js';
import { $, h, toast, attempt } from './dom.js';

let map = null;
let mode = 'idle';       // 'idle' | 'draw' | 'name' (new wall) | 'edit' (existing wall)
let draft = [];
let selectedId = null;

export function init() {
  map = createMap($('setup-map'), handleTap);

  $('wall-add').onclick = () => { mode = 'draw'; draft = []; selectedId = null; render(); };
  $('draw-undo').onclick = () => { draft.pop(); render(); };
  $('draw-cancel').onclick = reset;
  $('draw-done').onclick = () => {
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

  $('grade-add').onclick = () => {
    let g = null;
    if (!attempt(() => { g = store.addGrade('New colour', '#a855f7'); })) return;
    renderGrades();
   
    const input = document.querySelector(`[data-grade-name="${g.id}"]`);
    if (input) { input.focus(); input.select(); }
  };
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
  const hit = snapToWall(p, store.gym.walls, 0.8);
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

function deleteWall() {
  const w = store.wall(selectedId);
  if (!w) return;
  const index = store.gym.walls.indexOf(w);
  if (!attempt(() => store.removeWall(w.id))) return;
 
  reset();
  toast(`${w.name} deleted`, 'Undo', () => {
    // Re-insert the same wall (same id) at its old position.
    const walls = [...store.gym.walls];
    walls.splice(index, 0, w);
    if (attempt(() => store.restoreWalls(walls))) render();
  });
}

function resize(dim, step) {
  const ext = wallExtent(store.gym.walls);
  const min = Math.max(store.MIN_GRID, dim === 'cols' ? ext.cols : ext.rows);
  const next = Math.max(min, Math.min(store.MAX_GRID, store.gym[dim] + step));
  if (next === store.gym[dim]) {
    if (step < 0 && next === min && min > store.MIN_GRID) toast('A wall is in the way. Move or delete it first.');
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
  $('draw-done').disabled = draft.length < 2;
  $('draw-undo').disabled = draft.length === 0;
  $('wall-delete').hidden = mode !== 'edit';

  if (mode === 'edit') {
    const count = store.wallSendCount(selectedId);
    $('wall-delete').disabled = count > 0;
    $('wall-hint').textContent = count > 0
      ? `${count} logged boulder${count === 1 ? '' : 's'} on this wall, so it can only be renamed.`
      : '';
  } else {
    $('wall-hint').textContent = '';
  }

  $('grid-size-chip').textContent = `${store.gym.cols} × ${store.gym.rows}`;
  for (const stepper of document.querySelectorAll('.stepper')) {
    stepper.querySelector('output').textContent = store.gym[stepper.dataset.dim];
  }

  map.render({
    cols: store.gym.cols,
    rows: store.gym.rows,
    walls: store.gym.walls,
    pins: [],
    selectedWallId: selectedId,
    draft: mode === 'draw' || mode === 'name' ? draft : null,
    label: 'Gym map editor'
  });

  renderGrades();
}

function renderGrades() {
  const grades = store.gym.grades;
  $('grade-list').replaceChildren(...grades.map((g, i) => {
    const used = store.gradeSendCount(g.id);
    return h('li', { class: 'grade-item' },
      h('input', {
        type: 'color',
        value: g.color,
        'aria-label': `${g.name} colour`,
        onchange: (e) => attempt(() => store.updateGrade(g.id, { color: e.target.value }))
      }),
      h('input', {
        class: 'field',
        value: g.name,
        maxlength: '24',
        'data-grade-name': g.id,
        'aria-label': 'Colour name',
        onchange: (e) => {
          const name = e.target.value.trim();
          if (!name) { e.target.value = g.name; return; }
          attempt(() => store.updateGrade(g.id, { name }));
        }
      }),
      h('button', { class: 'icon-btn', 'aria-label': `Move ${g.name} easier`, disabled: i === 0, text: '↑', onclick: () => move(g.id, -1) }),
      h('button', { class: 'icon-btn', 'aria-label': `Move ${g.name} harder`, disabled: i === grades.length - 1, text: '↓', onclick: () => move(g.id, 1) }),
      h('button', {
        class: 'icon-btn',
        'aria-label': `Delete ${g.name}`,
        title: used ? 'Used by logged boulders' : 'Delete',
        disabled: used > 0,
        text: '✕',
        onclick: () => { if (attempt(() => store.removeGrade(g.id))) renderGrades(); }
      }));
  }));
}

function move(id, delta) {
  if (attempt(() => store.moveGrade(id, delta))) renderGrades();
}
