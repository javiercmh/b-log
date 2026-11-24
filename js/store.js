// store.js — persistence for the gym layout, grades, sends and settings.
// Talks to bridge.js; never touches the DOM. Every mutation builds the next state, writes it,
// and only then publishes it, so a failed write leaves both the file and memory unchanged.

import * as bridge from './bridge.js';
import { RESULTS } from './stats.js';

export const FILES = {
  gym: 'data/gym.json',
  sends: 'data/sends.json',
  settings: 'data/settings.json'
};

export const DEFAULT_GYM = {
  version: 1,
  cols: 12,
  rows: 16,
  walls: [],
  grades: [
    { id: 'g_yellow', name: 'Yellow', color: '#facc15' },
    { id: 'g_green', name: 'Green', color: '#22c55e' },
    { id: 'g_blue', name: 'Blue', color: '#3b82f6' },
    { id: 'g_red', name: 'Red', color: '#ef4444' },
    { id: 'g_black', name: 'Black', color: '#1f2937' }
  ]
};

export const DEFAULT_SETTINGS = { version: 1, selectedGradeId: null };

export const MIN_GRID = 4;
export const MAX_GRID = 40;

export let gym = structuredClone(DEFAULT_GYM);
export let sends = [];
export let settings = { ...DEFAULT_SETTINGS };

/** Files that exist but could not be parsed. They are never overwritten. */
export const corrupt = new Set();

// --- Loading & validation ---

function readJson(path) {
  const raw = bridge.readFile(path);
  if (!raw || !raw.trim()) return { missing: true };
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    console.error(`[store] ${path} is not valid JSON:`, err);
    return { error: true };
  }
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export function validGym(g) {
  if (!g || typeof g !== 'object') return false;
  if (!Number.isInteger(g.cols) || !Number.isInteger(g.rows)) return false;
  if (!Array.isArray(g.walls) || !Array.isArray(g.grades)) return false;
  const wallsOk = g.walls.every((w) => typeof w.id === 'string' && typeof w.name === 'string'
    && Array.isArray(w.points) && w.points.length >= 1
    && w.points.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1])));
  const gradesOk = g.grades.every((gr) => typeof gr.id === 'string' && typeof gr.name === 'string' && isColor(gr.color));
  return wallsOk && gradesOk;
}

export function validSend(s) {
  return s && typeof s.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
    && typeof s.gradeId === 'string' && typeof s.wallId === 'string'
    && isNum(s.x) && isNum(s.y) && RESULTS.includes(s.result);
}

export function load() {
  corrupt.clear();

  const g = readJson(FILES.gym);
  if (g.missing) gym = structuredClone(DEFAULT_GYM);
  else if (g.value && validGym(g.value)) gym = g.value;
  else corrupt.add(FILES.gym);

  const s = readJson(FILES.sends);
  if (s.missing) sends = [];
  else if (Array.isArray(s.value) && s.value.every(validSend)) sends = s.value;
  else corrupt.add(FILES.sends);

  const st = readJson(FILES.settings);
  if (st.missing) settings = { ...DEFAULT_SETTINGS };
  else if (st.value && typeof st.value === 'object') settings = { ...DEFAULT_SETTINGS, ...st.value };
  else corrupt.add(FILES.settings);
}

function write(path, value) {
  if (corrupt.has(path)) {
    throw new Error(`${path} is damaged, so B-log will not overwrite it. Fix or delete it in the editor.`);
  }
  if (!bridge.writeFile(path, JSON.stringify(value, null, 2))) {
    throw new Error('Could not save. Your previous data is unchanged.');
  }
}

function commitGym(next) { write(FILES.gym, next); gym = next; }
function commitSends(next) { write(FILES.sends, next); sends = next; }

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// --- Lookups ---

export function grade(id) { return gym.grades.find((g) => g.id === id) || null; }
export function wall(id) { return gym.walls.find((w) => w.id === id) || null; }
export function sendsOn(date) { return sends.filter((s) => s.date === date); }

export function selectedGrade() {
  return grade(settings.selectedGradeId) || gym.grades[0] || null;
}

// --- Settings ---

export function selectGrade(id) {
  const next = { ...settings, selectedGradeId: id };
  write(FILES.settings, next);
  settings = next;
}

// --- Sends ---

export function addSend({ date, gradeId, wallId, x, y, result }) {
  const send = { id: uid('s'), date, gradeId, wallId, x, y, result, createdAt: Date.now() };
  commitSends([...sends, send]);
  return send;
}

export function updateSend(id, patch) {
  commitSends(sends.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

/** Removes a send and returns it with its index so it can be restored by Undo. */
export function removeSend(id) {
  const index = sends.findIndex((s) => s.id === id);
  if (index === -1) return null;
  const removed = sends[index];
  commitSends(sends.filter((s) => s.id !== id));
  return { send: removed, index };
}

export function restoreSend(send, index) {
  const next = [...sends];
  next.splice(index, 0, send);
  commitSends(next);
}

// --- Walls ---

export function addWall(name, points) {
  const w = { id: uid('w'), name, points };
  commitGym({ ...gym, walls: [...gym.walls, w] });
  return w;
}

export function renameWall(id, name) {
  commitGym({ ...gym, walls: gym.walls.map((w) => (w.id === id ? { ...w, name } : w)) });
}

export function wallSendCount(id) { return sends.filter((s) => s.wallId === id).length; }

/** A wall with logged sends cannot be deleted: its pins would lose their place. */
export function removeWall(id) {
  if (wallSendCount(id) > 0) throw new Error('This wall has logged sends, so it cannot be deleted.');
  commitGym({ ...gym, walls: gym.walls.filter((w) => w.id !== id) });
}

/** Replaces the wall list wholesale; used by Undo after a delete. */
export function restoreWalls(walls) {
  commitGym({ ...gym, walls });
}

export function resizeGrid(cols, rows) {
  commitGym({ ...gym, cols, rows });
}

// --- Grades ---

export function addGrade(name, color) {
  const g = { id: uid('g'), name, color };
  commitGym({ ...gym, grades: [...gym.grades, g] });
  return g;
}

export function updateGrade(id, patch) {
  commitGym({ ...gym, grades: gym.grades.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
}

export function moveGrade(id, delta) {
  const list = [...gym.grades];
  const i = list.findIndex((g) => g.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  commitGym({ ...gym, grades: list });
}

export function gradeSendCount(id) { return sends.filter((s) => s.gradeId === id).length; }

export function removeGrade(id) {
  if (gradeSendCount(id) > 0) throw new Error('This colour has logged sends, so it cannot be deleted.');
  commitGym({ ...gym, grades: gym.grades.filter((g) => g.id !== id) });
}
