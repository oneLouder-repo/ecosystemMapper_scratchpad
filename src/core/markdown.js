/**
 * A small Markdown reader for exporting Dashi docs. It reads what the
 * editor writes (headings, paragraphs, bold, italic, strikethrough, code,
 * links, bullet and numbered lists with nesting, task lists, quotes, code
 * blocks, rules and tables) into plain blocks that the exporters
 * (core/office.js, core/pdf.js) and toHtml turn into files.
 *
 *   blocks: { type: 'heading', level, runs } | { type: 'para', runs }
 *         | { type: 'item', ordered, level, n, checked?, runs } | { type: 'quote', runs }
 *         | { type: 'code', text } | { type: 'rule' } | { type: 'table', rows: [[runs]] }
 *   runs:   [{ t, b?, i?, s?, code?, href? }]
 */
export function parseMarkdown(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'para', runs: inline(para.join(' ')) }); para = []; } };
  const counters = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (/^\s*$/.test(line)) { flush(); continue; }
    if ((m = line.match(/^(```|~~~)/))) {
      flush();
      const fence = m[1];
      const code = [];
      while (++i < lines.length && !lines[i].startsWith(fence)) code.push(lines[i]);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); blocks.push({ type: 'heading', level: m[1].length, runs: inline(m[2]) }); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'rule' }); continue; }
    if ((m = line.match(/^(\s*)([-*+]|(\d+)[.)])\s+(\[( |x|X)\]\s+)?(.*)$/))) {
      flush();
      const level = Math.floor(m[1].replace(/\t/g, '    ').length / 2);
      const ordered = !!m[3];
      counters.length = level + 1;
      counters[level] = ordered ? (counters[level] ?? +m[3] - 1) + 1 : 0;
      blocks.push({ type: 'item', ordered, level, n: counters[level], checked: m[5] ? m[5] !== ' ' : undefined, runs: inline(m[6]) });
      continue;
    }
    counters.length = 0;
    if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      const q = [m[1]];
      while (lines[i + 1]?.startsWith('>')) q.push(lines[++i].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', runs: inline(q.join(' ')) });
      continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const rows = [cells(line)];
      i++;
      while (lines[i + 1]?.includes('|') && lines[i + 1].trim()) rows.push(cells(lines[++i]));
      blocks.push({ type: 'table', rows });
      continue;
    }
    para.push(line.trim().replace(/\s{2,}$/, ''));
  }
  flush();
  return blocks;
}

/** Inline Markdown into runs. */
export function inline(text) {
  const runs = [];
  const re = /(`+)(.+?)\1|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*|(?<![\w])_(.+?)_(?![\w])|!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s<)]+)|<br\s*\/?>/g;
  let last = 0;
  let m;
  const push = (t, style = {}) => { if (t) runs.push({ t, ...style }); };
  const unescape = (s) => s.replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, '$1');
  while ((m = re.exec(text))) {
    push(unescape(text.slice(last, m.index)));
    if (m[2] != null) push(m[2], { code: true });
    else if (m[3] != null || m[4] != null) inline(m[3] ?? m[4]).forEach((r) => runs.push({ ...r, b: true }));
    else if (m[5] != null) inline(m[5]).forEach((r) => runs.push({ ...r, s: true }));
    else if (m[6] != null || m[7] != null) inline(m[6] ?? m[7]).forEach((r) => runs.push({ ...r, i: true }));
    else if (m[9] != null) push(m[8] || m[9], { href: m[9] });
    else if (m[10] != null) push(m[10], { href: m[10] });
    else push('\n');
    last = re.lastIndex;
  }
  push(unescape(text.slice(last)));
  return runs;
}

export const runsText = (runs) => runs.map((r) => r.t).join('');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeHref = (h) => (/^(https?:|mailto:|#|\/)/i.test(h) ? h : '#');
export function runsHtml(runs) {
  return runs.map((r) => {
    if (r.t === '\n') return '<br>';
    let s = esc(r.t);
    if (r.code) s = `<code>${s}</code>`;
    if (r.b) s = `<strong>${s}</strong>`;
    if (r.i) s = `<em>${s}</em>`;
    if (r.s) s = `<del>${s}</del>`;
    if (r.href) s = `<a href="${esc(safeHref(r.href))}">${s}</a>`;
    return s;
  }).join('');
}

/** Blocks as HTML (the body only). */
export function toHtml(blocks) {
  const out = [];
  const open = [];
  const closeTo = (level) => { while (open.length > level) out.push(`</${open.pop()}>`); };
  for (const b of blocks) {
    if (b.type !== 'item') closeTo(0);
    switch (b.type) {
      case 'heading': out.push(`<h${b.level}>${runsHtml(b.runs)}</h${b.level}>`); break;
      case 'para': out.push(`<p>${runsHtml(b.runs)}</p>`); break;
      case 'quote': out.push(`<blockquote><p>${runsHtml(b.runs)}</p></blockquote>`); break;
      case 'code': out.push(`<pre><code>${esc(b.text)}</code></pre>`); break;
      case 'rule': out.push('<hr>'); break;
      case 'table': out.push(`<table><thead><tr>${b.rows[0].map((c) => `<th>${runsHtml(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${runsHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); break;
      case 'item': {
        const tag = b.ordered ? 'ol' : 'ul';
        closeTo(b.level + 1);
        while (open.length < b.level + 1) { open.push(tag); out.push(`<${tag}>`); }
        if (open[b.level] !== tag) { closeTo(b.level); open.push(tag); out.push(`<${tag}>`); }
        out.push(`<li>${b.checked != null ? `<input type="checkbox" disabled${b.checked ? ' checked' : ''}> ` : ''}${runsHtml(b.runs)}</li>`);
        break;
      }
      default:
    }
  }
  closeTo(0);
  return out.join('\n');
}
