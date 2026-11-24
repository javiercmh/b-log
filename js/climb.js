// climb.js — the Climb screen: day switcher, colour palette, map logging and the day summary.

import * as store from './store.js';
import { createMap, PIN_R } from './map.js';
import { snapToWall, nearestPoint, wallExtent } from './geometry.js';
import { gradeCounts, localIso, addDays, parseIso } from './stats.js';
import { $, h, toast, attempt, swatch } from './dom.js';

const SNAP_DIST = 1.1;   // grid units: how far from a wall a tap still counts
const PIN_HIT = PIN_R + 0.35;
const RESULT_WORD = { flash: 'flashed', sent: 'sent', tried: 'tried' };

let day = localIso();
let followToday = true;  // keeps showing "today" when the app is reopened on a later day
let map = null;
let sheet = null;        // { mode: 'log', spot } | { mode: 'edit', send, gradeId, result }

export function init() {
  map = createMap($('climb-map'), handleTap);

  $('day-prev').onclick = () => setDay(addDays(day, -1));
  $('day-next').onclick = () => setDay(addDays(day, 1));
  $('day-input').onchange = (e) => { if (e.target.value) setDay(e.target.value); };

  const dialog = $('sheet');
  dialog.addEventListener('close', () => { sheet = null; render(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  $('sheet-results').addEventListener('click', (e) => {
    const btn = e.target.closest('.result');
    if (btn) chooseResult(btn.dataset.result);
  });
  $('sheet-save').onclick = saveEdit;
  $('sheet-delete').onclick = deleteEdit;
}

/** Called when the app becomes visible again: roll over to the new day if we were on today. */
export function refreshToday() {
  const today = localIso();
  if (followToday && day !== today) { day = today; render(); }
}

function setDay(iso) {
  const today = localIso();
  day = iso > today ? today : iso;
  followToday = day === today;
  render();
}

function dayLabel(iso) {
  const today = localIso();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return parseIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function render() {
  const today = localIso();
  $('day-text').textContent = dayLabel(day);
  $('day-input').value = day;
  $('day-input').max = today;
  $('day-next').disabled = day >= today;

  const dayWalls = store.wallsOn(day);
  const hasWalls = dayWalls.length > 0 || store.activeWalls().length > 0;
  $('climb-empty').hidden = hasWalls;
  $('climb-main').hidden = !hasWalls;
  if (!hasWalls) {
    const outline = Boolean(store.gym.outline);
    $('climb-empty-title').textContent = outline ? 'Now add the walls' : 'Draw your gym first';
    $('climb-empty-text').textContent = outline
      ? 'The building outline is ready. Draw the climbing walls in Setup with + Wall, then tap a wall here to log a boulder.'
      : 'Add the walls of your gym in Setup. Then tap a wall here to log a boulder.';
    return;
  }

  const selected = store.selectedGrade();
  $('palette').replaceChildren(...store.gym.grades.map((g) =>
    swatch(g, selected && g.id === selected.id, () => {
      if (attempt(() => store.selectGrade(g.id))) render();
    })));
  $('hint-grade').textContent = selected ? selected.name.toLowerCase() : '…';

  const daySends = store.sendsOn(day);
  // Walls of an older layout can reach past the current grid.
  const ext = wallExtent([...dayWalls, { points: store.gym.outline || [] }]);
  map.render({
    cols: Math.max(store.gym.cols, ext.cols),
    rows: Math.max(store.gym.rows, ext.rows),
    outline: store.gym.outline,
    walls: dayWalls,
    pins: daySends.map((s) => ({
      x: s.x,
      y: s.y,
      result: s.result,
      ring: store.grade(s.gradeId)?.color || '#888888',
      fill: store.hold(s.holdId)?.color || null
    })),
    preview: sheet?.mode === 'log'
      ? { ...sheet.spot, ring: sheet.grade.color, fill: store.hold(sheet.holdId)?.color || null }
      : null,
    label: `Gym map with ${daySends.length} logged boulders`
  });

  renderSummary(daySends);
}

function renderSummary(daySends) {
  $('summary-title').textContent = dayLabel(day);
  const rows = gradeCounts(daySends, store.gym.grades);
  if (!rows.length) {
    $('summary').replaceChildren(h('p', { class: 'muted', text: 'Nothing logged on this day yet.' }));
    return;
  }
  const num = (n) => h('span', { class: n ? 'n' : 'n zero', text: String(n) });
  const head = h('div', { class: 'sum-row head' }, h('span'), h('span'),
    h('span', { class: 'n', title: 'Flash' }, h('i', { class: 'sym sym-flash' })),
    h('span', { class: 'n', title: 'Sent' }, h('i', { class: 'sym sym-sent' })),
    h('span', { class: 'n', title: 'Tried' }, h('i', { class: 'sym sym-tried' })));
  const lines = rows.map((r) => h('div', { class: 'sum-row' },
    h('span', { class: 'dot', style: `background:${r.grade.color}` }),
    h('span', { class: 'name', text: r.grade.name }),
    num(r.flash), num(r.sent), num(r.tried)));
  const tops = rows.reduce((a, r) => a + r.flash + r.sent, 0);
  const tried = rows.reduce((a, r) => a + r.tried, 0);
  const total = h('div', { class: 'sum-row total' }, h('span'),
    h('span', { text: `${tops} top${tops === 1 ? '' : 's'}` }),
    num(rows.reduce((a, r) => a + r.flash, 0)), num(rows.reduce((a, r) => a + r.sent, 0)), num(tried));
  $('summary').replaceChildren(head, ...lines, total);
}

// --- Tapping the map ---

function handleTap(p) {
  if (sheet) return;
  const daySends = store.sendsOn(day);
  const pin = nearestPoint(p, [...daySends].reverse(), PIN_HIT);
  if (pin) { openEdit(pin); return; }

  const spot = snapToWall(p, store.wallsOn(day), SNAP_DIST);
  if (!spot) { toast('Tap closer to a wall.'); return; }
  const grade = store.selectedGrade();
  if (!grade) { toast('Add a colour in Setup first.'); return; }
  openLog(spot, grade);
}

function openLog(spot, grade) {
  sheet = { mode: 'log', spot, grade, holdId: null };
  $('sheet-title').textContent = `${grade.name} on ${store.wall(spot.wallId)?.name || 'wall'}`;
  $('sheet-grade-block').hidden = true;
  $('sheet-edit-actions').hidden = true;
  renderSheetColours();
  setPressed(null);
  $('sheet').showModal();
  render();
}

function openEdit(send) {
  sheet = { mode: 'edit', send, gradeId: send.gradeId, holdId: send.holdId || null, result: send.result };
  $('sheet-title').textContent = `Edit · ${store.wall(send.wallId)?.name || 'wall'}`;
  $('sheet-grade-block').hidden = false;
  $('sheet-edit-actions').hidden = false;
  renderSheetColours();
  setPressed(send.result);
  $('sheet').showModal();
}

/** Difficulty swatches (edit only) and hold swatches. Tapping the chosen hold again clears it. */
function renderSheetColours() {
  if (sheet.mode === 'edit') {
    $('sheet-colors').replaceChildren(...store.gym.grades.map((g) =>
      swatch(g, g.id === sheet.gradeId, () => { sheet.gradeId = g.id; renderSheetColours(); })));
  }
  $('sheet-holds').replaceChildren(...store.gym.holds.map((c) =>
    swatch(c, c.id === sheet.holdId, () => {
      sheet.holdId = sheet.holdId === c.id ? null : c.id;
      renderSheetColours();
      if (sheet.mode === 'log') render();
    })));
}

function setPressed(result) {
  for (const b of $('sheet-results').querySelectorAll('.result')) {
    b.setAttribute('aria-pressed', String(b.dataset.result === result));
  }
}

function chooseResult(result) {
  if (!sheet) return;
  if (sheet.mode === 'edit') { sheet.result = result; setPressed(result); return; }

  const { spot, grade, holdId } = sheet;
  let send = null;
  const ok = attempt(() => {
    send = store.addSend({ date: day, gradeId: grade.id, holdId, wallId: spot.wallId, x: spot.x, y: spot.y, result });
  });
  $('sheet').close();
  if (!ok) return;
  const holds = store.hold(holdId);
  toast(`${grade.name} ${RESULT_WORD[result]}${holds ? ` · ${holds.name.toLowerCase()} holds` : ''}`, 'Undo', () => {
    if (attempt(() => store.removeSend(send.id))) render();
  });
}

function saveEdit() {
  const { send, gradeId, holdId, result } = sheet;
  attempt(() => store.updateSend(send.id, { gradeId, holdId, result }));
  $('sheet').close();
}

function deleteEdit() {
  let removed = null;
  const ok = attempt(() => { removed = store.removeSend(sheet.send.id); });
  $('sheet').close();
  if (!ok || !removed) return;
  toast('Boulder deleted', 'Undo', () => {
    if (attempt(() => store.restoreSend(removed.send, removed.index))) render();
  });
}
