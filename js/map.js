// map.js — renders the gym floor plan as SVG in grid units, converts taps to grid points,
// and renders the colour-coded zone & wall legend. Pure presentation: never reads the store.

import { polylineMidpoint } from './geometry.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 0.6;
export const PIN_R = 0.34;
export const mapScale = (cols) => Math.max(1, cols / 13);

const FALLBACK_COLORS = [
  '#f97316', '#ef4444', '#eab308', '#f43f5e',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
  '#38bdf8', '#fb923c', '#ec4899', '#14b8a6'
];

export function wallColor(wall, index = 0) {
  return wall.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

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
        for (const z of zones) drawZone(zg, z, s);
      }

      // Subtle architectural grid lines
      const grid = el('g', { class: 'map-grid' }, svg);
      const step = cols > 16 ? 2 : 1;
      const majorStep = cols > 16 ? 10 : 5;
      for (let x = 0; x <= cols; x += step) {
        const major = x % majorStep === 0 || x === cols;
        el('line', {
          class: major ? 'grid-major' : 'grid-minor',
          x1: x, y1: 0, x2: x, y2: rows
        }, grid);
      }
      for (let y = 0; y <= rows; y += step) {
        const major = y % majorStep === 0 || y === rows;
        el('line', {
          class: major ? 'grid-major' : 'grid-minor',
          x1: 0, y1: y, x2: cols, y2: y
        }, grid);
      }

      // Zone labels above grid lines for crisp legibility
      if (zones.length) {
        const zlg = el('g', { class: 'map-zone-labels' }, svg);
        for (const z of zones) drawZoneLabel(zlg, z, s);
      }

      // Colour-coded walls + corner nodes
      const wallsG = el('g', { class: 'map-walls' }, svg);
      view.walls.forEach((w, i) => {
        const color = wallColor(w, i);
        const pts = w.points.map((p) => p.join(',')).join(' ');
        if (w.points.length === 1) {
          el('circle', { class: 'wall-dot', cx: w.points[0][0], cy: w.points[0][1], r: 0.22 * s, fill: color }, wallsG);
        } else {
          el('polyline', { class: 'wall', points: pts, stroke: color }, wallsG);
          for (const [x, y] of w.points) {
            el('circle', { class: 'wall-joint', cx: x, cy: y, r: 0.14 * s, stroke: color }, wallsG);
          }
        }
      });

      // Wall code / name pill badges
      const labels = el('g', { class: 'map-labels' }, svg);
      view.walls.forEach((w, i) => {
        const tag = w.code || w.name;
        if (!tag) return;
        const color = wallColor(w, i);
        const pos = w.labelPos || (() => {
          const m = polylineMidpoint(w.points);
          return [m.x, m.y - 0.55 * s];
        })();
        const text = tag.length > 10 ? `${tag.slice(0, 9)}…` : tag;
        const charW = 0.42 * s;
        const pillW = Math.max(1.8 * s, text.length * charW + 0.7 * s);
        const pillH = 1.05 * s;
        el('rect', {
          class: 'wall-badge-bg',
          x: pos[0] - pillW / 2,
          y: pos[1] - pillH / 2,
          width: pillW,
          height: pillH,
          rx: 0.26 * s,
          fill: color
        }, labels);
        const t = el('text', {
          class: 'wall-badge-text',
          x: pos[0],
          y: pos[1] + 0.24 * s,
          'text-anchor': 'middle'
        }, labels);
        t.textContent = text;
      });

      // Boulder pins on top of everything
      const pins = el('g', { class: 'map-pins' }, svg);
      for (const pin of view.pins) drawPin(pins, pin, s);
      if (view.preview) drawPin(pins, { ...view.preview, result: 'preview' }, s);
    }
  };
}

function drawZone(parent, z, s) {
  const pts = z.points.map((p) => p.join(',')).join(' ');
  const attrs = { class: `zone zone-${z.kind}`, points: pts };
  if (z.color) {
    attrs.stroke = z.color;
    attrs.fill = z.color;
  }
  el('polygon', attrs, parent);
}

function drawZoneLabel(parent, z, s) {
  if (!z.label) return;
  const [x, y] = z.labelPos || polyCenter(z.points);
  const attrs = {
    class: `zone-label zone-label-${z.kind}`,
    x,
    y: y + 0.22 * s,
    'text-anchor': 'middle'
  };
  if (z.color) attrs.fill = z.color;
  if (z.rotate) attrs.transform = `rotate(${z.rotate} ${x} ${y})`;
  const t = el('text', attrs, parent);
  t.textContent = z.label;
}

/**
 * Centre = hold colour (empty when none was recorded), ring = difficulty colour.
 * Shape carries the result so colour is never the only cue: solid ring = sent,
 * extra outer halo = flash, dashed ring = tried.
 */
function drawPin(parent, pin, s = 1) {
  const g = el('g', { class: `pin pin-${pin.result}` }, parent);
  if (pin.result === 'flash') {
    el('circle', { class: 'pin-halo', cx: pin.x, cy: pin.y, r: (PIN_R + 0.17) * s, stroke: pin.ring }, g);
  }
  el('circle', {
    class: 'pin-dot',
    cx: pin.x,
    cy: pin.y,
    r: PIN_R * s,
    fill: pin.fill || 'var(--surface-solid)',
    stroke: pin.ring
  }, g);
}

/**
 * Renders the floor-zone key and colour-coded wall legend inside `host`.
 */
export function renderMapLegend(host, { walls = [], zones = [] }) {
  const parts = [];
  const kinds = new Set((zones || []).map((z) => z.kind));
  if (kinds.size) {
    const items = [];
    if (kinds.has('mat')) items.push(h('span', { class: 'zone-key-item' }, h('i', { class: 'zone-swatch zone-swatch-mat' }), 'Mats'));
    if (kinds.has('walkway')) items.push(h('span', { class: 'zone-key-item' }, h('i', { class: 'zone-swatch zone-swatch-walkway' }), 'Walking'));
    if (kinds.has('floor')) items.push(h('span', { class: 'zone-key-item' }, h('i', { class: 'zone-swatch zone-swatch-floor' }), '2nd floor'));
    if (kinds.has('area')) items.push(h('span', { class: 'zone-key-item' }, h('i', { class: 'zone-swatch zone-swatch-area' }), 'Areas'));
    if (items.length) parts.push(h('div', { class: 'zone-key' }, ...items));
  }

  if (walls.length) {
    parts.push(h('ul', { class: 'wall-legend' }, ...walls.map((w, i) => {
      const color = wallColor(w, i);
      return h('li', { class: 'wall-legend-item' },
        h('span', { class: 'wall-code-pill', style: `background:${color}`, text: w.code || `W${i + 1}` }),
        h('span', { class: 'wall-legend-name', text: w.name }));
    })));
  }

  host.replaceChildren(...parts);
  host.hidden = parts.length === 0;
}
