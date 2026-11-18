// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene type "timeline".
 *
 * Helps the viewer understand: events in time, and where "now" falls among
 * them. Storyboard: the axis draws on, then the milestones drop onto it in
 * order; each event that has happened fills with the accent colour and the
 * axis behind it turns accent, while planned events stay pending. Last, a
 * "now" marker (the one emphasis element) settles on the axis after the last
 * event that has happened.
 *
 * Spec:
 *   { type: "timeline", id, title, description,
 *     events: [{ when, label, detail?, id?, planned? }], // 2–8, in time order; id names the step
 *     now?: { label, detail?, id? },                       // marker after the last event that is not planned
 *     fontSize?: number }
 * `planned: true` marks an event still to come; planned events come after all
 * the others. Strings may be localized objects: { en: "...", nl: "..." }.
 *
 * Layouts: a horizontal axis with labels below it, or alternating above and
 * below when they need the width (wide aspects and square); a vertical axis
 * with labels on the right (9:16, tall).
 */
import { easeOut, easeStandard, lerp, progress, springSettleTime, springStep } from "../motion.mjs";
import { FONT_MIN, maxFontSize, stateLabel } from "../parts.mjs";
import { FORMATS, localize, withId } from "../scene.mjs";
import { tok } from "../style.mjs";
import { drawOn, el, fade, num, text, translate } from "../svg.mjs";
import { wrapLabel } from "../wrap.mjs";

/** @import { Scene } from "../scene.mjs" */

// Timeline (seconds). Each beat ends (step) before the next one starts.
const AXIS = 0.6; // the axis draws on
const EXTEND = 0.3; // the accent axis reaches an event
const DROP = 0.35; // a milestone drops onto the axis
const LABEL = 0.3; // its label fades in
const FILL = 0.25; // a past event turns accent
const BEAT = 0.6; // one event: EXTEND/DROP/LABEL/FILL all end by 0.55
const SETTLE_AT = 0.55;
const NOW_OMEGA = 14; // the "now" marker settles on a critically damped spring
const NOW_FADE = 0.2;
const NOW_DROP = 18;
const TAIL = 0.4;

const PAD = 24;
const CHAR = 0.56;
const GAP = 16; // horizontal room between two labels on the same side
const DOT = 7; // milestone dot radius
const MAX_EVENTS = 8;

/**
 * One localized event; `lines` is its label wrapped to the layout's budget.
 * @typedef {{ label: string, when: string, planned: boolean, detail: string, id?: string, lines?: string[] }} Item
 */
/**
 * The localized "now" marker; `index` is the number of events before it.
 * @typedef {{ label: string, detail: string, id?: string, index: number }} Now
 */

/** Size of the "now" pill for a label at font size `fs`. */
function pill(label, fs) {
	const h = Math.round(fs * 1.25 + 10);
	return { w: Math.round(label.length * fs * CHAR + 22), h, fs };
}

function overlaps(a, b, gap = 4) {
	return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/**
 * Horizontal axis. `mode` "below" puts every label under the axis; "alternate"
 * puts even events below and odd ones above, which doubles each label's width.
 */
function horizontal(f, items, now, fs, mode) {
	const W = f.width;
	const fixed = f.height > 0;
	const n = items.length;
	const whenFs = Math.max(FONT_MIN, fs - 3);
	const lineH = fs * 1.25;
	const whenH = whenFs * 1.25;
	const nowU = now ? now.index - 0.5 : null; // between two events, or half a cell beyond an end
	const uMin = Math.min(0, nowU ?? 0);
	const uMax = Math.max(n - 1, nowU ?? 0);
	const U = uMax - uMin;
	const sides = mode === "alternate" ? 2 : 1;
	// Same-side labels sit `sides` cells apart; the outermost labels end at the padding.
	let cell = (W - 2 * PAD + GAP) / (U + sides);
	cell = Math.min(cell, fs * (sides === 2 ? 9 : 13));
	const labelW = sides * cell - GAP;
	const span = U * cell + labelW;
	const x0 = (W - span) / 2 + labelW / 2 - uMin * cell;
	const xs = items.map((_, k) => x0 + k * cell);
	const maxChars = Math.floor(labelW / (fs * CHAR));
	const whenChars = Math.floor(labelW / (whenFs * CHAR));
	const nowPill = now ? pill(now.label, whenFs) : null;
	const stem = Math.max(28, (nowPill?.h ?? 0) / 2 + 14);
	const blockH = whenH + 4 + 2 * lineH; // budget: one "when" line, two label lines
	const reach = stem + 6 + blockH; // axis → far edge of a label block
	const above = mode === "alternate" ? reach : Math.max(nowPill ? nowPill.h / 2 : 0, DOT + NOW_DROP);
	const contentH = above + reach;
	const H = fixed ? f.height : Math.ceil(contentH + 2 * PAD);
	const axisY = (H - contentH) / 2 + above;
	const axisX0 = Math.max(PAD, x0 + uMin * cell - cell / 2);
	const axisX1 = Math.min(W - PAD, x0 + uMax * cell + cell / 2);
	return {
		dir: "h", W, H, fs, whenFs, lineH, whenH, maxChars, whenChars, maxLines: 2, labelW, cell, stem,
		axis: { x0: axisX0, y0: axisY, x1: axisX1, y1: axisY },
		at: (k) => ({ x: xs[k], y: axisY }),
		nowAt: nowU == null ? null : { x: x0 + nowU * cell, y: axisY },
		side: (k) => (mode === "alternate" && k % 2 === 1 ? -1 : 1),
		nowPill,
	};
}

/** Vertical axis near the left edge, labels on the right, "now" in its own slot. */
function vertical(f, items, now, fs) {
	const W = f.width;
	const fixed = f.height > 0;
	const n = items.length;
	const whenFs = Math.max(FONT_MIN, fs - 3);
	const lineH = fs * 1.25;
	const whenH = whenFs * 1.25;
	const axisX = PAD + DOT + 4;
	const labelX = axisX + DOT + 14;
	const labelW = W - PAD - labelX;
	const maxChars = Math.floor(labelW / (fs * CHAR));
	const whenChars = Math.floor(labelW / (whenFs * CHAR));
	const nowPill = now ? pill(now.label, whenFs) : null;
	// A row is as tall as its label (two lines until the labels are wrapped).
	const rowH = (it) => whenH + 4 + (it.lines?.length ?? 2) * lineH;
	// Slots in order: events, with the "now" slot inserted at its place.
	const slots = items.map((it, k) => ({ k, h: rowH(it) }));
	if (now && nowPill) slots.splice(now.index, 0, { k: -1, h: nowPill.h });
	const used = slots.reduce((s, x) => s + x.h, 0);
	const gap = fixed ? Math.max(16, Math.min(fs * 2.4, (f.height - 2 * PAD - 2 * DOT - used) / Math.max(1, slots.length - 1))) : 18;
	const contentH = used + gap * (slots.length - 1);
	const H = fixed ? f.height : Math.ceil(contentH + 2 * PAD + 2 * DOT);
	let y = (H - contentH) / 2;
	const ys = new Array(n);
	/** @type {number | null} */
	let nowY = null;
	for (const s of slots) {
		// An event's dot sits on its "when" line; the pill is centred in its slot.
		if (s.k < 0) nowY = y + s.h / 2;
		else ys[s.k] = y + whenH / 2;
		y += s.h + gap;
	}
	const first = Math.min(ys[0], nowY ?? Infinity);
	const last = Math.max(ys[n - 1], nowY ?? -Infinity);
	return {
		dir: "v", W, H, fs, whenFs, lineH, whenH, maxChars, whenChars, maxLines: 2, labelW, labelX,
		axis: { x0: axisX, y0: Math.max(PAD / 2, first - gap), x1: axisX, y1: Math.min(H - PAD / 2, last + rowH(items[n - 1]) + gap / 2) },
		at: (k) => ({ x: axisX, y: ys[k] }),
		nowAt: nowY == null ? null : { x: axisX, y: nowY },
		side: () => 1,
		nowPill,
	};
}

/** Label blocks, dots and the pill as boxes, for the overlap check. */
function boxes(L, items) {
	const out = [];
	items.forEach((it, k) => {
		const p = L.at(k);
		const w = Math.max(it.when.length * L.whenFs, Math.max(...it.lines.map((l) => l.length)) * L.fs) * CHAR;
		const h = L.whenH + 4 + it.lines.length * L.lineH;
		out.push({ x: p.x - DOT, y: p.y - DOT, w: 2 * DOT, h: 2 * DOT, what: "dot" });
		if (L.dir === "h") {
			const top = L.side(k) > 0 ? p.y + L.stem + 6 : p.y - L.stem - 6 - h;
			out.push({ x: p.x - w / 2, y: top, w, h, what: `label "${it.label}"` });
		} else {
			out.push({ x: L.labelX, y: p.y - L.whenH / 2, w, h, what: `label "${it.label}"` });
		}
	});
	if (L.nowAt && L.nowPill) {
		const { w, h } = L.nowPill;
		const x = L.dir === "h" ? L.nowAt.x - w / 2 : L.nowAt.x - h / 2;
		out.push({ x, y: L.nowAt.y - h / 2, w, h, what: "the now marker" });
	}
	return out;
}

function layoutProblem(L, items) {
	const all = boxes(L, items);
	for (let i = 0; i < all.length; i++) {
		const b = all[i];
		if (b.x < 0 || b.y < 0 || b.x + b.w > L.W + 0.01 || b.y + b.h > L.H + 0.01) return `${b.what} falls outside the canvas`;
		for (let j = i + 1; j < all.length; j++) {
			if (b.what === "dot" && all[j].what === "dot") continue;
			if (overlaps(b, all[j])) return `${b.what} overlaps ${all[j].what}`;
		}
	}
	return null;
}

/**
 * The validated, localized events and "now" of a spec.
 * @param {any} spec
 * @param {string} locale
 */
function readSpec(spec, locale) {
	const name = `timeline "${spec.id}"`;
	const events = spec.events;
	if (!Array.isArray(events)) throw new Error(`${name}: needs "events", a list of { when, label }`);
	if (events.length < 2 || events.length > MAX_EVENTS) throw new Error(`${name}: needs 2–${MAX_EVENTS} events, got ${events.length}`);
	let seenPlanned = false;
	const items = events.map((e, i) => {
		const label = localize(e?.label, locale);
		const when = localize(e?.when, locale);
		if (!label) throw new Error(`${name}: event ${i + 1} needs a "label"`);
		if (!when) throw new Error(`${name}: event ${i + 1} ("${label}") needs a "when", e.g. "09:02" or "Q3 2026"`);
		if (e.planned !== undefined && typeof e.planned !== "boolean") throw new Error(`${name}: event ${i + 1} ("${label}"): "planned" must be true or false`);
		const planned = e.planned === true;
		if (seenPlanned && !planned) throw new Error(`${name}: event ${i + 1} ("${label}") has happened but comes after a planned event; planned events go last`);
		seenPlanned ||= planned;
		return { label, when, planned, detail: localize(e.detail, locale), id: e.id };
	});
	/** @type {Now | null} */
	let now = null;
	if (spec.now != null) {
		const label = localize(spec.now.label, locale);
		if (!label) throw new Error(`${name}: "now" needs a "label", e.g. "Now" or "Today"`);
		const index = items.filter((it) => !it.planned).length;
		now = { label, detail: localize(spec.now.detail, locale), id: spec.now.id, index };
	} else if (seenPlanned) {
		throw new Error(`${name}: planned events need a "now" marker to separate them from the past`);
	}
	return { items, now };
}

/**
 * Largest font (≤ max) at which the layout fits and every label wraps. At one
 * font size, labels below the axis win over alternating ones unless
 * alternating needs fewer lines (no orphaned words).
 */
function fit(f, items, now, maxFs, name) {
	const narrow = f.name === "tall" || (f.height > 0 && f.width / f.height < 0.8);
	let why = "";
	for (let fs = maxFs; fs >= FONT_MIN; fs--) {
		/** @type {{ L: any, items: Item[], lines: number } | null} */
		let best = null;
		for (const mode of narrow ? ["v"] : ["below", "alternate"]) {
			let L = mode === "v" ? vertical(f, items, now, fs) : horizontal(f, items, now, fs, mode);
			try {
				const wrapped = items.map((it) => {
					wrapLabel(it.when, L.whenChars, 1);
					return { ...it, lines: wrapLabel(it.label, L.maxChars, L.maxLines) };
				});
				if (now) wrapLabel(now.label, L.dir === "h" ? Math.floor((L.cell - 2 * DOT - 12) / (L.whenFs * CHAR)) : L.maxChars, 1);
				if (mode === "v") L = vertical(f, wrapped, now, fs);
				const problem = layoutProblem(L, wrapped);
				if (problem) {
					why = problem;
					continue;
				}
				const lines = wrapped.reduce((s, it) => s + it.lines.length, 0);
				if (!best || lines < best.lines) best = { L, items: wrapped, lines };
			} catch (e) {
				why = e instanceof Error ? e.message : String(e);
			}
		}
		if (best) return best;
	}
	throw new Error(`${name}: ${items.length} events do not fit format ${f.name} at ≥ ${FONT_MIN}px (${why}); use fewer events, shorter labels or a larger format`);
}

/**
 * Build a timeline scene from its spec.
 * @param {any} spec
 * @param {{ format?: string | { name: string, width: number, height: number }, locale?: string }} [opts]
 * @returns {Scene}
 */
export function timeline(spec, { format = "16:9", locale = "en" } = {}) {
	const f = typeof format === "string" ? { name: format, ...FORMATS[format] } : format;
	if (!f.width) throw new Error(`unknown format "${format}"`);
	const { items: raw, now } = readSpec(spec, locale);
	const n = raw.length;
	const maxFs = maxFontSize(spec, f.height > 0 ? 22 : 16, `timeline "${spec.id}"`);
	const { L, items } = fit(f, raw, now, maxFs, `timeline "${spec.id}"`);

	// Event k's beat; then the "now" beat.
	const beat = (k) => AXIS + 0.1 + k * BEAT;
	const stepAt = (k) => beat(k) + SETTLE_AT;
	const nowStart = beat(n);
	const nowAt = nowStart + springSettleTime(NOW_OMEGA) + 0.01;
	const duration = (now ? nowAt : stepAt(n - 1)) + TAIL;

	// The accent axis: from the axis start through every past event, then to "now".
	const ax = L.axis;
	const along = (p) => (L.dir === "h" ? p.x : p.y);
	const start = L.dir === "h" ? ax.x0 : ax.y0;
	const stops = items.flatMap((it, k) => (it.planned ? [] : [{ to: along(L.at(k)), at: beat(k) }]));
	if (now && L.nowAt) stops.push({ to: along(L.nowAt), at: nowStart });
	const axisLen = L.dir === "h" ? ax.x1 - ax.x0 : ax.y1 - ax.y0;

	function accentEnd(t) {
		let end = start;
		let from = start;
		for (const s of stops) {
			const p = progress(t, s.at, EXTEND, easeStandard);
			if (p <= 0) break;
			end = lerp(from, s.to, p);
			from = s.to;
		}
		return end;
	}

	const line = (a, b, attrs) =>
		el("path", { d: L.dir === "h" ? `M${num(a)} ${num(ax.y0)} H${num(b)}` : `M${num(ax.x0)} ${num(a)} V${num(b)}`, fill: "none", "stroke-linecap": "round", ...attrs });

	function milestone(t, it, k) {
		const p = L.at(k);
		const b = beat(k);
		const drop = progress(t, b + 0.05, DROP, easeOut);
		if (drop <= 0) return "";
		const shown = progress(t, b + 0.15, LABEL, easeOut);
		const active = it.planned ? 0 : progress(t, b + 0.3, FILL, easeStandard);
		const out = [];
		const s = L.side(k);
		if (L.dir === "h") {
			// Stem from the dot to the label block, drawn as the label arrives.
			const y0 = p.y + s * (DOT + 3);
			const y1 = p.y + s * L.stem;
			const len = Math.abs(y1 - y0);
			const dash = drawOn(len, progress(t, b + 0.15, LABEL, easeStandard));
			if (dash) out.push(el("path", { d: `M${num(p.x)} ${num(y0)} V${num(y1)}`, stroke: tok("line"), "stroke-width": 1.5, fill: "none", ...dash }));
		}
		const dy = (1 - drop) * -14;
		const dot = (fill, stroke) => el("circle", { cx: p.x, cy: p.y, r: DOT, fill, stroke, "stroke-width": 2 });
		out.push(
			fade(drop, { transform: Math.abs(dy) > 0.004 ? translate(0, dy) : undefined }, fade(1 - active, {}, dot(tok("surface"), tok("line"))), fade(active, {}, dot(tok("accent"), tok("accent")))),
		);
		// Label block: the "when" line (muted) and the wrapped label (muted → ink once it has happened).
		const h = L.whenH + 4 + it.lines.length * L.lineH;
		let x;
		let top;
		let anchor;
		if (L.dir === "h") {
			x = p.x;
			top = s > 0 ? p.y + L.stem + 6 : p.y - L.stem - 6 - h;
			anchor = "middle";
		} else {
			x = L.labelX;
			top = p.y - L.whenH / 2;
			anchor = "start";
		}
		if (shown > 0) {
			out.push(fade(shown, {}, text({ x, y: top, "text-anchor": anchor, "dominant-baseline": "hanging", "font-size": L.whenFs, "font-weight": 600, fill: tok("muted") }, it.when)));
			out.push(stateLabel({ x, y: top + L.whenH + 4, lines: it.lines, fontSize: L.fs, anchor, baseline: "hanging", enter: shown, active }));
		}
		return out.join("");
	}

	function nowMarker(t) {
		if (!now || !L.nowAt || !L.nowPill) return "";
		const shown = progress(t, nowStart, NOW_FADE, easeOut);
		if (shown <= 0) return "";
		const dy = -(1 - springStep(t - nowStart, NOW_OMEGA)) * NOW_DROP;
		const { w, h, fs } = L.nowPill;
		const x = L.dir === "h" ? L.nowAt.x - w / 2 : L.nowAt.x - h / 2;
		const y = L.nowAt.y - h / 2;
		return fade(
			shown,
			{ transform: Math.abs(dy) > 0.004 ? translate(0, dy) : undefined },
			el("rect", { x, y, width: w, height: h, rx: h / 2, fill: tok("bg"), stroke: tok("emphasis"), "stroke-width": 2.5 }),
			text({ x: x + w / 2, y: L.nowAt.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fs, "font-weight": 600, fill: tok("ink") }, now.label),
		);
	}

	function frame(t) {
		const out = [];
		// Axis: pending line draws on; an arrowhead at its end shows the direction of time.
		const axisDash = drawOn(axisLen, progress(t, 0, AXIS, easeStandard));
		if (axisDash) out.push(line(start, L.dir === "h" ? ax.x1 : ax.y1, { stroke: tok("line"), "stroke-width": 2, ...axisDash }));
		const head = progress(t, AXIS - 0.15, 0.2, easeOut);
		if (head > 0) {
			const d = L.dir === "h" ? `M${num(ax.x1 - 9)} ${num(ax.y1 - 6)} L${num(ax.x1)} ${num(ax.y1)} L${num(ax.x1 - 9)} ${num(ax.y1 + 6)}` : `M${num(ax.x1 - 6)} ${num(ax.y1 - 9)} L${num(ax.x1)} ${num(ax.y1)} L${num(ax.x1 + 6)} ${num(ax.y1 - 9)}`;
			out.push(el("path", { d, fill: "none", stroke: tok("line"), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: head }));
		}
		const end = accentEnd(t);
		if (end - start > 0.5) out.push(line(start, end, { stroke: tok("accent"), "stroke-width": 3 }));
		items.forEach((it, k) => out.push(milestone(t, it, k)));
		out.push(nowMarker(t));
		return out.join("");
	}

	const steps = items.map((it, k) => withId({ at: stepAt(k), label: it.label, detail: it.detail }, it.id));
	if (now) steps.push(withId({ at: nowAt, label: now.label, detail: now.detail }, now.id));

	return {
		id: `${spec.id}-${f.name.replace(":", "x")}`,
		type: "timeline",
		format: f.name,
		locale,
		width: L.W,
		height: L.H,
		duration,
		title: localize(spec.title, locale),
		description: localize(spec.description, locale),
		steps,
		frame,
	};
}
