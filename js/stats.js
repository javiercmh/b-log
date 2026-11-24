// stats.js — pure aggregation of sends. No DOM, no bridge; covered by tests/.

export const RESULTS = ['flash', 'sent', 'tried'];

/** A top is a completed boulder: flashed or sent. */
export function isTop(send) {
  return send.result === 'flash' || send.result === 'sent';
}

/**
 * Per-grade counts for a list of sends, in grade order (easiest first).
 * Only grades with at least one send are returned.
 */
export function gradeCounts(sends, grades) {
  const rows = grades.map((g) => ({ grade: g, flash: 0, sent: 0, tried: 0 }));
  const byId = new Map(rows.map((r) => [r.grade.id, r]));
  for (const s of sends) {
    const row = byId.get(s.gradeId);
    if (row && RESULTS.includes(s.result)) row[s.result]++;
  }
  return rows.filter((r) => r.flash + r.sent + r.tried > 0);
}

/** Local YYYY-MM-DD. Never toISOString(): that is UTC and shifts days after midnight. */
export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return localIso(d);
}

/** Monday of the ISO week containing iso. */
export function weekStart(iso) {
  const d = parseIso(iso);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return localIso(d);
}

export function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Buckets of tops per grade for the last `count` weeks or months ending at `today`.
 * Returns [{ start, label, total, byGrade: { gradeId: n } }], oldest first.
 */
export function topBuckets(sends, period, count, today) {
  const keyOf = period === 'month' ? monthStart : weekStart;
  const buckets = [];
  let cursor = keyOf(today);
  for (let i = 0; i < count; i++) {
    buckets.unshift({ start: cursor, total: 0, byGrade: {} });
    if (period === 'month') {
      const d = parseIso(cursor);
      d.setMonth(d.getMonth() - 1);
      cursor = localIso(d);
    } else {
      cursor = addDays(cursor, -7);
    }
  }
  const index = new Map(buckets.map((b, i) => [b.start, i]));
  for (const s of sends) {
    if (!isTop(s)) continue;
    const i = index.get(keyOf(s.date));
    if (i === undefined) continue;
    const b = buckets[i];
    b.total++;
    b.byGrade[s.gradeId] = (b.byGrade[s.gradeId] || 0) + 1;
  }
  return buckets;
}

/** Headline numbers over a set of sends. `grades` is ordered easiest → hardest. */
export function summary(sends, grades) {
  const tops = sends.filter(isTop);
  const days = new Set(sends.map((s) => s.date));
  const rank = new Map(grades.map((g, i) => [g.id, i]));
  let hardest = null;
  for (const s of tops) {
    const r = rank.get(s.gradeId);
    if (r !== undefined && (hardest === null || r > hardest)) hardest = r;
  }
  return {
    sessions: days.size,
    tops: tops.length,
    flashes: tops.filter((s) => s.result === 'flash').length,
    hardest: hardest === null ? null : grades[hardest]
  };
}
