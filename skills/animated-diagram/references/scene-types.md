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

### `state-machine`: states and explicit transitions

```json
{ "type": "state-machine", "id": "connection",
  "title": "A connection", "description": "Connect and disconnect.",
  "states": [{ "id": "off", "label": "Offline" }, { "id": "on", "label": "Online" }],
  "transitions": [
    { "id": "connect", "from": "off", "to": "on", "label": "Connect" },
    { "id": "close", "from": "on", "to": "off", "label": "Disconnect" }
  ],
  "initial": "off", "path": ["connect", "close"] }
```

2–8 states, 1–12 transitions and 1–10 narrated transitions in `path`.
State and transition ids are required and unique within their list. `initial`
names a state. Each path edge must start where the previous one ended; branches,
cycles, repeated transitions and self-transitions are supported. The path is
explicit: the runtime never decides which branch to take. All states appear
pending, the initial state fills, then a single token follows the path while
the current state fills accent. Completed edges retain their accent. The
built-in types carry one token at a time; a custom scene that needs several
pieces of work moving at once uses `tokensAlong` (`custom-scenes.md`).

Layouts use a column in reading order with separate connector lanes outside
the labels; each fixed format centers the fitted graph, and strips grow to
fit. Labels auto-fit to two lines at 14 px or above. Oversized graphs and labels
fail with a remedy. `fontSize` sets the optional maximum.

Steps are the initial state (`initial`), then one per path entry (`visit-1`,
`visit-2`, …). Transition labels and optional `detail` sentences appear in
controls, captions and the accessible transcript; they are narrative steps
(`stepLabelsInFrame: false`), not labels drawn on every edge. State labels stay
visible in every settled frame. Labels, title, description and details accept
localized strings. See `examples/player-states.json` and `connection.json`.

### `request-journey`: a request crossing components

Uses the same explicit walk, timing, bounds and step ids as `state-machine`,
with `components` instead of `states` and `hops` instead of `transitions`:

```json
{ "type": "request-journey", "id": "request",
  "title": "Queue a job", "description": "The API queues work asynchronously.",
  "components": [
    { "id": "api", "label": "API", "region": "Service" },
    { "id": "queue", "label": "Queue", "region": "Worker" }
  ],
  "hops": [{ "id": "send", "from": "api", "to": "queue", "label": "Enqueue", "async": true }],
  "initial": "api", "path": ["send"] }
```

A component's optional localized `region` names its boundary, shown as a
one-line heading above a dashed enclosure. Components sharing a region keep
separate enclosures with the same name. Hops with `async: true` stay dashed,
including after activation. Return paths are ordinary hops in the opposite
direction. See `examples/checkout.json`.

### `flowchart`: a process with branches and joins

Usually imported from Mermaid rather than written by hand:

```bash
motion-kit import flow.mmd --out flow.json   # also checks flow.json in every format (or only the --format ones)
```

```json
{ "type": "flowchart", "id": "pull-request",
  "title": "…", "description": "…",
  "direction": "down",                       // "up", "right", "left"
  "nodes": [ { "id": "ci", "label": "CI passes?", "shape": "decision", "rank": 1, "pos": 0.25 }, … ],
  "edges": [ { "from": "ci", "to": "fix", "label": "No" },
             { "from": "a", "to": "d", "via": [[1, 0.75]] },
             { "from": "login", "to": "auth", "dashed": true }, … ] }
```

2–12 nodes, 1–20 edges. The layout is stored in the spec: `rank` is a node's
layer along the flow (whole numbers), `pos` its place across the flow in node
pitches (nodes on one rank ≥ 1 apart), and an edge spanning several ranks has
one `via` waypoint per rank between. The importer computes these once at build
time (`lib/layout.mjs`, a layered layout); the scene type only scales them to
each format, so the runtime never lays a graph out. Shapes: `box` (default),
`round`, `pill`, `decision`. Edges may carry a short one-line `label`, be
`dashed`, or have no arrowhead (`"arrow": false`). Nodes may carry `detail`.

Storyboard: the chart appears rank by rank in pending colours → nodes fill
accent one at a time in flow order (rank, then across), each incoming connector
drawing on in accent just before its node fills → an emphasis outline marks the
node just reached. A connector that points back (a retry loop) turns accent
while its source fills. Steps = one per node; step ids are the node ids.
`direction` is the flow in wide formats; 9:16 and `tall` flow downward, and a
format falls back to the other axis when the preferred one does not fit. Throws
when labels, edge labels or connectors would collide: shorter labels, fewer
ranks or a larger format. See `examples/pull-request.mmd` and its spec.

### Importing Mermaid

`motion-kit import <file.mmd | ->` turns a Mermaid flowchart into a spec
(stdout, or `--out`; `--id`, `--title`, `--description` override what the
chart says). A plain chain (each node one link in and one out, no link labels,
no dotted links) becomes a `sequence`; anything else becomes a `flowchart`.

- Read: `flowchart`/`graph` with `TB`/`TD`/`BT`/`LR`/`RL`; `[box]`, `(round)`,
  `([pill])`, `{decision}`, `{{decision}}`; quoted labels, `<br>`, `#quot;`
  codes; `-->`, `---`, `-.->`, `-.-`, `==>`, `===` with `|text|` or
  `-- text -->` labels; chains and `&` groups; `accTitle`, `accDescr`, a
  front-matter `title`. The title and description become the scene's
  accessible name and description; without `accDescr` the description lists
  every link in words.
- Ignored with a warning (colours come from the motion-kit style): `classDef`,
  `class`, `style`, `linkStyle`, `:::name`, `%%{init}%%`, front-matter `config`.
- Errors naming the line: subgraphs and `direction`, `click`, other shapes
  (circle, database, subroutine, parallelogram, …), `@{ shape }`, two-way,
  circle and cross links, `~~~`, link ids, self-loops, markdown strings, HTML
  in labels, and more than 12 nodes or 20 links. Sequence, state and ER
  diagrams are not converted.

## Storyboards for types not built yet

Build these as custom scenes (`custom-scenes.md`) first. Promote one to a type
once it has been used twice.

| Type | Helps the viewer understand | Storyboard |
|---|---|---|
| `before-after` | what changes | left state fully shown → a divider sweeps → right state builds; differences highlighted with the emphasis colour |
| `comparison` | option A vs B on criteria | two columns appear → criteria rows fill one at a time → the deciding row emphasised |
| `funnel` / `data-flow` | volume or data narrowing/merging | sources appear → streams draw on and merge → result fills |

Auto-layout happens at build time, never in `frame()`: `motion-kit import`
lays out Mermaid flowcharts as `flowchart` specs (above). State diagrams are
not imported yet; write a `state-machine` spec. Don't convert sequence or ER
diagrams lossily.
