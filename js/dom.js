// dom.js — small DOM helpers shared by the screens: element lookup, builders and the toast.

export const $ = (id) => document.getElementById(id);

/** Creates an element with properties/attributes and children. Text goes through textContent. */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
}

let toastTimer = null;

/** Replaces alert(): a short message with an optional Undo action. */
export function toast(message, actionLabel = null, onAction = null) {
  $('toast-text').textContent = message;
  const action = $('toast-action');
  action.hidden = !actionLabel;
  if (actionLabel) action.textContent = actionLabel;
  action.onclick = () => {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
    if (onAction) onAction();
  };
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, actionLabel ? 5000 : 2600);
}

/** Runs a store mutation and reports its error as a toast. Returns true on success. */
export function attempt(fn) {
  try {
    fn();
    return true;
  } catch (err) {
    console.error(err);
    toast(err.message);
    return false;
  }
}

export function swatch(grade, checked, onClick) {
  return h('button', {
    type: 'button',
    class: 'swatch',
    role: 'radio',
    'aria-checked': String(checked),
    'aria-label': grade.name,
    title: grade.name,
    style: `background:${grade.color}`,
    onclick: onClick
  });
}
