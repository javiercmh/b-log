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
  assert.deepEqual(parsed, { cols: 12, rows: 16, walls: [{ name: 'Slab', points: [[0, 0], [4, 0]] }] });
  assert.throws(() => store.parseLayout('nope'), /not a B-log layout/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 12, rows: 16, walls: [] })), /no walls/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 99, rows: 16, walls: [] })), /grid/);
  assert.throws(() => store.parseLayout(JSON.stringify({ cols: 4, rows: 4, walls: [{ name: 'X', points: [[0, 9]] }] })), /broken/);
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
