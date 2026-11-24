// gyms.js — built-in gym layouts offered in Setup. Each entry is a layout file (see AGENTS.md),
// loaded exactly like an uploaded one. Add a gym by appending its layout here.

export const BUILT_IN_GYMS = [
  {
    format: 'b-log-layout',
    version: 1,
    name: 'Rocktown',
    cols: 13,
    rows: 40,
    // Traced from a satellite view and turned upright: west end at the top, parking side on the
    // left. 1 grid unit ≈ 1.6 m. No walls yet; they are drawn in the app.
    outline: [[13, 0], [13, 40], [5, 39], [4, 26], [0, 2]],
    walls: []
  }
];
