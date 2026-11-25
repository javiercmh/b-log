// store.js — persistence for the gym layout, grades, sends and settings (incl. hold colours).
// Talks to bridge.js; never touches the DOM. Every mutation builds the next state, writes it,
// and only then publishes it, so a failed write leaves both the file and memory unchanged.

import * as bridge from './bridge.js';
import { RESULTS, localIso } from './stats.js';

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

/**
 * Common hold colours; the user can edit the list in Setup. Hold colours are an input method,
 * the same at every gym, so they live in settings.json, never in a gym file.
 */
function defaultHolds() {
  return [
    ['red', 'Red', '#dc2626'], ['orange', 'Orange', '#f97316'], ['yellow', 'Yellow', '#facc15'],
    ['green', 'Green', '#16a34a'], ['turquoise', 'Turquoise', '#14b8a6'], ['blue', 'Blue', '#2563eb'],
    ['purple', 'Purple', '#9333ea'], ['pink', 'Pink', '#ec4899'], ['black', 'Black', '#111111'],
    ['white', 'White', '#f8fafc'], ['grey', 'Grey', '#9ca3af'], ['brown', 'Brown', '#92400e']
  ].map(([id, name, color]) => ({ id: `h_${id}`, name, color }));
}

export const THEMES = ['system', 'light', 'dark'];
export const DEFAULT_SETTINGS = { version: 1, selectedGradeId: null, theme: 'system', holds: defaultHolds() };

export const MIN_GRID = 4;
export const MAX_GRID = 100;

export let gym = structuredClone(DEFAULT_GYM);
export let sends = [];
export let settings = structuredClone(DEFAULT_SETTINGS);

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
const isPoint = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const ZONE_KINDS = new Set(['mat', 'walkway', 'area', 'floor']);
const colourOk = (c) => c && typeof c.id === 'string' && typeof c.name === 'string' && isColor(c.color);
const colourListOk = (list) => Array.isArray(list) && list.every(colourOk);

function validZone(z) {
  return z && typeof z === 'object' && ZONE_KINDS.has(z.kind)
    && Array.isArray(z.points) && z.points.length >= 3 && z.points.every(isPoint)
    && (z.label === undefined || z.label === null || typeof z.label === 'string')
    && (z.labelPos === undefined || z.labelPos === null || isPoint(z.labelPos))
    && (z.rotate === undefined || z.rotate === null || isNum(z.rotate))
    && (z.color === undefined || z.color === null || isColor(z.color));
}

export function validGym(g) {
  if (!g || typeof g !== 'object') return false;
  if (!Number.isInteger(g.cols) || !Number.isInteger(g.rows)) return false;
  if (!Array.isArray(g.walls) || !Array.isArray(g.grades)) return false;
  const wallsOk = g.walls.every((w) => typeof w.id === 'string' && typeof w.name === 'string'
    && Array.isArray(w.points) && w.points.length >= 1 && w.points.every(isPoint)
    && (w.code === undefined || w.code === null || typeof w.code === 'string')
    && (w.color === undefined || w.color === null || isColor(w.color))
    && (w.labelPos === undefined || w.labelPos === null || isPoint(w.labelPos)));
  // `holds` only appears in gym files written before hold colours moved to settings.json.
  const holdsOk = g.holds === undefined || colourListOk(g.holds);
  const outlineOk = g.outline === undefined || g.outline === null || (Array.isArray(g.outline)
    && g.outline.every(isPoint));
  const zonesOk = g.zones === undefined || g.zones === null || (Array.isArray(g.zones) && g.zones.every(validZone));
  const nameOk = g.name === undefined || g.name === null || typeof g.name === 'string';
  const sourceOk = g.source === undefined || g.source === null || validSource(g.source);
  return wallsOk && g.grades.every(colourOk) && holdsOk && outlineOk && zonesOk && nameOk && sourceOk;
}

/** Which built-in gym (and which revision of it) the current layout was loaded from. */
function validSource(s) {
  return s && typeof s === 'object' && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 40
    && Number.isInteger(s.revision) && s.revision >= 1;
}

export function validSend(s) {
  return s && typeof s.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
    && typeof s.gradeId === 'string' && typeof s.wallId === 'string'
    && isNum(s.x) && isNum(s.y) && RESULTS.includes(s.result)
    && (s.holdId === undefined || s.holdId === null || typeof s.holdId === 'string');
}

export function load() {
  corrupt.clear();

  const g = readJson(FILES.gym);
  let legacyHolds = null;
  if (g.missing) gym = structuredClone(DEFAULT_GYM);
  else if (g.value && validGym(g.value)) {
    const { holds, ...rest } = g.value;
    gym = rest;
    legacyHolds = holds || null;
  } else corrupt.add(FILES.gym);

  const s = readJson(FILES.sends);
  if (s.missing) sends = [];
  else if (Array.isArray(s.value) && s.value.every(validSend)) sends = s.value;
  else corrupt.add(FILES.sends);

  const st = readJson(FILES.settings);
  let savedHolds = false;
  if (st.missing) settings = structuredClone(DEFAULT_SETTINGS);
  else if (st.value && typeof st.value === 'object' && (st.value.holds === undefined || colourListOk(st.value.holds))) {
    settings = { ...structuredClone(DEFAULT_SETTINGS), ...st.value };
    savedHolds = st.value.holds !== undefined;
  } else corrupt.add(FILES.settings);
  if (!THEMES.includes(settings.theme)) settings = { ...settings, theme: 'system' };

  // Before v0.8 hold colours lived in gym.json. Move them to settings.json once (settings first,
  // so a failed write never loses them), keeping their ids so logged boulders still match.
  if (legacyHolds && !savedHolds) {
    settings = { ...settings, holds: legacyHolds };
    let moved = false;
    try {
      write(FILES.settings, settings);
      moved = true;
      write(FILES.gym, gym);
    } catch (err) {
      console.error('[store] could not move hold colours to settings.json:', err);
      // Until settings.json can take them, keep them in gym.json so later gym writes don't drop them.
      if (!moved) gym = { ...gym, holds: legacyHolds };
    }
  }
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
function commitSettings(next) { write(FILES.settings, next); settings = next; }
function commitSends(next) { write(FILES.sends, next); sends = next; }

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// --- Lookups ---

export function grade(id) { return gym.grades.find((g) => g.id === id) || null; }
export function hold(id) { return (id && settings.holds.find((h) => h.id === id)) || null; }
export function wall(id) { return gym.walls.find((w) => w.id === id) || null; }
export function sendsOn(date) { return sends.filter((s) => s.date === date); }

export function selectedGrade() {
  return grade(settings.selectedGradeId) || gym.grades[0] || null;
}

// --- Settings ---

export function selectGrade(id) {
  commitSettings({ ...settings, selectedGradeId: id });
}

/** 'system' follows the phone; 'light' and 'dark' override it. */
export function setTheme(theme) {
  if (!THEMES.includes(theme)) throw new Error('Unknown theme.');
  commitSettings({ ...settings, theme });
}

// --- Sends ---

export function addSend({ date, gradeId, holdId = null, wallId, x, y, result }) {
  const send = { id: uid('s'), date, gradeId, holdId, wallId, x, y, result, createdAt: Date.now() };
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
//
// A wall can carry two optional local dates. `removedOn` retires it: it leaves the current map,
// but its logged boulders keep their place and older days still show it. `addedOn` hides a wall
// on days before it existed; it is only set once the gym has retired walls (a new layout), so a
// first setup can still be used to log earlier days.

const isRetired = (w) => Boolean(w.removedOn);

/** Walls of the current layout. */
export function activeWalls() { return gym.walls.filter((w) => !isRetired(w)); }

/** Walls that stood on `date`, plus any wall with a boulder logged that day. */
export function wallsOn(date) {
  const used = new Set(sendsOn(date).map((s) => s.wallId));
  return gym.walls.filter((w) => used.has(w.id)
    || (!(w.addedOn && w.addedOn > date) && !(w.removedOn && w.removedOn <= date)));
}

function newWallDates() {
  return gym.walls.some(isRetired) ? { addedOn: localIso() } : {};
}

export function addWall(name, points) {
  const w = { id: uid('w'), name, points, ...newWallDates() };
  commitGym({ ...gym, walls: [...gym.walls, w] });
  return w;
}

export function renameWall(id, name) {
  commitGym({ ...gym, walls: gym.walls.map((w) => (w.id === id ? { ...w, name } : w)) });
}

export function wallSendCount(id) { return sends.filter((s) => s.wallId === id).length; }

/**
 * Removes a wall from the map. A wall with logged boulders is retired instead of deleted, so
 * its pins keep their place in the history. Returns the previous wall list for Undo.
 */
export function removeWall(id) {
  const previous = gym.walls;
  const walls = wallSendCount(id) > 0
    ? gym.walls.map((w) => (w.id === id ? { ...w, removedOn: localIso() } : w))
    : gym.walls.filter((w) => w.id !== id);
  commitGym({ ...gym, walls });
  return previous;
}

/** Replaces the wall list wholesale; used by Undo after a delete. */
export function restoreWalls(walls) {
  commitGym({ ...gym, walls });
}

// --- Gym name ---

export const MAX_GYM_NAME = 60;

export function setGymName(name) {
  const clean = String(name || '').trim().slice(0, MAX_GYM_NAME);
  commitGym({ ...gym, name: clean || null });
}

// --- Building outline: a closed polygon drawn under the walls; boulders cannot be logged on it ---

/** Sets (points, at least 3) or clears (null) the outline. Returns the previous one for Undo. */
export function setOutline(points) {
  const previous = gym.outline || null;
  commitGym({ ...gym, outline: points && points.length >= 3 ? points : null });
  return previous;
}

// --- Layout files: the grid and the current walls, to share with other climbers ---

export const LAYOUT_FORMAT = 'b-log-layout';
const MAX_LAYOUT_WALLS = 200;
const MAX_WALL_POINTS = 100;

/** The current layout as a shareable object (no ids, dates, colours or climbs). */
export function layoutFile() {
  return {
    format: LAYOUT_FORMAT,
    version: 1,
    ...(gym.name ? { name: gym.name } : {}),
    cols: gym.cols,
    rows: gym.rows,
    ...(gym.outline ? { outline: gym.outline } : {}),
    ...(gym.zones && gym.zones.length ? { zones: gym.zones } : {}),
    ...(gym.grades && gym.grades.length
      ? { grades: gym.grades.map((g) => ({ name: g.name, color: g.color })) }
      : {}),
    walls: activeWalls().map((w) => ({
      ...(w.code ? { code: w.code } : {}),
      name: w.name,
      points: w.points,
      ...(w.color ? { color: w.color } : {}),
      ...(w.labelPos ? { labelPos: w.labelPos } : {})
    }))
  };
}

/**
 * Parses and validates a layout file. Also accepts a B-log `gym.json` (its current walls).
 * Throws an Error with a message for the user when the file cannot be used.
 */
export function parseLayout(text) {
  let v;
  try { v = JSON.parse(text); } catch { throw new Error('This file is not a B-log layout.'); }
  if (!v || typeof v !== 'object' || (v.format !== undefined && v.format !== LAYOUT_FORMAT)
    || !Array.isArray(v.walls)) {
    throw new Error('This file is not a B-log layout.');
  }
  const size = (n) => Number.isInteger(n) && n >= MIN_GRID && n <= MAX_GRID;
  if (!size(v.cols) || !size(v.rows)) {
    throw new Error(`The layout's grid must be between ${MIN_GRID} and ${MAX_GRID} units.`);
  }
  const walls = v.walls.filter((w) => w && !w.removedOn);
  const onGrid = (p) => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1])
    && p[0] >= 0 && p[0] <= v.cols && p[1] >= 0 && p[1] <= v.rows;
  const inBounds = (p) => isPoint(p) && p[0] >= 0 && p[0] <= v.cols && p[1] >= 0 && p[1] <= v.rows;
  let outline = null;
  if (v.outline !== undefined && v.outline !== null) {
    if (!Array.isArray(v.outline) || v.outline.length < 3 || v.outline.length > MAX_WALL_POINTS || !v.outline.every(onGrid)) {
      throw new Error("The building outline in this layout is broken.");
    }
    outline = v.outline.map(([x, y]) => [x, y]);
  }
  let zones = null;
  if (v.zones !== undefined && v.zones !== null) {
    if (!Array.isArray(v.zones) || v.zones.length > 100 || !v.zones.every((z) => validZone(z)
      && z.points.length <= MAX_WALL_POINTS && z.points.every(inBounds)
      && (!z.labelPos || inBounds(z.labelPos)))) {
      throw new Error('The floor zones in this layout are broken.');
    }
    if (v.zones.length) {
      zones = v.zones.map((z) => ({
        kind: z.kind,
        points: z.points.map(([x, y]) => [x, y]),
        ...(typeof z.label === 'string' && z.label.trim() ? { label: z.label.trim().slice(0, 40) } : {}),
        ...(z.labelPos ? { labelPos: [z.labelPos[0], z.labelPos[1]] } : {}),
        ...(isNum(z.rotate) ? { rotate: z.rotate } : {}),
        ...(z.color ? { color: z.color } : {})
      }));
    }
  }
  let grades = null;
  if (v.grades !== undefined && v.grades !== null) {
    if (!Array.isArray(v.grades) || v.grades.length > 30 || !v.grades.every((g) => g && typeof g === 'object'
      && typeof g.name === 'string' && g.name.trim() && isColor(g.color))) {
      throw new Error('The difficulty colours in this layout are broken.');
    }
    if (v.grades.length) {
      grades = v.grades.map((g) => ({ name: g.name.trim().slice(0, 24), color: g.color }));
    }
  }
  if (!walls.length && !outline) throw new Error('This layout has no walls.');
  if (walls.length > MAX_LAYOUT_WALLS) throw new Error(`A layout can have at most ${MAX_LAYOUT_WALLS} walls.`);
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, MAX_GYM_NAME) : null;
  // Built-in gyms carry an id and a revision so B-log can offer their updates.
  const source = validSource({ id: v.id, revision: v.revision }) ? { id: v.id, revision: v.revision } : null;
  return {
    name,
    ...(source ? { source } : {}),
    cols: v.cols,
    rows: v.rows,
    outline,
    ...(zones ? { zones } : {}),
    ...(grades ? { grades } : {}),
    walls: walls.map((w, i) => {
      if (!Array.isArray(w.points) || !w.points.length || w.points.length > MAX_WALL_POINTS || !w.points.every(onGrid)
        || (w.code !== undefined && w.code !== null && typeof w.code !== 'string')
        || (w.color !== undefined && w.color !== null && !isColor(w.color))
        || (w.labelPos !== undefined && w.labelPos !== null && !inBounds(w.labelPos))) {
        throw new Error(`Wall ${i + 1} in this layout is broken.`);
      }
      const wName = typeof w.name === 'string' && w.name.trim() ? w.name.trim().slice(0, 40) : `Wall ${i + 1}`;
      const wCode = typeof w.code === 'string' && w.code.trim() ? w.code.trim().slice(0, 8) : null;
      return {
        ...(wCode ? { code: wCode } : {}),
        name: wName,
        points: w.points.map(([x, y]) => [x, y]),
        ...(w.color ? { color: w.color } : {}),
        ...(w.labelPos ? { labelPos: [w.labelPos[0], w.labelPos[1]] } : {})
      };
    })
  };
}

/** A wall's identity across layout versions: its code (e.g. "W5"), else its name. */
const wallKey = (w) => (w.code || w.name).trim().toLowerCase();

/** True when a layout is a new version of the current gym rather than a different gym. */
function sameGym(layout) {
  if (layout.source && gym.source) return layout.source.id === gym.source.id;
  return Boolean(layout.name && gym.name && layout.name.toLowerCase() === gym.name.toLowerCase());
}

/**
 * Replaces the current layout (name, grid, outline, zones, walls, and optional grades) with a parsed one.
 * When the layout is a new version of the same gym, walls are matched by code (else name): a matched
 * wall keeps its id and history and only takes the new shape. Unmatched walls with logged boulders are
 * retired (kept for the history); unused ones are dropped.
 * When the layout includes grades, existing grade IDs matching by name are reused, and any unlisted
 * grades with logged boulders are kept so history stays intact. Returns the previous state for Undo.
 */
export function importLayout(layout) {
  const today = localIso();
  const previous = {
    name: gym.name || null,
    source: gym.source || null,
    cols: gym.cols,
    rows: gym.rows,
    walls: gym.walls,
    outline: gym.outline || null,
    zones: gym.zones || null,
    grades: gym.grades
  };
  const current = new Map(sameGym(layout) ? activeWalls().map((w) => [wallKey(w), w]) : []);
  const matched = new Set();
  let reshaped = 0;
  const pending = layout.walls.map((w) => {
    const match = current.get(wallKey(w));
    if (!match || matched.has(match.id)) return { w, match: null };
    matched.add(match.id);
    if (JSON.stringify(match.points) !== JSON.stringify(w.points)) reshaped++;
    return { w, match };
  });
  const retiring = activeWalls().filter((w) => !matched.has(w.id) && wallSendCount(w.id) > 0);
  const kept = gym.walls
    .filter((w) => isRetired(w) || retiring.includes(w))
    .map((w) => (isRetired(w) ? w : { ...w, removedOn: today }));
  const dates = kept.length ? { addedOn: today } : {};
  const stamp = uid('w');
  let added = 0;
  const walls = pending.map(({ w, match }, i) => {
    if (!match) added++;
    return {
      id: match ? match.id : `${stamp}${i}`,
      ...(w.code ? { code: w.code } : {}),
      name: w.name,
      points: w.points,
      ...(w.color ? { color: w.color } : {}),
      ...(w.labelPos ? { labelPos: w.labelPos } : {}),
      ...(match ? (match.addedOn ? { addedOn: match.addedOn } : {}) : dates)
    };
  });

  let nextGrades = gym.grades;
  if (layout.grades && layout.grades.length) {
    const existingByName = new Map(gym.grades.map((g) => [g.name.toLowerCase(), g]));
    const usedIds = new Set();
    const gStamp = uid('g');
    const mapped = layout.grades.map((g, i) => {
      const match = existingByName.get(g.name.toLowerCase());
      if (match && !usedIds.has(match.id)) {
        usedIds.add(match.id);
        return { id: match.id, name: g.name, color: g.color };
      }
      return { id: `${gStamp}${i}`, name: g.name, color: g.color };
    });
    const preserved = gym.grades.filter((g) => !usedIds.has(g.id) && colourSendCount('grades', g.id) > 0);
    nextGrades = [...mapped, ...preserved];
  }

  commitGym({
    ...gym,
    name: layout.name || null,
    source: layout.source || null,
    cols: layout.cols,
    rows: layout.rows,
    outline: layout.outline || null,
    zones: layout.zones || null,
    grades: nextGrades,
    walls: [...kept, ...walls]
  });
  return { previous, added, reshaped, kept: matched.size, retired: retiring.length };
}

/**
 * The built-in gym the current layout came from, when it has a newer revision.
 * Returns { layout, added, reshaped, removed } or null. A layout loaded before revisions existed
 * (no `source`) is matched by name and offered the update once.
 */
export function layoutUpdate(builtIns) {
  const src = gym.source
    ? builtIns.find((b) => b.id === gym.source.id)
    : builtIns.find((b) => b.name && gym.name && b.name.toLowerCase() === gym.name.toLowerCase());
  if (!src || !Number.isInteger(src.revision)) return null;
  if (gym.source && gym.source.revision >= src.revision) return null;
  const current = new Map(activeWalls().map((w) => [wallKey(w), w]));
  const keys = new Set(src.walls.map(wallKey));
  let added = 0;
  let reshaped = 0;
  for (const w of src.walls) {
    const match = current.get(wallKey(w));
    if (!match) added++;
    else if (JSON.stringify(match.points) !== JSON.stringify(w.points)) reshaped++;
  }
  const removed = [...current.keys()].filter((k) => !keys.has(k)).length;
  return { layout: src, added, reshaped, removed };
}

/** Undo of importLayout. Refused once boulders were logged on the uploaded walls. */
export function restoreLayout(previous) {
  const ids = new Set(previous.walls.map((w) => w.id));
  if (sends.some((s) => !ids.has(s.wallId))) {
    throw new Error('Boulders were already logged on the new walls, so the upload cannot be undone.');
  }
  commitGym({
    ...gym,
    name: previous.name,
    source: previous.source || null,
    cols: previous.cols,
    rows: previous.rows,
    walls: previous.walls,
    outline: previous.outline,
    zones: previous.zones || null,
    grades: previous.grades || gym.grades
  });
}

export function resizeGrid(cols, rows) {
  commitGym({ ...gym, cols, rows });
}

// --- Colour lists: 'grades' (the gym's, ordered easiest → hardest, in gym.json) and
// 'holds' (app-wide, in settings.json) ---

const SEND_KEY = { grades: 'gradeId', holds: 'holdId' };
const ID_PREFIX = { grades: 'g', holds: 'h' };

/** The current list of a kind: the gym's difficulty colours or the app's hold colours. */
export function colours(kind) {
  return kind === 'holds' ? settings.holds : gym.grades;
}

function commitColours(kind, list) {
  if (kind === 'holds') commitSettings({ ...settings, holds: list });
  else commitGym({ ...gym, grades: list });
}

export function addColour(kind, name, color) {
  const c = { id: uid(ID_PREFIX[kind]), name, color };
  commitColours(kind, [...colours(kind), c]);
  return c;
}

export function updateColour(kind, id, patch) {
  commitColours(kind, colours(kind).map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function moveColour(kind, id, delta) {
  const list = [...colours(kind)];
  const i = list.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  commitColours(kind, list);
}

/** Moves a colour to `index` in one write (drag to reorder). */
export function moveColourTo(kind, id, index) {
  const list = [...colours(kind)];
  const i = list.findIndex((c) => c.id === id);
  if (i === -1) return;
  const j = Math.max(0, Math.min(list.length - 1, index));
  if (i === j) return;
  const [c] = list.splice(i, 1);
  list.splice(j, 0, c);
  commitColours(kind, list);
}

export function colourSendCount(kind, id) {
  return sends.filter((s) => s[SEND_KEY[kind]] === id).length;
}

/** A colour used by logged boulders cannot be deleted; it can be renamed or recoloured. */
export function removeColour(kind, id) {
  if (colourSendCount(kind, id) > 0) throw new Error('This colour is used by logged boulders, so it cannot be deleted.');
  commitColours(kind, colours(kind).filter((c) => c.id !== id));
}
