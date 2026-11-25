# B-log

A boulder logbook for [App²](https://github.com/javiercmh/appapp). Draw your gym, define its colour
grades, and tap the wall where you just climbed to log it as a flash, a send or a try, with the
colour of its holds so you know which route it was.

- **Climb**: pick a colour once, then tap a wall for each boulder. The map shows today's climbs;
  switch days to review or edit older ones. A summary counts flashes, sends and tries per colour.
- **Progress**: tops per week or month as a stacked chart by colour, sessions, flashes and your
  hardest colour.
- **Setup**: add your gym from the built-in list (RockTown Kaiserslautern so far) or upload, save and share gym layout files. A fresh install opens here.
  When a built-in gym's map changes, B-log offers the update and keeps your walls and history.
  Drag to order your gym's difficulty colours and the hold colours, and pick light, dark or system
  appearance.

Everything stays on the phone in plain JSON files (`data/`), included in App² exports and backups.
No internet permission needed.

## Install

In App²: **+ Import → GitHub** and enter `javiercmh/b-log`. Updates arrive through App²'s update
check.

## Development

See [AGENTS.md](AGENTS.md). Run the tests with `node --test tests/`.

## License

MIT
