/** @import { Style } from "./style.mjs" */
/** @import { LabelBox } from "./iso.mjs" */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · the scene contract.
 *
 * A scene is an animated diagram as a pure function of time:
 *
 *   {
 *     id, width, height,          // viewBox
 *     duration,                   // seconds until the final state
 *     title, description,         // accessible name + description
 *     stepLabelsInFrame?: boolean, // false for narrative steps (default true)
 *     labelBoxes?(t) → LabelBox[], // the boxes of the labels drawn at t, for the gate
 *     steps: [{ at, label, detail?, id? }],   // build steps; last = finished diagram
 *     frame(t, { idPrefix }) → string         // inner SVG markup at time t
 *   }
 *
 * frame(t) may depend on nothing but t and the scene's own constants: no Date,
 * no Math.random(), no performance.now(), no state from earlier frames. That is
 * what lets a player jump anywhere, an exporter write exactly the frame a slide
 * needs, and a video renderer sample frame f at t = f / fps.
 *
 * Every render passes an `idPrefix` unique to that instance on the page. A
 * scene that defines ids (clip paths, gradients, masks, markers, filters) MUST
 * build them from it (`${idPrefix}-clip`), so two instances never share an id.
 */
import { esc, num } from "./svg.mjs";
import { normalizeStyle, cssVars, resolveTokens } from "./style.mjs";

/**
 * One build step. `at` is a settled time; `id` is an optional stable name that
 * page scripts can use instead of the step's index.
 * @typedef {{ at: number, label: string, detail?: string, id?: string }} Step
 */
/**
 * What `renderSvg` passes to `frame` besides the time.
 * @typedef {{ idPrefix: string, style?: Style }} FrameContext
 */
/**
 * An animated diagram as a pure function of time (see the module comment).
 * `contrastPairs`: the token pairs the scene draws (runtime/style.mjs
 * `sharedPairs` picks from CONTRAST_PAIRS; others are written out). The gate
 * holds the style to exactly these and reports the shared pairs left out as
 * warnings; a scene that declares none is held to all of CONTRAST_PAIRS.
 * `labelBoxes`: the box of every label `frame(t)` draws, in the picture's
 * coordinates (`labelAnchor` returns one); the gate fails a scene whose labels
 * overlap, whose stems cross a label, or that leave the picture (runtime/iso.mjs).
 * @typedef {{ id: string, width: number, height: number, duration: number, title: string, description: string, steps: Step[], frame: (t: number, ctx: FrameContext) => string, stepLabelsInFrame?: boolean, contrastPairs?: readonly { fg: string, bg: string, min: number, use?: string }[], labelBoxes?: (t: number) => LabelBox[], type?: string, format?: string, locale?: string }} Scene
 */

/** Formats: name → viewBox. Layouts are computed per format, never cropped. */
export const FORMATS = {
	"16:9": { width: 960, height: 540 },
	"4:3": { width: 960, height: 720 },
	"1:1": { width: 720, height: 720 },
	"9:16": { width: 540, height: 960 },
	wide: { width: 960, height: 0 }, // strip: height computed by the scene type
	tall: { width: 360, height: 0 }, // phone column: height computed by the scene type
};

/**
 * Resolve copy exactly; plain strings are shared by every locale. Missing
 * translations must never silently publish a different language.
 * @param {string | Record<string, string> | null | undefined} value
 * @param {string} [locale]
 * @returns {string}
 */
export function localize(value, locale = "en") {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, locale) || typeof value[locale] !== "string" || !value[locale]) {
		throw new Error(`missing translation for locale "${locale}"`);
	}
	return value[locale];
}

/**
 * A valid, CSS-safe id token from any string: letters, digits, "_" and "-",
 * starting with a letter. Ids that already are one come back unchanged.
 * @param {unknown} value
 * @returns {string}
 */
export function safeId(value) {
	const s = String(value).replace(/[^A-Za-z0-9_-]+/g, "-");
	return /^[A-Za-z]/.test(s) ? s : `mk-${s}`;
}

/**
 * Throw unless `scene` meets the contract; returns it unchanged.
 * @template {Scene} S
 * @param {S} scene
 * @returns {S}
 */
export function validateScene(scene) {
	for (const k of ["id", "width", "height", "duration", "title", "description", "steps", "frame"]) {
		if (scene[k] === undefined || scene[k] === "") throw new Error(`scene ${scene.id ?? "?"} is missing "${k}"`);
	}
	for (const key of ["width", "height", "duration"]) {
		if (!Number.isFinite(scene[key]) || scene[key] <= 0) throw new Error(`scene ${scene.id}: ${key} must be a positive finite number`);
	}
	if (typeof scene.frame !== "function") throw new Error(`scene ${scene.id}: frame must be a function`);
	if (scene.labelBoxes !== undefined && typeof scene.labelBoxes !== "function") throw new Error(`scene ${scene.id}: labelBoxes must be a function`);
	if (!Array.isArray(scene.steps) || !scene.steps.length) throw new Error(`scene ${scene.id}: needs at least one step`);
	let prev = -Infinity;
	const ids = new Set();
	for (const s of scene.steps) {
		if (!Number.isFinite(s.at) || s.at < 0) throw new Error(`scene ${scene.id}: step time must be finite and non-negative`);
		if (!(s.at > prev)) throw new Error(`scene ${scene.id}: steps must be strictly increasing in time`);
		if (s.at > scene.duration + 1e-9) throw new Error(`scene ${scene.id}: step "${s.label}" is after the duration`);
		if (!s.label) throw new Error(`scene ${scene.id}: every step needs a label`);
		if (s.id !== undefined) {
			if (typeof s.id !== "string" || !s.id) throw new Error(`scene ${scene.id}: step "${s.label}" has an id that is not a non-empty string`);
			if (ids.has(s.id)) throw new Error(`scene ${scene.id}: two steps share the id "${s.id}"`);
			ids.add(s.id);
		}
		prev = s.at;
	}
	return scene;
}

/**
 * `step` with `id` added when one is given (scene types pass a spec's ids on).
 * @template {Step} S
 * @param {S} step
 * @param {unknown} id
 * @returns {S}
 */
export function withId(step, id) {
	return id == null ? step : { ...step, id: /** @type {string} */ (id) };
}

/**
 * The index of a step given by index or by id. Throws RangeError for an
 * index outside the steps, or an id no step has.
 * @param {{ steps: Step[] }} scene
 * @param {number | string} ref
 * @returns {number}
 */
export function stepIndex(scene, ref) {
	if (typeof ref === "string") {
		const i = scene.steps.findIndex((s) => s.id === ref);
		if (i < 0) throw new RangeError(`Unknown step id: ${ref}`);
		return i;
	}
	if (!Number.isInteger(ref) || ref < 0 || ref >= scene.steps.length) throw new RangeError(`Invalid step index: ${ref}`);
	return ref;
}

/**
 * Complete, accessible <svg> for `scene` at time t (clamped to the scene).
 *
 * options:
 *   standalone  resolve tokens to literal colours, write width/height (exports)
 *   theme       "light" | "dark" (standalone only)
 *   style       style object or "neutral"
 *   background  paint the style's bg colour behind the diagram (video, PNG for slides)
 *   scale       width/height multiplier for standalone output
 *   idPrefix    prefix for every id in the output: <title>/<desc>, and the scene's
 *               own ids through frame(t, { idPrefix }). Unique per instance on a
 *               page; made a safe id token (safeId). Default: scene.id
 * @param {Scene} scene
 * @param {number} t
 * @param {{ standalone?: boolean, theme?: string, style?: any, background?: boolean, scale?: number, idPrefix?: string, live?: boolean }} [options]
 * @returns {string}
 */
export function renderSvg(scene, t, options = {}) {
	const style = normalizeStyle(options.style);
	const time = Math.min(Math.max(t, 0), scene.duration);
	const id = safeId(options.idPrefix ?? scene.id);
	const scale = options.scale ?? 1;
	const size = options.standalone ? ` width="${num(scene.width * scale)}" height="${num(scene.height * scale)}"` : "";
	const vars = options.standalone ? "" : ` style="${cssVars(style, options.theme ?? "light")}"`;
	const bg = options.background ? `<rect width="100%" height="100%" fill="var(--mk-bg)"/>` : "";
	const markup =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}"${size}` +
		` font-family="${esc(style.font)}" role="img" aria-labelledby="${id}-title ${id}-desc"${options.live ? "" : vars}>` +
		`<title id="${id}-title">${esc(scene.title)}</title>` +
		`<desc id="${id}-desc">${esc(scene.description)}</desc>` +
		(options.standalone ? resolveTokens(bg + scene.frame(time, { idPrefix: id, style }), style, options.theme ?? "light") : bg + scene.frame(time, { idPrefix: id, style })) +
		`</svg>`;
	return markup;
}

/** Time of each step (convenience). */
export function stepTimes(scene) {
	return scene.steps.map((s) => s.at);
}

/** Index of the step shown at time t (last step whose at ≤ t), or -1 before the first. */
export function stepIndexAt(scene, t) {
	let idx = -1;
	scene.steps.forEach((s, i) => {
		if (t >= s.at - 1e-9) idx = i;
	});
	return idx;
}
