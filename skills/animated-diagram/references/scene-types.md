# Scene types

Prefer a spec-driven type; a new diagram is then data, not code. Strings can be
plain or localized (`{ "en": "...", "nl": "..." }`). Every node may have a
`detail` sentence (player caption + screen-reader text).

## Built

### `sequence`: one thing through ordered stages

```json
{ "type": "sequence", "id": "order-flow",
  "title": "How an order reaches the customer",
  "description": "Six stages in order: …",
  "nodes": [ { "label": "Order", "detail": "The customer places an order." }, … ],
  "glyphs": "numbers",          // or "none"; per node: "glyph": "A" or "icon": "<path d>"
  "fontSize": 18 }              // optional max; auto-fit otherwise
```

2–12 nodes. Storyboard: nodes appear in reading order → an emphasis ring lands
on node 1 → it travels node to node; each reached node fills accent and the
path behind turns accent. Steps = one per node.
Layouts: row (wide aspects), snake grid with outside elbows (1:1, 4:3, crowded
16:9), column with labels on the right (9:16, tall).

### `hub-spoke`: one centre connected to many

```json
{ "type": "hub-spoke", "id": "integrations",
  "title": "…", "description": "…",
  "hub": { "label": "Platform", "detail": "…" },
  "spokes": [ { "label": "E-mail", "detail": "…" }, … ],
  "direction": "out" }          // "in" = spokes feed the hub
```

2–10 spokes. Storyboard: hub + spokes appear → the hub activates → one link at a
time draws (carrying an emphasis dot) and the spoke fills. Steps = hub, then
each spoke. Layouts: radial ellipse (wide/square), tree with an outside trunk
(9:16, tall). Throws when boxes would overlap: fewer spokes or a larger format.

### `timeline`: events in time

```json
{ "type": "timeline", "id": "incident",
  "title": "…", "description": "…",
  "events": [ { "when": "09:02", "label": "Alert fires", "detail": "…" },
              …,
              { "when": "Thursday", "label": "Review", "planned": true } ],
  "now": { "label": "Now", "detail": "…" },   // optional
  "fontSize": 18 }                             // optional max; auto-fit otherwise
```

2–8 events in time order, each with a short `when` (one line: "09:02",
"Q3 2026") and a `label`. `planned: true` marks an event still to come;
planned events go last and need a `now`. Events and `now` may carry an `id`
for their step. Storyboard: the axis draws on → milestones drop onto it in
order; an event that has happened fills accent and the axis behind it turns
accent, a planned one stays pending → the "now" marker (the emphasis element)
settles on the axis after the last past event. Steps = one per event, then
`now`. Events are spaced evenly, not to scale. Layouts: horizontal axis with
labels below, or alternating above and below when that saves lines (wide
aspects, 1:1); vertical axis with labels on the right (9:16, tall). Throws when
a label or the now marker does not fit: fewer events, shorter labels or a
larger format.

### `stack`: layers that build on each other

```json
{ "type": "stack", "id": "web-stack",
  "title": "…", "description": "…",
  "layers": [ { "label": "Browser", "detail": "…" }, …,
              { "label": "Database", "detail": "…" } ],
  "direction": "down",          // or "up": the packet enters at the bottom
  "fontSize": 18 }              // optional max; auto-fit otherwise
```

2–8 layers, listed top to bottom as drawn; a layer may carry an `id` for its
step. Storyboard: the layers rise into place bottom-up → a packet (the emphasis
dot) enters on a rail beside the stack and hops layer to layer; the layer it
reaches fills accent, a layer it has left keeps an accent outline, and the rail
behind it turns accent. Steps = one per layer, in travel order (top → bottom
for `down`, bottom → top for `up`). Layout: one column of layers with the rail
on the right in every format; labels take one line, two when needed. Throws
when the layers do not fit: fewer layers, shorter labels or a larger format.

## Storyboards for types not built yet

Build these as custom scenes (`custom-scenes.md`) first. Promote one to a type
once it has been used twice.

| Type | Helps the viewer understand | Storyboard |
|---|---|---|
| `before-after` | what changes | left state fully shown → a divider sweeps → right state builds; differences highlighted with the emphasis colour |
| `comparison` | option A vs B on criteria | two columns appear → criteria rows fill one at a time → the deciding row emphasised |
| `state-machine` | states and transitions | all states (pending) → a token walks a path of transitions, the current state accent |
| `request-journey` | a request crossing system components | components in regions/boundaries → a dot travels the path, each hop lights, async edges dashed |
| `funnel` / `data-flow` | volume or data narrowing/merging | sources appear → streams draw on and merge → result fills |

Auto-layout for larger graphs: lay out with ELK.js or dagre once (Node, at
build time), store coordinates in the spec, then animate. Mermaid flowchart or
state syntax can serve as input notation (parse nodes/edges, recompute layout).
Don't convert sequence or ER diagrams lossily.
