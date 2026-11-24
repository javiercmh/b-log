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

test('walls and colours in use cannot be deleted', () => {
  const w = store.addWall('Slab', [[0, 0], [4, 0]]);
  store.addSend({ date: '2026-11-24', gradeId: 'g_blue', wallId: w.id, x: 1, y: 0, result: 'sent' });
  assert.throws(() => store.removeWall(w.id));
  assert.throws(() => store.removeGrade('g_blue'));
  store.removeGrade('g_black');
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
  store.moveGrade('g_red', -1);
  assert.deepEqual(store.gym.grades.map((g) => g.id).slice(2, 4), ['g_red', 'g_blue']);
  store.selectGrade('g_red');
  store.load();
  assert.equal(store.selectedGrade().id, 'g_red');
});
