/**
 * Formulas for calculated measures, like a spreadsheet's:
 *
 *   [Meals served] / [Good food boxes]
 *   ([Youth reached] - prev([Youth reached])) / prev([Youth reached]) * 100
 *
 * Measures go in square brackets by name; numbers, + - * / ^ and brackets
 * work as usual, plus a few functions:
 *   prev(x)        x a month earlier
 *   ago(x, n)      x n months earlier (ago(x, 12): the same month last year)
 *   avg3(x)        the average of x over the last three months
 *   min(a, b), max(a, b), abs(x), round(x[, digits])
 *
 * The formula is parsed once into a small tree; nothing is ever run as code
 * (the pages' security policy wouldn't allow it anyway). Stored formulas
 * name measures by id, {m-meals}, so renaming a measure doesn't break them.
 */

const FUNCS = {
  min: { args: [2, 9], run: (...v) => Math.min(...v) },
  max: { args: [2, 9], run: (...v) => Math.max(...v) },
  abs: { args: [1, 1], run: Math.abs },
  round: { args: [1, 2], run: (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d },
};
const SHIFTS = { prev: 1, ago: null, avg3: 'avg3' };

/** Split a formula into tokens. */
function tokenize(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      const end = text.indexOf(close, i + 1);
      if (end < 0) throw new Error(`A ${c} has no ${close}`);
      out.push({ t: c === '{' ? 'id' : 'name', v: text.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    const num = text.slice(i).match(/^(\d+(\.\d*)?|\.\d+)/);
    if (num) { out.push({ t: 'num', v: +num[0] }); i += num[0].length; continue; }
    const word = text.slice(i).match(/^[a-z][a-z0-9]*/i);
    if (word) { out.push({ t: 'fn', v: word[0].toLowerCase() }); i += word[0].length; continue; }
    if ('+-*/^(),%'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`“${c}” isn’t something a formula can use`);
  }
  return out;
}

/**
 * Parse a formula. `resolve(name)` turns a [Name] into a measure id (or
 * null); {id} references are taken as they are.
 * Returns { tree, refs: [ids] }, or throws an Error saying what's wrong.
 */
export function parseFormula(text, resolve = () => null) {
  const toks = tokenize(String(text ?? ''));
  if (!toks.length) throw new Error('Write a formula');
  let i = 0;
  const refs = new Set();
  const peek = () => toks[i]?.t;
  const take = (t) => { if (peek() !== t) throw new Error(t === ')' ? 'A bracket isn’t closed' : `Expected ${t}`); return toks[i++]; };

  function primary() {
    const tok = toks[i++];
    if (!tok) throw new Error('The formula ends too soon');
    if (tok.t === 'num') return { k: 'num', v: tok.v };
    if (tok.t === 'id' || tok.t === 'name') {
      const id = tok.t === 'id' ? tok.v : resolve(tok.v);
      if (!id) throw new Error(`There’s no measure called “${tok.v}”`);
      refs.add(id);
      return { k: 'ref', id };
    }
    if (tok.t === '(') { const e = expr(); take(')'); return e; }
    if (tok.t === '-') return { k: 'neg', a: power() };
    if (tok.t === 'fn') {
      const name = tok.v;
      if (!(name in FUNCS) && !(name in SHIFTS)) throw new Error(`There’s no function called ${name}`);
      take('(');
      const args = [expr()];
      while (peek() === ',') { i++; args.push(expr()); }
      take(')');
      if (name in SHIFTS) {
        if (name === 'ago') {
          if (args.length !== 2 || args[1].k !== 'num') throw new Error('ago needs a value and a number of months: ago([Meals], 12)');
          return { k: 'shift', a: args[0], by: Math.round(args[1].v) };
        }
        if (args.length !== 1) throw new Error(`${name} takes one value`);
        return name === 'prev' ? { k: 'shift', a: args[0], by: 1 } : { k: 'avg', a: args[0], n: 3 };
      }
      const [lo, hi] = FUNCS[name].args;
      if (args.length < lo || args.length > hi) throw new Error(`${name} takes ${lo === hi ? lo : `${lo} to ${hi}`} value${hi > 1 ? 's' : ''}`);
      return { k: 'fn', name, args };
    }
    throw new Error('Something is missing between the parts of the formula');
  }
  function power() {
    let a = primary();
    if (peek() === '%') { i++; a = { k: 'op', op: '/', a, b: { k: 'num', v: 100 } }; }
    if (peek() === '^') { i++; return { k: 'op', op: '^', a, b: power() }; }
    return a;
  }
  function term() {
    let a = power();
    while (peek() === '*' || peek() === '/') { const op = toks[i++].t; a = { k: 'op', op, a, b: power() }; }
    return a;
  }
  function expr() {
    let a = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++].t; a = { k: 'op', op, a, b: term() }; }
    return a;
  }
  const tree = expr();
  if (i < toks.length) throw new Error('Something is missing between the parts of the formula');
  return { tree, refs: [...refs] };
}

/**
 * Work a parsed formula out for month `m` (an index into `months`), with
 * `value(id, monthIndex)` giving a measure's number or null. Null when any
 * input is missing or the sum can't be done (dividing by zero).
 */
export function evaluate(tree, m, value) {
  const run = (n, at) => {
    switch (n.k) {
      case 'num': return n.v;
      case 'ref': return at < 0 ? null : value(n.id, at);
      case 'neg': { const a = run(n.a, at); return a == null ? null : -a; }
      case 'shift': return run(n.a, at - n.by);
      case 'avg': {
        const vals = [];
        for (let k = 0; k < n.n; k++) { const v = run(n.a, at - k); if (v == null) return null; vals.push(v); }
        return vals.reduce((s, v) => s + v, 0) / vals.length;
      }
      case 'fn': {
        const args = n.args.map((x) => run(x, at));
        return args.some((v) => v == null) ? null : FUNCS[n.name].run(...args);
      }
      case 'op': {
        const a = run(n.a, at);
        const b = run(n.b, at);
        if (a == null || b == null) return null;
        if (n.op === '+') return a + b;
        if (n.op === '-') return a - b;
        if (n.op === '*') return a * b;
        if (n.op === '/') return b === 0 ? null : a / b;
        return a ** b;
      }
      default: return null;
    }
  };
  const v = run(tree, m);
  return v == null || !Number.isFinite(v) ? null : v;
}

/** Show a stored formula ({m-meals}) with measure names ([Meals served]). */
export const formulaText = (expr, nameOf) => String(expr ?? '').replace(/\{([^}]+)\}/g, (_, id) => `[${nameOf(id) ?? id}]`);

/** Store a typed formula ([Meals served]) by ids ({m-meals}); throws if it doesn't parse. */
export function formulaStore(text, resolve) {
  parseFormula(text, resolve);
  return String(text).replace(/\[([^\]]+)\]/g, (_, name) => `{${resolve(name.trim())}}`);
}
