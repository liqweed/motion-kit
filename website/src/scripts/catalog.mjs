// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · what the site shows. Plain data, importable in Node (the
 * site test checks every entry) and in the browser (no DOM here).
 *
 * LIVE entries are real scenes in this repository. PLANNED entries are
 * storyboards of scene types that are not built yet (docs/roadmap.md); the
 * site shows them as "needs" cards and never fakes them with a player.
 */

export const REPO = "https://github.com/liqweed/motion-kit";

/** @typedef {{ key: string, label: string, hint: string }} Group */
/** @type {Group[]} */
export const GROUPS = [
	{ key: "process", label: "A process", hint: "Things happen in order." },
	{ key: "system", label: "A system", hint: "What connects to what, and what a request crosses." },
	{ key: "change", label: "A change or a choice", hint: "What is different, and which option to pick." },
	{ key: "data", label: "Data narrowing or merging", hint: "Many inputs, one result." },
	{ key: "custom", label: "Your own shape", hint: "Custom scenes: plain modules with frame(t)." },
];

/**
 * @typedef {{
 *   id: string, group: string, title: string, type: string,
 *   file: string, kind: "spec" | "module", steps: number,
 *   kit?: boolean,
 * }} LiveExample
 */
/** @type {LiveExample[]} */
export const LIVE = [
	{"id": "player-states", "group": "process", "title": "The player, as states", "type": "state-machine", "file": "examples/player-states.json", "kind": "spec", "steps": 6},
	{"id": "checkout", "group": "system", "title": "A checkout request", "type": "request-journey", "file": "examples/checkout.json", "kind": "spec", "steps": 5},
	{"id": "connection", "group": "system", "title": "A connection recovers", "type": "state-machine", "file": "examples/connection.json", "kind": "spec", "steps": 5},
	{ id: "pull-request", group: "process", title: "How a pull request lands", type: "flowchart", file: "examples/pull-request.json", kind: "spec", steps: 7 },
	{ id: "order-flow", group: "process", title: "How an order reaches the customer", type: "sequence", file: "examples/order-flow.json", kind: "spec", steps: 6 },
	{ id: "release-pipeline", group: "process", title: "From commit to published media", type: "sequence", file: "examples/release-pipeline.json", kind: "spec", steps: 5 },
	{ id: "agent-loop", group: "process", title: "An agent goes from brief to checked diagram", type: "sequence", file: "examples/agent-loop.json", kind: "spec", steps: 6 },
	{ id: "incident", group: "process", title: "An incident, start to review", type: "timeline", file: "examples/incident.json", kind: "spec", steps: 7 },
	{ id: "smart-home", group: "system", title: "What the home hub connects", type: "hub-spoke", file: "examples/smart-home.json", kind: "spec", steps: 6 },
	{ id: "integrations", group: "system", title: "One platform, many integrations", type: "hub-spoke", file: "examples/integrations.json", kind: "spec", steps: 8 },
	{ id: "web-stack", group: "system", title: "A request through the layers", type: "stack", file: "examples/web-stack.json", kind: "spec", steps: 5 },
	{ id: "custom-pulse", group: "custom", title: "Request and response", type: "custom scene", file: "examples/custom-pulse.scene.mjs", kind: "module", steps: 3 },
	{ id: "logo", group: "custom", title: "The motion-kit mark", type: "custom scene", file: "brand/logo.scene.mjs", kind: "module", steps: 3, kit: true },
];

/**
 * `issue` is the tracker item for the type, once one exists; without it the
 * card points at the roadmap's suggestions.
 * @typedef {{ id: string, group: string, title: string, type: string, issue?: number, story: string }} PlannedExample
 */
/** @type {PlannedExample[]} */
export const PLANNED = [
	{ id: "one-scene", group: "change", title: "Per-medium authoring vs one scene", type: "before-after", story: "The left state shows, a divider sweeps, the right state builds, the difference is emphasised." },
	{ id: "bake-vs-live", group: "change", title: "Baked SVG or live player?", type: "comparison", story: "Two columns; criteria rows fill; the deciding row is emphasised." },
	{ id: "gate-funnel", group: "data", title: "Everything goes through the gate", type: "funnel", story: "Sources appear, streams merge, the result fills." },
];

/**
 * What the scene types draw, in the order the site lists them. `example` is a
 * LIVE entry of that type; test/site.test.mjs checks the list against the
 * registry, so a new scene type cannot be left off the site.
 * @typedef {{ type: string, use: string, example: string, cmd?: string }} TypeEntry
 */
/** @type {TypeEntry[]} */
export const TYPES = [
	{ type: "sequence", use: "Steps in order: a process, a pipeline, a build-up.", example: "order-flow" },
	{ type: "flowchart", use: "A process with branches, joins and decisions. Import it from a Mermaid flowchart.", example: "pull-request", cmd: "motion-kit import flow.mmd --out flow.json" },
	{ type: "hub-spoke", use: "What connects to a centre: a platform and its integrations.", example: "smart-home" },
	{ type: "timeline", use: "What happened, and when: an incident, a project, a release history.", example: "incident" },
	{ type: "stack", use: "What a request crosses: layers from the browser to the database.", example: "web-stack" },
	{ type: "state-machine", use: "States, and the moves between them.", example: "player-states" },
	{ type: "request-journey", use: "One request's path across systems, and back.", example: "checkout" },
];

/** Where one scene can go. */
export const TARGETS = [
	{ h: "Live player", p: "Scrubber, steps and captions on a web page, in an Astro island, a <motion-diagram> element or a Craft Page. It respects reduced motion." },
	{ h: "Slidev", p: "One build step per click, from the same spec." },
	{ h: "Step frames", p: "Settled SVG or PNG for slides, in light and dark and every format, with a QC contact sheet to review." },
	{ h: "Baked SVG", p: "A zero-JS animated SVG that plays in a README or a chat preview, then holds." },
	{ h: "Video", p: "MP4, WebM or GIF in 16:9, 4:3, 1:1 and 9:16." },
	{ h: "Project icon", p: "The repository's icon set (assets/, .idea/) from a logo scene." },
];

/** Formats the example page offers, with the width its stage may take. */
export const FORMAT_STAGE = {
	wide: 1200,
	tall: 400,
	"16:9": 1000,
	"4:3": 860,
	"1:1": 640,
	"9:16": 420,
};
export const FORMAT_NAMES = Object.keys(FORMAT_STAGE);
export const LOCALES = ["en", "nl"];

/**
 * Styles the site can preview: colours, font and, for some, the motion curves.
 * The "draw" block (node, connector and emphasis skins) is not built, so
 * nothing here pretends to be.
 * @typedef {{ name: string, note: string, file: string, font: string, fontStack: string, motion?: import("../../../runtime/motion.mjs").Motion, light: Record<string,string>, dark: Record<string,string> }} SiteStyle
 */
/** @type {Record<string, SiteStyle>} */
export const STYLES = {
	studio: {
		name: "studio",
		note: "this site",
		file: "diagrams/studio.json",
		font: "Inter",
		fontStack: '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
		light: { bg: "#ffffff", surface: "#f3f4f6", ink: "#111827", muted: "#4b5563", line: "#8b929c", accent: "#1d36a8", onAccent: "#ffffff", emphasis: "#d97706" },
		dark: { bg: "#0f1115", surface: "#1c2029", ink: "#f3f4f6", muted: "#a7adb8", line: "#6b7280", accent: "#2563eb", onAccent: "#ffffff", emphasis: "#fbbf24" },
	},
	neutral: {
		name: "neutral",
		note: "shipped today",
		file: "styles/neutral.json",
		font: "system-ui",
		fontStack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
		light: { bg: "#ffffff", surface: "#f3f4f6", ink: "#111827", muted: "#4b5563", line: "#8b929c", accent: "#1d36a8", onAccent: "#ffffff", emphasis: "#d97706" },
		dark: { bg: "#0f1115", surface: "#1c2029", ink: "#f3f4f6", muted: "#a7adb8", line: "#6b7280", accent: "#2563eb", onAccent: "#ffffff", emphasis: "#fbbf24" },
	},
	tidewater: {
		name: "tidewater",
		note: "teal & rust",
		file: "diagrams/tidewater.json",
		motion: { enter: [0.16, 1, 0.3, 1], move: [0.23, 1, 0.32, 1] },
		font: "Inter",
		fontStack: '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif',
		light: { bg: "#ffffff", surface: "#eef6f5", ink: "#0b2a2e", muted: "#3f5f63", line: "#6f8c8e", accent: "#0f3f3b", onAccent: "#ffffff", emphasis: "#ea580c" },
		dark: { bg: "#071a1c", surface: "#0f2a2d", ink: "#e6f4f2", muted: "#9cc0bd", line: "#4f7a7c", accent: "#0f766e", onAccent: "#ffffff", emphasis: "#fdba74" },
	},
	ledger: {
		name: "ledger",
		note: "editorial",
		file: "diagrams/ledger.json",
		font: "Source Serif 4",
		fontStack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif',
		light: { bg: "#faf7f0", surface: "#f0ebe0", ink: "#1c1917", muted: "#57534e", line: "#8c8478", accent: "#5c200e", onAccent: "#ffffff", emphasis: "#3b82f6" },
		dark: { bg: "#1a1714", surface: "#26221d", ink: "#f5f0e6", muted: "#b5ab9c", line: "#7d7468", accent: "#c2410c", onAccent: "#ffffff", emphasis: "#bfdbfe" },
	},
	blueprint: {
		name: "blueprint",
		note: "technical",
		file: "diagrams/blueprint.json",
		font: "JetBrains Mono",
		fontStack: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
		light: { bg: "#eef4fb", surface: "#e1ecf8", ink: "#0b2545", muted: "#2f4a6b", line: "#5b7aa0", accent: "#172554", onAccent: "#ffffff", emphasis: "#d9480f" },
		dark: { bg: "#0b1f3a", surface: "#11294b", ink: "#e6f0ff", muted: "#a9c1e0", line: "#5f86b8", accent: "#2563eb", onAccent: "#ffffff", emphasis: "#fbbf24" },
	},
};
export const STYLE_NAMES = Object.keys(STYLES);

/** The agent session in the hero: one brief per real scene. */
export const BRIEFS = [
	{ id: "order-flow", label: "Order flow", prompt: "Explain how an order reaches the customer, in plain language.", file: "diagrams/order-flow.json", type: "sequence", steps: 6 },
	{ id: "smart-home", label: "Home hub", prompt: "What does the home hub connect? One step per device.", file: "diagrams/smart-home.json", type: "hub-spoke", steps: 6 },
	{ id: "release-pipeline", label: "Release pipeline", prompt: "Walk through our release, from commit to published media.", file: "diagrams/release-pipeline.json", type: "sequence", steps: 5 },
	{ id: "integrations", label: "Integrations", prompt: "Show the seven tools our platform plugs into.", file: "diagrams/integrations.json", type: "hub-spoke", steps: 8 },
];

export const PROOFS = [
	{ h: "Same t, same bytes", p: "Rendering a time twice gives identical output, in Node and in the browser." },
	{ h: "Settled step frames", p: "Every step is a finished frame you can put on a slide." },
	{ h: "Every format × locale", p: "Six formats, every language in the spec; labels must fit or the scene fails." },
	{ h: "Zero JS where needed", p: "Baked SVGs carry no script: they play in a README and hold." },
];

/** Hero transcript. `step` indexes the agent-loop scene shown beside it. */
export const TRANSCRIPT = [
	{ who: "You", text: "Explain how an order reaches the customer, in plain language.", cmd: null },
	{ who: "Agent", text: "Proposes six steps, Order to Follow up, one sentence each. You approve the story before anything is drawn.", cmd: null },
	{ who: "Agent", text: "Writes a sequence spec: data, not animation code.", cmd: "diagrams/order-flow.json" },
	{ who: "Agent", text: "Runs the gate for every format and both locales, and fixes what it reports.", cmd: "motion-kit check diagrams/order-flow.json" },
	{ who: "Agent", text: "Renders step frames with a review sheet, and a baked SVG for the README.", cmd: "motion-kit export … --png --qc · motion-kit bake … -f wide" },
	{ who: "You", text: "Review the contact sheet in light, dark and at phone width, and sign off.", cmd: null },
];

export const DEFECTS = [
	{
		title: "A translated label doesn’t fit", rule: "G13", ruleName: "construction per format × locale", file: "diagrams/order-flow.json",
		code: '{ "label": {\n    "en": "Pick / Pack",\n    "nl": "Verzamelen en inpakken in het distributiecentrum" } }\n\n❯ motion-kit check diagrams/order-flow.json',
		why: "In 9:16 the Dutch label needs more lines than its node allows, so the scene is not built for 9:16 × nl. The other formats are still checked.",
		fix: "a shorter label, fewer nodes, or another format. Never by cropping or shrinking below 14 px.",
	},
	{
		title: "A colour literal in frame()", rule: "G4", ruleName: "token-only colours", file: "diagrams/my-diagram.scene.mjs",
		code: 'frame(t) {\n  return el("circle", { r: 8,\n    fill: "#2563eb" });   // literal\n}',
		why: "A hex, rgb(), hsl() or named colour (\"red\") in the output can’t follow light/dark or a brand style.",
		fix: 'fill: tok("accent").',
	},
	{
		title: "A step that isn’t settled", rule: "G6", ruleName: "settled step frames", file: "diagrams/my-diagram.scene.mjs",
		code: 'steps: [{ at: 1.2, label: "Ship" }],\n// the line to "Ship" draws from 0.9 s to 1.4 s',
		why: "render(1.199) differs from render(1.2): a slide made from this step would show a half-drawn line.",
		fix: "end the movement before the step time, or move the step to 1.45.",
	},
	{
		title: "Math.random() in frame()", rule: "G1 · G11", ruleName: "deterministic bytes", file: "diagrams/my-diagram.scene.mjs",
		code: "frame(t) {\n  const jitter = Math.random() * 2;\n  …\n}",
		why: "The same t renders different bytes, and the source scan finds Math.random. Video, slides and the player would disagree.",
		fix: "derive everything from t and constants.",
	},
	{
		title: "It never stops", rule: "G8", ruleName: "holds the final frame", file: "diagrams/my-diagram.scene.mjs",
		code: "const pulse = Math.sin(t * 6);\n// still moving after duration",
		why: "render(duration + 5) differs from render(duration). Explainers hold; they don’t loop.",
		fix: "clamp the motion to end at or before duration.",
	},
];

/** The rules the gate enforces, as the example page lists them. */
export const RULES = [
	["G1", "Same t, same bytes (121 samples)"],
	["G2", "Well-formed markup"],
	["G3", "No number with 5 or more decimals"],
	["G4", "No colour literals: tokens only"],
	["G5", "No NaN, undefined or Infinity"],
	["G6", "Settled step frames: at rest at the step, unchanged 45 ms after"],
	["G7", "Advice: something animates"],
	["G8", "Holds the final frame"],
	["G9", "Advice: duration ≤ 12 s"],
	["G10", "Advice: every step label appears in the final frame"],
	["G11", "No clock or randomness in frame() or what it calls"],
	["G12", "Style contrast, light and dark (emphasis on accent is advice)"],
	["G13", "Builds in every format × locale"],
];

export const STORY = [
	{ h: "Commit", p: "Someone changes a spec, a label or a custom scene. That is the only kind of edit: nobody re-animates anything by hand." },
	{ h: "Test", p: "Unit tests run first, including one that renders the same scene in the browser bundle and in Node and compares the bytes." },
	{ h: "Gate", p: "motion-kit check builds every example in every format and locale and samples each 121 times. One failure stops the push." },
	{ h: "Bake", p: "npm run media regenerates the README animations and the logo. Generated media are never edited by hand." },
	{ h: "Publish", p: "Unchanged inputs give byte-identical files, so a diff in the media folder means something really changed." },
];

export const NEIGHBOURS = [
	{ tool: "HyperFrames", lic: "Apache-2.0", when: "Video with footage, screen recordings, audio, captions and longer edits.", fit: "Same seek(t) idea: a motion-kit scene can be a clip through window.__motionKit[id].seek(t)." },
	{ tool: "Remotion", lic: "source-available", when: "React-based video compositions, rich templates, Lambda rendering.", fit: "Free for individuals and companies of up to 3 people; a company licence otherwise." },
	{ tool: "Motion Canvas / Revideo", lic: "MIT", when: "Hand-crafted technical explainer videos with generator timelines.", fit: "Good for one-off videos; no live-page reuse." },
	{ tool: "Manim CE", lic: "MIT", when: "Mathematics and science visuals, equations.", fit: "Python, video only." },
	{ tool: "GSAP", lic: "free incl. commercial", when: "Rich page motion, morphing, text splitting.", fit: "Paused timelines are seekable. Use it for website polish; keep explainers in motion-kit." },
	{ tool: "React effect libraries", lic: "Magic UI: MIT", when: "A few animated connectors, such as Magic UI's animated-beam or Aceternity's beams, on a page that already renders React.", fit: "The hub-spoke scene draws the same integrations picture without React, and the same spec also gives slide frames, a zero-JS baked SVG and video." },
	{ tool: "Mermaid", lic: "MIT", when: "Static diagrams from text; quick structure.", fit: "Import flowcharts with motion-kit import; the layout is computed once at build time." },
];

export const INSTALLS = [
	{ title: "Claude Code plugin", text: "Recommended. The animated-diagram, motion-render and project-logo skills, in every project.", cmd: "claude plugin marketplace add liqweed/motion-kit\nclaude plugin install motion-kit@motion-kit", primary: true },
	{ title: "npm", text: "Run the CLI with no clone. PNG and video need the optional @resvg/resvg-js, which npx installs with it.", cmd: "npx @liqweed/motion-kit types\nnpx @liqweed/motion-kit check diagrams/order-flow.json\nnpx @liqweed/motion-kit import flow.mmd --out flow.json" },
	{ title: "Clone and try", text: "Check, build and bake the examples yourself.", cmd: "git clone https://github.com/liqweed/motion-kit\ncd motion-kit\nnode cli/motion-kit.mjs check examples/order-flow.json\nnode cli/motion-kit.mjs bake examples/order-flow.json \\\n  -o out/order.svg -f wide" },
	{ title: "Vendor into your repo", text: "Copies runtime/ and one adapter (slidev, astro or page). Your CI needs no install step.", cmd: "node cli/motion-kit.mjs vendor <repo>/src/motion-kit \\\n  --adapter astro" },
];

/** Docs sidebar. `href` is a page on this site or a file in the repository. */
export const DOCS_NAV = [
	{ title: "Start", items: [
		{ label: "Install", href: "/#install" },
		{ label: "Your first scene", href: `${REPO}/blob/main/skills/animated-diagram/SKILL.md` },
		{ label: "The gate", href: `${REPO}/blob/main/docs/spec/technique.md` },
	] },
	{ title: "Patterns", items: [
		{ label: "Step buttons and caption", href: `${REPO}/blob/main/skills/animated-diagram/references/interactivity.md` },
		{ label: "Hover and focus linking", href: "/docs/", current: true },
		{ label: "Scroll-driven steps", href: "/#scroll" },
		{ label: "Astro", href: `${REPO}/blob/main/docs/guides/astro.md` },
		{ label: "Scrubbing", href: `${REPO}/blob/main/skills/animated-diagram/references/interactivity.md` },
		{ label: "Explorables", href: "/docs/#explore" },
	] },
	{ title: "Reference", items: [
		{ label: "Player API", href: `${REPO}/blob/main/runtime/player.mjs` },
		{ label: "Scene types", href: `${REPO}/blob/main/skills/animated-diagram/references/scene-types.md` },
		{ label: "Formats", href: `${REPO}/blob/main/docs/spec/technique.md` },
		{ label: "Styles, tokens and motion curves", href: `${REPO}/blob/main/skills/animated-diagram/references/styles.md` },
		{ label: "Targets and adapters", href: `${REPO}/blob/main/skills/animated-diagram/references/targets.md` },
		{ label: "What semver covers", href: `${REPO}/blob/main/docs/stability.md` },
		{ label: "Roadmap", href: `${REPO}/blob/main/docs/roadmap.md` },
	] },
];

/** Looks up a live or planned example. @param {string} id */
export function findExample(id) {
	const live = LIVE.find((e) => e.id === id);
	if (live) return { ...live, built: true };
	const planned = PLANNED.find((e) => e.id === id);
	return planned ? { ...planned, built: false } : null;
}
