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
