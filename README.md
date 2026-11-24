# B-log

A boulder logbook for [App²](https://github.com/javiercmh/appapp). Draw your gym, define its colour
grades, and tap the wall where you just climbed to log it as a flash, a send or a try, with the
colour of its holds so you know which route it was.

- **Climb**: pick a colour once, then tap a wall for each boulder. The map shows today's climbs;
  switch days to review or edit older ones. A summary counts flashes, sends and tries per colour.
- **Progress**: tops per week or month as a stacked chart by colour, sessions, flashes and your
  hardest colour.
- **Setup**: draw the building outline and the walls on a grid, name the walls, set your gym's difficulty colours from easiest to
  hardest, and edit the list of hold colours. Upload, save or share the gym layout as a file to
  swap it with friends; when the gym is rebuilt, the old walls stay in your history.

Everything stays on the phone in plain JSON files (`data/`), included in App² exports and backups.
No internet permission needed.

## Install

In App²: **+ Import → GitHub** and enter `javiercmh/b-log`. Updates arrive through App²'s update
check.

## Development

See [AGENTS.md](AGENTS.md). Run the tests with `node --test tests/`.

## License

MIT
