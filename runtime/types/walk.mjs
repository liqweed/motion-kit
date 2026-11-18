/** @import { Scene } from "../scene.mjs" */
/** @import { Style } from "../style.mjs" */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/** Small, explicitly narrated graphs. Layout is computed once, never in frame(). */
import { progress, lerp, easings } from "../motion.mjs";
import { FONT_MIN, maxFontSize } from "../parts.mjs";
import { FORMATS, localize } from "../scene.mjs";
import { NEUTRAL, tok } from "../style.mjs";
import { el, fade, num, text } from "../svg.mjs";
import { wrapLabel } from "../wrap.mjs";

/**
 * Build the common graph walk used by state-machine and request-journey.
 * Nodes are in reading order; connectors use separate outside lanes. The
 * narrated path is explicit, so branching and cycles never choose randomly.
 * @param {any} spec
 * @param {{format?: string, locale?: string}} [opts]
 * @returns {Scene}
 */
export function walk(spec, { format = "16:9", locale = "en" } = {}) {
	const journey = spec.type === "request-journey";
	const name = `${spec.type} "${spec.id}"`;
	const nodes = journey ? spec.components : spec.states;
	const edges = journey ? spec.hops : spec.transitions;
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const fail = (why) => { throw new Error(`${name}: ${why}`); };
	if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 8) fail(`needs 2–8 ${journey ? "components" : "states"}`);
	if (!Array.isArray(edges) || edges.length < 1 || edges.length > 12) fail(`needs 1–12 ${journey ? "hops" : "transitions"}`);
	const nodeIds = new Map();
	const labels = nodes.map((node, i) => {
		if (!node || typeof node.id !== "string" || !node.id || nodeIds.has(node.id)) fail(`node ${i + 1} needs a unique non-empty id`);
		nodeIds.set(node.id, i);
		const label = localize(node.label, locale);
		if (!label) fail(`node ${node.id} needs a label`);
		return label;
	});
	const edgeIds = new Map();
	edges.forEach((edge, i) => {
		if (!edge || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id)) fail(`edge ${i + 1} needs a unique non-empty id`);
		if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) fail(`edge ${edge.id} has an unknown from/to node`);
		if (!localize(edge.label, locale)) fail(`edge ${edge.id} needs a label`);
		if (edge.async !== undefined && typeof edge.async !== "boolean") fail(`edge ${edge.id}: async must be boolean`);
		edgeIds.set(edge.id, i);
	});
	if (!nodeIds.has(spec.initial)) fail("initial must name a node");
	if (!Array.isArray(spec.path) || spec.path.length < 1 || spec.path.length > 10) fail("path needs 1–10 edge ids");
	let current = spec.initial;
	const visits = [nodeIds.get(current)];
	const route = spec.path.map((id) => {
		const e = edgeIds.get(id);
		if (e === undefined) fail(`path names unknown edge "${id}"`);
		const edge = edges[e];
		if (edge.from !== current) fail(`path edge "${id}" starts at ${edge.from}, expected ${current}`);
		current = edge.to;
		visits.push(nodeIds.get(current));
		return e;
	});
	const regions = journey ? nodes.map((n) => localize(n.region, locale)) : nodes.map(() => "");
	const n = nodes.length;
	const W = f.width;
	const laneGap = 7;
	const rightSpace = 28 + edges.length * laneGap;
	const boxW = Math.min(360, W - 48 - rightSpace);
	let fitted;
	let why = "labels do not fit";
	for (let fs = maxFontSize(spec, f.height ? 22 : 16, name); fs >= FONT_MIN; fs--) {
		try {
			const chars = Math.floor((boxW - 24) / (fs * 0.56));
			const wrapped = labels.map((s) => wrapLabel(s, chars, 2));
			const regionLines = regions.map((s) => s ? wrapLabel(s, chars, 1) : []);
			const boxH = Math.max(...wrapped.map((l) => l.length)) * fs * 1.25 + 18;
			const regionH = regions.some(Boolean) ? fs * 1.5 : 0;
			const pitch = boxH + regionH + 16;
			const needed = pitch * n - 16 + 48;
			if (f.height && needed > f.height) { why = `needs ${Math.ceil(needed)}px height`; continue; }
			const H = f.height || Math.ceil(needed);
			const x = (W - boxW - rightSpace) / 2;
			const top = (H - (pitch * n - 16)) / 2;
			fitted = { fs, wrapped, regionLines, boxH, H, x, ys: nodes.map((_, i) => top + pitch * i + regionH), regionH };
			break;
		} catch (e) { why = e instanceof Error ? e.message : String(e); }
	}
	if (!fitted) throw new Error(`${name}: does not fit ${format} at ≥ ${FONT_MIN}px (${why}); use fewer nodes, shorter labels or a larger format`);
	const L = fitted;
	const right = L.x + boxW;
	const cy = (i) => L.ys[i] + L.boxH / 2;
	// Each edge has its own port and lane. Self-transitions leave and return
	// through separate ports instead of degenerating to a zero-length path.
	const paths = edges.map((edge, i) => {
		const from = nodeIds.get(edge.from);
		const to = nodeIds.get(edge.to);
		const offset = (i - (edges.length - 1) / 2) * Math.min(2, L.boxH / (edges.length + 2));
		const y0 = cy(from) + (from === to ? -L.boxH / 4 : offset);
		const y1 = cy(to) + (from === to ? L.boxH / 4 : offset);
		const lane = right + 20 + (i + 1) * laneGap;
		return [[right, y0], [lane, y0], [lane, y1], [right, y1]];
	});
	const pathD = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${num(x)} ${num(y)}`).join(" ");
	const position = (pts, p) => {
		const lengths = pts.slice(1).map(([x, y], i) => Math.hypot(x - pts[i][0], y - pts[i][1]));
		let distance = p * lengths.reduce((a, b) => a + b, 0);
		for (let i = 0; i < lengths.length; i++) {
			if (distance <= lengths[i] || i === lengths.length - 1) {
				const q = lengths[i] ? distance / lengths[i] : 1;
				return [lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)];
			}
			distance -= lengths[i];
		}
		return pts[0];
	};
	const firstAt = 0.75;
	const period = 0.8;
	const hopAt = (k) => firstAt + 0.1 + k * period;
	const stepAt = (k) => firstAt + (k + 1) * period;
	const duration = stepAt(route.length - 1) + 0.3;
	/** @param {number} t @param {{style?: Style}} [ctx] */
	function frame(t, { style = NEUTRAL } = {}) {
		const { easeOut, easeStandard } = easings(style.motion);
		const entrance = progress(t, 0, 0.5, easeOut);
		const active = nodes.map(() => 0);
		active[visits[0]] = progress(t, 0.5, 0.2, easeStandard);
		let dot = [right + 7, cy(visits[0])];
		const passed = new Set();
		for (let k = 0; k < route.length; k++) {
			const p = progress(t, hopAt(k), 0.45, easeStandard);
			if (p <= 0) break;
			dot = position([[right + 7, cy(visits[k])], ...paths[route[k]], [right + 7, cy(visits[k + 1])]], p);
			active[visits[k]] *= 1 - progress(t, hopAt(k), 0.2, easeStandard);
			active[visits[k + 1]] = Math.max(active[visits[k + 1]], progress(t, hopAt(k) + 0.45, 0.2, easeStandard));
			if (p === 1) passed.add(route[k]);
		}
		const out = [];
		paths.forEach((pts, i) => {
			const stroke = tok(passed.has(i) ? "accent" : "line");
			const width = style.stroke * (passed.has(i) ? 1.5 : 1);
			out.push(el("path", { d: pathD(pts), fill: "none", stroke, "stroke-width": width, "stroke-dasharray": edges[i].async ? "5 4" : undefined, "stroke-linejoin": "round" }));
			const [x, y] = pts[3];
			out.push(el("path", { d: `M${num(x + 6)} ${num(y - 4)} L${num(x)} ${num(y)} L${num(x + 6)} ${num(y + 4)}`, fill: "none", stroke, "stroke-width": width }));
		});
		nodes.forEach((node, i) => {
			if (regions[i]) {
				out.push(el("rect", { x: L.x - 8, y: L.ys[i] - L.regionH, width: boxW + 16, height: L.boxH + L.regionH + 6, rx: 6, fill: "none", stroke: tok("line"), "stroke-dasharray": "4 4" }));
				out.push(text({ x: L.x + 8, y: L.ys[i] - L.regionH / 2, "dominant-baseline": "central", "font-size": L.fs, fill: tok("muted") }, L.regionLines[i]));
			}
			const box = (fill, stroke) => el("rect", { x: L.x, y: L.ys[i], width: boxW, height: L.boxH, rx: style.radius, fill, stroke, "stroke-width": style.stroke });
			const label = (fill) => text({ x: L.x + boxW / 2, y: cy(i), "text-anchor": "middle", "dominant-baseline": "central", "font-size": L.fs, fill }, L.wrapped[i]);
			out.push(fade(1 - active[i], {}, box(tok("surface"), tok("line")), label(tok("ink"))));
			out.push(fade(active[i], {}, box(tok("accent"), tok("accent")), label(tok("onAccent"))));
		});
		out.push(el("circle", { cx: dot[0], cy: dot[1], r: 6, fill: tok("emphasis") }));
		return fade(entrance, {}, ...out);
	}
	return {
		id: `${spec.id}-${format.replace(":", "x")}`, type: spec.type, format, locale,
		width: W, height: L.H, duration, title: localize(spec.title, locale), description: localize(spec.description, locale),
		stepLabelsInFrame: false,
		steps: [{ id: "initial", at: firstAt, label: labels[visits[0]], detail: localize(nodes[visits[0]].detail, locale) },
			...route.map((e, k) => ({ id: `visit-${k + 1}`, at: stepAt(k), label: localize(edges[e].label, locale), detail: localize(edges[e].detail, locale) || `${labels[visits[k]]} → ${labels[visits[k + 1]]}` }))],
		frame,
	};
}
