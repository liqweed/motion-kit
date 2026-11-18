// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene type "stack".
 *
 * Helps the viewer understand: layers that build on each other (an
 * architecture, security layers, a protocol stack), and what passes through
 * them. Storyboard: the layers rise into place bottom-up (skeleton first),
 * then a packet (the one emphasis element) enters on a rail beside the stack
 * and travels layer to layer; each layer it reaches fills with the accent
 * colour, and the rail behind the packet turns accent.
 *
 * Spec:
 *   { type: "stack", id, title, description,
 *     layers: [{ label, detail?, id? }], // 2–8, listed top to bottom; id names the step
 *     direction?: "down" | "up",         // default "down": the packet enters at the top
 *     fontSize?: number }
 * Strings may be localized objects: { en: "...", nl: "..." }.
 *
 * Layout: one column of full-width layers with the rail on their right, in
 * every format; layers get taller (up to a limit) where the format has room.
 */
import { easeOut, easeStandard, lerp, progress } from "../motion.mjs";
import { FONT_MIN, maxFontSize } from "../parts.mjs";
import { FORMATS, localize, withId } from "../scene.mjs";
import { tok } from "../style.mjs";
import { drawOn, el, fade, num, text, translate } from "../svg.mjs";
import { wrapLabel } from "../wrap.mjs";

/** @import { Scene } from "../scene.mjs" */

// Timeline (seconds). Steps are settled because PERIOD ≥ HOP + FILL.
const RISE_GAP = 0.1;
const RISE = 0.4;
const RAIL = 0.45;
const APPEAR = 0.25;
const HOP = 0.4;
const FILL = 0.25;
const PERIOD = HOP + FILL + 0.05;
const TAIL = 0.4;

const PAD = 24;
const CHAR = 0.56;
const GAP = 10; // between two layers
const RAIL_GAP = 26; // layer edge → rail
const LEAD = 34; // rail beyond the outer layers, where the packet enters and leaves
const DOT = 7;
const MAX_LAYERS = 8;
const RISE_BY = 14; // a layer rises this far into place

/**
 * One layer in three states, cross-faded: pending (surface), current (accent
 * fill) and passed (surface with an accent outline), so the finished stack
 * shows the packet's path without a wall of accent.
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {string[]} lines
 * @param {number} fs
 * @param {number} enter
 * @param {number} active
 * @param {number} passed
 */
function layer(b, lines, fs, enter, active, passed) {
	if (enter <= 0) return "";
	const dy = (1 - enter) * RISE_BY;
	const label = (fill) => text({ x: b.x + b.w / 2, y: b.y + b.h / 2, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fs, "font-weight": 500, fill }, lines);
	const box = (fill, stroke, width) => el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10, fill, stroke, "stroke-width": width });
	return fade(
		enter,
		{ transform: dy > 0.004 ? translate(0, dy) : undefined },
		fade(1 - active, {}, box(tok("surface"), tok("line"), 2), label(tok("ink"))),
		fade(active * (1 - passed), {}, box(tok("accent"), tok("accent"), 2), label(tok("onAccent"))),
		fade(passed, {}, box(tok("surface"), tok("accent"), 3), label(tok("ink"))),
	);
}

/**
 * Geometry for `n` layers at font size `fs` with up to `maxLines` label lines,
 * or the reason it does not fit.
 * @param {{ name: string, width: number, height: number }} f
 * @param {number} n
 * @param {number} fs
 * @param {number} maxLines
 */
function layout(f, n, fs, maxLines) {
	const W = f.width;
	const fixed = f.height > 0;
	const lineH = fs * 1.25;
	const minH = maxLines * lineH + 20;
	const railSpace = RAIL_GAP + DOT + 2;
	const boxW = Math.min(W - 2 * PAD - railSpace, fs * 24);
	let boxH = minH;
	if (fixed) {
		const room = (f.height - 2 * PAD - 2 * LEAD - (n - 1) * GAP) / n;
		if (room < minH) return { problem: `${n} layers of ${maxLines} line(s) need ${Math.ceil(n * minH + (n - 1) * GAP + 2 * LEAD + 2 * PAD)}px of height, the format has ${f.height}` };
		boxH = Math.min(room, Math.max(minH, fs * 3.4));
	}
	const stackH = n * boxH + (n - 1) * GAP;
	const H = fixed ? f.height : Math.ceil(stackH + 2 * LEAD + 2 * PAD);
	const x = (W - (boxW + railSpace)) / 2;
	const top = (H - stackH) / 2;
	const boxes = Array.from({ length: n }, (_, i) => ({ x, y: top + i * (boxH + GAP), w: boxW, h: boxH }));
	const railX = x + boxW + RAIL_GAP;
	return { W, H, fs, lineH, maxLines, boxes, railX, railTop: top - LEAD, railBottom: top + stackH + LEAD, maxChars: Math.floor((boxW - 24) / (fs * CHAR)) };
}

/**
 * Build a stack scene from its spec.
 * @param {any} spec
 * @param {{ format?: string | { name: string, width: number, height: number }, locale?: string }} [opts]
 * @returns {Scene}
 */
export function stack(spec, { format = "16:9", locale = "en" } = {}) {
	const name = `stack "${spec.id}"`;
	const f = typeof format === "string" ? { name: format, ...FORMATS[format] } : format;
	if (!f.width) throw new Error(`unknown format "${format}"`);
	const layers = spec.layers;
	if (!Array.isArray(layers)) throw new Error(`${name}: needs "layers", a list of { label }, top to bottom`);
	const n = layers.length;
	if (n < 2 || n > MAX_LAYERS) throw new Error(`${name}: needs 2–${MAX_LAYERS} layers, got ${n}`);
	const direction = spec.direction ?? "down";
	if (direction !== "down" && direction !== "up") throw new Error(`${name}: "direction" must be "down" or "up", got ${JSON.stringify(spec.direction)}`);
	const labels = layers.map((l, i) => {
		const label = localize(l?.label, locale);
		if (!label) throw new Error(`${name}: layer ${i + 1} needs a "label"`);
		return label;
	});

	// Largest font (≤ max) at which every label wraps; one line before two.
	const maxFs = maxFontSize(spec, f.height > 0 ? 22 : 16, name);
	let L;
	let lines;
	let why = "";
	search: for (let fs = maxFs; fs >= FONT_MIN; fs--) {
		for (const maxLines of [1, 2]) {
			const cand = layout(f, n, fs, maxLines);
			if ("problem" in cand) {
				why = cand.problem ?? why;
				continue;
			}
			try {
				lines = labels.map((l) => wrapLabel(l, cand.maxChars, maxLines));
				L = cand;
				break search;
			} catch (e) {
				why = e instanceof Error ? e.message : String(e);
			}
		}
	}
	if (!L || !lines) throw new Error(`${name}: ${n} layers do not fit format ${f.name} at ≥ ${FONT_MIN}px (${why}); use fewer layers, shorter labels or a larger format`);
	const fitted = L;
	const wrapped = lines;

	// Travel order: the packet visits layers top → bottom ("down") or bottom → top ("up").
	const order = direction === "down" ? labels.map((_, i) => i) : labels.map((_, i) => n - 1 - i);
	const visit = new Array(n); // layer index → position in the travel order
	order.forEach((li, k) => (visit[li] = k));
	const centerY = (li) => fitted.boxes[li].y + fitted.boxes[li].h / 2;
	const entryY = direction === "down" ? fitted.railTop : fitted.railBottom;
	const exitY = direction === "down" ? fitted.railBottom : fitted.railTop;
	const stops = [entryY, ...order.map(centerY)];

	// Rise bottom-up; then the packet appears at the entry and hops.
	const riseAt = (li) => (n - 1 - li) * RISE_GAP;
	const START = RISE_GAP * (n - 1) + RISE + 0.1;
	const hopStart = (k) => START + APPEAR + 0.05 + k * PERIOD;
	const fillStart = (k) => hopStart(k) + HOP;
	const stepAt = (k) => fillStart(k) + FILL;
	const duration = stepAt(n - 1) + TAIL;

	function packetY(t) {
		let y = stops[0];
		for (let k = 0; k < n; k++) {
			const p = progress(t, hopStart(k), HOP, easeStandard);
			if (p <= 0) break;
			y = lerp(stops[k], stops[k + 1], p);
		}
		return y;
	}

	const vline = (x, y0, y1, attrs) => el("path", { d: `M${num(x)} ${num(y0)} V${num(y1)}`, fill: "none", "stroke-linecap": "round", ...attrs });

	function frame(t) {
		const out = [];
		const { railX } = fitted;
		// Rail: draws on from the entry end while the layers rise; an arrowhead marks the exit.
		const railLen = Math.abs(exitY - entryY);
		const railDash = drawOn(railLen, progress(t, 0.2, RAIL, easeStandard));
		if (railDash) out.push(vline(railX, entryY, exitY, { stroke: tok("line"), "stroke-width": 2, ...railDash }));
		const head = progress(t, 0.2 + RAIL - 0.15, 0.2, easeOut);
		if (head > 0) {
			const s = direction === "down" ? -1 : 1;
			out.push(el("path", { d: `M${num(railX - 6)} ${num(exitY + s * 9)} L${num(railX)} ${num(exitY)} L${num(railX + 6)} ${num(exitY + s * 9)}`, fill: "none", stroke: tok("line"), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: head }));
		}
		const y = packetY(t);
		if (Math.abs(y - entryY) > 0.5) out.push(vline(railX, entryY, y, { stroke: tok("accent"), "stroke-width": 3 }));
		fitted.boxes.forEach((b, li) => {
			const enter = progress(t, riseAt(li), RISE, easeOut);
			const k = visit[li];
			const active = progress(t, fillStart(k), FILL, easeStandard);
			// Once the packet moves on, the layer keeps an accent outline.
			const passed = k < n - 1 ? progress(t, hopStart(k + 1), FILL, easeStandard) : 0;
			// Tick from the layer to the rail: pending once the layer is in, accent once reached.
			const cy = b.y + b.h / 2;
			if (enter > 0) out.push(el("path", { d: `M${num(b.x + b.w + 4)} ${num(cy)} H${num(railX - 4)}`, stroke: tok("line"), "stroke-width": 2, "stroke-linecap": "round", opacity: enter * (1 - active) }));
			if (active > 0) out.push(el("path", { d: `M${num(b.x + b.w + 4)} ${num(cy)} H${num(railX - 4)}`, stroke: tok("accent"), "stroke-width": 3, "stroke-linecap": "round", opacity: active }));
			out.push(layer(b, wrapped[li], fitted.fs, enter, active, passed));
		});
		// The packet: appears at the entry, then rides the rail.
		const appear = progress(t, START, APPEAR, easeOut);
		if (appear > 0) out.push(el("circle", { cx: railX, cy: y, r: DOT * (0.6 + 0.4 * appear), fill: tok("emphasis"), opacity: appear }));
		return out.join("");
	}

	return {
		id: `${spec.id}-${f.name.replace(":", "x")}`,
		type: "stack",
		format: f.name,
		locale,
		width: fitted.W,
		height: fitted.H,
		duration,
		title: localize(spec.title, locale),
		description: localize(spec.description, locale),
		steps: order.map((li, k) => withId({ at: stepAt(k), label: labels[li], detail: localize(layers[li].detail, locale) }, layers[li].id)),
		frame,
	};
}
