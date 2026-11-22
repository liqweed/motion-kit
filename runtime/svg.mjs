// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · SVG string builder and geometry.
 *
 * Scenes return strings, so one frame can be mounted in a browser, written to a
 * standalone .svg, rasterized, or baked. Text and attribute values are escaped
 * here; numbers are rounded here. Numbers you interpolate into a template
 * string yourself (transform, points, path d) must go through `num()`.
 */
import { clamp01, easeStandard, progress } from "./motion.mjs";
import { tok } from "./style.mjs";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
	return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Round to `digits` decimals (default 2). Never returns "-0". */
export function num(n, digits = 2) {
	if (!Number.isFinite(n)) throw new Error(`num(): not a finite number: ${n}`);
	const f = 10 ** digits;
	const r = Math.round(n * f) / f;
	return String(Object.is(r, -0) ? 0 : r);
}

export function attrString(attrs) {
	let out = "";
	for (const [name, value] of Object.entries(attrs)) {
		if (value === undefined || value === null || value === false) continue;
		if (name === "opacity" && typeof value === "number" && Math.round(value * 1000) >= 1000) continue;
		const v = typeof value === "number" ? num(value, name === "opacity" ? 3 : 2) : esc(value);
		out += ` ${name}="${v}"`;
	}
	return out;
}

/** Element whose children are already-built (trusted) markup. */
export function el(tag, attrs = {}, ...children) {
	// An element whose opacity rounds to 0 is invisible: drop it, so frames that
	// look identical are byte-identical.
	if (typeof attrs.opacity === "number" && Math.round(attrs.opacity * 1000) <= 0) return "";
	const body = children.flat().filter(Boolean).join("");
	return body === "" ? `<${tag}${attrString(attrs)}/>` : `<${tag}${attrString(attrs)}>${body}</${tag}>`;
}

/** `<text>` with escaped content. A string[] becomes stacked <tspan> lines. */
export function text(attrs, content, lineHeight = 1.25) {
	if (Array.isArray(content)) {
		if (content.length === 1) return `<text${attrString(attrs)}>${esc(content[0])}</text>`;
		const size = Number(attrs["font-size"] ?? 14);
		const x = attrs.x ?? 0;
		const first = -((content.length - 1) * lineHeight * size) / 2;
		const spans = content
			.map((line, i) => `<tspan x="${typeof x === "number" ? num(x) : esc(x)}" dy="${num(i === 0 ? first : lineHeight * size)}">${esc(line)}</tspan>`)
			.join("");
		return `<text${attrString(attrs)}>${spans}</text>`;
	}
	return `<text${attrString(attrs)}>${esc(content)}</text>`;
}

/** `translate(x y)` / `scale(s)` with rounding. */
export function translate(x, y) {
	return `translate(${num(x)} ${num(y)})`;
}
export function scaleAbout(s, cx, cy) {
	return `translate(${num(cx)} ${num(cy)}) scale(${num(s, 4)}) translate(${num(-cx)} ${num(-cy)})`;
}

/** Group with opacity; returns "" when fully transparent (keeps frames small). */
export function fade(opacity, attrs, ...children) {
	const o = Math.round(opacity * 1000) / 1000; // decide on the rounded value, so 0.9999 ≡ 1
	if (o <= 0) return "";
	return el("g", { ...attrs, opacity: o >= 1 ? undefined : o }, ...children);
}

/**
 * Reveal: opacity, a small rise and a blur that goes to zero, on one group.
 * The element starts soft, transparent and `rise` units low and sharpens into
 * place as `enter` goes from 0 to 1 (`progress(t, start, 0.3–0.6, ease)`, with
 * the style's entrance curve: `easings(style.motion).easeOut`).
 *
 * The blur is an SVG filter, which is the one thing a frame must clean up
 * after: once `enter` reaches 1 (as `fade` rounds it) the children come back
 * bare, with no group, no filter and no `<defs>`, so a settled frame is
 * byte-identical to the same markup drawn without the reveal. Before it
 * starts (`enter` ≤ 0) nothing is drawn.
 *
 * `id` names the filter and must be built from the frame's `idPrefix`
 * (`${idPrefix}-reveal-1`), one id per revealed element: two instances on a
 * page, and every slice of a baked SVG, then never share a filter. The filter
 * works in sRGB, so every renderer blurs the same colours. Its region is the
 * element's box plus 25 % sideways and 100 % above and below, which holds the
 * blur of text at least about 50 units wide; for anything narrower (a short
 * label, an icon) or a larger `blur`, pass `box`, the element's own
 * `{ x, y, width, height }`, and the region becomes that box plus 3 × `blur`
 * on every side, in the element's own units.
 *
 * @param {number} enter eased progress, 0 to 1
 * @param {{ id: string, rise?: number, blur?: number, box?: { x: number, y: number, width: number, height: number } }} options
 *   `rise`: units it starts below its place (default 6); `blur`: its starting
 *   blur radius, in units (default 4, at most 12); `box`: the element's box, see above
 * @param {...(string | string[])} children markup
 * @returns {string}
 */
export function blurReveal(enter, { id, rise = 6, blur = 4, box }, ...children) {
	if (typeof id !== "string" || !/^[A-Za-z][\w-]*$/.test(id)) throw new Error(`blurReveal: id must be a CSS-safe id built from idPrefix, got ${JSON.stringify(id)}`);
	if (!Number.isFinite(rise) || rise < 0 || rise > 24) throw new Error(`blurReveal: rise must be a number from 0 to 24, got ${rise}`);
	if (!Number.isFinite(blur) || blur < 0 || blur > 12) throw new Error(`blurReveal: blur must be a number from 0 to 12, got ${blur}`);
	if (box !== undefined && !(box && ["x", "y", "width", "height"].every((k) => Number.isFinite(box[k])) && box.width > 0 && box.height > 0)) throw new Error("blurReveal: box must be { x, y, width, height } with finite numbers and a positive size");
	const o = Math.round(clamp01(enter) * 1000) / 1000; // as fade(): 0.9999 ≡ 1
	if (o <= 0) return "";
	const body = children.flat().filter(Boolean).join("");
	if (o >= 1) return body;
	const dy = (1 - o) * rise;
	const sd = (1 - o) * blur;
	const blurred = sd >= 0.005; // below that it rounds to 0 and would filter nothing
	const m = 3 * blur;
	const region = box
		? { filterUnits: "userSpaceOnUse", x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m }
		: { x: "-25%", y: "-100%", width: "150%", height: "300%" };
	const filter = blurred ? `<defs>${el("filter", { id, ...region, "color-interpolation-filters": "sRGB" }, el("feGaussianBlur", { stdDeviation: sd }))}</defs>` : "";
	return filter + el("g", { transform: dy >= 0.005 ? translate(0, dy) : undefined, opacity: o, filter: blurred ? `url(#${id})` : undefined }, body);
}

/**
 * Highlighter sweep: a band in a token colour at low opacity that grows from
 * its left edge to `x + width` as `p` goes from 0 to 1. Draw it before the
 * text it marks, so the text sits on top; size it to the line
 * (`estimateWidth(line, fontSize)` plus a little padding each side). Nothing is
 * drawn at `p` ≤ 0, and at 1 the band is the same rectangle every frame.
 *
 * Keep `opacity` low (0.2 to 0.4) as a starting point: the text drawn over it
 * keeps its contrast only while the band stays a light tint of the canvas, and
 * the gate checks the text against the canvas, not against the band. For a
 * custom style, check the ink against the composited tint yourself (the neutral
 * style does at 0.3). `token` is any style token;
 * the default `emphasis` is the style's marker colour.
 *
 * @param {number} p eased progress, 0 to 1
 * @param {{ x: number, y: number, width: number, height: number, token?: string, opacity?: number, radius?: number }} band
 * @returns {string}
 */
export function highlightSweep(p, { x, y, width, height, token = "emphasis", opacity = 0.3, radius = 4 }) {
	for (const [name, v] of [["x", x], ["y", y], ["width", width], ["height", height], ["radius", radius]]) {
		if (!Number.isFinite(v)) throw new Error(`highlightSweep: ${name} must be a finite number, got ${v}`);
	}
	if (width <= 0 || height <= 0) throw new Error("highlightSweep: width and height must be positive");
	if (!(Number.isFinite(opacity) && opacity > 0 && opacity <= 1)) throw new Error(`highlightSweep: opacity must be above 0 and at most 1, got ${opacity}`);
	const w = width * clamp01(p);
	if (w < 0.01) return "";
	return el("rect", { x, y, width: w, height, rx: Math.max(0, Math.min(radius, w / 2, height / 2)), fill: tok(token), opacity });
}

/* ---------------------------------------------------------------- geometry */

export function dist(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointOnLine(a, b, p) {
	return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

/** Shorten a segment by `ra` at the start and `rb` at the end (e.g. node radii). */
export function trimSegment(a, b, ra, rb = ra) {
	const d = dist(a, b);
	if (d <= ra + rb) return [a, a];
	return [pointOnLine(a, b, ra / d), pointOnLine(a, b, 1 - rb / d)];
}

/** Polyline helpers: total length and point at a fraction of arc length. */
export function polyline(points) {
	const segs = [];
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		const len = dist(points[i - 1], points[i]);
		segs.push({ a: points[i - 1], b: points[i], start: total, len });
		total += len;
	}
	return {
		length: total,
		d: points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join(" "),
		at(f) {
			const target = Math.min(Math.max(f, 0), 1) * total;
			for (const s of segs) {
				if (target <= s.start + s.len || s === segs[segs.length - 1]) {
					return pointOnLine(s.a, s.b, s.len === 0 ? 0 : (target - s.start) / s.len);
				}
			}
			return points[0];
		},
	};
}

/**
 * Cubic Bézier with an arc-length lookup table, computed without a DOM, so a
 * marker can travel along a curve at constant speed in Node and the browser.
 */
export function cubic(p0, p1, p2, p3, samples = 64) {
	const pt = (s) => {
		const u = 1 - s;
		return {
			x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x,
			y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y,
		};
	};
	const lut = [0];
	let prev = p0;
	for (let i = 1; i <= samples; i++) {
		const p = pt(i / samples);
		lut.push(lut[i - 1] + dist(prev, p));
		prev = p;
	}
	const length = lut[samples];
	return {
		length,
		d: `M${num(p0.x)} ${num(p0.y)} C${num(p1.x)} ${num(p1.y)} ${num(p2.x)} ${num(p2.y)} ${num(p3.x)} ${num(p3.y)}`,
		at(f) {
			const target = Math.min(Math.max(f, 0), 1) * length;
			let lo = 0;
			let hi = samples;
			while (hi - lo > 1) {
				const mid = (lo + hi) >> 1;
				if (lut[mid] < target) lo = mid;
				else hi = mid;
			}
			const span = lut[hi] - lut[lo];
			const s = (lo + (span === 0 ? 0 : (target - lut[lo]) / span)) / samples;
			return pt(s);
		},
	};
}

/**
 * Draw-on stroke: dasharray/dashoffset for progress p of a path of `length`.
 * Returns null while p ≤ 0 — a zero-length dash with round caps still paints a
 * dot, so callers must skip the element entirely.
 */
export function drawOn(length, p) {
	if (p <= 0) return null;
	if (p >= 1) return {};
	return { "stroke-dasharray": `${num(length)} ${num(length)}`, "stroke-dashoffset": num(length * (1 - p)) };
}

/* ------------------------------------------------------------------ tokens */

/**
 * One token's journey: it starts at `start` s and takes `duration` s along
 * `path` (default: the path given to the function), on `ease` (default
 * `easeStandard`). It is drawn while it travels; with `hold` it stays at the
 * end of the path once it has arrived.
 * @typedef {{ start: number, duration: number, path?: { at: (f: number) => any }, ease?: (p: number) => number, hold?: boolean }} TokenRun
 */

/**
 * Where each of several tokens is at time t. Any number of tokens may travel
 * at once, on one path or each on its own; a token not yet started, or
 * arrived without `hold`, is left out. A scene keeps the steps settled by
 * having every token arrive, and be gone, before the step's time.
 * @param {{ at: (f: number) => any }} path anything with `at(fraction) → point`: `polyline`, `cubic`, `path3`
 * @param {number} t
 * @param {TokenRun[]} runs
 * @returns {{ index: number, progress: number, point: any, run: TokenRun }[]}
 */
export function tokenPoints(path, t, runs) {
	const out = [];
	for (const [index, run] of runs.entries()) {
		const p = progress(t, run.start, run.duration, run.ease ?? easeStandard);
		if (p <= 0 || (p >= 1 && !run.hold)) continue;
		out.push({ index, progress: p, point: (run.path ?? path).at(p), run });
	}
	return out;
}

/**
 * Several tokens travelling at once: `draw(point, { index, progress, run })`
 * for each token in flight, concatenated. Pure like every frame helper, so any
 * frame is the same whatever was drawn before it.
 * @param {{ at: (f: number) => any }} path
 * @param {number} t
 * @param {TokenRun[]} runs
 * @param {(point: any, info: { index: number, progress: number, run: TokenRun }) => string} draw
 * @returns {string}
 */
export function tokensAlong(path, t, runs, draw) {
	return tokenPoints(path, t, runs)
		.map(({ point, index, progress, run }) => draw(point, { index, progress, run }))
		.join("");
}
