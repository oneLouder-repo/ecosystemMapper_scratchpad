# Ecosystem Mapper (scratchpad)

A playful board for mapping a change ecosystem: actors and agents, the connections and groups between them, and the feedback and learning loops that run through it, drawn over a swappable "systems lens". Five lenses ship: Micro / Meso / Macro, the Water of Systems Change, NPC's Spheres of Systems Change, Meadows' Twelve Leverage Points and the Theory of System Change.

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
| Add actors | Press **A** (or click **Actor**), then click the board as many times as you like, typing a name after each. Press **A** again, click the tool again, or **Esc** to stop. Double-clicking the board also adds one |
| Actor or agent | Select it and use the **Actor / Agent** switch in the side panel |
| Rename an actor | Double-click it, or use the panel on the right |
| Move an actor | Drag it. Its region (ring or band) follows where you drop it |
| Select several | Drag a box on empty board, or shift-click. Drag any selected actor to move them all |
| Connect actors | Press **C**, then drag from actor to actor, as many times as you like. **C** again or **Esc** to stop |
| Group | Select several actors, then **Ctrl/⌘ + G** or the button in the side panel. Drag a group's tab to move it |
| Re-dock a connector | Select it, drag one of its round ends onto another actor (or onto empty board to leave it floating) |
| Pan | Scroll, hold **Space** and drag, middle-drag, or the **Pan** tool (**H**) |
| Zoom | Ctrl or ⌘ + scroll; **F** or **Fit** fits the whole lens |
| Delete | Select, then Delete or Backspace |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z |
| Switch lens | The **Lens** menu in the top bar |

Maps autosave to the browser. **Example** reloads the shared test map (28 actors, 33 relationships, 3 groups; see `src/seed.js`). **Export** downloads the map as JSON and **Open…** loads one back.

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

Add a JSON file to `src/lenses/` (copy `micro-meso-macro.json`) and list its name in `LENS_FILES` in `src/lenses/index.js`. A lens picks a `layout`: `rings` (concentric circles), `triangle` (inverted triangle), `bands` (horizontal tiers) or `grid` (bands with named columns). A new layout is a geometry entry in `src/lenses/index.js` plus a renderer in `src/display/LensView.js`.

Every region gives a `depth` range on one shared scale, 0 (explicit, structural, collective) to 1 (implicit, personal, mental models). Actors are stored as `place: { depth, spread }`, not x/y, and each lens projects that place onto its own shape. That is what makes an actor in the Micro ring land in Transformative change, Mindset or paradigm, and so on when you switch lens. Tune a lens's `depth` ranges to change how it lines up with the others.

Actor categories and connector types are shared by all lenses, in `src/lenses/taxonomy.json`. Lenses never change map data; actors whose category a lens doesn't define show as "unmapped" until recategorised.

## Icons

Tool and panel icons are monochrome line drawings in `src/ui/icons.js`. A tool's `icon` can name one of them or be raw SVG path data on a 24×24 grid.

## Making things move

Any display object can listen for `enterFrame`, AS3-style:

```js
view.addEventListener('enterFrame', (e) => {
  view.alpha = 0.8 + 0.2 * Math.sin(e.time / 300);
});
```

Selected actors use this for their breathing outline (`ActorView.js`).

## Status

Working now: actors and agents, groups, sticky tools with custom cursors, marquee and multi-select with group moves, connectors with docking and re-docking, connector types, layers (show, hide, lock, assign), five lenses on a shared depth scale with live switching and region highlighting while dragging, undo and redo, autosave, JSON export and import.

Not yet: per-lens position overrides, accounts and folders, free-text notes, the Node server and live multi-user editing.
