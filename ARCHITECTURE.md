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
