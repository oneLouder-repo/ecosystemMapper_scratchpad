# Ecosystem Mapper: Architecture (draft 1)

A minimal, playful, FigJam-like board for mapping a change ecosystem. Plain ES modules, HTML and CSS, no build step. The client framework borrows its feel from ActionScript 3: a stage, a display list, display objects with events, and an optional frame tick.

Mark up anything. Open questions are flagged with **Q:**.

---

## 1. Goals for the proof of concept

- Add, drag, rename and recolour actors on an infinite (pan and zoom) canvas.
- Connectors dock to actors, can be re-docked by dragging either end, and can be retyped.
- Layers can be shown, hidden and locked.
- The "systems lens" (the substrate under the map) can be swapped live. Two lenses ship: Micro/Meso/Macro and Water of Systems Change.
- Maps save to the browser and export or import as JSON.
- Everything a person does is an **operation**, so live multi-user editing later is "send ops over a websocket", not a rewrite.

Out of scope for now: accounts, server, HubSpot, auth, audio (but the frame tick and event model leave room for audio later).

---

## 2. Data model

```
Account
└── Folder (nestable)
    └── Map
        ├── lensId            which substrate is active
        ├── layers[]          ordered, each can be hidden or locked
        │   └── items[]       ids of actors, groups, connectors, notes
        ├── actors{}          id → Actor
        ├── groups{}          id → Group
        ├── connectors{}      id → Connector
        └── notes{}           id → Note (free text, sticky-style)
```

**Actor**: `{ id, label, category, x, y, w, h, style, meta }`
- `category` comes from the active lens (for the Actua lens: ally, resource provider, problem maker, other).
- `meta` is free-form key/value for notes, links, contacts, later CRM ids.
- Position is free. The lens decides which band or region an actor sits in by looking at where it is, so moving an actor between Micro and Macro is just a drag.

**Group**: `{ id, label, memberIds[], style }`. A soft container for clustering actors.

**Connector**: `{ id, from: Dock, to: Dock, type, label, style }`
- `Dock` is either `{ actorId, side }` (docked) or `{ x, y }` (floating end).
- `type` comes from the lens (for example: funds, informs, influences, feedback loop, learning loop).

**Note**: `{ id, text, x, y, w, h, style }`.

**Q:** Should a connector be able to dock to a group or another connector (for example, a feedback loop wrapping a relationship)? Easy to allow later, slightly harder to retrofit.

---

## 3. Lenses

> **Update (round 2).** Lenses now share one ordinal **depth** scale (0 = explicit / structural / collective, 1 = implicit / personal / mental models). Each region declares its `depth` range, actors are stored as `place: { depth, spread }` instead of x/y, and each layout (`rings`, `triangle`, `bands`, `grid`) projects places onto its shape. Actor categories and connector types moved out of the lenses into a shared `taxonomy.json`. Actors carry `kind: 'actor' | 'agent'`. See `src/lenses/index.js` for the current model; the sketch below is the original.

A lens is one JSON file. Swapping it changes the backdrop and the vocabulary, never the map data.

```json
{
  "id": "micro-meso-macro",
  "name": "Micro / Meso / Macro",
  "layout": "bands",
  "regions": [
    { "id": "macro", "label": "Macro / Us", "hint": "Structural change: policy, budgets" },
    { "id": "meso",  "label": "Meso / We",  "hint": "Norms, relationships, alignment" },
    { "id": "micro", "label": "Micro / Me", "hint": "Individual practice" }
  ],
  "actorCategories": [
    { "id": "ally",     "label": "Key ally",          "color": "#2a9d8f" },
    { "id": "resource", "label": "Resource provider", "color": "#e9c46a" },
    { "id": "problem",  "label": "Problem maker",     "color": "#e76f51" },
    { "id": "other",    "label": "Other",             "color": "#8d99ae" }
  ],
  "connectorTypes": [
    { "id": "relationship", "label": "Relationship" },
    { "id": "feedback",     "label": "Feedback loop", "dash": "4 3" },
    { "id": "learning",     "label": "Learning loop", "dash": "1 3" }
  ]
}
```

`layout` picks the geometry and renderer: `rings` (concentric circles; Micro / Meso / Macro uses this with Micro at the centre), `triangle` (an inverted triangle; Water of Systems Change uses this with structural change at the wide top and transformative change at the point) or `bands` (horizontal tiers). The example above is simplified; see `src/lenses/*.json` for the real files. An actor's region is never stored: it is worked out from the actor's position, so it follows drag and drop and is re-read when the lens changes.

When a map switches lens and a category doesn't exist in the new lens, the actor keeps its old category and shows as "unmapped" until someone recategorises it. Nothing is lost.

---

## 4. Client framework (the ActionScript-ish part)

```
src/
  core/
    Stage.js            owns the SVG root, camera (pan/zoom), frame tick
    DisplayObject.js    x, y, rotation, alpha, visible, parent, children
    Sprite.js           DisplayObject that can draw (an SVG <g>)
    EventDispatcher.js  addEventListener / removeEventListener / dispatchEvent
    Store.js            map state + apply(op) + undo/redo + subscribe
    ops.js              the operation vocabulary (see 5)
  display/
    ActorView.js        extends Sprite, renders one actor
    ConnectorView.js    extends Sprite, renders one connector + dock handles
    NoteView.js
    LensView.js         draws the active lens backdrop
  tools/
    registry.js         registerTool(), active tool switching
    SelectTool.js
    ActorTool.js
    ConnectTool.js
    TextTool.js
    PanTool.js
  ui/
    Toolbar.js          builds buttons from the tool registry
    Inspector.js        edit label, category, type, meta of the selection
    LayersPanel.js
    LensPicker.js
  lenses/
    micro-meso-macro.json
    water-of-systems-change.json
  persistence/
    local.js            localStorage save/load
    file.js             JSON export/import
index.html
main.js
```

### Display objects

```js
const a = new ActorView(actorData);
stage.addChild(a);
a.addEventListener('drag', e => store.apply(ops.moveActor(a.id, e.x, e.y)));
a.addEventListener('enterFrame', () => { a.alpha = 0.8 + 0.2 * Math.sin(stage.time / 300); });
```

Views never change data directly. They dispatch intent, a tool turns it into an op, the store applies it, and views re-render from the store. This keeps drag-and-drop code playful and local while the data stays clean.

### Tools

A tool is one small file:

```js
export default {
  id: 'actor',
  label: 'Actor',
  icon: '◯',
  key: 'a',
  onPointerDown(e, ctx) {
    ctx.store.apply(ctx.ops.addActor({ x: e.worldX, y: e.worldY, category: ctx.lens.defaultCategory }));
  },
};
```

`registerTool(tool)` adds it to the toolbar and keyboard shortcuts. Copy a tool to make a new one.

### Frame tick

`Stage` runs one `requestAnimationFrame` loop and dispatches `enterFrame` only to objects that have a listener, so idle maps cost nothing. This is also where audio-reactive or ambient motion would hook in later.

---

## 5. Operations

Every change is a plain JSON object:

```js
{ op: 'addActor',        id, data }
{ op: 'updateActor',     id, patch }
{ op: 'moveActor',       id, x, y }
{ op: 'removeActor',     id }
{ op: 'addConnector',    id, data }
{ op: 'dockConnector',   id, end: 'from'|'to', dock }
{ op: 'updateConnector', id, patch }
{ op: 'setLens',         lensId }
{ op: 'addLayer' | 'updateLayer' | 'moveToLayer' ... }
```

`Store.apply(op)` validates, applies, pushes the inverse onto the undo stack and notifies subscribers. Later, the websocket client simply sends each local op to the server and applies ops that arrive from others. Drags send one op on release, with optional throttled "preview" ops so others see motion live.

**Q:** For multi-user, last-write-wins per field is simplest and fine for a whiteboard. A CRDT library (Yjs) is the heavier option if offline editing matters. Suggest starting with last-write-wins.

---

## 6. Later: server (step 4, not now)

Small Node server (Express or Fastify, plus `ws`): serves the static client, stores accounts, folders and maps (SQLite to start), and relays ops per map room. Same op format as the client, so the server can replay a map from its op log.

---

## 7. Conventions

- ES modules loaded straight in the browser. Open `index.html` through any static server (`npx serve` or similar).
- No framework, no bundler, no TypeScript for now. JSDoc type hints where they help.
- SVG for the canvas (crisp, inspectable, easy hit-testing). Can swap to canvas later if maps get very large.
- Tests: a handful of plain Node tests for `Store` and ops, since that is the part that must stay correct.

---

## 8. The toolbox (round 3)

The mapper is now one tool in a toolbox for a small nonprofit: planning, data and knowledge, ecosystem mapping, strategy, operations, and monitoring and evaluation under one model.

**Pages, not a single-page app.** Each tool is its own HTML page with its own module (`mapper.html`, `strategy.html`, `org.html`) plus the dashboard (`index.html`). They share `src/core` (display list, Store, ops), `src/ui` (Shell header, `h()` helper, icons) and `src/platform` (data models and storage). This keeps each tool small enough to read in one sitting, and a new tool is a page plus an entry in `src/toolbox.js`.

**Documents.** Each tool works on one JSON document held in a `Store`:

| Document | Shape | Ops |
| --- | --- | --- |
| `map` | actors, connectors, groups, layers, lensId | the mapper's own (`core/ops.js`) |
| `org` | name, mission, staff, teams, sites | generic collection ops (`core/collections.js`) |
| `strategy` | `nodes`: one tree of framework → plan(s) → objective → goal → workplan → task | collection ops + `platform/strategy.js` helpers |

Every change is still a small JSON op with an inverse, so undo works everywhere and the same ops can travel to a server later.

**How the pieces join up (next).**
- *Measures → dashboards.* Objectives and goals already carry measures. A dashboard tool would read those, plus values recorded against them, and render KPI tiles and charts.
- *Public views.* Sites in the org document carry a visibility. A public dashboard is a saved view of chosen measures, published to a site; the server serves only what a view names.
- *Accounts, roles, sandboxes.* Staff already have roles (admin, lead, staff, viewer). With a server, a sign-in maps to a staff record; roles gate which ops a person may send; a sandbox is a copy of a document that can be merged back as ops.
- *Cross-links.* Mapper actors, strategy nodes and staff can reference each other by id (e.g. a workplan "tends" a set of ecosystem actors), which is where the umbrella model starts paying off.

## 9. Dashboards, public sites and assets (round 4)

**Two new documents.**

| Document | Shape | Ops |
| --- | --- | --- |
| `data` | `series`: `{ [measureId]: { points: [{ date: 'YYYY-MM-01', value }] } }` | collection ops |
| `dashboards` | `dashboards`: `{ [id]: { title, description, visibility, siteId, sourceNodeId, widgets } }` | collection ops |

Measures on objectives and goals now have stable ids (`migrateStrategy` adds any missing). Program data and dashboard widgets point at a measure by id, so renaming a measure renames it everywhere.

**One loader.** `platform/docs.js` loads (or seeds) every document, so any tool can read any other: the Strategy tool shows map actors as assets, dashboards read strategy measures and program data, the public site reads all of them. `storage.onDocChange(name, fn)` fires when another tab saves a document, which is how public sites update live.

**Charts** (`src/charts`). `renderWidget(widget, { strategy, data, asOf, months })` draws one widget as it stood at month `asOf`. `DashboardView` puts a `Player` above the grid; the player only changes `asOf` and redraws, so every widget type gets time travel for free. To add a widget type, add a renderer in `charts/widgets.js` and an entry in `WIDGET_TYPES`.

**Creative Palette** (`src/palette`). A page with a list of mini-tools; each is a function `(ctx) → element` in `MINI_TOOLS`. Add a mini-tool by writing one function and one entry.

**Assets.** Tasks and workplans hold `assets: [{ id, kind, label, ref?, url?, detail?, year?, dataUrl? }]`. `ref` points into another document (map actor, staff, strategy node); `label` is kept as a fallback if that item is deleted. `assetsUnder(strategy, id)` gathers assets from any level down; `groupAssets` merges repeats. To add an asset kind for a future tool: add it to `ASSET_KINDS`, a resolver in `resolveAsset`, and a picker in `ui/AssetChooser.js`.

**Later, with the server.** Public sites become pages (or HubSpot modules) served from a published snapshot holding only public dashboards and the series they name. Program data arrives from program systems instead of being typed in. Uploaded documents move from data URLs to file storage.

## 10. Orgs, plugins and themes (round 5)

**Orgs load on command.** `platform/session.js` keeps a registry (`org-toolbox:v3:registry`): which orgs exist, which is open, who is signed in to each. Every document is stored under its org (`org-toolbox:v3:<orgId>/<doc>`), so switching org is "change the registry, reload". `platform/docs.js` loads the open org's documents and seeds example orgs with example data; any other org starts empty.

**The org document** now holds the org's settings: name, description, mission, contact, logo, `theme { palette, shape }`, `plugins { id: false }` switches, staff (with avatar, email and followed `interests`), teams and sites. `migrateOrg` fills in new fields on old documents.

**Plugins.** `src/plugins.js` lists them. `core: true` plugins (Organisation, Help) can't be switched off; `nav: false` keeps one out of the header.

**Themes.** A palette is a DaisyUI theme name; a shape (rounded, squared, flat) sets DaisyUI's radius, border and depth variables. `applyTheme(el, theme)` applies both. Staff pages use the toolbox theme (`data-theme="toolbox"`, defined in `styles.css`); public sites use the org's theme. The app's own colour names (`--ink`, `--panel`, `--line`, `--accent`...) are defined from the theme variables, so all the older styles follow the theme too. Chart series keep one validated blue on every theme.

**DaisyUI without a build.** `vendor/daisyui/daisyui.css` is the subset of components used, with Tailwind's responsive variants stripped; `themes.css` holds the offered palettes. DaisyUI's CSS sits in cascade layers, so the app's own (unlayered) CSS always wins; bare `button`s are reset with `:where()` so `.btn` keeps its looks. Watch for class-name clashes with DaisyUI components (`.radio`, `.list`, `.label`, `.tooltip` caught us).

**Ecosystem maps.** An org has many maps: the `maps` index (`title, description, ownerId, memberIds, createdAt, updatedAt`) and one document per map (`map/<id>`). The mapper opens `mapper.html#<mapId>`. Task assets point at actors by `{ mapId, ref }`.

**Radio & Podcasts.** `platform/radio.js` follows Castopod's model (podcasts with handle, category, type and owner; episodes with number, season, type, status and audio enclosure) plus a weekly `schedule` for the station. `podcastRss` writes the feed podcast apps read. Moving to a real Castopod server means syncing these through its API and reading its feeds; the shapes don't change. Sample audio lives in `media/radio/`.

**Help.** `src/help/` draws its diagrams from the lens files (`lenses/crosswalk.js` works out which regions of each lens sit in each micro / meso / macro tier), so the guide stays right when a lens changes.
