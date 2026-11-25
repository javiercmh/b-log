import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory stand-in for the native bridge, installed before store.js loads bridge.js.
const files = new Map();
let failWrites = false;
globalThis.window = {
  AndroidStorage: {
    readFile: (name) => files.get(name) ?? '',
    writeFile: (name, text) => { if (failWrites) return false; files.set(name, text); return true; }
  }
};
const store = await import('../js/store.js');
const { localIso, addDays } = await import('../js/stats.js');

beforeEach(() => { files.clear(); failWrites = false; store.load(); });

test('missing files load defaults without writing anything', () => {
  assert.equal(store.gym.cols, 12);
  assert.equal(store.gym.grades.length, 5);
  assert.deepEqual(store.sends, []);
  assert.equal(files.size, 0);
});

test('sends round-trip through the file and reload identically', () => {
  const w = store.addWall('Slab', [[0, 0], [4, 0]]);
  store.addSend({ date: '2026-11-24', gradeId: 'g_red', wallId: w.id, x: 2, y: 0, result: 'flash' });
  const before = JSON.stringify(store.sends);
  store.load();
  assert.equal(JSON.stringify(store.sends), before);
  assert.equal(store.gym.walls[0].name, 'Slab');
  assert.equal(store.sendsOn('2026-11-24').length, 1);
});

test('a failed write leaves memory and file unchanged', () => {
  const w = store.addWall('Cave', [[0, 0], [0, 4]]);
  const saved = files.get(store.FILES.gym);
  failWrites = true;
  assert.throws(() => store.renameWall(w.id, 'Roof'));
  assert.equal(store.wall(w.id).name, 'Cave');
  assert.equal(files.get(store.FILES.gym), saved);
});

test('a corrupt file is reported and never overwritten', () => {
  files.set(store.FILES.sends, '{not json');
  store.load();
  assert.ok(store.corrupt.has(store.FILES.sends));
  assert.throws(() => store.addSend({ date: '2026-11-24', gradeId: 'g_red', wallId: 'x', x: 0, y: 0, result: 'sent' }));
  assert.equal(files.get(store.FILES.sends), '{not json');
});

test('a used wall is retired, an unused one deleted; colours in use cannot be deleted', () => {
  const w = store.addWall('Slab', [[0, 0], [4, 0]]);
  const spare = store.addWall('Spare', [[0, 2], [4, 2]]);
  const yesterday = addDays(localIso(), -1);
  store.addSend({ date: yesterday, gradeId: 'g_blue', wallId: w.id, x: 1, y: 0, result: 'sent' });
  const before = store.removeWall(w.id);
  store.removeWall(spare.id);
  assert.equal(store.wall(spare.id), null);
  assert.equal(store.wall(w.id).removedOn, localIso());
  assert.deepEqual(store.activeWalls(), []);
  assert.deepEqual(store.wallsOn(yesterday).map((x) => x.id), [w.id]);
  assert.deepEqual(store.wallsOn(localIso()), []);
  store.restoreWalls(before);
  assert.equal(store.wall(w.id).removedOn, undefined);
  assert.throws(() => store.removeColour('grades', 'g_blue'));
  store.removeColour('grades', 'g_black');
  assert.equal(store.grade('g_black'), null);
});

test('remove and restore keep the send position in the list', () => {
  const w = store.addWall('Slab', [[0, 0], [4, 0]]);
  const a = store.addSend({ date: '2026-11-24', gradeId: 'g_red', wallId: w.id, x: 1, y: 0, result: 'sent' });
  const b = store.addSend({ date: '2026-11-24', gradeId: 'g_red', wallId: w.id, x: 2, y: 0, result: 'tried' });
  const removed = store.removeSend(a.id);
  store.restoreSend(removed.send, removed.index);
  assert.deepEqual(store.sends.map((s) => s.id), [a.id, b.id]);
});

test('grades reorder and the selected colour persists', () => {
  store.moveColour('grades', 'g_red', -1);
  assert.deepEqual(store.gym.grades.map((g) => g.id).slice(2, 4), ['g_red', 'g_blue']);
  store.selectGrade('g_red');
  store.load();
  assert.equal(store.selectedGrade().id, 'g_red');
});

test('hold colour is optional, saved with the send, and guarded against deletion', () => {
  assert.equal(store.gym.holds.length, 12);
  const w = store.addWall('Slab', [[0, 0], [4, 0]]);
  const a = store.addSend({ date: '2026-11-24', gradeId: 'g_red', holdId: 'h_blue', wallId: w.id, x: 1, y: 0, result: 'sent' });
  const b = store.addSend({ date: '2026-11-24', gradeId: 'g_red', wallId: w.id, x: 2, y: 0, result: 'tried' });
  store.load();
  assert.equal(store.sends.find((s) => s.id === a.id).holdId, 'h_blue');
  assert.equal(store.sends.find((s) => s.id === b.id).holdId, null);
  assert.throws(() => store.removeColour('holds', 'h_blue'));
  store.removeColour('holds', 'h_brown');
  assert.equal(store.hold('h_brown'), null);
  const c = store.addColour('holds', 'Neon', '#a3e635');
  store.updateColour('holds', c.id, { name: 'Lime' });
  assert.equal(store.hold(c.id).name, 'Lime');
});

test('a gym file from before hold colours gets the default holds', () => {
  const old = { version: 1, cols: 8, rows: 8, walls: [], grades: [{ id: 'g_x', name: 'X', color: '#123456' }] };
  files.set(store.FILES.gym, JSON.stringify(old));
  files.set(store.FILES.sends, JSON.stringify([{ id: 's_1', date: '2026-11-20', gradeId: 'g_x', wallId: 'w', x: 0, y: 0, result: 'sent' }]));
  store.load();
  assert.equal(store.corrupt.size, 0);
  assert.equal(store.gym.cols, 8);
  assert.equal(store.gym.holds.length, 12);
  assert.equal(store.sends.length, 1);
});

test('a layout file round-trips and rejects broken files', () => {
  store.addWall('Slab', [[0, 0], [4, 0]]);
  const text = JSON.stringify(store.layoutFile());
  const parsed = store.parseLayout(text);
  assert.deepEqual(parsed, {
    name: null,
    cols: 12,
    rows: 16,
    outline: null,
    grades: store.gym.grades.map((g) => ({ name: g.name, color: g.color })),
    walls: [{ name: 'Slab', points: [[0, 0], [4, 0]] }]
  });
  assert.throws(() => store.parseLayout('nope'), /not a B-log layout/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 12, rows: 16, walls: [] })), /no walls/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 101, rows: 16, walls: [] })), /grid/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 4, rows: 4, walls: [{ name: 'X', points: [[0, 9]] }] })), /broken/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 4, rows: 4, grades: [{ name: 'Bad', color: 'red' }], walls: [{ name: 'X', points: [[0, 0]] }] })), /difficulty/);
  // A whole gym.json works too.
  assert.equal(store.parseLayout(files.get(store.FILES.gym)).walls.length, 1);
});

test('uploading a layout keeps used walls in the history and can be undone', () => {
  const used = store.addWall('Old slab', [[0, 0], [4, 0]]);
  store.addWall('Unused', [[0, 3], [4, 3]]);
  const yesterday = addDays(localIso(), -1);
  store.addSend({ date: yesterday, gradeId: 'g_red', wallId: used.id, x: 1, y: 0, result: 'sent' });
  const layout = store.parseLayout(JSON.stringify({ cols: 8, rows: 8, walls: [{ name: 'Cave', points: [[1, 1], [1, 5]] }] }));
  const r = store.importLayout(layout);
  assert.equal(r.added, 1);
  assert.equal(r.retired, 1);
  assert.equal(store.gym.cols, 8);
  assert.deepEqual(store.activeWalls().map((w) => w.name), ['Cave']);
  assert.deepEqual(store.wallsOn(yesterday).map((w) => w.name), ['Old slab']);
  assert.deepEqual(store.wallsOn(localIso()).map((w) => w.name), ['Cave']);
  store.load();
  assert.deepEqual(store.wallsOn(yesterday).map((w) => w.name), ['Old slab']);
  store.restoreLayout(r.previous);
  assert.deepEqual(store.activeWalls().map((w) => w.name), ['Old slab', 'Unused']);
  assert.equal(store.gym.cols, 12);
});

test('undoing an upload is refused once boulders are logged on the new walls', () => {
  const r = store.importLayout(store.parseLayout(JSON.stringify({ cols: 8, rows: 8, walls: [{ name: 'Cave', points: [[1, 1], [1, 5]] }] })));
  store.addSend({ date: localIso(), gradeId: 'g_red', wallId: store.activeWalls()[0].id, x: 1, y: 2, result: 'flash' });
  assert.throws(() => store.restoreLayout(r.previous), /cannot be undone/);
});

test('the outline is optional, round-trips through layout files and is replaced by an upload', () => {
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 8, rows: 8, outline: [[0, 0], [9, 0], [0, 8]], walls: [] })), /outline/);
  const prev = store.setOutline([[0, 0], [8, 0], [8, 8], [0, 8]]);
  assert.equal(prev, null);
  store.load();
  assert.equal(store.gym.outline.length, 4);
  const file = store.layoutFile();
  assert.equal(file.outline.length, 4);
  // An outline alone is a valid layout.
  const only = store.parseLayout(JSON.stringify({ cols: 10, rows: 10, outline: [[0, 0], [10, 0], [10, 10]], walls: [] }));
  const r = store.importLayout(only);
  assert.deepEqual(store.gym.outline, [[0, 0], [10, 0], [10, 10]]);
  store.restoreLayout(r.previous);
  assert.equal(store.gym.outline.length, 4);
  store.setOutline(null);
  assert.equal(store.layoutFile().outline, undefined);
});

test('the gym name is saved, travels with the layout and is restored by Undo', () => {
  store.setGymName('  Rocktown  ');
  store.load();
  assert.equal(store.gym.name, 'Rocktown');
  assert.equal(store.layoutFile().name, 'Rocktown');
  const r = store.importLayout(store.parseLayout(JSON.stringify({ name: 'Other gym', cols: 8, rows: 8, outline: [[0, 0], [8, 0], [8, 8]], walls: [] })));
  assert.equal(store.gym.name, 'Other gym');
  store.restoreLayout(r.previous);
  assert.equal(store.gym.name, 'Rocktown');
  store.setGymName('');
  assert.equal(store.gym.name, null);
  assert.equal(store.layoutFile().name, undefined);
});

test('every built-in gym is a valid layout', async () => {
  const { BUILT_IN_GYMS } = await import('../js/gyms.js');
  assert.ok(BUILT_IN_GYMS.length > 0);
  for (const g of BUILT_IN_GYMS) {
    const parsed = store.parseLayout(JSON.stringify(g));
    assert.equal(parsed.name, g.name);
    assert.equal(parsed.walls.length, g.walls.length);
    const r = store.importLayout(parsed);
    const exported = store.layoutFile();
    assert.equal(exported.walls[0].code, g.walls[0].code);
    assert.equal(exported.walls[0].color, g.walls[0].color);
    assert.equal(exported.zones.length, g.zones.length);
    assert.deepEqual(exported.grades, g.grades);
    store.restoreLayout(r.previous);
  }
});

test('importing a layout with grades reuses matching IDs, preserves used grades, and supports Undo', () => {
  const w = store.addWall('Slab', [[0, 0], [4, 0]]);
  const extra = store.addColour('grades', 'Pink', '#ec4899');
  store.addSend({ date: localIso(), gradeId: extra.id, wallId: w.id, x: 1, y: 0, result: 'sent' });
  store.addSend({ date: localIso(), gradeId: 'g_blue', wallId: w.id, x: 2, y: 0, result: 'flash' });

  const layout = store.parseLayout(JSON.stringify({
    cols: 8,
    rows: 8,
    grades: [
      { name: 'Blue', color: '#2563eb' },
      { name: 'White', color: '#f8fafc' }
    ],
    walls: [{ name: 'Cave', points: [[1, 1], [1, 5]] }]
  }));
  const r = store.importLayout(layout);
  assert.deepEqual(store.gym.grades.map((g) => g.name), ['Blue', 'White', 'Pink']);
  assert.equal(store.gym.grades[0].id, 'g_blue');
  assert.equal(store.gym.grades[0].color, '#2563eb');
  assert.equal(store.gym.grades[2].id, extra.id);
  store.restoreLayout(r.previous);
  assert.ok(store.gym.grades.some((g) => g.id === 'g_yellow'));
});

// --- Layout revisions and wall identity ---

const rev = (revision, walls, extra = {}) => ({ format: 'b-log-layout', version: 1, id: 'testgym', revision,
  name: 'Test Gym', cols: 20, rows: 20, walls, ...extra });

test('a new revision of the same gym keeps reshaped walls, adds new ones and retires removed ones', () => {
  store.importLayout(store.parseLayout(JSON.stringify(rev(1, [
    { code: 'A', name: 'Slab', points: [[1, 1], [5, 1]] },
    { code: 'B', name: 'Cave', points: [[1, 5], [5, 5]] },
    { code: 'C', name: 'Roof', points: [[1, 9], [5, 9]] }
  ]))));
  assert.deepEqual(store.gym.source, { id: 'testgym', revision: 1 });
  const [a, b, c] = store.activeWalls();
  store.addSend({ date: localIso(), gradeId: 'g_red', wallId: a.id, x: 2, y: 1, result: 'sent' });
  store.addSend({ date: localIso(), gradeId: 'g_red', wallId: b.id, x: 2, y: 5, result: 'sent' });

  const next = rev(2, [
    { code: 'A', name: 'Slab', points: [[1, 1], [6, 2]] },   // reshaped
    { code: 'C', name: 'Big Roof', points: [[1, 9], [5, 9]] }, // renamed, same code
    { code: 'D', name: 'Prow', points: [[9, 9], [9, 14]] }     // new
  ]);
  assert.deepEqual(
    (({ added, reshaped, removed }) => ({ added, reshaped, removed }))(store.layoutUpdate([next])),
    { added: 1, reshaped: 1, removed: 1 });

  const r = store.importLayout(store.parseLayout(JSON.stringify(next)));
  assert.deepEqual({ added: r.added, reshaped: r.reshaped, retired: r.retired }, { added: 1, reshaped: 1, retired: 1 });
  assert.equal(store.wall(a.id).points[1][0], 6);
  assert.equal(store.wall(a.id).removedOn, undefined);
  assert.equal(store.wall(b.id).removedOn, localIso());
  assert.equal(store.wall(c.id).name, 'Big Roof');
  assert.equal(store.layoutUpdate([next]), null);
  store.restoreLayout(r.previous);
  assert.deepEqual(store.wall(a.id).points, [[1, 1], [5, 1]]);
  assert.deepEqual(store.gym.source, { id: 'testgym', revision: 1 });
});

test('a different gym never matches walls by code', () => {
  store.importLayout(store.parseLayout(JSON.stringify(rev(1, [{ code: 'W1', name: 'Slab', points: [[1, 1], [5, 1]] }]))));
  const w = store.activeWalls()[0];
  store.addSend({ date: localIso(), gradeId: 'g_red', wallId: w.id, x: 2, y: 1, result: 'sent' });
  const other = { cols: 20, rows: 20, name: 'Other Gym', walls: [{ code: 'W1', name: 'Slab', points: [[1, 1], [5, 1]] }] };
  const r = store.importLayout(store.parseLayout(JSON.stringify(other)));
  assert.equal(r.retired, 1);
  assert.equal(store.wall(w.id).removedOn, localIso());
  assert.equal(store.gym.source, null);
});

test('a layout loaded before revisions existed is offered the built-in update once', () => {
  store.importLayout(store.parseLayout(JSON.stringify({ cols: 20, rows: 20, name: 'Test Gym', walls: [{ code: 'A', name: 'Slab', points: [[1, 1], [5, 1]] }] })));
  assert.equal(store.gym.source, null);
  const next = rev(3, [{ code: 'A', name: 'Slab', points: [[1, 1], [5, 1]] }]);
  assert.ok(store.layoutUpdate([next]));
  store.importLayout(store.parseLayout(JSON.stringify(next)));
  assert.equal(store.layoutUpdate([next]), null);
});

test('colours move to a position in one write', () => {
  store.moveColourTo('grades', 'g_yellow', 3);
  assert.deepEqual(store.gym.grades.map((g) => g.id), ['g_green', 'g_blue', 'g_red', 'g_yellow', 'g_black']);
  store.load();
  assert.equal(store.gym.grades[3].id, 'g_yellow');
  store.moveColourTo('holds', 'h_brown', 0);
  assert.equal(store.gym.holds[0].id, 'h_brown');
});

test('the theme setting persists and rejects unknown values', () => {
  assert.equal(store.settings.theme, 'system');
  store.setTheme('dark');
  store.load();
  assert.equal(store.settings.theme, 'dark');
  assert.throws(() => store.setTheme('neon'));
  files.set(store.FILES.settings, JSON.stringify({ version: 1, theme: 'neon' }));
  store.load();
  assert.equal(store.settings.theme, 'system');
});
