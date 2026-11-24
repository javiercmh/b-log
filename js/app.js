// app.js — entry point: loads data, wires the three screens and the tab bar.

import * as store from './store.js';
import * as climb from './climb.js';
import * as progress from './progress.js';
import * as setup from './setup.js';
import { $ } from './dom.js';

const screens = { climb, progress, setup };
let current = 'climb';

function show(name) {
  current = name;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.pane === name);
  for (const pane of document.querySelectorAll('.pane')) pane.classList.toggle('active', pane.id === `pane-${name}`);
  screens[name].render();
  window.scrollTo(0, 0);
}

function showDamaged() {
  const files = [...store.corrupt];
  $('damaged').hidden = files.length === 0;
  $('damaged').textContent = files.length
    ? `Could not read ${files.join(', ')}. B-log will not overwrite ${files.length === 1 ? 'it' : 'them'}; fix or delete the file in the App² editor.`
    : '';
}

store.load();
showDamaged();

climb.init();
progress.init();
setup.init();

for (const tab of document.querySelectorAll('.tab')) tab.onclick = () => show(tab.dataset.pane);
$('go-setup').onclick = () => show('setup');

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  climb.refreshToday();
  if (current !== 'climb') screens[current].render();
});

show('climb');
