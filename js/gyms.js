// gyms.js — built-in gym layouts offered in Setup. Each entry is a layout file (see AGENTS.md),
// loaded exactly like an uploaded one. Add a gym by appending its layout here.

export const BUILT_IN_GYMS = [
  {
    format: 'b-log-layout',
    version: 1,
    name: 'Rocktown',
    cols: 26,
    rows: 100,
    // Traced from satellite + interior photos, turned upright: west end at the top, parking side
    // on the left. 1 grid unit ≈ 0.8 m. 2nd floor (above the West Cave) sits cleanly in y = 0..16
    // above the 1st floor outline (y = 20..100) so walls and pins never overlap.
    outline: [[26, 20], [26, 100], [10, 98], [8, 72], [0, 59], [0, 24]],
    zones: [
      // 2nd floor deck (above West Cave)
      { kind: 'floor', label: '2F · ABOVE CAVE', labelPos: [13, 14.8], points: [[26, 0], [26, 16], [0, 16], [0, 4]] },
      { kind: 'area', label: 'Yoga', color: '#a855f7', points: [[2, 4], [9, 4], [9, 12], [2, 12]] },
      // 1st floor climbing mats
      { kind: 'mat', points: [[0, 24], [26, 20], [26, 69], [18, 69], [16, 40], [11, 40], [11, 59], [0, 59]] },
      { kind: 'mat', points: [[17, 72], [26, 72], [26, 95], [15, 95], [15, 77]] },
      // 1st floor walking / seating / entrance corridor
      {
        kind: 'walkway',
        label: 'WALKING AREA',
        labelPos: [13.8, 51],
        rotate: -90,
        points: [[11, 40], [16, 40], [18, 69], [26, 69], [26, 72], [17, 72], [15, 77], [15, 95], [26, 95], [26, 100], [10, 98], [8, 72], [0, 59], [11, 59]]
      },
      // 2F overhang footprint above 1F cave
      { kind: 'floor', points: [[26, 20], [26, 36], [0, 36], [0, 24]] },
      // Named non-climbing areas
      { kind: 'area', label: 'Bistro', color: '#f59e0b', points: [[6, 61], [14, 61], [14, 70], [6, 70]] },
      { kind: 'area', label: 'ENTRANCE', color: '#4ade80', labelPos: [18, 98.2], points: [[11, 96], [25, 96], [25, 99.5], [11, 99.5]] }
    ],
    walls: [
      // 2nd floor (above West Cave)
      { code: '2F-1', name: 'Kilterboard', color: '#38bdf8', labelPos: [17, 9.2], points: [[14, 12], [20, 12]] },
      { code: '2F-2', name: 'MoonBoard', color: '#facc15', labelPos: [14, 2.0], points: [[10, 4], [18, 4]] },
      { code: '2F-3', name: '2F North Wall', color: '#fb923c', labelPos: [21.5, 6.4], points: [[20, 4], [24, 4], [24, 12]] },
      // 1st floor (Main Hall, West → East)
      { code: 'W1', name: 'West Cave', color: '#f97316', labelPos: [16.5, 31], points: [[14, 36], [14, 26], [19, 26], [19, 36]] },
      { code: 'W2', name: 'Cave Barrel & North', color: '#ef4444', labelPos: [22.2, 32.6], points: [[19, 36], [21, 35], [23, 36], [25, 39], [25, 52]] },
      { code: 'W3', name: 'South Blue/Grey Bay', color: '#eab308', labelPos: [5.4, 41], points: [[14, 36], [10, 35], [2, 37], [1, 41], [1, 44], [2, 46]] },
      { code: 'W4', name: 'South Big Wave', color: '#f43f5e', labelPos: [5.2, 50.5], points: [[2, 46], [7, 47], [9, 49], [9, 52], [7, 54], [2, 54]] },
      { code: 'W5', name: 'North Narrow Prow', color: '#22c55e', labelPos: [22.0, 54], points: [[25, 52], [19, 54], [25, 56]] },
      { code: 'W6', name: 'North Faceted & Corner', color: '#06b6d4', labelPos: [20.2, 63], points: [[25, 56], [24, 60], [22, 63], [24, 66], [22, 68]] },
      { code: 'W7', name: 'East Overhang', color: '#3b82f6', labelPos: [18.6, 82.5], points: [[25, 72], [25, 76], [23, 78], [21, 81], [21, 84], [23, 86], [25, 88]] },
      { code: 'W8', name: 'Fußball Dome', color: '#a855f7', labelPos: [18.0, 92.2], points: [[25, 88], [23, 89], [21, 90], [20, 92], [21, 94], [23, 95], [25, 95]] }
    ]
  }
];
