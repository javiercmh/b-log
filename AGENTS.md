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
    bottom sheet with the **hold colour** swatches (optional, nothing pre-selected because it
    changes every route; tapping the chosen one again clears it) and **Flash / Sent / Tried**.
    Choosing an outcome saves immediately and shows an Undo toast. A tap far from every wall
    only shows a hint.
  - The map shows **only the selected day's** sends. It opens on today, and a new day starts
    empty. `‹ ›` and the date picker change the day (never into the future); logging and
    editing apply to the day that is shown. Reopening the app on a later day rolls over to the
    new today if the user was on today.
  - Tapping an existing pin opens the same sheet in edit mode: change difficulty colour, hold
    colour and outcome, then **Save**, or **Delete** (with Undo).
  - Pins: centre = hold colour (empty if none recorded), ring = difficulty colour. Solid ring =
    sent, extra outer halo = flash, dashed ring = tried.
  - A summary below the map lists, per colour in grade order, the counts of flash / sent / tried
    for the shown day, plus total tops.
  - The map uses the full width; a long hall makes it taller than the screen and the page scrolls,
    while the colour palette stays pinned at the top. Lay a long gym out upright (long side
    vertical) so pins stay a usable size.
- **Progress**: Weeks (last 12, Monday start) or Months (last 12). Tiles: sessions (days with
  any logged boulder), tops, flashes, hardest colour topped (by grade order). A stacked bar chart
  of tops per period, coloured by grade, with a legend, tap-for-details and a table view.
- **Setup**
  - **Gym map**: `+ Wall` → tap grid points to place the wall's corners (snapped to the grid,
    duplicates of the last point ignored) → Done → name it. Tapping an existing wall selects it
    for renaming or deletion. A wall with logged sends is **retired** instead of deleted
    (`removedOn`): it leaves the current map, but older days still show it with its pins.
  - **Gym name**: a free-text field at the top of the Gym map card (up to 60 characters, empty =
    none). It travels with layout files and names saved files (`rocktown-b-log-layout.json`).
  - **Building outline**: `+ Outline` / `Redraw outline` → tap the building's corners in order →
    Done closes the polygon (at least 3 corners). It is drawn as a grey floor under the grid dots on
    both maps and is never a wall: taps do not snap to it and boulders cannot be logged on it.
    `Remove outline` appears while redrawing. Saving or removing offers Undo. The outline is not
    versioned by date (only walls have history).
  - **Grid size**: width and height in grid units (4–100). It cannot shrink past current walls or
    the outline.
  - **Gym layout**: Upload / Save file / Share a `<gym>-b-log-layout.json` with the gym name, the
    grid, the outline and the current walls only (names and points; no ids, colours or climbs), so climbers at the same gym
    can swap layouts and a gym rebuild can be loaded in one go. Uploading replaces the name and
    outline (cleared if the file has none) and the walls:
    walls with logged sends are retired, unused ones dropped, and the new walls get
    `addedOn` = today. Undo is offered until a boulder is logged on the new walls. A B-log
    `gym.json` is accepted as an upload too. Share is hidden where `share.available` is false;
    Save falls back to a browser download in previews.
  - **Built-in gyms**: a list under the layout buttons; **Load** works exactly like uploading that
    layout (same replacement rules and Undo). The layouts live in `js/gyms.js` (an ES module, so
    no fetch is needed); add a gym by appending its layout object there. Currently: Rocktown
    (26 × 98 with 2nd floor above the 1st floor outline, west end at the top).
  - **Difficulty colours**: ordered easiest → hardest, each with a name and a colour. Reorder
    with ↑ ↓.
  - **Hold colours**: starts with 12 common hold colours; rename, recolour, reorder, add or
    remove them. The order is the order of the swatches in the sheet.
  - A difficulty or hold colour used by logged boulders cannot be deleted; it can be renamed or
    recoloured.

Terminology: a **top** is a boulder completed (`flash` or `sent`); `tried` is an attempt
without a top. Tries count towards sessions but not tops.

**Wall history**: the Climb map for a day shows the walls that stood on that day
(`addedOn` ≤ day < `removedOn`, both optional) plus any wall with a boulder logged that day, and
widens the grid if an older layout reaches past the current one. `addedOn` is only set once the
gym has retired walls, so a first setup can still log earlier days.

Out of scope for now (agreed with the owner, may come later): multiple gyms, a background image of
the gym's own plan, attempt counts, notes, per-wall statistics, background image for the map.

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
| `js/setup.js` | Setup screen: wall drawing/naming/deletion, grid size, one colour-list editor shared by difficulty and hold colours. |
| `js/progress.js` | Progress screen: tiles, SVG stacked bar chart, legend, details, table. |
| `js/map.js` | SVG renderer in grid units (`viewBox`), tap → grid coordinates. Receives data; never reads the store. |
| `js/geometry.js` | Pure: snap to wall/grid, nearest pin, polyline midpoint, wall extent. |
| `js/stats.js` | Pure: per-grade counts, week/month buckets, summary, local date helpers. |
| `js/dom.js` | `$`, `h()` element builder (text via `textContent`), toast, `attempt()` error wrapper, swatch. |
| `js/gyms.js` | Built-in gym layouts (plain layout-file objects) listed in Setup. |
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
  "name": "Rocktown",
  "cols": 12,
  "rows": 16,
  "outline": [[0, 0], [12, 0], [12, 16], [0, 16]],
  "walls": [{ "id": "w_…", "name": "Slab", "points": [[1, 1], [7, 1]],
               "addedOn": "2026-11-24", "removedOn": "2026-12-01" }],
  "grades": [{ "id": "g_red", "name": "Red", "color": "#ef4444" }],
  "holds": [{ "id": "h_blue", "name": "Blue", "color": "#2563eb" }]
}
```
`grades` order is the difficulty order, easiest first. `holds` are the hold colours; a file
without `holds` (written before v0.2) loads the default list. Wall `addedOn`/`removedOn` are
optional local dates (see wall history). `outline` is optional (`null` or absent = none): a closed
polygon of grid points. `name` is the optional gym name (`null` or absent = none). `color` is `#rrggbb`. IDs are stable and
never reused; names can change freely.

### `data/sends.json`
```json
[{ "id": "s_…", "date": "2026-11-24", "gradeId": "g_red", "holdId": "h_blue", "wallId": "w_…",
   "x": 3, "y": 1, "result": "flash", "createdAt": 1795551444043 }]
```
`date` is the **local** day (`YYYY-MM-DD`; never `toISOString()`, which is UTC). `result` is
`flash`, `sent` or `tried`. `holdId` is optional (`null` or absent when not recorded).

### Layout file (`b-log-layout.json`, not stored in `data/`)
```json
{ "format": "b-log-layout", "version": 1, "name": "Rocktown", "cols": 12, "rows": 16,
  "outline": [[0, 0], [12, 0], [12, 16], [0, 16]],
  "walls": [{ "name": "Slab", "points": [[1, 1], [7, 1]] }] }
```
Validated on upload: grid 4–100, up to 200 walls (a file needs walls or an outline), 1–100 integer
points per wall inside the grid, an optional name (trimmed, up to 60 characters), an optional outline of 3–100 such points, files up to 1 MiB.

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
- Chart colours are the gym's own difficulty colours (identity is fixed by the gym), so the
  chart always pairs them with names: legend, tap details and the table view. Results are told
  apart by shape (halo = flash, solid ring = sent, dashed ring = tried), never by colour alone.
- UI language is English. No `alert()`/`confirm()`; use the toast and inline hints.
