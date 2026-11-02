/**
 * Themes for an org's public sites: a colour palette and a shape.
 * Palettes are DaisyUI themes (vendor/daisyui/themes.css), so any DaisyUI
 * component on a page picks them up. A shape sets DaisyUI's radius,
 * border and depth variables on top.
 *
 * org.theme = { palette: 'corporate', shape: 'rounded' }
 *
 * To offer another palette, add a DaisyUI theme name here (and make sure
 * vendor/daisyui/themes.css includes it).
 */
export const PALETTES = [
  { id: 'corporate', label: 'Corporate blue' },
  { id: 'light', label: 'Bright' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'garden', label: 'Garden' },
  { id: 'nord', label: 'Nordic' },
  { id: 'winter', label: 'Winter' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'caramellatte', label: 'Caramel' },
  { id: 'lofi', label: 'Black and white' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'retro', label: 'Retro' },
  { id: 'dim', label: 'Dim (dark)' },
  { id: 'business', label: 'Business (dark)' },
];

export const SHAPES = [
  { id: 'rounded', label: 'Rounded', blurb: 'Soft corners and gentle depth', vars: { '--radius-box': '1rem', '--radius-field': '0.5rem', '--radius-selector': '1rem', '--border': '1px', '--depth': '1' } },
  { id: 'squared', label: 'Squared', blurb: 'Square corners, firm edges', vars: { '--radius-box': '0', '--radius-field': '0', '--radius-selector': '0', '--border': '1px', '--depth': '0' } },
  { id: 'flat', label: 'Minimal and flat', blurb: 'Barely-there corners, no depth', vars: { '--radius-box': '0.25rem', '--radius-field': '0.25rem', '--radius-selector': '0.25rem', '--border': '1px', '--depth': '0', '--noise': '0' } },
];

export const paletteById = Object.fromEntries(PALETTES.map((p) => [p.id, p]));
export const shapeById = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

/** Apply a theme to an element (usually <html> on a public site, or a preview box). */
export function applyTheme(el, theme = {}) {
  el.setAttribute('data-theme', paletteById[theme.palette] ? theme.palette : 'corporate');
  const shape = shapeById[theme.shape] ?? SHAPES[0];
  for (const s of SHAPES) for (const k of Object.keys(s.vars)) el.style.removeProperty(k);
  for (const [k, v] of Object.entries(shape.vars)) el.style.setProperty(k, v);
  el.dataset.shape = shape.id;
}
