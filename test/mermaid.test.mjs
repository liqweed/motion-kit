import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkScene } from "../lib/check.mjs";
import { layered, placeInOrder } from "../lib/layout.mjs";
import { chainOrder, mermaidToSpec, parseMermaid } from "../lib/mermaid.mjs";
import { FORMATS } from "../runtime/scene.mjs";
import { createScene } from "../runtime/types/index.mjs";

const read = (/** @type {string} */ rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/** Every format passes the scene gate. @param {any} spec */
function gateEveryFormat(spec) {
	for (const format of Object.keys(FORMATS)) {
		const scene = createScene(spec, { format });
		assert.deepEqual(checkScene(scene).problems, [], `${spec.id} · ${format}`);
	}
}

describe("Mermaid import", () => {
	it("a linear flowchart becomes a sequence spec that passes the gate", () => {
		const { spec, warnings } = mermaidToSpec("flowchart LR\n  A[Write] --> B[Review] --> C[Merge]\n  C --> D([Release])\n", { id: "ship" });
		assert.deepEqual(warnings, []);
		assert.equal(spec.type, "sequence");
		assert.deepEqual(spec.nodes.map((/** @type {any} */ n) => n.label), ["Write", "Review", "Merge", "Release"]);
		assert.equal(spec.title, "Ship");
		assert.match(spec.description, /4 stages in order: Write, Review, Merge and Release/);
		gateEveryFormat(spec);
	});

	it("a branching flowchart becomes a laid-out flowchart that passes the gate in every format", () => {
		const { spec } = mermaidToSpec(read("examples/pull-request.mmd"), { id: "pull-request" });
		assert.equal(spec.type, "flowchart");
		assert.equal(spec.title, "How a pull request lands");
		for (const n of spec.nodes) assert.ok(Number.isInteger(n.rank) && Number.isFinite(n.pos), n.id);
		gateEveryFormat(spec);
	});

	it("the committed example is what the importer writes today", () => {
		const { spec } = mermaidToSpec(read("examples/pull-request.mmd"), { id: "pull-request" });
		assert.equal(`${JSON.stringify(spec, null, "\t")}\n`, read("examples/pull-request.json"), "rerun: node cli/motion-kit.mjs import examples/pull-request.mmd --out examples/pull-request.json");
	});

	it("labels on links, dotted links or joins keep a flowchart, not a sequence", () => {
		assert.equal(mermaidToSpec("graph TD\nA -->|go| B\n").spec.type, "flowchart");
		assert.equal(mermaidToSpec("graph TD\nA -.-> B\n").spec.type, "flowchart");
		assert.equal(mermaidToSpec("graph TD\nA --> C\nB --> C\n").spec.type, "flowchart");
		assert.equal(chainOrder(parseMermaid("graph TD\nA --> B\nB --> A\n")), null, "a cycle is no chain");
	});

	it("reads shapes, link forms, chains, groups, entities and accessibility text", () => {
		const g = parseMermaid([
			"---", "title: Front matter", "---",
			"graph RL;",
			"  accDescr {", "    Two", "    lines", "  }",
			'  a(Round) & b([Pill]) -- text --> c{{Hex}} --- d["Quote #quot;x#quot; <br/> two"]',
			"  c -. maybe .-> e{Choice}; e ==> a",
		].join("\n"));
		assert.equal(g.direction, "left");
		assert.equal(g.title, "Front matter");
		assert.equal(g.description, "Two lines");
		assert.deepEqual(g.nodes.map((n) => [n.id, n.shape, n.label]), [
			["a", "round", "Round"], ["b", "pill", "Pill"], ["c", "decision", "Hex"], ["d", "box", 'Quote "x" two'], ["e", "decision", "Choice"],
		]);
		assert.deepEqual(g.edges.map((e) => `${e.from}>${e.to}:${e.label}:${e.arrow ? "a" : "-"}${e.dashed ? "d" : ""}`), [
			"a>c:text:a", "b>c:text:a", "c>d::-", "c>e:maybe:ad", "e>a::a",
		]);
		assert.match(g.warnings.join("\n"), /thick links/);
	});

	it("ignores styling with a warning", () => {
		const { warnings } = mermaidToSpec("%%{init: {'theme':'dark'}}%%\ngraph TD\nA:::hot --> B\nclassDef hot fill:#f00\nclass A hot\nstyle B fill:#0f0\nlinkStyle 0 stroke:#00f\n");
		assert.equal(warnings.length, 6);
		for (const w of warnings) assert.match(w, /^line \d+: .*ignored/);
	});

	it("names unsupported syntax and its line", () => {
		const cases = [
			["sequenceDiagram\nA->>B: hi", /line 1: "sequenceDiagram" is not a flowchart/],
			["graph TD\nsubgraph one\nA --> B\nend", /line 2: "subgraph" is not supported/],
			["graph TD\nA --> B\nclick A call()", /line 3: "click" is not supported/],
			["graph TD\nA((Circle)) --> B", /line 2: node A uses the \(\(circle\)\) shape/],
			["graph TD\nA[(DB)] --> B", /database/],
			["graph TD\nA[[Sub]] --> B", /subroutine/],
			["graph TD\nA <--> B", /two-way, circle and cross links/],
			["graph TD\nA --o B", /two-way, circle and cross links/],
			["graph TD\nA ~~~ B", /invisible links/],
			["graph TD\nA --> A", /links to itself/],
			["graph TD\nA@{ shape: rect } --> B", /@\{ shape/],
			['graph TD\nA["`**bold**`"] --> B', /markdown strings/],
			["graph TD\nA[<b>x</b>] --> B", /HTML in the label/],
			["graph TD\nA -> B", /expected a link/],
			["", /no "flowchart" or "graph" header/],
		];
		for (const [src, re] of cases) assert.throws(() => mermaidToSpec(/** @type {string} */ (src)), /** @type {RegExp} */ (re), String(src));
		assert.throws(() => mermaidToSpec("graph TD\nA"), /needs at least 2/);
		assert.throws(() => mermaidToSpec(`graph TD\n${Array.from({ length: 13 }, (_, i) => `n${i} --> n${i + 1}`).join("\n")}`), /at most 12/);
	});
});

describe("layered layout", () => {
	it("is deterministic, ranks along the flow and keeps nodes apart", () => {
		const edges = [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }, { from: "a", to: "d" }, { from: "d", to: "a" }];
		const one = layered(["a", "b", "c", "d"], edges);
		const two = layered(["a", "b", "c", "d"], edges);
		assert.deepEqual(one, two);
		assert.deepEqual([...one.ranks.values()], [0, 1, 1, 2]);
		assert.ok(Math.abs(/** @type {number} */ (one.pos.get("b")) - /** @type {number} */ (one.pos.get("c"))) >= 1);
		// a → d spans two ranks: one waypoint, off the boxes of rank 1.
		assert.equal(one.via[4].length, 1);
		assert.equal(one.via[4][0][0], 1);
		// The back edge d → a runs through rank 1 from d's side.
		assert.deepEqual(one.via[5].map((p) => p[0]), [1]);
		assert.equal(Math.min(...one.pos.values(), ...one.via.flat().map((p) => p[1])), 0);
	});

	it("placeInOrder keeps order and gaps with the least movement", () => {
		assert.deepEqual(placeInOrder([0, 0, 0], [1, 1]), [-1, 0, 1]);
		assert.deepEqual(placeInOrder([0, 5], [1]), [0, 5]);
	});
});

describe("flowchart scene type", () => {
	const base = JSON.parse(read("examples/pull-request.json"));

	it("steps follow the flow and carry the node ids", () => {
		const scene = createScene(base);
		assert.deepEqual(scene.steps.map((s) => s.id), ["open", "ci", "fix", "review", "revise", "merge", "release"]);
		assert.equal(scene.steps.at(-1)?.label, "Release");
		assert.ok(scene.duration <= 8, `${scene.duration}s`);
	});

	it("validates the stored layout", () => {
		const bad = (/** @type {(s: any) => void} */ edit, /** @type {RegExp} */ re) => {
			const spec = structuredClone(base);
			edit(spec);
			assert.throws(() => createScene(spec), re);
		};
		bad((s) => (s.nodes[3].pos = s.nodes[2].pos + 0.5), /overlap on rank/);
		bad((s) => (s.nodes[0].rank = 1.5), /rank must be a whole number/);
		bad((s) => (s.edges[0].via = [[3, 0]]), /consecutive ranks/);
		bad((s) => (s.edges[0].to = "nope"), /unknown from\/to/);
		bad((s) => (s.edges[0].to = s.edges[0].from), /self-loop/);
		bad((s) => (s.nodes[0].shape = "circle"), /shape must be one of/);
		bad((s) => (s.direction = "sideways"), /direction must be one of/);
		bad((s) => (s.nodes[0].label = "Supercalifragilisticexpialidocious-and-then-some"), /does not fit/);
	});

	it("renders every direction", () => {
		for (const direction of ["down", "up", "right", "left"]) {
			const scene = createScene({ ...base, direction });
			assert.deepEqual(checkScene(scene).problems, [], direction);
		}
	});
});
