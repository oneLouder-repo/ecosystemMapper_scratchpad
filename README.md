# Ecosystem Mapper (scratchpad)

A playful board for mapping a change ecosystem: actors, the connections between them, and the feedback and learning loops that run through it, drawn over a swappable "systems lens" such as Micro / Meso / Macro or the Water of Systems Change.

Plain ES modules, HTML, CSS and SVG. No framework, no bundler, no dependencies. See [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

## Run it

```sh
npm start        # http://localhost:5173
npm test         # store and op tests (Node 20+)
```

Any static server works too; `npm start` is a tiny one in `server.js`.

## Using the board

| Do this | How |
| --- | --- |
| Add an actor | Double-click the board, or press **A** and click |
| Rename an actor | Double-click it, or use the panel on the right |
| Move an actor | Drag it |
| Connect actors | Press **C**, drag from one actor to another |
| Re-dock a connector | Select it, drag one of its round ends onto another actor (or onto empty board to leave it floating) |
| Pan / zoom | Scroll or drag empty board / Ctrl or ⌘ + scroll |
| Delete | Select, then Delete or Backspace |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z |
| Switch lens | The **Lens** menu in the top bar |

Maps autosave to the browser. **Export** downloads the map as JSON and **Open…** loads one back.

## Layout

```
src/
  core/         Stage, DisplayObject, Sprite, EventDispatcher, Store, ops
  display/      ActorView, ConnectorView, LensView, MapView (store → display list)
  tools/        one file per tool + the registry
  ui/           top bar, toolbar, inspector, layers panel, inline label editor
  lenses/       one JSON file per lens + the registry
  persistence/  local storage and JSON file import/export
  main.js       wires it all together
test/           node:test tests for the store and ops
```

## Adding a tool

Copy `src/tools/PanTool.js`, change `id`, `label`, `icon` and `key`, fill in the handlers you need, then register it in `src/main.js`:

```js
ctx.tools.register(MyTool);
```

Handlers get a stage event (`worldX`, `worldY`, `view`, `handle`, `shiftKey`, …) and the shared `ctx` (`stage`, `store`, `ops`, `mapView`, `tools`, `ui`, `actions`). Change map data only through `ctx.store.apply(ctx.ops.something(...))` so it can be undone and, later, shared live.

## Adding a lens

Add a JSON file to `src/lenses/` (copy `micro-meso-macro.json`) and list its name in `LENS_FILES` in `src/lenses/index.js`. Lenses never change map data; actors whose category a lens doesn't define show as "unmapped" until recategorised.

## Making things move

Any display object can listen for `enterFrame`, AS3-style:

```js
view.addEventListener('enterFrame', (e) => {
  view.alpha = 0.8 + 0.2 * Math.sin(e.time / 300);
});
```

Selected actors use this for their breathing outline (`ActorView.js`).

## Status

Working now: actors, connectors with docking and re-docking, connector types, layers (show, hide, lock, assign), two lenses with live switching, undo and redo, autosave, JSON export and import.

Not yet: accounts and folders, free-text notes, groups, the Node server and live multi-user editing.
