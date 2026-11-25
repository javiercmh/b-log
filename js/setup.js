// setup.js — the Setup screen: a list of rows (this gym, all gyms, app) that each open a sub-page.
// Sub-pages: map & walls, difficulty colours, switching/uploading gyms, hold colours, app settings.

import * as store from './store.js';
import { createMap, renderMapLegend } from './map.js';
import { $, h, toast, attempt, applyTheme } from './dom.js';
import { save, share } from './bridge.js';
import { BUILT_IN_GYMS } from './gyms.js';

const PAGES = {
  walls: { title: 'Map & walls', context: 'gym' },
  grades: { title: 'Difficulty colours', context: 'gym' },
  gyms: { title: 'Switch or upload gym', context: 'gym' },
  holds: { title: 'Hold colours', context: 'All gyms' },
  app: { title: 'App settings', context: '' }
};
const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };

let map = null;
let page = null;   // null = the list

export function init() {
  map = createMap($('setup-map'), null);

  for (const row of document.querySelectorAll('#setup-home .set-row')) row.onclick = () => openPage(row.dataset.page);
  $('setup-back').onclick = () => openPage(null);

  $('gym-name').onchange = (e) => {
    if (attempt(() => store.setGymName(e.target.value))) render();
  };
  $('gym-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  $('layout-upload').onclick = () => {
    const input = $('layout-file');
    input.value = '';   // choosing the same file again must still fire `change`
    input.click();
  };
  $('layout-file').onchange = uploadLayout;
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

  for (const btn of document.querySelectorAll('[data-theme-choice]')) {
    btn.onclick = () => {
      if (!attempt(() => store.setTheme(btn.dataset.themeChoice))) return;
      applyTheme(store.settings.theme);
      render();
    };
  }
}

/** Opens a sub-page by name, or the list with null. Opening the Setup tab always shows the list. */
export function openPage(name) {
  page = name && PAGES[name] ? name : null;
  $('setup-home').hidden = page !== null;
  $('setup-page').hidden = page === null;
  for (const card of document.querySelectorAll('#setup-page [data-page]')) card.hidden = card.dataset.page !== page;
  if (page) {
    $('sub-title').textContent = PAGES[page].title;
    const ctx = PAGES[page].context;
    $('sub-context').textContent = ctx === 'gym' ? (store.gym.name || 'Your gym') : ctx;
  }
  render();
  window.scrollTo(0, 0);
}

// --- Layout updates ---

/** A newer revision of the built-in gym in use, or null. */
export function pendingUpdate() {
  return store.layoutUpdate(BUILT_IN_GYMS);
}

function updateText(u) {
  const parts = [];
  if (u.added) parts.push(`${u.added} new wall${u.added === 1 ? '' : 's'}`);
  if (u.reshaped) parts.push(`${u.reshaped} reshaped`);
  if (u.removed) parts.push(`${u.removed} removed`);
  return parts.length ? parts.join(' · ') : 'Your walls and history are kept';
}

function renderUpdate() {
  const u = pendingUpdate();
  $('update-slot').replaceChildren(...(u ? [h('div', { class: 'update-banner' },
    h('span', { class: 'ub-icon', 'aria-hidden': 'true', text: '↻' }),
    h('span', { class: 'ub-text' }, h('b', { text: `New ${u.layout.name} layout` }), h('span', { text: updateText(u) })),
    h('button', { class: 'btn primary sm', text: 'Update', onclick: () => loadLayout(JSON.stringify(u.layout)) }))] : []));
  document.querySelector('.tab[data-pane="setup"]').classList.toggle('has-dot', Boolean(u));
}

// --- Layout files ---

/** File name from the gym name: "Rocktown" → rocktown-b-log-layout.json. */
function layoutName() {
  const slug = (store.gym.name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
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
  let r = null;
  if (!attempt(() => { r = store.importLayout(layout); })) return;
  render();
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const parts = [];
  if (r.kept) {
    if (r.added) parts.push(`${n(r.added, 'new wall')}`);
    if (r.reshaped) parts.push(`${r.reshaped} reshaped`);
  } else if (r.added) {
    parts.push(n(r.added, 'wall'));
  }
  if (r.retired) parts.push(`${n(r.retired, 'old wall')} kept for your history`);
  const name = layout.name || 'Layout';
  toast(`${r.kept ? `${name} updated` : `${name} loaded`}${parts.length ? ` · ${parts.join(' · ')}` : ''}`, 'Undo', () => {
    if (attempt(() => store.restoreLayout(r.previous))) render();
  });
}

// --- Rendering ---

const strip = (list) => h('span', { class: 'strip', 'aria-hidden': 'true' },
  ...list.map((c) => h('i', { style: `background:${c.color}` })));

export function render() {
  const walls = store.activeWalls();
  if (document.activeElement !== $('gym-name')) $('gym-name').value = store.gym.name || '';
  $('gym-meta').textContent = `${walls.length} wall${walls.length === 1 ? '' : 's'} · ${store.gym.grades.length} difficulty colours`;
  $('row-walls').textContent = `${walls.length} walls · ${store.gym.cols} × ${store.gym.rows} grid`;
  $('row-grades').replaceChildren(h('span', { class: 'strip-scale' },
    h('span', { text: 'Easy' }), strip(store.gym.grades), h('span', { text: 'Hard' })));
  $('row-grades').setAttribute('aria-label', `Easiest to hardest: ${store.gym.grades.map((g) => g.name).join(', ')}`);
  $('row-holds').replaceChildren(strip(store.colours('holds')));
  $('row-holds').setAttribute('aria-label', store.colours('holds').map((c) => c.name).join(', '));
  $('row-app').textContent = `Appearance: ${THEME_LABEL[store.settings.theme]}`;
  renderUpdate();

  if (page === 'walls') {
    map.render({
      cols: store.gym.cols, rows: store.gym.rows, outline: store.gym.outline, zones: store.gym.zones,
      walls, pins: [], label: 'Gym map preview'
    });
    renderMapLegend($('setup-legend'), { walls, zones: store.gym.zones });
  }
  if (page === 'gyms') renderBuiltIns();
  if (page === 'grades') renderColours('grades');
  if (page === 'holds') renderColours('holds');
  if (page === 'app') {
    for (const btn of document.querySelectorAll('[data-theme-choice]')) {
      const on = btn.dataset.themeChoice === store.settings.theme;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', String(on));
    }
  }
}

function renderBuiltIns() {
  const update = pendingUpdate();
  $('builtin-gyms').replaceChildren(...BUILT_IN_GYMS.map((g) => {
    const inUse = store.gym.source ? store.gym.source.id === g.id : store.gym.name === g.name;
    const outdated = inUse && update && update.layout.id === g.id;
    return h('li', {},
      h('span', {}, h('span', { class: 'name', text: g.name }), ' ',
        h('span', { class: 'muted', text: `${g.walls.length ? `${g.walls.length} walls` : 'outline'}` })),
      inUse && !outdated
        ? h('span', { class: 'chip chip-ok', text: '✓ In use' })
        : h('button', {
          class: outdated ? 'btn primary' : 'btn ghost',
          text: outdated ? 'Update' : 'Load',
          'aria-label': `${outdated ? 'Update' : 'Load'} ${g.name}`,
          onclick: () => loadLayout(JSON.stringify(g))
        }));
  }));
}

// --- Colour lists (drag to reorder) ---

const LISTS = {
  // Grades are stored easiest → hardest in store.js, but shown hardest → easiest in Setup
  // (hardest at the top, like most gym boards).
  grades: { list: 'grade-list', add: 'grade-add', reverse: true },
  holds: { list: 'hold-list', add: 'hold-add', reverse: false }
};

/** Moves a colour shown at display position `from` to display position `to`. */
function moveShown(kind, id, to) {
  const n = store.colours(kind).length;
  const index = LISTS[kind].reverse ? n - 1 - to : to;
  return attempt(() => store.moveColourTo(kind, id, index));
}

function renderColours(kind) {
  const { list, reverse } = LISTS[kind];
  const items = reverse ? [...store.colours(kind)].reverse() : store.colours(kind);
  $(list).replaceChildren(...items.map((c, i) => {
    const used = store.colourSendCount(kind, c.id);
    const handle = h('button', {
      type: 'button',
      class: 'drag-handle',
      'aria-label': `Reorder ${c.name}. Drag, or use the arrow keys.`,
      onkeydown: (e) => {
        const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
        if (to === null || to < 0 || to >= items.length) return;
        e.preventDefault();
        if (moveShown(kind, c.id, to)) {
          renderColours(kind);
          $(list).children[to]?.querySelector('.drag-handle')?.focus();
        }
      }
    }, ...Array.from({ length: 6 }, () => h('i')));
    const li = h('li', { class: 'drag-item' },
      handle,
      h('input', {
        type: 'color',
        value: c.color,
        'aria-label': `${c.name} colour`,
        onchange: (e) => { if (attempt(() => store.updateColour(kind, c.id, { color: e.target.value }))) render(); }
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
      h('button', {
        class: 'icon-btn',
        'aria-label': `Delete ${c.name}`,
        title: used ? 'Used by logged boulders' : 'Delete',
        disabled: used > 0,
        text: '✕',
        onclick: () => { if (attempt(() => store.removeColour(kind, c.id))) renderColours(kind); }
      }));
    handle.addEventListener('pointerdown', (e) => startDrag(e, kind, li, c.id));
    return li;
  }));
}

/** Drags a row by its handle; the other rows slide out of the way and the order is saved on release. */
function startDrag(e, kind, li, id) {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const rows = [...li.parentElement.children];
  const from = rows.indexOf(li);
  const step = li.getBoundingClientRect().height + 4;
  const y0 = e.clientY;
  let to = from;
  li.classList.add('dragging');
  li.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dy = ev.clientY - y0;
    li.style.transform = `translateY(${dy}px)`;
    to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / step)));
    rows.forEach((r, i) => {
      if (r === li) return;
      const shift = from < to && i > from && i <= to ? -step : from > to && i < from && i >= to ? step : 0;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const end = () => {
    li.removeEventListener('pointermove', move);
    li.removeEventListener('pointerup', end);
    li.removeEventListener('pointercancel', end);
    if (to !== from) moveShown(kind, id, to);
    renderColours(kind);
    render();
  };
  li.addEventListener('pointermove', move);
  li.addEventListener('pointerup', end);
  li.addEventListener('pointercancel', end);
}
