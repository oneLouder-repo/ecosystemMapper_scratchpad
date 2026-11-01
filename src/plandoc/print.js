/**
 * Print a plan document, one plan page to a sheet of US Letter, edge to
 * edge. The print window's "Save as PDF" makes the PDF: real text, sharp
 * pictures, links that work, and nothing to install.
 */
export function printPlan(docEl, title) {
  const root = document.createElement('div');
  root.className = 'pd-print-root';
  root.style.display = 'none';
  root.append(docEl);
  docEl.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  document.body.append(root);
  const before = document.title;
  document.title = title;
  const imgs = [...root.querySelectorAll('img')];
  imgs.forEach((i) => { i.loading = 'eager'; });
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => {
    window.print();
    setTimeout(() => { root.remove(); document.title = before; }, 500);
  });
}
