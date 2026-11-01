/**
 * Cover art made on the spot: abstract SVG pictures in the document's
 * colours. They belong to whoever makes them (no licence to credit), cost
 * nothing, and print sharply at any size.
 *
 *   artUrl('waves', ['#1d4ed8', '#2a9d8f', '#f4a261'], 3) → a data: URL
 */
export const ART_STYLES = [
  { id: 'waves', label: 'Waves' },
  { id: 'circles', label: 'Circles' },
  { id: 'topo', label: 'Contours' },
  { id: 'rays', label: 'Sunrise' },
  { id: 'mosaic', label: 'Mosaic' },
  { id: 'hills', label: 'Hills' },
];

function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const mix = (a, b, t) => {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#3d63dd');

export function artSvg(style, colours = [], seed = 1, W = 1200, H = 800) {
  const [a, b, c] = [hex(colours[0]), hex(colours[1] ?? mix(hex(colours[0]), '#ffffff', 0.4)), hex(colours[2] ?? mix(hex(colours[0]), '#000000', 0.3))];
  const r = rng(seed);
  const out = [];
  const bg = mix(a, '#ffffff', 0.86);
  out.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  if (style === 'waves') {
    for (let i = 0; i < 7; i++) {
      const y0 = H * (0.25 + i * 0.11);
      const amp = 40 + r() * 70;
      const ph = r() * Math.PI * 2;
      let d = `M0 ${H} L0 ${y0}`;
      for (let x = 0; x <= W; x += 40) d += ` L${x} ${(y0 + Math.sin(x / (160 + i * 30) + ph) * amp).toFixed(1)}`;
      d += ` L${W} ${H} Z`;
      out.push(`<path d="${d}" fill="${mix(i % 2 ? a : b, c, i / 9)}" opacity="${0.55 + i * 0.06}"/>`);
    }
  } else if (style === 'circles') {
    for (let i = 0; i < 14; i++) {
      const rad = 60 + r() * 260;
      out.push(`<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${rad.toFixed(0)}" fill="${[a, b, c][i % 3]}" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`);
    }
  } else if (style === 'topo') {
    const cx = W * (0.3 + r() * 0.4), cy = H * (0.3 + r() * 0.4);
    for (let i = 18; i > 0; i--) {
      let d = '';
      for (let k = 0; k <= 64; k++) {
        const t = (k / 64) * Math.PI * 2;
        const rr = i * 42 * (1 + 0.18 * Math.sin(t * 3 + i * 0.4) + 0.1 * Math.cos(t * 5 + seed));
        d += `${k ? 'L' : 'M'}${(cx + Math.cos(t) * rr * 1.3).toFixed(1)} ${(cy + Math.sin(t) * rr).toFixed(1)}`;
      }
      out.push(`<path d="${d}Z" fill="${mix(a, b, i / 18)}" stroke="${mix(c, '#ffffff', 0.5)}" stroke-width="1.5" opacity="0.9"/>`);
    }
  } else if (style === 'rays') {
    const cx = W / 2, cy = H * 0.95;
    for (let i = 0; i < 24; i++) {
      const t0 = Math.PI + (i / 24) * Math.PI, t1 = Math.PI + ((i + 1) / 24) * Math.PI;
      const R = W;
      out.push(`<path d="M${cx} ${cy} L${(cx + Math.cos(t0) * R).toFixed(1)} ${(cy + Math.sin(t0) * R).toFixed(1)} L${(cx + Math.cos(t1) * R).toFixed(1)} ${(cy + Math.sin(t1) * R).toFixed(1)} Z" fill="${i % 2 ? mix(a, '#ffffff', 0.55) : mix(b, '#ffffff', 0.35)}"/>`);
    }
    for (let i = 4; i > 0; i--) out.push(`<circle cx="${cx}" cy="${cy}" r="${i * 70}" fill="${mix(c, a, i / 5)}" opacity="${0.5 + (4 - i) * 0.12}"/>`);
  } else if (style === 'mosaic') {
    const s = 100;
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
      const col = [a, b, c, bg][Math.floor(r() * 4)];
      const k = Math.floor(r() * 4);
      const shapes = [
        `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${col}"/>`,
        `<path d="M${x} ${y} L${x + s} ${y} L${x} ${y + s} Z" fill="${col}"/>`,
        `<path d="M${x} ${y + s} A${s} ${s} 0 0 1 ${x + s} ${y} L${x + s} ${y + s} Z" fill="${col}"/>`,
        `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2.4}" fill="${col}"/>`,
      ];
      out.push(shapes[k]);
    }
  } else {
    // hills
    out.push(`<circle cx="${W * (0.6 + r() * 0.25)}" cy="${H * 0.28}" r="${H * 0.12}" fill="${mix(c, '#ffffff', 0.3)}"/>`);
    for (let i = 0; i < 5; i++) {
      const y0 = H * (0.45 + i * 0.12);
      let d = `M0 ${H} L0 ${y0}`;
      const ph = r() * 6;
      for (let x = 0; x <= W; x += 30) d += ` L${x} ${(y0 - Math.abs(Math.sin(x / (300 - i * 30) + ph)) * (90 - i * 10)).toFixed(1)}`;
      d += ` L${W} ${H} Z`;
      out.push(`<path d="${d}" fill="${mix(mix(a, b, i / 5), '#000000', i * 0.05)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${out.join('')}</svg>`;
}

export const artUrl = (style, colours, seed, W, H) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artSvg(style, colours, seed, W, H))}`;
