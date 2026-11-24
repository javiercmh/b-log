import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapToWall, snapToGrid, nearestPoint, wallExtent, polylineMidpoint } from '../js/geometry.js';

const walls = [
  { id: 'a', name: 'A', points: [[0, 0], [10, 0]] },
  { id: 'b', name: 'B', points: [[0, 5], [0, 10], [5, 10]] }
];

test('snaps a tap onto the nearest wall segment', () => {
  assert.deepEqual(snapToWall([3, 0.6], walls, 1), { wallId: 'a', x: 3, y: 0, dist: 0.6 });
  const hit = snapToWall([4, 9.2], walls, 1);
  assert.equal(hit.wallId, 'b');
  assert.deepEqual([hit.x, hit.y], [4, 10]);
});

test('clamps to segment ends', () => {
  const hit = snapToWall([11, 0.2], walls, 2);
  assert.deepEqual([hit.wallId, hit.x, hit.y], ['a', 10, 0]);
});

test('returns null when no wall is close enough', () => {
  assert.equal(snapToWall([5, 5], walls, 1), null);
  assert.equal(snapToWall([5, 5], [], 1), null);
});

test('snapToGrid rounds and clamps to the grid', () => {
  assert.deepEqual(snapToGrid([2.4, 3.6], 12, 16), [2, 4]);
  assert.deepEqual(snapToGrid([-1, 20], 12, 16), [0, 16]);
});

test('nearestPoint picks the closest item within range', () => {
  const items = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }];
  assert.equal(nearestPoint([0.8, 0], items, 0.5).id, 2);
  assert.equal(nearestPoint([5, 5], items, 0.5), null);
});

test('wallExtent and midpoint', () => {
  assert.deepEqual(wallExtent(walls), { cols: 10, rows: 10 });
  assert.deepEqual(polylineMidpoint([[0, 0], [4, 0], [4, 4]]), { x: 4, y: 0 });
  assert.deepEqual(polylineMidpoint([[2, 3]]), { x: 2, y: 3 });
});
