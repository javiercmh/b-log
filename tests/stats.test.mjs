import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeCounts, topBuckets, summary, weekStart, addDays } from '../js/stats.js';

const grades = [{ id: 'y', name: 'Yellow' }, { id: 'b', name: 'Blue' }, { id: 'r', name: 'Red' }];
const s = (date, gradeId, result) => ({ date, gradeId, result });

test('gradeCounts splits by result in grade order and skips empty grades', () => {
  const rows = gradeCounts([s('2026-11-24', 'r', 'sent'), s('2026-11-24', 'y', 'flash'), s('2026-11-24', 'r', 'tried')], grades);
  assert.deepEqual(rows.map((r) => [r.grade.id, r.flash, r.sent, r.tried]), [['y', 1, 0, 0], ['r', 0, 1, 1]]);
});

test('week math uses Monday starts across month boundaries', () => {
  assert.equal(weekStart('2026-11-24'), '2026-11-23');
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

test('topBuckets counts only tops, per grade, in the right bucket', () => {
  const sends = [
    s('2026-11-24', 'b', 'sent'), s('2026-11-23', 'b', 'flash'), s('2026-11-22', 'r', 'sent'),
    s('2026-11-24', 'r', 'tried'), s('2025-01-01', 'r', 'sent')
  ];
  const weeks = topBuckets(sends, 'week', 3, '2026-11-24');
  assert.deepEqual(weeks.map((w) => w.start), ['2026-11-09', '2026-11-16', '2026-11-23']);
  assert.deepEqual(weeks[2].byGrade, { b: 2 });
  assert.deepEqual(weeks[1].byGrade, { r: 1 });
  const months = topBuckets(sends, 'month', 2, '2026-11-24');
  assert.deepEqual(months.map((m) => [m.start, m.total]), [['2026-10-01', 0], ['2026-11-01', 3]]);
});

test('summary finds the hardest top by grade order, ignoring tries', () => {
  const out = summary([s('2026-11-24', 'b', 'sent'), s('2026-11-24', 'r', 'tried'), s('2026-11-20', 'y', 'flash')], grades);
  assert.deepEqual({ ...out, hardest: out.hardest.id }, { sessions: 2, tops: 2, flashes: 1, hardest: 'b' });
  assert.equal(summary([], grades).hardest, null);
});

test('chart axis uses whole-number ticks that fit the data', async () => {
  const { niceScale } = await import('../js/stats.js');
  assert.deepEqual(niceScale(0), { max: 2, ticks: 2 });
  assert.deepEqual(niceScale(4), { max: 4, ticks: 4 });
  assert.deepEqual(niceScale(9), { max: 10, ticks: 5 });
  assert.deepEqual(niceScale(25), { max: 25, ticks: 5 });
  assert.deepEqual(niceScale(26), { max: 30, ticks: 3 });
  assert.deepEqual(niceScale(130), { max: 150, ticks: 3 });
});
