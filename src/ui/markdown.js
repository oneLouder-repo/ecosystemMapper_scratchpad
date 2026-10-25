import { h } from './dom.js';
import { parseMarkdown } from '../platform/pages.js';

/**
 * Turn a page body into DOM nodes. Text is always set as text (never as
 * HTML), so a body can't inject markup or scripts.
 *
 * `embed({ kind, id })` returns the element for a [[kind:id]] shortcode,
 * e.g. a live dashboard or an episode player; without it, or when it
 * returns nothing, the shortcode shows as a small placeholder.
 */
export function Markdown(body, { embed } = {}) {
  return h('div', { class: 'md' }, parseMarkdown(body).map((b) => block(b, embed)));
}

function block(b, embed) {
  switch (b.t) {
    case 'h': return h(`h${b.level}`, {}, inline(b.c));
    case 'p': return h('p', {}, inline(b.c));
    case 'ul': case 'ol': return h(b.t, {}, b.items.map((c) => h('li', {}, inline(c))));
    case 'quote': return h('blockquote', {}, inline(b.c));
    case 'hr': return h('hr');
    case 'embed': return embed?.(b) ?? h('div', { class: 'md-embed-missing' }, `${b.kind} “${b.id}” is not available here.`);
    default: return null;
  }
}

function inline(nodes) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return n.v;
      case 'b': return h('strong', {}, inline(n.c));
      case 'i': return h('em', {}, inline(n.c));
      case 'code': return h('code', {}, n.v);
      case 'a': return h('a', { href: n.href, ...(/^https?:/.test(n.href) ? { target: '_blank', rel: 'noopener' } : {}) }, inline(n.c));
      default: return null;
    }
  });
}
