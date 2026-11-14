export const $ = (id) => document.getElementById(id);

export const has = (o, k) => Object.hasOwn(o, k);

const textCache = new WeakMap();

export function setText(el, text) {
  if (textCache.get(el) === text) return;
  textCache.set(el, text);
  el.textContent = text;
}

export function setHTML(el, html) {
  if (textCache.get(el) === html) return;
  textCache.set(el, html);
  el.innerHTML = html;
}
