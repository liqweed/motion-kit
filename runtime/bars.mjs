// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · bars with values, for custom scenes (`kit`).
 *
 * Parts for a row of a benchmark-style chart, as pure functions of time:
 *
 * - a **hatch**: a pattern of diagonal lines at 45° in a token colour, whose id
 *   is built from the frame's `idPrefix` (`hatchPattern`);
 * - a **track**: a rounded, empty bar filled with that hatching (`drawTrack`);
 * - a **bar**: a rounded bar that grows over the track from its start
 *   (`drawBar`), on the style's movement curve (`barProgress`);
 * - a **value**: a number that rolls from a start value to its end value with
 *   the bar's progress, formatted by the caller (`drawValue`, `rollingValue`).
 *
 * Nothing here repeats. A bar grows once inside its step's beat and rests; its
 * value shows exactly its end value from the moment the bar has settled, so a
 * step frame is the settled frame (`barEnd` says when). Colours are token
 * names, never literals.
 *
 * Imports stay single-line named imports: lib/bundle.mjs inlines only that form.
 */
import { clamp01, easings, lerp, progress } from "./motion.mjs";
import { safeId } from "./scene.mjs";
import { tok } from "./style.mjs";
import { el, fade, num, text } from "./svg.mjs";

/** @import { Style } from "./style.mjs" */

/** @param {number} n */
const finite = (n) => typeof n === "number" && Number.isFinite(n);
/** What may stand in an id: the characters `safeId` leaves. */
const ID_PART = /^[A-Za-z0-9_-]+$/;
/** Names `renderSvg` already uses for ids (`${id}-title`, `${id}-desc`). */
const RESERVED_NAMES = new Set(["title", "desc"]);
/** Every hatch `hatchPattern` has made: a hand-built look-alike is not one. */
const ISSUED = new WeakSet();

/**
 * @typedef {{ id: string, fill: string, markup: string }} Hatch
 * `markup` is the `<defs>` holding the pattern: put it in the frame once,
 * before any track that uses it, every frame. `fill` is the paint to refer to
 * it, `url(#id)`.
 */

/**
 * Diagonal hatching: lines at 45°, rising to the right, `spacing` pixels apart
 * (measured across the lines) and `width` pixels wide, in the token `stroke`.
 * The pattern is anchored to the picture, not to a track, so tracks that use it
 * show one continuous hatch. Its id is `${idPrefix}-${name}` (the prefix made a
 * safe id token, as `renderSvg` does): `idPrefix` is the frame's, so two instances on a page never share one, and a scene that draws
 * several hatchings gives each its own `name`.
 * @param {{ idPrefix: string, name?: string, stroke?: string, spacing?: number, width?: number }} o
 * @returns {Hatch}
 */
export function hatchPattern({ idPrefix, name = "hatch", stroke = "line", spacing = 7, width = 1.5 }) {
	if (typeof idPrefix !== "string" || idPrefix === "") throw new Error(`hatchPattern: idPrefix must be the frame's idPrefix, a non-empty string, got ${JSON.stringify(idPrefix)}`);
	if (typeof name !== "string" || !ID_PART.test(name)) throw new Error(`hatchPattern: name must use letters, digits, "_" and "-", got ${JSON.stringify(name)}`);
	if (RESERVED_NAMES.has(name)) throw new Error(`hatchPattern: name "${name}" is reserved for the picture's own ids`);
	if (!finite(spacing) || spacing <= 0) throw new Error(`hatchPattern: spacing must be a positive number, got ${spacing}`);
	if (!finite(width) || width <= 0 || width >= spacing) throw new Error(`hatchPattern: width must be more than 0 and less than the spacing (${spacing}), got ${width}`);
	const id = `${safeId(idPrefix)}-${name}`; // the frame's prefix is a safe id already; the gate's own call passes the raw scene id
	// One vertical line in the middle of a square tile, turned 45° by the pattern.
	const line = el("path", { d: `M${num(spacing / 2)} 0 V${num(spacing)}`, fill: "none", stroke: tok(stroke), "stroke-width": width });
	const pattern = el("pattern", { id, width: spacing, height: spacing, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, line);
	const hatch = { id, fill: `url(#${id})`, markup: el("defs", {}, pattern) };
	ISSUED.add(hatch);
	return hatch;
}

/** @param {string} who @param {{ x: number, y: number, width: number, height: number }} r */
function checkRect(who, { x, y, width, height }, allowEmpty = false) {
	if (![x, y, width, height].every(finite)) throw new Error(`${who}: x, y, width and height must be finite numbers`);
	if (allowEmpty && width === 0 && height > 0) return;
	if (width <= 0 || height <= 0) throw new Error(`${who}: width and height must be positive, got ${width} × ${height}`);
}

/** The corner radius for a rect `w` × `h`: `radius`, never more than half of either side. */
const corner = (/** @type {number | undefined} */ radius, /** @type {number} */ w, /** @type {number} */ h) => {
	const r = radius ?? h / 2;
	if (!finite(r) || r < 0) throw new Error(`radius must be a number of 0 or more, got ${radius}`);
	return Math.min(r, w / 2, h / 2);
};

/**
 * An empty track: a rounded bar of `width` × `height` at (`x`, `y`), filled with
 * the token `fill` (default `surface`; `null` for none) and, over it, with the
 * `hatch` when one is given. A track needs one of the two. `radius` defaults to
 * half the height, a pill.
 * @param {{ x: number, y: number, width: number, height: number, hatch?: Hatch, fill?: string | null, radius?: number, opacity?: number, id?: string }} o
 * @returns {string}
 */
export function drawTrack({ x, y, width, height, hatch, fill = "surface", radius, opacity = 1, id }) {
	checkRect("drawTrack", { x, y, width, height });
	if (hatch !== undefined && (!hatch || !ISSUED.has(hatch))) throw new Error("drawTrack: hatch must come from hatchPattern()");
	if (!hatch && fill === null) throw new Error("drawTrack: a track needs a fill or a hatch");
	const rx = corner(radius, width, height);
	const rect = (/** @type {string} */ paint) => el("rect", { x, y, width, height, rx, fill: paint });
	return fade(opacity, id ? { "data-track": id } : {}, fill === null ? "" : rect(tok(fill)), hatch ? rect(hatch.fill) : "");
}

/**
 * A bar `width` long when it is done (its end value's share of the track, 0 for a zero value), drawn
 * up to fraction `p` of it from its start at (`x`, `y`): `p` is the eased progress of its
 * growth (`barProgress`), and the bar is rounded at both ends all the way, so
 * it grows as a pill. Nothing for `p` ≤ 0; `p` ≥ 1 is the full bar it rests as.
 * @param {{ x: number, y: number, width: number, height: number, p: number, fill?: string, radius?: number, opacity?: number, id?: string }} o
 * @returns {string}
 */
export function drawBar({ x, y, width, height, p, fill = "accent", radius, opacity = 1, id }) {
	checkRect("drawBar", { x, y, width, height }, true); // a zero value is a zero-width bar: nothing to draw
	if (!finite(p)) throw new Error(`drawBar: p must be a finite number, got ${p}`);
	const share = clamp01(p);
	if (share <= 0) return "";
	const w = width * share;
	if (w <= 0) return "";
	return fade(opacity, id ? { "data-bar": id } : {}, el("rect", { x, y, width: w, height, rx: corner(radius, w, height), fill: tok(fill) }));
}

/**
 * One bar's growth: it starts at `start` s and takes `duration` s.
 * @typedef {{ start: number, duration: number }} BarRun
 */

/**
 * The eased progress of a bar's growth at time `t`, 0 before it starts and
 * exactly 1 once it has ended, on the style's movement curve (`style.motion`,
 * or the default curve for no style), so a bar moves as the rest of the diagram
 * does on the page's own curve. `style` is the one `frame(t, { idPrefix, style })`
 * is given.
 * @param {number} t
 * @param {BarRun} run
 * @param {Pick<Style, "motion"> | null} [style]
 * @returns {number}
 */
export function barProgress(t, run, style) {
	return progress(t, run.start, run.duration, easings(style?.motion).easeStandard);
}

/**
 * The time a bar has settled and its value shows its end value: `start +
 * duration`. A scene's step comes at least 50 ms after this for every bar of
 * its beat.
 * @param {BarRun} run
 * @returns {number}
 */
export function barEnd(run) {
	return run.start + run.duration;
}

/**
 * The value a number shows at progress `p` of its bar: `from` at 0, `to` at
 * the end, and in between a straight line (the bar's easing already shapes
 * it), so the number and the bar arrive together. At `p` ≥ 1 it is `to` itself,
 * exactly, never a rounded sum.
 * @param {number} from
 * @param {number} to
 * @param {number} p
 * @returns {number}
 */
export function rollingValue(from, to, p) {
	if (!finite(from) || !finite(to) || !finite(p)) throw new Error(`rollingValue: from, to and p must be finite numbers, got ${from}, ${to}, ${p}`);
	if (p >= 1) return to;
	if (p <= 0) return from;
	const v = lerp(from, to, p);
	return finite(v) ? v : from * (1 - p) + to * p; // to - from overflowed: weigh each end instead
}

/**
 * The number that rolls beside a bar: `format(rollingValue(from, to, p))` as
 * text at (`x`, `y`), vertically centred on `y`. `format` is the caller's
 * (units, decimals, locale: `(v) => new Intl.NumberFormat(locale, …).format(v)`)
 * and must return a string; the default rounds to a whole number. Set `family`
 * to a monospace face so the digits do not jitter as they change, and `anchor`
 * to `"end"` at a fixed x so the number grows leftward, or `"start"` beside the
 * bar's end.
 * @param {{ x: number, y: number, to: number, from?: number, p: number, format?: (value: number) => string, fontSize?: number, anchor?: "start" | "middle" | "end", fill?: string, weight?: number, family?: string, opacity?: number, id?: string }} o
 * @returns {string}
 */
export function drawValue({ x, y, to, from = 0, p, format = (v) => num(v, 0), fontSize = 16, anchor = "start", fill = "ink", weight = 600, family, opacity = 1, id }) {
	if (![x, y, fontSize].every(finite) || fontSize <= 0) throw new Error("drawValue: x, y and fontSize must be finite numbers, the size above 0");
	if (typeof format !== "function") throw new Error("drawValue: format must be a function (number) => string");
	const shown = format(rollingValue(from, to, p));
	if (typeof shown !== "string") throw new Error(`drawValue: format must return a string, got ${typeof shown}`);
	return fade(opacity, id ? { "data-value": id } : {}, text({ x, y, "text-anchor": anchor, "dominant-baseline": "central", "font-size": fontSize, "font-weight": weight, "font-family": family, fill: tok(fill) }, shown));
}
