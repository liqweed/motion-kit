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
 *     steps: [{ at, label, detail? }],   // build steps; last = finished diagram
 *     frame(t) → string           // inner SVG markup at time t
 *   }
 *
 * frame(t) may depend on nothing but t and the scene's own constants: no Date,
 * no Math.random(), no performance.now(), no state from earlier frames. That is
 * what lets a player jump anywhere, an exporter write exactly the frame a slide
 * needs, and a video renderer sample frame f at t = f / fps.
 */
import { esc, num } from "./svg.mjs";
import { normalizeStyle, cssVars, resolveTokens } from "./style.mjs";

/** Formats: name → viewBox. Layouts are computed per format, never cropped. */
export const FORMATS = {
	"16:9": { width: 960, height: 540 },
	"4:3": { width: 960, height: 720 },
	"1:1": { width: 720, height: 720 },
	"9:16": { width: 540, height: 960 },
	wide: { width: 960, height: 0 }, // strip: height computed by the scene type
	tall: { width: 360, height: 0 }, // phone column: height computed by the scene type
};

/** Pick a localized string: plain string, or { en, nl, ... }. */
export function localize(value, locale = "en") {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (value[locale] != null) return value[locale];
	const first = Object.values(value)[0];
	if (first == null) return "";
	return first;
}

export function validateScene(scene) {
	for (const k of ["id", "width", "height", "duration", "title", "description", "steps", "frame"]) {
		if (scene[k] === undefined || scene[k] === "") throw new Error(`scene ${scene.id ?? "?"} is missing "${k}"`);
	}
	if (!scene.steps.length) throw new Error(`scene ${scene.id}: needs at least one step`);
	let prev = -Infinity;
	for (const s of scene.steps) {
		if (!(s.at > prev)) throw new Error(`scene ${scene.id}: steps must be strictly increasing in time`);
		if (s.at > scene.duration + 1e-9) throw new Error(`scene ${scene.id}: step "${s.label}" is after the duration`);
		if (!s.label) throw new Error(`scene ${scene.id}: every step needs a label`);
		prev = s.at;
	}
	return scene;
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
 *   idPrefix    unique prefix for <title>/<desc> ids when several diagrams share a page
 */
export function renderSvg(scene, t, options = {}) {
	const style = normalizeStyle(options.style);
	const time = Math.min(Math.max(t, 0), scene.duration);
	const id = esc(options.idPrefix ?? scene.id);
	const scale = options.scale ?? 1;
	const size = options.standalone ? ` width="${num(scene.width * scale)}" height="${num(scene.height * scale)}"` : "";
	const vars = options.standalone ? "" : ` style="${cssVars(style, options.theme ?? "light")}"`;
	const bg = options.background ? `<rect width="100%" height="100%" fill="var(--mk-bg)"/>` : "";
	const markup =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(scene.width)} ${num(scene.height)}"${size}` +
		` font-family="${esc(style.font)}" role="img" aria-labelledby="${id}-title ${id}-desc"${options.live ? "" : vars}>` +
		`<title id="${id}-title">${esc(scene.title)}</title>` +
		`<desc id="${id}-desc">${esc(scene.description)}</desc>` +
		bg +
		scene.frame(time) +
		`</svg>`;
	return options.standalone ? resolveTokens(markup, style, options.theme ?? "light") : markup;
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
