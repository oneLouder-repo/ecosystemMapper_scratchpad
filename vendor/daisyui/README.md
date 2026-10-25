# DaisyUI (vendored)

[DaisyUI](https://daisyui.com) 5.7.50, MIT licensed (see LICENSE). Copied here so the platform needs no build step and no CDN.

- `daisyui.css`: the components the platform uses, with Tailwind's responsive copies (`sm:btn` and so on) removed, since there is no Tailwind here.
- `themes.css`: the palettes orgs can choose for their public sites (listed in `src/platform/themes.js`).

To add a component or theme, take its file from the `daisyui` npm package (`components/<name>.css`, `theme/<name>.css`) and append it.
