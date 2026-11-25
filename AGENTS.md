# AGENTS.md — B-log Subapp Specification & Developer Guide

**B-log** is an offline boulder logbook that runs inside App². The user draws their gym as a
floor plan, defines the gym's own colour grades, and logs each boulder by tapping the wall where
it was. It answers "how many reds and blues did I climb today, and where?" and shows progress
over weeks and months.

> Platform contract (bridge API, limits, packaging, GitHub updates): [`PACKAGING.md`](./PACKAGING.md).
> It is copied from the App² starter template; refresh it from the host repository rather than editing it.

---

## 1. Features & workflows

- **Start tab**: Climb once a gym is loaded; a fresh install (no walls and no outline,
  `store.hasGym()` false) opens on **Setup**, where the gym is added.
- **Climb** (default tab once a gym is loaded)
  - A palette of the gym's colours (dot + name) sits above the map. Each colour carries a badge
    with the number of tops of that colour on the shown day. The selected colour is remembered
    (`data/settings.json`) and stays selected until changed, so logging a run of reds is one
    tap per boulder plus the outcome. Under the palette, one line counts the day's tops, flashes
    and tries, with **Details** scrolling to the summary.
  - Tapping near a wall (within `SNAP_DIST` grid units) snaps the tap onto the wall and opens a
    bottom sheet titled with the wall's name. It shows the **difficulty** (pre-selected from the
    palette; changing it here applies to this boulder only), the **hold colour** (named swatches,
    optional, nothing pre-selected because it changes every route; tapping the chosen one again
    clears it) and **Flash / Sent / Tried**. Each outcome button previews the exact pin it will
    drop. Choosing an outcome saves immediately and shows an Undo toast. A tap far from every wall
    only shows a hint.
  - The map shows **only the selected day's** sends. It opens on today, and a new day starts
    empty. `‹ ›` and the date picker change the day (never into the future); logging and
    editing apply to the day that is shown. Reopening the app on a later day rolls over to the
    new today if the user was on today.
  - Tapping an existing pin opens the same sheet in edit mode: change difficulty colour, hold
    colour and outcome, then **Save**, or **Delete** (with Undo).
  - Pins: centre = hold colour (empty if none recorded), ring = difficulty colour. Solid ring =
    sent, extra outer halo = flash, dashed ring = tried. A light rim keeps pins readable.
  - The floor, zones and walls are drawn **neutral** (grey walls, outlined code pills): colour on
    the map only ever means a logged boulder, so a red pin never disappears on a red wall. Wall
    `color` values in layout files are kept but not drawn.
  - A pin is drawn snapped onto its wall's **current** shape (a reshaped wall in a new layout
    revision); the send's saved `x`/`y` never change.
  - A summary below the map lists, per colour in grade order, the counts of flash / sent / tried
    for the shown day, plus total tops.
  - The map uses the full width; a long hall makes it taller than the screen and the page scrolls,
    while the colour palette stays pinned at the top. Lay a long gym out upright (long side
    vertical) so pins stay a usable size.
- **Progress**: Weeks (last 12, Monday start) or Months (last 12). Tiles compare the range with
  the 12 periods before it: sessions (days with any logged boulder) and tops with a ▲/▼ change,
  flash rate (flashes ÷ tops, with the flash count), and hardest colour topped (by grade order,
  with the previous range's when it differs). A stacked bar chart of tops per period, coloured by
  grade, with whole-number axis ticks, a legend, tap-for-details and a table view. **Tops by
  colour**: one bar per colour (hardest first), bar length = tops, solid part = flashes.
- **Setup** is a list of rows that open sub-pages (‹ Setup goes back; the Setup tab always opens
  the list). Groups: **Your gym** (things that belong to one gym), **All gyms**, **App**.
  - **No gym loaded** (fresh install): "Your gym" is a single **+ Add your gym** card, and the
    gym's own rows are hidden. It opens the **Add a gym** sheet: each built-in gym with a map
    thumbnail, wall and colour counts and **Add**; a greyed "More gyms coming soon" row; and
    **Upload layout file**. The Climb empty state's **Add your gym** button opens the same sheet.
    Adding loads the layout like any other load (toast with Undo). There is no in-app map drawing,
    so nothing here asks the user to design a map.
  - **Your gym** card (once loaded): the gym name, editable in place (up to 60 characters), with
    the wall and colour counts; a map thumbnail (turned on its side when the gym is taller than
    wide) that opens **Map & walls**, a read-only map with the zone key and the wall legend
    (code + name); the **layout update** banner when there is one; and rows:
    - **Difficulty colours** (the row shows the colours easy → hard, left to right): stored
      easiest → hardest, shown hardest on top with a Hard ↑ / Easy ↓ scale. Each row has a name,
      a colour and a ⠿ handle: drag to reorder (or focus the handle and use ↑ ↓ keys). Layouts can
      optionally include their own `grades` (easiest → hardest), which are applied on load while
      reusing matching IDs and keeping any unlisted grades that have logged boulders.
    - **Change gym**: **Built-in gyms** (the one in use shows "✓ In use", or **Update**
      when a newer revision exists; others **Load**), and **Upload / Save file / Share** for layout
      files. Maps are designed externally (e.g. with AI) as JSON layout files rather than drawn
      in-app. A B-log `gym.json` is accepted as an upload too. Share is hidden where
      `share.available` is false; Save falls back to a browser download in previews.
  - **All gyms → Hold colours** (the row shows the colours): starts with 12 common hold colours;
    rename, recolour, drag to reorder, add or remove. The order is the order of the swatches in
    the sheet. Hold colours are an input method, the same at every gym, so they are stored in
    `settings.json`, **never in a gym file or layout**; loading a gym never changes them.
  - **App → App settings**: Appearance System / Light / Dark (`settings.theme`).
  - A difficulty or hold colour used by logged boulders cannot be deleted; it can be renamed or
    recoloured.
  - **Loading a layout** (upload, built-in Load or Update) replaces the name, grid, outline, zones
    and walls, with Undo until a boulder is logged on a new wall. When the layout is a new version
    of the **same gym** (same built-in `id`, else same name), walls are matched by `code` (else
    name): a matched wall keeps its id and history and just takes the new shape (**reshaped**);
    a new code is a **new wall** (`addedOn` = today once the gym has retired walls); a missing code
    is **removed** (retired if it has logged boulders, dropped otherwise). A different gym never
    matches walls: all used walls are retired.
  - **Layout updates**: built-in gyms carry a permanent `id` and a `revision`. Loading one stores
    `gym.source = { id, revision }`. When `js/gyms.js` ships a higher revision, Setup shows
    "New <gym> layout · n new walls · n reshaped · n removed" with **Update**, and the Setup tab
    gets a dot. A gym loaded before revisions existed (no `source`) is matched by name and offered
    the update once. A renamed built-in gym lists its old names in `formerNames`, so a gym loaded
    under an old name still matches (walls keep their history); the rename itself reaches existing
    installs through a revision bump.
  - Built-in gyms so far: **RockTown Kaiserslautern** (`id: rocktown`, formerly "Rocktown").

Terminology: a **top** is a boulder completed (`flash` or `sent`); `tried` is an attempt
without a top. Tries count towards sessions but not tops.

**Wall history**: the Climb map for a day shows the walls that stood on that day
(`addedOn` ≤ day < `removedOn`, both optional) plus any wall with a boulder logged that day, and
widens the grid if an older layout reaches past the current one. `addedOn` is only set once the
gym has retired walls, so a first setup can still log earlier days.

Out of scope for now (agreed with the owner, may come later): multiple gyms (the Setup list is
already grouped per gym for it), a background image of
the gym's own plan, attempt counts, notes, per-wall statistics, background image for the map.

---

## 2. Architecture

Vanilla ES modules, no build step. Dependencies point one way: screens → `store` → `bridge`.
Pure logic lives in `geometry.js` and `stats.js` so it can be unit tested in Node.

| File | Responsibility |
| :--- | :--- |
| `index.html` | Shell: three panes (`#pane-climb`, `#pane-progress`, `#pane-setup` with `#setup-home` list and `#setup-page` sub-pages), the log/edit `<dialog id="sheet">`, the add-a-gym `<dialog id="gym-sheet">`, toast, tab bar (inline SVG icons). |
| `css/style.css` | Light/dark tokens (`prefers-color-scheme`, overridden by `:root[data-theme]`), `--sa-*` safe-area tokens, map, sheet, setup, chart styles. |
| `js/app.js` | Entry point: loads the store, applies the theme, shows the damaged-file banner, tab switching, day rollover on `visibilitychange`. |
| `js/climb.js` | Climb screen: day switcher, palette with counts, day tally, tap handling (pin hit test → edit, wall snap → log), sheet with pin-preview outcomes, day summary. |
| `js/setup.js` | Setup screen: "Add your gym" card and picker sheet when no gym is loaded, row list and sub-pages, layout load/upload/save/share and updates, drag-to-reorder colour lists, app settings. |
| `js/progress.js` | Progress screen: comparison tiles, SVG stacked bar chart, legend, details, table, tops by colour. |
| `js/map.js` | SVG renderer in grid units (`viewBox`), tap → grid coordinates, pin icon for the sheet, static gym thumbnail (`mapThumb`). Receives data; never reads the store. |
| `js/geometry.js` | Pure: snap to wall/grid, nearest pin, polyline midpoint, wall extent. |
| `js/stats.js` | Pure: per-grade counts, week/month buckets, summary, chart axis scale, local date helpers. |
| `js/dom.js` | `$`, `h()` element builder (text via `textContent`), toast, `attempt()` error wrapper, named swatch, `applyTheme()`. |
| `js/gyms.js` | Built-in gym layouts (plain layout-file objects with `id` and `revision`) listed in Setup. |
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
  "source": { "id": "rocktown", "revision": 1 }
}
```
`grades` order is the difficulty order, easiest first. Hold colours are not part of the gym (see
`settings.json`); a gym file written before v0.8 may still contain `holds`, which load moves to
`settings.json` once (settings first, ids kept; if `settings.json` is damaged they stay in the
gym file until it can be written). Wall `addedOn`/`removedOn` are
optional local dates (see wall history). `outline` is optional (`null` or absent = none): a closed
polygon of grid points. `name` is the optional gym name (`null` or absent = none). `source` is
the built-in gym and revision the layout came from (`null` or absent = uploaded or older file). `color` is `#rrggbb`. IDs are stable and
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
Built-in layouts also carry `"id"` (permanent) and `"revision"` (integer ≥ 1), and optionally
`"formerNames"` (earlier names of the same gym, matched case-insensitively like the name). Walls may carry
`code` (up to 8 characters, the wall's identity across revisions), `color` and `labelPos`.
Validated on upload: grid 4–100, up to 200 walls (a file needs walls or an outline), 1–100 integer
points per wall inside the grid, an optional name (trimmed, up to 60 characters), an optional outline of 3–100 such points, files up to 1 MiB.

### `data/settings.json`
```json
{ "version": 1, "selectedGradeId": "g_red", "theme": "system",
  "holds": [{ "id": "h_blue", "name": "Blue", "color": "#2563eb" }] }
```
`theme` is `system`, `light` or `dark` (anything else loads as `system`). `holds` are the
app-wide hold colours in swatch order (absent = the 12 defaults); a send's `holdId` refers to them.
An invalid `holds` list marks the file as damaged.

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
- **Built-in gym changes**: bump the gym's `revision` in `js/gyms.js` whenever its layout changes,
  so installs offer the update. Never change a gym's `id`, and keep a wall's `code` when you
  reshape or rename it (a new code = a new wall; a dropped code = a removed wall).
- Keep the map neutral: never colour walls or zones by identity. Colour on the map is reserved
  for logged boulders (difficulty ring, hold centre).
- Colour dots use `--swatch-ring` so black stays visible on dark and white on light.
- UI changes: show the owner screenshots of the options first and build after they choose;
  take screenshots from a scratch copy (see Browser preview above).
