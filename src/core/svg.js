const NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element, set attributes, optionally append it to a parent. */
export function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  setAttrs(el, attrs);
  parent?.appendChild(el);
  return el;
}

/** Set attributes; null or undefined removes the attribute. */
export function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) el.removeAttribute(k);
    else el.setAttribute(k, v);
  }
  return el;
}
