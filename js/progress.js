// progress.js — the Progress screen: headline tiles and a stacked bar chart of tops per period.
// Bar colours are the gym's own grade colours (identity is fixed by the hold colour), so the
// legend, per-bar details and the table view always carry the grade names as well.

import * as store from './store.js';
import { topBuckets, summary, gradeCounts, niceScale, localIso, parseIso, addDays, weekStart, monthStart } from './stats.js';
import { $, h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const COUNT = 12;
const W = 340;
const H = 190;
const M = { top: 10, right: 6, bottom: 24, left: 26 };

let period = 'week';
let activeIndex = null;

export function init() {
  for (const btn of document.querySelectorAll('.seg')) {
    btn.onclick = () => {
      period = btn.dataset.period;
      activeIndex = null;
      document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    };
  }
  $('chart-table-toggle').onclick = () => {
    const table = $('chart-table');
    table.hidden = !table.hidden;
    $('chart-table-toggle').textContent = table.hidden ? 'Table' : 'Chart';
    $('chart').hidden = !table.hidden;
    $('chart-tip').hidden = true;
    activeIndex = null;
  };
}

function svg(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function bucketLabel(start, long = false) {
  const d = parseIso(start);
  if (period === 'month') return d.toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
  return long ? `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Start of the period `count` periods before `start`. */
function periodsBefore(start, count) {
  if (period !== 'month') return addDays(start, -7 * count);
  const d = parseIso(start);
  d.setMonth(d.getMonth() - count);
  return localIso(d);
}

export function render() {
  const today = localIso();
  const grades = store.gym.grades;
  const buckets = topBuckets(store.sends, period, COUNT, today);
  const from = buckets[0].start;
  const keyOf = period === 'month' ? monthStart : weekStart;
  const inRange = store.sends.filter((s) => keyOf(s.date) >= from);
  const prevFrom = periodsBefore(from, COUNT);
  const before = store.sends.filter((s) => keyOf(s.date) >= prevFrom && keyOf(s.date) < from);

  $('chart-title').textContent = period === 'month' ? 'Tops per month' : 'Tops per week';
  $('tiles-caption').textContent = period === 'month'
    ? 'Last 12 months, compared with the 12 before'
    : 'Last 12 weeks, compared with the 12 before';
  renderTiles(summary(inRange, grades), summary(before, grades));
  renderGradeBars(inRange, grades);
  renderChart(buckets, grades);
  renderLegend(buckets, grades);
  renderTable(buckets, grades);
}

function renderTiles(now, before) {
  const delta = (a, b) => {
    const d = a - b;
    return h('span', { class: `delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`, text: d === 0 ? '±0' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}` });
  };
  const tile = (label, value, foot, lead = null, small = false) =>
    h('div', { class: 'tile' }, h('div', { class: 'label', text: label }),
      h('div', { class: small ? 'value small' : 'value' }, lead, value), foot);
  const hard = now.hardest;
  const wasHard = before.hardest && (!hard || before.hardest.id !== hard.id)
    ? h('span', { class: 'delta', text: `was ${before.hardest.name}` }) : null;
  $('tiles').replaceChildren(
    tile('Sessions', String(now.sessions), delta(now.sessions, before.sessions)),
    tile('Tops', String(now.tops), delta(now.tops, before.tops)),
    tile('Flash rate', now.tops ? `${Math.round((100 * now.flashes) / now.tops)}%` : '—',
      h('span', { class: 'delta', text: `${now.flashes} flash${now.flashes === 1 ? '' : 'es'}` })),
    tile('Hardest top', hard ? hard.name : '—', wasHard,
      hard ? h('span', { class: 'gpill', style: `background:${hard.color}` }) : null, true));
}

/** Tops per colour, hardest first; the solid part of each bar is the flashes. */
function renderGradeBars(sends, grades) {
  const rows = gradeCounts(sends, grades).filter((r) => r.flash + r.sent).reverse();
  if (!rows.length) {
    $('grade-bars').replaceChildren(h('p', { class: 'muted', text: 'No tops in this range yet.' }));
    return;
  }
  const max = Math.max(...rows.map((r) => r.flash + r.sent));
  $('grade-bars').replaceChildren(...rows.map((r) => {
    const tops = r.flash + r.sent;
    return h('div', { class: 'gb-row', 'aria-label': `${r.grade.name}: ${tops} tops, ${r.flash} flashed` },
      h('span', { class: 'gb-name' }, h('i', { class: 'dot', style: `background:${r.grade.color}` }), r.grade.name),
      h('span', { class: 'gb-track' },
        h('span', { class: 'gb-bar', style: `width:${(100 * tops) / max}%;--g:${r.grade.color}` },
          h('span', { class: 'gb-flash', style: `width:${(100 * r.flash) / tops}%` }))),
      h('span', { class: 'gb-n', text: String(tops) }));
  }));
}

function renderChart(buckets, grades) {
  const { max, ticks } = niceScale(Math.max(0, ...buckets.map((b) => b.total)));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const slot = plotW / buckets.length;
  const barW = Math.min(18, slot * 0.62);
  const y = (v) => M.top + plotH - (v / max) * plotH;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': $('chart-title').textContent });
  const axis = svg('g', { class: 'axis' }, root);
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    svg('line', { class: 'gridline', x1: M.left, x2: W - M.right, y1: y(v), y2: y(v) }, axis);
    const t = svg('text', { x: M.left - 6, y: y(v) + 3.5, 'text-anchor': 'end' }, axis);
    t.textContent = String(v);
  }

  const labelEvery = period === 'week' ? 3 : 2;
  buckets.forEach((b, i) => {
    const cx = M.left + slot * i + slot / 2;
    if ((buckets.length - 1 - i) % labelEvery === 0) {
      const t = svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, axis);
      t.textContent = bucketLabel(b.start);
    }

    const col = svg('g', { class: i === activeIndex ? 'bar-col active' : 'bar-col' }, root);
    svg('rect', { class: 'hit', x: cx - slot / 2, y: M.top, width: slot, height: plotH, rx: 4 }, col);
    if (b.total > 0) {
      // Clip the stack to a rounded top; the clip extends below the baseline so the bottom stays square.
      const clipId = `clip-${i}`;
      const clip = svg('clipPath', { id: clipId }, root);
      svg('rect', { x: cx - barW / 2, y: y(b.total), width: barW, height: y(0) - y(b.total) + 4, rx: 4 }, clip);
      const stack = svg('g', { 'clip-path': `url(#${clipId})` }, col);
      let acc = 0;
      for (const g of grades) {
        const n = b.byGrade[g.id] || 0;
        if (!n) continue;
        const top = y(acc + n);
        const bottom = y(acc);
        svg('rect', { class: 'bar-seg', x: cx - barW / 2, y: top, width: barW, height: bottom - top, fill: g.color }, stack);
        // 2px surface gap between stacked segments.
        if (acc > 0) svg('rect', { x: cx - barW / 2, y: bottom - 1, width: barW, height: 2, fill: 'var(--surface)' }, stack);
        acc += n;
      }
    }
    col.addEventListener('click', () => { activeIndex = activeIndex === i ? null : i; render(); });
  });

  $('chart').replaceChildren(root);
  renderTip(buckets, grades);
}

function renderTip(buckets, grades) {
  const tip = $('chart-tip');
  if (activeIndex === null) { tip.hidden = true; return; }
  const b = buckets[activeIndex];
  const rows = grades.filter((g) => b.byGrade[g.id]).reverse().map((g) =>
    h('div', { class: 'tip-row' }, h('span', { class: 'dot', style: `background:${g.color}` }),
      h('span', { text: g.name }), h('b', { text: String(b.byGrade[g.id]) })));
  tip.replaceChildren(
    h('div', { class: 'tip-row' }, h('strong', { text: bucketLabel(b.start, true) }), h('b', { text: `${b.total} top${b.total === 1 ? '' : 's'}` })),
    ...rows);
  tip.hidden = false;
}

function renderLegend(buckets, grades) {
  const used = grades.filter((g) => buckets.some((b) => b.byGrade[g.id]));
  $('chart-legend').replaceChildren(...(used.length ? used : []).map((g) =>
    h('span', {}, h('i', { class: 'dot', style: `background:${g.color}` }), g.name)));
  if (!used.length) $('chart-legend').replaceChildren(h('span', { text: 'No tops in this range yet.' }));
}

function renderTable(buckets, grades) {
  const used = grades.filter((g) => buckets.some((b) => b.byGrade[g.id]));
  const head = h('tr', {}, h('th', { text: period === 'month' ? 'Month' : 'Week' }),
    ...used.map((g) => h('th', { text: g.name })), h('th', { text: 'Total' }));
  const body = [...buckets].reverse().map((b) => h('tr', {}, h('td', { text: bucketLabel(b.start) }),
    ...used.map((g) => h('td', { text: String(b.byGrade[g.id] || 0) })), h('td', { text: String(b.total) })));
  $('chart-table').replaceChildren(h('table', {}, h('thead', {}, head), h('tbody', {}, body)));
}
