// Tiny DOM helpers.

const SVG_NS = 'http://www.w3.org/2000/svg';

function build(el, props, children) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function h(tag, props, ...children) {
  return build(document.createElement(tag), props, children);
}

export function s(tag, props, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children);
}

export const icons = {
  play: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M7 4.5v15l13-7.5z' })),
  stop: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('rect', { x: 6, y: 6, width: 12, height: 12, rx: 2 })),
  wave: () =>
    s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      s('path', { d: 'M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' })),
};

let toastTimer = 0;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Open a bottom sheet. `render(close)` returns the sheet body. */
export function openSheet(title, render) {
  const root = document.getElementById('sheet-root');
  const close = () => {
    root.innerHTML = '';
    document.body.style.overflow = '';
  };
  const body = h('div', null);
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'btn small ghost', onclick: close }, 'Done')),
    body);
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => e.target === backdrop && close() }, sheet);
  const rerender = () => body.replaceChildren(render(close, rerender));
  rerender();
  root.replaceChildren(backdrop);
  document.body.style.overflow = 'hidden';
  return { close, rerender };
}

export function seg(options, value, onChange, { disabled } = {}) {
  return h('div', { class: 'seg', role: 'tablist' },
    options.map(([v, label]) =>
      h('button', {
        class: v === value ? 'active' : '',
        role: 'tab',
        'aria-selected': v === value ? 'true' : 'false',
        disabled: disabled && disabled(v),
        onclick: () => onChange(v),
      }, label)));
}
