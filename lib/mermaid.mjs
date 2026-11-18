// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · import a Mermaid flowchart as a spec (Node, build time).
 *
 *   parseMermaid(source) → { direction, title, description, nodes, edges, warnings }
 *   mermaidToSpec(source, { id, title, description }) → { spec, warnings }
 *
 * A flowchart that is one chain (every node has at most one link in and one
 * out, no link labels, no dotted links) becomes a `sequence` spec. Anything
 * else becomes a `flowchart` spec with its layout computed here, once
 * (lib/layout.mjs), and stored as ranks and positions, so the runtime never
 * lays a graph out.
 *
 * Supported: `flowchart`/`graph` with TB, TD, BT, LR or RL; nodes with
 * `[box]`, `(round)`, `([pill])`, `{decision}` and `{{decision}}` shapes,
 * quoted labels, `<br>` and `#entity;` codes; links `-->`, `---`, `-.->`,
 * `-.-`, `==>`, `===` of any length, with `|text|` or `-- text -->` labels;
 * chains (`A --> B --> C`) and `&` groups; `accTitle`, `accDescr` and a
 * front-matter `title`. Styling (`classDef`, `class`, `style`, `linkStyle`,
 * `:::name`, `%%{init}%%`, front-matter `config`) is ignored with a warning:
 * colours come from the motion-kit style. Everything else fails with an
 * error that names it and its line.
 */
import { layered } from "./layout.mjs";

/**
 * @typedef {{ id: string, label: string, shape: "box" | "round" | "pill" | "decision" }} MermaidNode
 * @typedef {{ from: string, to: string, label: string, arrow: boolean, dashed: boolean }} MermaidEdge
 * @typedef {{ direction: "down" | "up" | "right" | "left", title: string, description: string, nodes: MermaidNode[], edges: MermaidEdge[], warnings: string[] }} MermaidGraph
 */

const DIRECTIONS = { TB: "down", TD: "down", BT: "up", LR: "right", RL: "left" };

/**
 * Node shapes: opener, closer (null: several), and the built shape it becomes
 * or a description of the unsupported one.
 * @type {[string, string | null, string][]}
 */
const SHAPES = [
	["(((", ")))", "the (((double circle))) shape"],
	["((", "))", "the ((circle)) shape"],
	["([", "])", "pill"],
	["[[", "]]", "the [[subroutine]] shape"],
	["[(", ")]", "the [(database)] shape"],
	["[/", null, "the [/parallelogram/] and [/trapezoid\\] shapes"],
	["[\\", null, "the [\\parallelogram\\] and [\\trapezoid/] shapes"],
	["{{", "}}", "decision"],
	["[", "]", "box"],
	["(", ")", "round"],
	["{", "}", "decision"],
	[">", "]", "the >asymmetric] shape"],
];
const BUILT_SHAPES = new Set(["box", "round", "pill", "decision"]);

/** Plain links: pattern, arrow, dashed, thick. Longer patterns first. */
const LINKS = [
	[/^-\.+->/, true, true, false],
	[/^-\.+-/, false, true, false],
	[/^-{2,}>/, true, false, false],
	[/^-{3,}/, false, false, false],
	[/^={2,}>/, true, false, true],
	[/^={3,}/, false, false, true],
];
/** Links with the label inside: `-- text -->`, `-. text .->`, `== text ==>`. */
const TEXT_LINKS = [
	[/^--(?![->])\s*(.+?)\s*(-{2,}>|-{3,})/, false, false],
	[/^-\.(?![-.])\s*(.+?)\s*(\.+->|\.+-)/, true, false],
	[/^==(?![=>])\s*(.+?)\s*(={2,}>|={3,})/, false, true],
];

const OTHER_DIAGRAMS = /^(sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4\w*|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|architecture(?:-beta)?|kanban|radar(?:-beta)?|zenuml)\b/;

/**
 * Split one line into statements at `;`, outside quotes, brackets and |labels|.
 * @param {string} line
 */
function statements(line) {
	const out = [];
	let cur = "";
	let quote = false;
	let pipe = false;
	let depth = 0;
	for (const c of line) {
		if (c === '"') quote = !quote;
		else if (!quote && c === "|") pipe = !pipe;
		else if (!quote && !pipe && "[({".includes(c)) depth++;
		else if (!quote && !pipe && "])}".includes(c)) depth = Math.max(0, depth - 1);
		if (c === ";" && !quote && !pipe && depth === 0) {
			out.push(cur);
			cur = "";
		} else cur += c;
	}
	out.push(cur);
	return out.map((s) => s.trim()).filter(Boolean);
}

const ENTITIES = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", apos: "'", num: "#", semi: ";" };

/**
 * Label text as plain text: entity codes decoded, `<br>` as a space.
 * @param {string} raw
 * @param {(why: string) => never} fail
 */
function cleanLabel(raw, fail) {
	let s = raw.trim();
	if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
	if (s.startsWith("`")) fail("markdown strings (\"`…`\") are not supported; write the label as plain text");
	s = s.replace(/<br\s*\/?>/gi, " ");
	if (/<\/?[a-z][^>]*>/i.test(s)) fail(`HTML in the label "${s}" is not supported; write plain text`);
	if (/\bfa:fa-[\w-]+/.test(s)) fail(`Font Awesome icons in the label "${s}" are not supported`);
	s = s.replace(/#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/#([a-z]+);/gi, (m, k) => ENTITIES[/** @type {keyof typeof ENTITIES} */ (k.toLowerCase())] ?? m);
	return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse a Mermaid flowchart. Throws on anything it cannot convert faithfully.
 * @param {string} source
 * @returns {MermaidGraph}
 */
export function parseMermaid(source) {
	const lines = String(source).replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
	/** @type {string[]} */
	const warnings = [];
	let title = "";
	let description = "";
	let n = 0;
	// Front matter: only `title` carries meaning here.
	while (n < lines.length && !lines[n].trim()) n++;
	if (lines[n]?.trim() === "---") {
		const close = lines.findIndex((l, i) => i > n && l.trim() === "---");
		if (close < 0) throw new Error(`line ${n + 1}: front matter is not closed with ---`);
		for (let i = n + 1; i < close; i++) {
			const m = lines[i].match(/^(\w+)\s*:\s*(.*)$/);
			if (!m) continue;
			if (m[1] === "title") title = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
			else warnings.push(`line ${i + 1}: front matter "${m[1]}" ignored: colours and layout come from motion-kit`);
		}
		n = close + 1;
	}

	/** @type {"down" | "up" | "right" | "left" | ""} */
	let direction = "";
	/** @type {Map<string, MermaidNode>} */
	const nodes = new Map();
	/** @type {MermaidEdge[]} */
	const edges = [];
	let thickWarned = false;

	for (; n < lines.length; n++) {
		const lineNo = n + 1;
		/** @param {string} why @returns {never} */
		const fail = (why) => {
			throw new Error(`line ${lineNo}: ${why}`);
		};
		const raw = lines[n].trim();
		if (!raw) continue;
		if (raw.startsWith("%%")) {
			if (raw.startsWith("%%{")) warnings.push(`line ${lineNo}: directive ignored: colours and layout come from motion-kit`);
			continue;
		}
		if (!direction) {
			const first = raw.split(/[\s;]/)[0];
			const head = raw.match(/^(flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?\s*;?\s*(.*)$/i);
			if (!head) {
				throw new Error(`line ${lineNo}: ${OTHER_DIAGRAMS.test(raw) ? `"${first}" is not a flowchart: only Mermaid flowcharts ("flowchart" or "graph") can be imported` : `expected "flowchart" or "graph" with a direction, got "${raw}"`}`);
			}
			direction = /** @type {"down" | "up" | "right" | "left"} */ (DIRECTIONS[/** @type {keyof typeof DIRECTIONS} */ ((head[2] ?? "TB").toUpperCase())]);
			if (!head[3]) continue;
			lines[n] = head[3];
			n--;
			continue;
		}
		const acc = raw.match(/^acc(Title|Descr)\s*(:|\{)\s*(.*)$/);
		if (acc) {
			let value = acc[3];
			if (acc[2] === "{") {
				const parts = [value.replace(/\}\s*$/, "")];
				while (!/\}\s*$/.test(lines[n]) && n + 1 < lines.length) parts.push(lines[++n].trim().replace(/\}\s*$/, ""));
				value = parts.join(" ");
			}
			if (acc[1] === "Title") title = value.trim();
			else description = value.replace(/\s+/g, " ").trim();
			continue;
		}
		for (const stmt of statements(raw)) {
			const word = stmt.split(/\s/)[0];
			if (word === "subgraph" || word === "end" || word === "direction") fail(`"${word}" is not supported: subgraphs have no motion-kit equivalent; remove the subgraph lines or split the chart`);
			if (word === "click") fail(`"click" is not supported: interaction comes from the player, not the chart`);
			if (["classDef", "class", "style", "linkStyle"].includes(word)) {
				warnings.push(`line ${lineNo}: "${word}" ignored: colours come from the motion-kit style`);
				continue;
			}
			parseChain(stmt, lineNo, fail);
		}
	}
	if (!direction) throw new Error(`no "flowchart" or "graph" header found`);

	/**
	 * `A --> B & C -- yes --> D`: nodes and links, left to right.
	 * @param {string} s @param {number} lineNo @param {(why: string) => never} fail
	 */
	function parseChain(s, lineNo, fail) {
		let i = 0;
		const ws = () => {
			while (i < s.length && /\s/.test(s[i])) i++;
		};
		const node = () => {
			ws();
			const m = s.slice(i).match(/^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/);
			if (!m) fail(`expected a node id at "${s.slice(i)}"`);
			const id = m[0];
			if (id === "end") fail(`"end" is a Mermaid keyword and cannot be a node id`);
			i += id.length;
			if (s.startsWith("@{", i)) fail(`node ${id}: the @{ shape: … } syntax is not supported; use [box], (round), ([pill]) or {decision}`);
			const shape = SHAPES.find(([open]) => s.startsWith(open, i));
			if (shape) {
				const [open, close, what] = shape;
				if (!BUILT_SHAPES.has(what) || !close) fail(`node ${id} uses ${what}, which is not supported; use [box], (round), ([pill]) or {decision}`);
				i += open.length;
				ws();
				let end;
				if (s[i] === '"') {
					const q = s.indexOf('"', i + 1);
					if (q < 0) fail(`node ${id}: the quoted label is not closed`);
					end = s.indexOf(close, q + 1);
				} else end = s.indexOf(close, i);
				if (end < 0) fail(`node ${id}: "${open}" is not closed with "${close}"`);
				const label = cleanLabel(s.slice(i, end), fail);
				i = end + close.length;
				nodes.set(id, { id, label: label || id, shape: /** @type {MermaidNode["shape"]} */ (what) });
			} else if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: "box" });
			const cls = s.slice(i).match(/^:::[\w-]+/);
			if (cls) {
				warnings.push(`line ${lineNo}: "${cls[0]}" on ${id} ignored: colours come from the motion-kit style`);
				i += cls[0].length;
			}
			return id;
		};
		const group = () => {
			const ids = [node()];
			for (ws(); s[i] === "&"; ws()) {
				i++;
				ids.push(node());
			}
			return ids;
		};
		const link = () => {
			ws();
			const rest = s.slice(i);
			if (rest.startsWith("~~~")) fail(`invisible links (~~~) are not supported`);
			if (/^(<|o|x)(-|=|\.)/.test(rest) || /^(-{2,}|={2,}|-\.+-)[ox]/.test(rest)) fail(`two-way, circle and cross links (<-->, --o, --x) are not supported; use --> or ---`);
			if (/^[A-Za-z_]+@(-|=)/.test(rest)) fail(`link ids (e1@-->) are not supported`);
			for (const [re, arrow, dashed, thick] of LINKS) {
				const m = rest.match(/** @type {RegExp} */ (re));
				if (!m) continue;
				i += m[0].length;
				ws();
				let label = "";
				if (s[i] === "|") {
					const close = s.indexOf("|", i + 1);
					if (close < 0) fail(`a link label "|…" is not closed with "|"`);
					label = cleanLabel(s.slice(i + 1, close), fail);
					i = close + 1;
				}
				return { arrow: /** @type {boolean} */ (arrow), dashed: /** @type {boolean} */ (dashed), thick: /** @type {boolean} */ (thick), label };
			}
			for (const [re, dashed, thick] of TEXT_LINKS) {
				const m = rest.match(/** @type {RegExp} */ (re));
				if (!m) continue;
				i += m[0].length;
				return { arrow: m[2].endsWith(">"), dashed: /** @type {boolean} */ (dashed), thick: /** @type {boolean} */ (thick), label: cleanLabel(m[1], fail) };
			}
			fail(`expected a link (-->, ---, -.->, ==>) at "${rest}"`);
		};
		let from = group();
		for (ws(); i < s.length; ws()) {
			const l = link();
			if (l.thick && !thickWarned) {
				thickWarned = true;
				warnings.push(`line ${lineNo}: thick links (==>) are drawn like other links`);
			}
			const to = group();
			for (const a of from) {
				for (const b of to) {
					if (a === b) fail(`${a} links to itself; flowcharts draw no self-loops`);
					edges.push({ from: a, to: b, label: l.label, arrow: l.arrow, dashed: l.dashed });
				}
			}
			from = to;
		}
	}

	return { direction, title, description, nodes: [...nodes.values()], edges, warnings };
}

/**
 * The nodes in chain order when the graph is one plain chain, else null.
 * @param {MermaidGraph} g
 * @returns {MermaidNode[] | null}
 */
export function chainOrder(g) {
	if (g.edges.length !== g.nodes.length - 1 || g.edges.some((e) => e.label || e.dashed)) return null;
	const next = new Map();
	const into = new Set();
	for (const e of g.edges) {
		if (next.has(e.from) || into.has(e.to)) return null;
		next.set(e.from, e.to);
		into.add(e.to);
	}
	const starts = g.nodes.filter((nd) => !into.has(nd.id));
	if (starts.length !== 1) return null;
	const byId = new Map(g.nodes.map((nd) => [nd.id, nd]));
	const out = [];
	for (let id = starts[0].id; id !== undefined; id = next.get(id)) out.push(byId.get(id));
	return out.length === g.nodes.length ? /** @type {MermaidNode[]} */ (out) : null;
}

/** "order-review" → "Order review" */
function humanize(/** @type {string} */ id) {
	const s = id.replace(/[-_]+/g, " ").trim();
	return s ? s[0].toUpperCase() + s.slice(1) : "Flowchart";
}

/** "a", "a and b", "a, b and c" */
function list(/** @type {string[]} */ items, word = "and") {
	return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

/**
 * A Mermaid flowchart as a motion-kit spec.
 * @param {string} source
 * @param {{ id?: string, title?: string, description?: string }} [o]
 * @returns {{ spec: Record<string, any>, warnings: string[] }}
 */
export function mermaidToSpec(source, o = {}) {
	const g = parseMermaid(source);
	const id = o.id ?? "flowchart";
	if (!/^[A-Za-z][\w-]*$/.test(id)) throw new Error(`id "${id}" must start with a letter and use only letters, digits, "-" and "_"`);
	if (g.nodes.length < 2) throw new Error(`the chart has ${g.nodes.length} node(s); a scene needs at least 2`);
	if (g.nodes.length > 12) throw new Error(`the chart has ${g.nodes.length} nodes; motion-kit draws at most 12 in one scene: split it`);
	if (g.edges.length > 20) throw new Error(`the chart has ${g.edges.length} links; motion-kit draws at most 20 in one scene: split it`);
	const title = o.title ?? (g.title || humanize(id));
	const label = new Map(g.nodes.map((nd) => [nd.id, nd.label]));
	const chain = chainOrder(g);
	if (chain) {
		const description = o.description ?? (g.description || `${chain.length} stages in order: ${list(chain.map((nd) => nd.label))}.`);
		return {
			spec: { type: "sequence", id, title, description, nodes: chain.map((nd) => ({ id: nd.id, label: nd.label })) },
			warnings: g.warnings,
		};
	}
	const { ranks, pos, via } = layered(g.nodes.map((nd) => nd.id), g.edges);
	const shape = new Map(g.nodes.map((nd) => [nd.id, nd.shape]));
	const order = [...g.nodes].sort((a, b) => /** @type {number} */ (ranks.get(a.id)) - /** @type {number} */ (ranks.get(b.id)) || /** @type {number} */ (pos.get(a.id)) - /** @type {number} */ (pos.get(b.id)));
	const sentences = order
		.map((nd) => {
			const outs = g.edges.filter((e) => e.from === nd.id).map((e) => `${label.get(e.to)}${e.label ? ` (${e.label})` : ""}`);
			return outs.length ? `${nd.label} leads to ${list(outs, shape.get(nd.id) === "decision" ? "or" : "and")}.` : "";
		})
		.filter(Boolean);
	const description = o.description ?? (g.description || sentences.join(" "));
	return {
		spec: {
			type: "flowchart",
			id,
			title,
			description,
			direction: g.direction,
			nodes: g.nodes.map((nd) => ({ id: nd.id, label: nd.label, ...(nd.shape === "box" ? {} : { shape: nd.shape }), rank: ranks.get(nd.id), pos: pos.get(nd.id) })),
			edges: g.edges.map((e, i) => ({
				from: e.from,
				to: e.to,
				...(e.label ? { label: e.label } : {}),
				...(e.dashed ? { dashed: true } : {}),
				...(e.arrow ? {} : { arrow: false }),
				...(via[i].length ? { via: via[i] } : {}),
			})),
		},
		warnings: g.warnings,
	};
}
