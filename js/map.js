// map.js — renders the gym floor plan as SVG in grid units, converts taps to grid points,
// and renders the zone & wall legend. Pure presentation: never reads the store.
//
// The floor and walls are neutral on purpose: colour on the map only ever means a logged boulder
// (ring = difficulty, centre = holds), so a red pin never disappears against a red wall.

import { polylineMidpoint } from './geometry.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 0.6;
export const PIN_R = 0.5;
export const mapScale = (cols) => Math.max(1, cols / 13);

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function polyCenter(points) {
  let sx = 0, sy = 0;
  for (const [x, y] of points) { sx += x; sy += y; }
  return [sx / points.length, sy / points.length];
}

/**
 * Creates a map inside `host`. `onTap([x, y])` receives grid coordinates (unsnapped).
 */
export function createMap(host, onTap) {
  const svg = el('svg', { class: 'map-svg', role: 'img' });
  host.replaceChildren(svg);
  if (onTap) {
    // Use `click`, not pointerup: the browser only fires it for a real tap (not a scroll), and
    // opening the sheet on pointerup lets the trailing click land on the new dialog's backdrop
    // and close it again.
    svg.addEventListener('click', (e) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      onTap([pt.x, pt.y]);
    });
  }

  return {
    svg,
    /**
     * view = { cols, rows, outline: [[x,y]...] | null, zones: [...] | null, walls,
     *          pins: [{x, y, ring, fill, result}], preview: {x, y, ring, fill} | null, label }
     */
    render(view) {
      const { cols, rows } = view;
      const s = mapScale(cols);
      const pad = PAD * s;
      svg.style.setProperty('--s', s);
      svg.setAttribute('viewBox', `${-pad} ${-pad} ${cols + 2 * pad} ${rows + 2 * pad}`);
      svg.setAttribute('aria-label', view.label || 'Gym map');
      svg.replaceChildren();

      el('rect', { class: 'map-floor', x: 0, y: 0, width: cols, height: rows, rx: 0.35 * s }, svg);

      if (view.outline && view.outline.length >= 3) {
        el('polygon', { class: 'map-outline', points: view.outline.map((p) => p.join(',')).join(' ') }, svg);
      }

      // Floor zones (mats, walkways, 2F decks, named areas like Bistro/Yoga/Entrance)
      const zones = view.zones || [];
      if (zones.length) {
        const zg = el('g', { class: 'map-zones' }, svg);
        for (const z of zones) {
          el('polygon', { class: `zone zone-${z.kind}`, points: z.points.map((p) => p.join(',')).join(' ') }, zg);
        }
      }

      // A light grid for orientation: every 5 units (10 on wide gyms).
      const grid = el('g', { class: 'map-grid' }, svg);
      const major = cols > 16 ? 10 : 5;
      for (let x = 0; x <= cols; x += major) el('line', { class: 'grid-major', x1: x, y1: 0, x2: x, y2: rows }, grid);
      for (let y = 0; y <= rows; y += major) el('line', { class: 'grid-major', x1: 0, y1: y, x2: cols, y2: y }, grid);

      if (zones.length) {
        const zlg = el('g', { class: 'map-zone-labels' }, svg);
        for (const z of zones) drawZoneLabel(zlg, z, s);
      }

      const wallsG = el('g', { class: 'map-walls' }, svg);
      for (const w of view.walls) {
        if (w.points.length === 1) {
          el('circle', { class: 'wall-dot', cx: w.points[0][0], cy: w.points[0][1], r: 0.22 * s }, wallsG);
        } else {
          el('polyline', { class: 'wall', points: w.points.map((p) => p.join(',')).join(' ') }, wallsG);
        }
      }

      // Wall code / name pill badges
      const labels = el('g', { class: 'map-labels' }, svg);
      for (const w of view.walls) {
        const tag = w.code || w.name;
        if (!tag) continue;
        const pos = w.labelPos || (() => {
          const m = polylineMidpoint(w.points);
          return [m.x, m.y - 0.55 * s];
        })();
        const text = tag.length > 10 ? `${tag.slice(0, 9)}…` : tag;
        const k = 0.78 * s;
        const pillW = Math.max(1.8 * k, text.length * 0.42 * k + 0.7 * k);
        const pillH = 1.05 * k;
        el('rect', {
          class: 'wall-badge-bg', x: pos[0] - pillW / 2, y: pos[1] - pillH / 2,
          width: pillW, height: pillH, rx: pillH / 2
        }, labels);
        const t = el('text', { class: 'wall-badge-text', x: pos[0], y: pos[1] + 0.24 * k, 'text-anchor': 'middle' }, labels);
        t.textContent = text;
      }

      // Boulder pins on top of everything
      const pins = el('g', { class: 'map-pins' }, svg);
      for (const pin of view.pins) drawPin(pins, pin, s);
      if (view.preview) drawPin(pins, { ...view.preview, result: 'preview' }, s);
    }
  };
}

function drawZoneLabel(parent, z, s) {
  if (!z.label) return;
  const [x, y] = z.labelPos || polyCenter(z.points);
  const attrs = { class: `zone-label zone-label-${z.kind}`, x, y: y + 0.2 * s, 'text-anchor': 'middle' };
  if (z.rotate) attrs.transform = `rotate(${z.rotate} ${x} ${y})`;
  el('text', attrs, parent).textContent = z.label;
}

/**
 * Centre = hold colour (empty when none was recorded), ring = difficulty colour.
 * Shape carries the result so colour is never the only cue: solid ring = sent,
 * extra outer halo = flash, dashed ring = tried. A light rim keeps pins readable on any floor.
 */
function drawPin(parent, pin, s = 1) {
  const g = el('g', { class: `pin pin-${pin.result}` }, parent);
  el('circle', { class: 'pin-rim', cx: pin.x, cy: pin.y + 0.06 * s, r: (PIN_R + (pin.result === 'flash' ? 0.3 : 0.12)) * s }, g);
  if (pin.result === 'flash') {
    el('circle', { class: 'pin-halo', cx: pin.x, cy: pin.y, r: (PIN_R + 0.24) * s, stroke: pin.ring }, g);
  }
  el('circle', {
    class: 'pin-dot', cx: pin.x, cy: pin.y, r: PIN_R * s,
    fill: pin.fill || 'var(--surface-solid)', stroke: pin.ring
  }, g);
}

/**
 * A pin as a small standalone SVG (the sheet's outcome buttons preview the pin they will drop).
 */
export function pinIcon({ ring, fill, result }) {
  const svg = el('svg', { viewBox: '-1 -1 2 2', 'aria-hidden': 'true' });
  if (result === 'flash') el('circle', { r: 0.86, fill: 'none', stroke: ring, 'stroke-width': 0.13 }, svg);
  el('circle', {
    r: 0.56, fill: fill || 'var(--surface-solid)', stroke: ring, 'stroke-width': 0.22,
    ...(result === 'tried' ? { 'stroke-dasharray': '0.3 0.18' } : {})
  }, svg);
  return svg;
}

/**
 * Renders the floor-zone key and the wall legend (code + name) inside `host`.
 */
export function renderMapLegend(host, { walls = [], zones = [] }) {
  const parts = [];
  const kinds = new Set((zones || []).map((z) => z.kind));
  const KEY = [['mat', 'Mats'], ['walkway', 'Walking'], ['floor', '2nd floor'], ['area', 'Areas']];
  const items = KEY.filter(([k]) => kinds.has(k)).map(([k, label]) =>
    h('span', { class: 'zone-key-item' }, h('i', { class: `zone-swatch zone-swatch-${k}` }), label));
  if (items.length) parts.push(h('div', { class: 'zone-key' }, ...items));

  if (walls.length) {
    parts.push(h('ul', { class: 'wall-legend' }, ...walls.map((w, i) =>
      h('li', { class: 'wall-legend-item' },
        h('span', { class: 'wall-code-pill', text: w.code || `W${i + 1}` }),
        h('span', { class: 'wall-legend-name', text: w.name })))));
  }

  host.replaceChildren(...parts);
  host.hidden = parts.length === 0;
}

/**
 * A small static preview of a gym (outline, zones, walls) as a standalone SVG. A gym taller than it
 * is wide is turned on its side so the preview fits a wide card. No labels, grid or pins.
 */
export function mapThumb({ cols, rows, outline, zones, walls }) {
  const turn = rows > cols;
  const w = turn ? rows : cols;
  const ht = turn ? cols : rows;
  const pad = Math.max(w, ht) * 0.015;
  const svg = el('svg', {
    class: 'map-thumb', viewBox: `${-pad} ${-pad} ${w + 2 * pad} ${ht + 2 * pad}`,
    preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true'
  });
  // Turned: (x, y) → (y, cols - x), i.e. a quarter turn anticlockwise.
  const g = el('g', turn ? { transform: `translate(0 ${cols}) rotate(-90)` } : {}, svg);
  const pts = (list) => list.map((p) => p.join(',')).join(' ');
  if (outline && outline.length >= 3) el('polygon', { class: 'thumb-outline', points: pts(outline) }, g);
  for (const z of zones || []) el('polygon', { class: 'thumb-zone', points: pts(z.points) }, g);
  for (const wall of walls) {
    if (wall.points.length === 1) el('circle', { class: 'thumb-dot', cx: wall.points[0][0], cy: wall.points[0][1], r: 0.6 }, g);
    else el('polyline', { class: 'thumb-wall', points: pts(wall.points) }, g);
  }
  return svg;
}
