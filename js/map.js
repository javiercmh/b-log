// map.js — renders the gym floor plan as SVG in grid units and converts taps to grid points.
// Pure presentation: it receives data and callbacks, never reads the store itself.

import { polylineMidpoint } from './geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 0.6;
export const PIN_R = 0.34;

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Creates a map inside `host`. `onTap([x, y])` receives grid coordinates (unsnapped).
 */
export function createMap(host, onTap) {
  const svg = el('svg', { class: 'map-svg', role: 'img' });
  host.replaceChildren(svg);
  // Use `click`, not pointerup: the browser only fires it for a real tap (not a scroll), and
  // opening the sheet on pointerup lets the trailing click land on the new dialog's backdrop
  // and close it again.
  svg.addEventListener('click', (e) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    onTap([pt.x, pt.y]);
  });

  return {
    svg,
    /**
     * view = { cols, rows, outline: [[x,y]...] | null, walls, pins: [{x, y, ring, fill, result}], selectedWallId,
     *          draft: [[x,y]...] | null, draftClosed, preview: {x, y, ring, fill} | null, label }
     */
    render(view) {
      const { cols, rows } = view;
      svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${cols + 2 * PAD} ${rows + 2 * PAD}`);
      svg.setAttribute('aria-label', view.label || 'Gym map');
      svg.replaceChildren();

      el('rect', { class: 'map-floor', x: 0, y: 0, width: cols, height: rows, rx: 0.3 }, svg);

      if (view.outline && view.outline.length >= 3) {
        el('polygon', { class: 'map-outline', points: view.outline.map((p) => p.join(',')).join(' ') }, svg);
      }

      const dots = el('g', { class: 'map-grid' }, svg);
      for (let x = 0; x <= cols; x++) {
        for (let y = 0; y <= rows; y++) el('circle', { cx: x, cy: y, r: 0.05 }, dots);
      }

      const walls = el('g', { class: 'map-walls' }, svg);
      for (const w of view.walls) {
        const cls = w.id === view.selectedWallId ? 'wall selected' : 'wall';
        const pts = w.points.map((p) => p.join(',')).join(' ');
        if (w.points.length === 1) el('circle', { class: cls, cx: w.points[0][0], cy: w.points[0][1], r: 0.18 }, walls);
        else el('polyline', { class: cls, points: pts }, walls);
      }

      const labels = el('g', { class: 'map-labels' }, svg);
      for (const w of view.walls) {
        if (!w.name) continue;
        const m = polylineMidpoint(w.points);
        const t = el('text', { x: m.x, y: m.y - 0.45, 'text-anchor': 'middle' }, labels);
        t.textContent = w.name;
      }

      if (view.draft && view.draft.length) {
        const d = el('g', { class: 'map-draft' }, svg);
        const pts = view.draft.map((p) => p.join(',')).join(' ');
        if (view.draft.length > 1) el(view.draftClosed ? 'polygon' : 'polyline', { points: pts }, d);
        view.draft.forEach((p, i) => el('circle', { cx: p[0], cy: p[1], r: i === view.draft.length - 1 ? 0.24 : 0.16 }, d));
      }

      const pins = el('g', { class: 'map-pins' }, svg);
      for (const pin of view.pins) drawPin(pins, pin);
      if (view.preview) drawPin(pins, { ...view.preview, result: 'preview' });
    }
  };
}

/**
 * Centre = hold colour (empty when none was recorded), ring = difficulty colour.
 * Shape carries the result so colour is never the only cue: solid ring = sent,
 * extra outer halo = flash, dashed ring = tried.
 */
function drawPin(parent, pin) {
  const g = el('g', { class: `pin pin-${pin.result}` }, parent);
  if (pin.result === 'flash') {
    el('circle', { class: 'pin-halo', cx: pin.x, cy: pin.y, r: PIN_R + 0.17, stroke: pin.ring }, g);
  }
  el('circle', {
    class: 'pin-dot',
    cx: pin.x,
    cy: pin.y,
    r: PIN_R,
    fill: pin.fill || 'var(--surface-solid)',
    stroke: pin.ring
  }, g);
}
