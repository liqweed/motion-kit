/** @import { Scene } from "../scene.mjs" */
/** @import { Style } from "../style.mjs" */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene type "flowchart".
 *
 * Helps the viewer understand: a process with branches and joins, as drawn in
 * a flowchart. Storyboard: the whole chart appears rank by rank in pending
 * colours, so the structure is visible first; then the nodes fill accent one
 * at a time in flow order, each incoming connector drawing on in accent just
 * before its node fills, and an emphasis outline marks the node just reached.
 *
 * The layout is data: every node carries a `rank` (its layer along the flow)
 * and a `pos` (its place across the flow, in node pitches), and an edge that
 * spans ranks carries a waypoint per rank between (`via`). `motion-kit import`
 * computes them once at build time from a Mermaid flowchart (lib/layout.mjs);
 * this module only scales them to each format and never lays the graph out.
 *
 * Spec:
 *   { type: "flowchart", id, title, description,
 *     direction?: "down" | "up" | "right" | "left",   // default "down"
 *     nodes: [{ id, label, rank, pos, shape?, detail? }],   // 2–12 nodes
 *     edges: [{ from, to, label?, via?: [[rank, pos], …], dashed?, arrow? }],   // 1–20 edges
 *     fontSize? }
 * shape: "box" (default) | "round" | "pill" | "decision".
 * Strings may be localized objects: { en: "...", nl: "..." }.
 */
import { easeOut, easeStandard, progress } from "../motion.mjs";
import { FONT_MIN, maxFontSize, rectEdge } from "../parts.mjs";
import { FORMATS, localize, withId } from "../scene.mjs";
import { NEUTRAL, tok } from "../style.mjs";
import { drawOn, el, fade, num, polyline, text, translate } from "../svg.mjs";
import { estimateWidth, wrapLabel } from "../wrap.mjs";

export const FLOWCHART_SHAPES = ["box", "round", "pill", "decision"];
export const FLOWCHART_DIRECTIONS = ["down", "up", "right", "left"];

// Timeline (seconds). Steps settle: a step's fill ends at its `at`, and the
// next connector starts drawing BEAT later.
const ENTER_GAP = 0.1;
const ENTER = 0.4;
const DRAW = 0.35;
const FILL = 0.25;
const BEAT = 0.05;
const PERIOD = DRAW + FILL + BEAT;
const TAIL = 0.4;

const BOX_MAX = 220;
const GAP_Y = 20; // between neighbouring boxes across a horizontal flow
const MAX_LINES = 3;
const RING = 5; // emphasis outline distance from the node

/**
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Box
 */

/** @param {Box} a @param {Box} b */
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Does segment a–b pass through box r? (Liang–Barsky clipping.)
 * @param {Pt} a @param {Pt} b @param {Box} r
 */
function segmentHits(a, b, r) {
	let lo = 0;
	let hi = 1;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]]) {
		if (p === 0) {
			if (q < 0) return false;
		} else {
			const s = q / p;
			if (p < 0) lo = Math.max(lo, s);
			else hi = Math.min(hi, s);
			if (lo > hi) return false;
		}
	}
	return true;
}

/**
 * @param {any} spec
 * @param {{ format?: string, locale?: string }} [opts]
 * @returns {Scene}
 */
export function flowchart(spec, { format = "16:9", locale = "en" } = {}) {
	const name = `flowchart "${spec.id}"`;
	/** @param {string} why @returns {never} */
	const fail = (why) => {
		throw new Error(`${name}: ${why}`);
	};
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const nodes = spec.nodes;
	const edges = spec.edges;
	if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 12) fail(`needs 2–12 nodes, got ${Array.isArray(nodes) ? nodes.length : "none"}`);
	if (!Array.isArray(edges) || edges.length < 1 || edges.length > 20) fail(`needs 1–20 edges, got ${Array.isArray(edges) ? edges.length : "none"}`);
	const direction = spec.direction ?? "down";
	if (!FLOWCHART_DIRECTIONS.includes(direction)) fail(`direction must be one of ${FLOWCHART_DIRECTIONS.join(", ")}`);

	/** @type {Map<string, number>} */
	const index = new Map();
	const labels = nodes.map((node, i) => {
		if (!node || typeof node.id !== "string" || !node.id || index.has(node.id)) fail(`node ${i + 1} needs a unique non-empty id`);
		index.set(node.id, i);
		const label = localize(node.label, locale);
		if (!label) fail(`node ${node.id} needs a label`);
		if (!Number.isInteger(node.rank) || node.rank < 0) fail(`node ${node.id}: rank must be a whole number ≥ 0`);
		if (!Number.isFinite(node.pos) || node.pos < 0) fail(`node ${node.id}: pos must be a number ≥ 0`);
		if (node.shape !== undefined && !FLOWCHART_SHAPES.includes(node.shape)) fail(`node ${node.id}: shape must be one of ${FLOWCHART_SHAPES.join(", ")}`);
		return label;
	});
	const minRank = Math.min(...nodes.map((n) => n.rank));
	const maxRank = Math.max(...nodes.map((n) => n.rank));
	const R = maxRank - minRank + 1;
	const edgeLabels = edges.map((edge, i) => {
		const what = `edge ${i + 1} (${edge?.from} → ${edge?.to})`;
		if (!edge || !index.has(edge.from) || !index.has(edge.to)) fail(`${what} has an unknown from/to node`);
		if (edge.from === edge.to) fail(`${what} is a self-loop; flowcharts draw none`);
		for (const key of ["dashed", "arrow"]) if (edge[key] !== undefined && typeof edge[key] !== "boolean") fail(`${what}: ${key} must be boolean`);
		const via = edge.via ?? [];
		if (!Array.isArray(via) || via.some((p) => !Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isFinite(p[1]) || p[1] < 0)) fail(`${what}: via must be a list of [rank, pos] pairs`);
		const ranks = [nodes[index.get(edge.from) ?? 0].rank, ...via.map((p) => p[0]), nodes[index.get(edge.to) ?? 0].rank];
		const sign = Math.sign(ranks[1] - ranks[0]);
		if (!sign || ranks.some((r, k) => k > 0 && r - ranks[k - 1] !== sign)) fail(`${what}: from, via and to must be on consecutive ranks (one waypoint per rank between)`);
		return localize(edge.label, locale);
	});
	// Positions must leave room: boxes on a rank one pitch apart, waypoints
	// clear of boxes.
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			if (nodes[i].rank === nodes[j].rank && Math.abs(nodes[i].pos - nodes[j].pos) < 1 - 1e-6) fail(`nodes ${nodes[i].id} and ${nodes[j].id} overlap on rank ${nodes[i].rank} (pos must differ by ≥ 1)`);
		}
		for (const edge of edges) {
			for (const [r, p] of edge.via ?? []) {
				if (r === nodes[i].rank && Math.abs(p - nodes[i].pos) < 0.5 - 1e-6) fail(`edge ${edge.from} → ${edge.to} passes through node ${nodes[i].id} on rank ${r}`);
			}
		}
	}
	const minPos = Math.min(...nodes.map((n) => n.pos), ...edges.flatMap((e) => (e.via ?? []).map((p) => p[1])));
	const P = Math.max(...nodes.map((n) => n.pos), ...edges.flatMap((e) => (e.via ?? []).map((p) => p[1]))) - minPos;
	const shapes = nodes.map((n) => n.shape ?? "box");
	const anyEdgeLabel = edgeLabels.some(Boolean);

	// Step order: along the flow, then across it.
	const order = nodes.map((_, i) => i).sort((a, b) => nodes[a].rank - nodes[b].rank || nodes[a].pos - nodes[b].pos || a - b);
	const stepOf = new Array(nodes.length);
	order.forEach((v, k) => (stepOf[v] = k));

	const vertical = direction === "down" || direction === "up";
	const narrow = format === "tall" || (f.height > 0 && f.width / f.height < 0.8);
	const tries = narrow || vertical ? [true, false] : [false, true];
	const maxFs = maxFontSize(spec, f.height ? 20 : 16, name);

	/**
	 * Place the chart with the flow vertical or horizontal at font size fs.
	 * Throws a reason when it does not fit.
	 * @param {boolean} down flow runs vertically
	 * @param {number} fs
	 */
	function place(down, fs) {
		const W = f.width;
		// Phone widths keep a smaller margin and gap, so three boxes fit side by side.
		const PAD = narrow ? 16 : 24;
		const GAP_X = narrow ? 14 : 24; // between neighbouring boxes across a vertical flow
		const lineH = fs * 1.25;
		const labelW = Math.max(0, ...edgeLabels.map((s) => (s ? estimateWidth(s, fs) + 8 : 0)));
		const labelH = lineH + 4;
		const flowGap = down ? (anyEdgeLabel ? labelH + 28 : 36) : anyEdgeLabel ? labelW + 28 : 40;
		const bw = Math.min(BOX_MAX, down ? (W - 2 * PAD - P * GAP_X) / (P + 1) : (W - 2 * PAD - (R - 1) * flowGap) / R);
		const inset = fs * 0.8;
		// A decision's pointed ends and a pill's round ends take one inset of the text width.
		const chars = (/** @type {number} */ i) => Math.floor((bw - 16 - (shapes[i] === "decision" || shapes[i] === "pill" ? inset : 0)) / (fs * 0.56));
		if (nodes.some((_, i) => chars(i) < 6)) throw new Error(`boxes would be ${Math.floor(bw)}px wide`);
		const wrapped = labels.map((s, i) => wrapLabel(s, chars(i), MAX_LINES));
		const bh = Math.max(...wrapped.map((l) => l.length)) * lineH + 18;
		/** @type {number} */ let H;
		/** @type {number} */ let flowPitch;
		/** @type {number} */ let crossUnit;
		if (down) {
			crossUnit = P ? Math.min((W - 2 * PAD - bw) / P, bw + 64) : 0;
			if (f.height) {
				H = f.height;
				flowPitch = Math.min((H - 2 * PAD - bh) / (R - 1), bh + 96);
				if (flowPitch - bh < flowGap) throw new Error(`needs ${Math.ceil((R - 1) * (bh + flowGap) + bh + 2 * PAD)}px height`);
			} else {
				flowPitch = bh + Math.max(flowGap, 48);
				H = Math.ceil(2 * PAD + (R - 1) * flowPitch + bh);
			}
		} else {
			flowPitch = R > 1 ? Math.min((W - 2 * PAD - bw) / (R - 1), bw + flowGap + 64) : 0;
			if (f.height) {
				H = f.height;
				crossUnit = P ? Math.min((H - 2 * PAD - bh) / P, bh + 48) : 0;
				if (P && crossUnit < bh + GAP_Y) throw new Error(`needs ${Math.ceil(P * (bh + GAP_Y) + bh + 2 * PAD)}px height`);
			} else {
				crossUnit = bh + GAP_Y + 4;
				H = Math.ceil(2 * PAD + P * crossUnit + bh);
			}
		}
		const flowSpan = (R - 1) * flowPitch;
		const crossSpan = P * crossUnit;
		const reverse = direction === "up" || direction === "left";
		/** @param {number} rank @param {number} pos @returns {Pt} */
		const at = (rank, pos) => {
			const r = reverse ? maxRank - rank : rank - minRank;
			const along = r * flowPitch - flowSpan / 2;
			const across = (pos - minPos) * crossUnit - crossSpan / 2;
			return down ? { x: W / 2 + across, y: H / 2 + along } : { x: W / 2 + along, y: H / 2 + across };
		};
		const centres = nodes.map((n) => at(n.rank, n.pos));
		const boxes = centres.map((c) => ({ x0: c.x - bw / 2, y0: c.y - bh / 2, x1: c.x + bw / 2, y1: c.y + bh / 2 }));

		// Connectors: centre → waypoints → centre, trimmed to the boxes. Edges
		// joining the same two nodes run side by side.
		const pairCount = new Map();
		const pairKey = (/** @type {any} */ e) => [e.from, e.to].sort().join("\u0000");
		edges.forEach((e) => pairCount.set(pairKey(e), (pairCount.get(pairKey(e)) ?? 0) + 1));
		const pairSeen = new Map();
		const paths = edges.map((e) => {
			const a = /** @type {number} */ (index.get(e.from));
			const b = /** @type {number} */ (index.get(e.to));
			const key = pairKey(e);
			const k = pairSeen.get(key) ?? 0;
			pairSeen.set(key, k + 1);
			const shift = (k - ((pairCount.get(key) ?? 1) - 1) / 2) * 12;
			const off = (/** @type {Pt} */ p) => (down ? { x: p.x + shift, y: p.y } : { x: p.x, y: p.y + shift });
			const pts = [off(centres[a]), ...(e.via ?? []).map((/** @type {number[]} */ p) => off(at(p[0], p[1]))), off(centres[b])];
			const start = rectEdge(pts[0].x, pts[0].y, bw / 2, bh / 2, pts[1], 2);
			const end = rectEdge(pts[pts.length - 1].x, pts[pts.length - 1].y, bw / 2, bh / 2, pts[pts.length - 2], 3);
			return [start, ...pts.slice(1, -1), end];
		});
		// Every connector stays clear of the boxes it does not join.
		edges.forEach((e, i) => {
			const ends = [index.get(e.from), index.get(e.to)];
			const pts = paths[i];
			boxes.forEach((box, j) => {
				if (ends.includes(j)) return;
				const inner = { x0: box.x0 + 2, y0: box.y0 + 2, x1: box.x1 - 2, y1: box.y1 - 2 };
				if (pts.some((p, s) => s > 0 && segmentHits(pts[s - 1], p, inner))) throw new Error(`edge ${e.from} → ${e.to} crosses node ${nodes[j].id}`);
			});
		});
		// Edge labels sit beside the first segment, on the outside of the turn.
		/** @type {({ x: number, y: number, box: Box } | null)[]} */
		const tags = edges.map((e, i) => {
			const s = edgeLabels[i];
			if (!s) return null;
			const [a, b] = paths[i];
			const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const w = estimateWidth(s, fs) + 4;
			let box;
			if (down) {
				const slope = Math.abs(b.y - a.y) < 1e-6 ? 0 : Math.abs((b.x - a.x) / (b.y - a.y));
				const reach = slope * labelH / 2 + 6;
				const left = b.x < a.x - 0.5;
				box = left ? { x0: m.x - reach - w, x1: m.x - reach } : { x0: m.x + reach, x1: m.x + reach + w };
				box = { ...box, y0: m.y - labelH / 2, y1: m.y + labelH / 2 };
			} else {
				const slope = Math.abs(b.x - a.x) < 1e-6 ? 0 : Math.abs((b.y - a.y) / (b.x - a.x));
				const reach = slope * w / 2 + 4;
				const below = b.y > a.y + 0.5;
				box = below ? { y0: m.y + reach, y1: m.y + reach + labelH } : { y0: m.y - reach - labelH, y1: m.y - reach };
				box = { ...box, x0: m.x - w / 2, x1: m.x + w / 2 };
			}
			return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, box };
		});
		tags.forEach((tag, i) => {
			if (!tag) return;
			const { box } = tag;
			if (box.x0 < 2 || box.y0 < 2 || box.x1 > W - 2 || box.y1 > H - 2) throw new Error(`the label of edge ${edges[i].from} → ${edges[i].to} leaves the canvas`);
			boxes.forEach((nb, j) => {
				if (overlaps(box, { x0: nb.x0 - 3, y0: nb.y0 - 3, x1: nb.x1 + 3, y1: nb.y1 + 3 })) throw new Error(`the label of edge ${edges[i].from} → ${edges[i].to} covers node ${nodes[j].id}`);
			});
			tags.forEach((other, j) => {
				if (j > i && other && overlaps(box, other.box)) throw new Error(`the labels of edges ${edges[i].from} → ${edges[i].to} and ${edges[j].from} → ${edges[j].to} overlap`);
			});
			paths.forEach((pts, j) => {
				if (j !== i && pts.some((p, s) => s > 0 && segmentHits(pts[s - 1], p, box))) throw new Error(`the label of edge ${edges[i].from} → ${edges[i].to} crosses edge ${edges[j].from} → ${edges[j].to}`);
			});
		});
		return { fs, W, H, bw, bh, inset, wrapped, centres, paths: paths.map((pts) => ({ pts, line: polyline(pts) })), tags };
	}

	let L;
	let why = "";
	for (const down of tries) {
		for (let fs = maxFs; fs >= FONT_MIN && !L; fs--) {
			try {
				L = place(down, fs);
			} catch (e) {
				why ||= e instanceof Error ? e.message : String(e);
			}
		}
		if (L) break;
	}
	if (!L) fail(`does not fit ${format} at ≥ ${FONT_MIN}px (${why}); use fewer nodes or ranks, shorter labels or a larger format`);
	const G = L;

	// Each connector turns accent at the later of its two nodes' steps: before
	// that node fills when it is the target, while it fills when it is the source.
	const edgeStep = edges.map((e) => Math.max(stepOf[index.get(e.from) ?? 0], stepOf[index.get(e.to) ?? 0]));
	const backward = edges.map((e, i) => stepOf[index.get(e.to) ?? 0] !== edgeStep[i]);
	const rankIndex = (/** @type {number} */ r) => r - minRank;
	const START = ENTER_GAP * (R - 1) + ENTER + 0.1;
	const stepAt = (/** @type {number} */ k) => START + DRAW + FILL + k * PERIOD;
	const fillStart = (/** @type {number} */ k) => stepAt(k) - FILL;
	const drawStart = (/** @type {number} */ k) => fillStart(k) - DRAW;
	const duration = stepAt(nodes.length - 1) + TAIL;
	const n = nodes.length;

	/**
	 * Node outline for its shape, grown by `grow` px (the emphasis outline).
	 * @param {number} i @param {number} grow @param {number} radius the style's corner radius
	 * @param {Record<string, string | number>} attrs
	 */
	function shapeAt(i, grow, radius, attrs) {
		const c = G.centres[i];
		const w = G.bw + 2 * grow;
		const h = G.bh + 2 * grow;
		const x = c.x - w / 2;
		const y = c.y - h / 2;
		if (shapes[i] === "decision") {
			const k = Math.min(h / 2, G.inset + grow);
			const pts = [[x + k, y], [x + w - k, y], [x + w, c.y], [x + w - k, y + h], [x + k, y + h], [x, c.y]];
			return el("polygon", { points: pts.map(([px, py]) => `${num(px)},${num(py)}`).join(" "), "stroke-linejoin": "round", ...attrs });
		}
		const rx = shapes[i] === "pill" ? h / 2 : shapes[i] === "round" ? Math.min(h / 2, Math.max(radius, 14) + grow) : radius + grow;
		return el("rect", { x, y, width: w, height: h, rx, ...attrs });
	}

	/** @param {number} t @param {{ style?: Style }} [ctx] */
	function frame(t, { style = NEUTRAL } = {}) {
		const enter = (/** @type {number} */ r) => progress(t, rankIndex(r) * ENTER_GAP, ENTER, easeOut);
		const out = [];
		const drawn = edges.map((_, i) => progress(t, backward[i] ? fillStart(edgeStep[i]) - 0.1 : drawStart(edgeStep[i]), backward[i] ? DRAW - 0.05 : DRAW, easeStandard));
		edges.forEach((e, i) => {
			const shown = Math.min(enter(nodes[index.get(e.from) ?? 0].rank), enter(nodes[index.get(e.to) ?? 0].rank));
			if (shown <= 0) return;
			const { pts, line } = G.paths[i];
			const common = { d: line.d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": e.dashed ? "6 5" : undefined };
			out.push(el("path", { ...common, stroke: tok("line"), "stroke-width": style.stroke, opacity: shown }));
			// A dashed connector turns accent whole; a solid one draws on.
			if (e.dashed) {
				if (drawn[i] > 0) out.push(el("path", { ...common, stroke: tok("accent"), "stroke-width": style.stroke * 1.5, opacity: drawn[i] }));
			} else {
				const dash = drawOn(line.length, drawn[i]);
				if (dash) out.push(el("path", { ...common, stroke: tok("accent"), "stroke-width": style.stroke * 1.5, ...dash }));
			}
			if (e.arrow !== false) {
				const tip = pts[pts.length - 1];
				const prev = pts[pts.length - 2];
				const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
				const ux = (tip.x - prev.x) / len;
				const uy = (tip.y - prev.y) / len;
				const d = `M${num(tip.x - 8 * ux - 5 * uy)} ${num(tip.y - 8 * uy + 5 * ux)} L${num(tip.x)} ${num(tip.y)} L${num(tip.x - 8 * ux + 5 * uy)} ${num(tip.y - 8 * uy - 5 * ux)}`;
				const head = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
				const on = progress(t, (backward[i] ? fillStart(edgeStep[i]) - 0.1 : drawStart(edgeStep[i])) + DRAW * 0.6, DRAW * 0.3, easeStandard);
				out.push(fade(shown * (1 - on), {}, el("path", { ...head, stroke: tok("line"), "stroke-width": style.stroke })));
				out.push(fade(on, {}, el("path", { ...head, stroke: tok("accent"), "stroke-width": style.stroke * 1.5 })));
			}
			const tag = G.tags[i];
			if (tag) {
				const attrs = { x: tag.x, y: tag.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": G.fs, "font-weight": 500 };
				out.push(fade(shown, {}, fade(1 - drawn[i], {}, text({ ...attrs, fill: tok("muted") }, edgeLabels[i])), fade(drawn[i], {}, text({ ...attrs, fill: tok("ink") }, edgeLabels[i]))));
			}
		});
		nodes.forEach((node, i) => {
			const shown = enter(node.rank);
			if (shown <= 0) return;
			const active = progress(t, fillStart(stepOf[i]), FILL, easeStandard);
			const c = G.centres[i];
			const label = (/** @type {string} */ fill) => text({ x: c.x, y: c.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": G.fs, "font-weight": 500, fill }, G.wrapped[i]);
			const pending = el("g", {}, shapeAt(i, 0, style.radius, { fill: tok("surface"), stroke: tok("line"), "stroke-width": style.stroke }), label(tok("ink")));
			const on = el("g", {}, shapeAt(i, 0, style.radius, { fill: tok("accent"), stroke: tok("accent"), "stroke-width": style.stroke }), label(tok("onAccent")));
			const dy = (1 - shown) * 8;
			out.push(fade(shown, { transform: dy > 0.004 ? translate(0, dy) : undefined }, fade(1 - active, {}, pending), fade(active, {}, on)));
		});
		// Emphasis: an outline on the node reached last.
		order.forEach((v, k) => {
			const opacity = progress(t, fillStart(k), FILL, easeOut) * (k + 1 < n ? 1 - progress(t, drawStart(k + 1), FILL, easeStandard) : 1);
			if (opacity > 0) out.push(fade(opacity, {}, shapeAt(v, RING, style.radius, { fill: "none", stroke: tok("emphasis"), "stroke-width": style.stroke * 1.5 })));
		});
		return out.join("");
	}

	return {
		id: `${spec.id}-${format.replace(":", "x")}`,
		type: "flowchart",
		format,
		locale,
		width: G.W,
		height: G.H,
		duration,
		title: localize(spec.title, locale),
		description: localize(spec.description, locale),
		steps: order.map((v, k) => withId({ at: stepAt(k), label: labels[v], detail: localize(nodes[v].detail, locale) }, nodes[v].id)),
		frame,
	};
}
