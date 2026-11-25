// gyms.js — built-in gym layouts offered in Setup. Each entry is a layout file (see AGENTS.md),
// loaded exactly like an uploaded one. Add a gym by appending its layout here.

export const BUILT_IN_GYMS = [
  {
    format: 'b-log-layout',
    version: 1,
    name: 'Rocktown',
    cols: 26,
    rows: 98,
    // Traced from satellite + interior photos, turned upright: west end at the top, parking side
    // on the left. 1 grid unit ≈ 0.8 m. 2nd floor (above the West Cave) sits cleanly in y = 0..14
    // above the 1st floor outline (y = 18..98) so walls and pins never overlap.
    outline: [[26, 18], [26, 98], [10, 96], [8, 70], [0, 57], [0, 22]],
    walls: [
      // 2nd floor (above West Cave)
      { name: '2F MoonBoard', points: [[10, 4], [18, 4]] },
      { name: '2F Kilterboard', points: [[14, 12], [20, 12]] },
      { name: '2F North Wall', points: [[20, 4], [24, 4], [24, 12]] },
      // 1st floor (Main Hall, West → East)
      { name: 'Cave', points: [[14, 34], [14, 24], [19, 24], [19, 34]] },
      { name: 'Cave Barrel', points: [[19, 34], [21, 33], [23, 34], [25, 37], [25, 50]] },
      { name: 'South Bay', points: [[14, 34], [10, 33], [2, 35], [1, 39], [1, 42], [2, 44]] },
      { name: 'South Wave', points: [[2, 44], [7, 45], [9, 47], [9, 50], [7, 52], [2, 52]] },
      { name: 'North Prow', points: [[25, 50], [19, 52], [25, 54]] },
      { name: 'North Wall', points: [[25, 54], [24, 58], [22, 61], [24, 64], [22, 66]] },
      { name: 'East Overhang', points: [[25, 70], [25, 74], [23, 76], [21, 79], [21, 82], [23, 84], [25, 86]] },
      { name: 'Fußball', points: [[25, 86], [23, 87], [21, 88], [20, 90], [21, 92], [23, 93], [25, 93]] }
    ]
  }
];
