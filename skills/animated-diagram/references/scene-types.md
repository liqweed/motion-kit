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

## Storyboards for types not built yet

Build these as custom scenes (`custom-scenes.md`) first. Promote one to a type
once it has been used twice.

| Type | Helps the viewer understand | Storyboard |
|---|---|---|
| `stack` | layers build on each other (architecture, security layers) | layers rise bottom-up; then a request/data packet travels down/up, each layer lighting as it passes |
| `before-after` | what changes | left state fully shown → a divider sweeps → right state builds; differences highlighted with the emphasis colour |
| `timeline` | events in time | axis draws on → milestones drop in order → "now" marker settles |
| `comparison` | option A vs B on criteria | two columns appear → criteria rows fill one at a time → the deciding row emphasised |
| `state-machine` | states and transitions | all states (pending) → a token walks a path of transitions, the current state accent |
| `request-journey` | a request crossing system components | components in regions/boundaries → a dot travels the path, each hop lights, async edges dashed |
| `funnel` / `data-flow` | volume or data narrowing/merging | sources appear → streams draw on and merge → result fills |

Auto-layout for larger graphs: lay out with ELK.js or dagre once (Node, at
build time), store coordinates in the spec, then animate. Mermaid flowchart or
state syntax can serve as input notation (parse nodes/edges, recompute layout).
Don't convert sequence or ER diagrams lossily.
