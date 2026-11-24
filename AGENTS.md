# AGENTS.md — B-log Subapp Specification & Developer Guide

**B-log** is an offline boulder logbook that runs inside App². The user draws their gym as a
floor plan, defines the gym's own colour grades, and logs each boulder by tapping the wall where
it was. It answers "how many reds and blues did I climb today, and where?" and shows progress
over weeks and months.

> Platform contract (bridge API, limits, packaging, GitHub updates): [`PACKAGING.md`](./PACKAGING.md).
> It is copied from the App² starter template; refresh it from the host repository rather than editing it.

---

## 1. Features & workflows

- **Climb** (default tab)
  - A palette of the gym's colours sits above the map. The selected colour is remembered
    (`data/settings.json`) and stays selected until changed, so logging a run of reds is one
    tap per boulder plus the outcome.
  - Tapping near a wall (within `SNAP_DIST` grid units) snaps the tap onto the wall and opens a
    bottom sheet with **Flash / Sent / Tried**; choosing one saves immediately and shows an Undo
    toast. A tap far from every wall only shows a hint.
  - The map shows **only the selected day's** sends. It opens on today, and a new day starts
    empty. `‹ ›` and the date picker change the day (never into the future); logging and
    editing apply to the day that is shown. Reopening the app on a later day rolls over to the
    new today if the user was on today.
  - Tapping an existing pin opens the same sheet in edit mode: change colour and outcome, then
    **Save**, or **Delete** (with Undo).
  - A summary below the map lists, per colour in grade order, the counts of flash / sent / tried
    for the shown day, plus total tops.
- **Progress**: Weeks (last 12, Monday start) or Months (last 12). Tiles: sessions (days with
  any logged boulder), tops, flashes, hardest colour topped (by grade order). A stacked bar chart
  of tops per period, coloured by grade, with a legend, tap-for-details and a table view.
- **Setup**
  - **Gym map**: `+ Wall` → tap grid points to place the wall's corners (snapped to the grid,
    duplicates of the last point ignored) → Done → name it. Tapping an existing wall selects it
    for renaming or deletion. A wall with logged sends cannot be deleted (its pins would lose
    their place); it can be renamed.
  - **Grid size**: width and height in grid units (4–40). It cannot shrink past existing walls.
  - **Colours**: ordered easiest → hardest, each with a name and a colour. Reorder with ↑ ↓.
    A colour with logged sends cannot be deleted; it can be renamed or recoloured.

Terminology: a **top** is a boulder completed (`flash` or `sent`); `tried` is an attempt
without a top. Tries count towards sessions but not tops.

Out of scope for v1 (agreed with the owner, may come later): multiple gyms, wall re-set dates,
attempt counts, notes, per-wall statistics, background image for the map.

---

## 2. Architecture

Vanilla ES modules, no build step. Dependencies point one way: screens → `store` → `bridge`.
Pure logic lives in `geometry.js` and `stats.js` so it can be unit tested in Node.

| File | Responsibility |
| :--- | :--- |
| `index.html` | Shell: three panes (`#pane-climb`, `#pane-progress`, `#pane-setup`), the log/edit `<dialog id="sheet">`, toast, tab bar. |
| `css/style.css` | Light/dark tokens (`prefers-color-scheme`), `--sa-*` safe-area tokens, map, sheet, chart styles. |
| `js/app.js` | Entry point: loads the store, shows the damaged-file banner, tab switching, day rollover on `visibilitychange`. |
| `js/climb.js` | Climb screen: day switcher, palette, tap handling (pin hit test → edit, wall snap → log), sheet, day summary. |
| `js/setup.js` | Setup screen: wall drawing/naming/deletion, grid size, colour list. |
| `js/progress.js` | Progress screen: tiles, SVG stacked bar chart, legend, details, table. |
| `js/map.js` | SVG renderer in grid units (`viewBox`), tap → grid coordinates. Receives data; never reads the store. |
| `js/geometry.js` | Pure: snap to wall/grid, nearest pin, polyline midpoint, wall extent. |
| `js/stats.js` | Pure: per-grade counts, week/month buckets, summary, local date helpers. |
| `js/dom.js` | `$`, `h()` element builder (text via `textContent`), toast, `attempt()` error wrapper, swatch. |
| `js/store.js` | Loads/validates/saves `data/*.json`. The only module that calls `bridge.js`. |
| `js/bridge.js` | App² bridge wrapper, copied from the starter template. Do not edit except to refresh it from the host. |

### Map coordinates

Everything on the map is in **grid units**: the floor spans `0..cols` × `0..rows`, wall corners
are integer grid points, and a send's `x`/`y` is the snapped point on its wall (rounded to 0.01).
Rendering scales the SVG `viewBox` to the screen width, so data never depends on screen size.

---

## 3. Data schema (`data/`)

All records and settings are plain JSON files. Missing files load defaults and are only written
on the first change. A file that exists but does not parse or validate is listed in the damaged
banner and **never overwritten** (every write to it throws) until the user fixes or deletes it.
Every mutation builds the next state, writes it, and publishes it only if the write returned
`true`.

### `data/gym.json`
```json
{
  "version": 1,
  "cols": 12,
  "rows": 16,
  "walls": [{ "id": "w_…", "name": "Slab", "points": [[1, 1], [7, 1]] }],
  "grades": [{ "id": "g_red", "name": "Red", "color": "#ef4444" }]
}
```
`grades` order is the difficulty order, easiest first. `color` is `#rrggbb`. IDs are stable and
never reused; names can change freely.

### `data/sends.json`
```json
[{ "id": "s_…", "date": "2026-11-24", "gradeId": "g_red", "wallId": "w_…",
   "x": 3, "y": 1, "result": "flash", "createdAt": 1795551444043 }]
```
`date` is the **local** day (`YYYY-MM-DD`; never `toISOString()`, which is UTC). `result` is
`flash`, `sent` or `tried`.

### `data/settings.json`
```json
{ "version": 1, "selectedGradeId": "g_red" }
```

The repository copies of these files are the empty seeds shipped to new installs. Never commit
real climbing data.

---

## 4. Development

- Unit tests: `node --test tests/` (geometry, stats, and the store against an in-memory fake
  bridge: persistence round trip, failed writes, damaged files, delete guards).
- Browser preview: copy the repo to a scratch folder and run `python3 dev_server.py` there, so
  test data never lands in the repository's `data/`.
- Keep `manifest.json` `files` and `app2Update.managedFiles` in sync with shipped files.
  `data/*.json` are `seedFiles` only (copied when absent, never replaced by an update).
- Bump `manifest.json` `version` for each release pushed to `main`; App² offers the update from
  GitHub (`javiercmh/b-log`, branch `main`).
- Chart colours are the gym's own grade colours (identity is the hold colour), so the chart
  always pairs them with names: legend, tap details and the table view. Results are told apart
  by shape (◉ flash, ● sent, ○ tried), never by colour alone.
- UI language is English. No `alert()`/`confirm()`; use the toast and inline hints.
