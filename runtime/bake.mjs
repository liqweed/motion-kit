// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · bake: a scene → one zero-JavaScript animated SVG.
 *
 * For places that do not run scripts (Craft html-preview, GitHub READMEs,
 * Obsidian notes, email, most embeds). The scene is sampled at `fps`; each
 * distinct frame becomes a <g> that a CSS animation makes visible for exactly
 * its time slice. Identical consecutive frames (holds) are merged, so a scene
 * that rests between steps costs little. It plays once and holds the final
 * frame; with prefers-reduced-motion the final frame shows immediately.
 *
 * Trade-off: file size grows with fps × duration (a 6 s scene at 15 fps is
 * typically 150–400 KB). Use the live player where scripts are allowed.
 */
import { renderSvg } from "./scene.mjs";
import { num } from "./svg.mjs";

/** The most frames one baked SVG or one video may hold. The duration advice (12 s) is taste; this is a resource limit, and no acknowledgement waives it. */
export const MAX_FRAMES = 20000;

/**
 * @param {import("./scene.mjs").Scene} scene
 * @param {{ fps?: number, delay?: number, idPrefix?: string, style?: any, theme?: string, background?: boolean }} [options]
 *   idPrefix: prefix for the file's ids (default "mk-bake"); give each baked
 *   SVG inlined into one page its own.
 * @returns {string}
 */
export function bake(scene, options = {}) {
	const fps = options.fps ?? 15;
	const delay = options.delay ?? 0.3;
	const base = options.idPrefix ?? "mk-bake";
	const total = Math.ceil(scene.duration * fps);
	if (!Number.isFinite(total) || total > MAX_FRAMES) throw new Error(`bake: ${scene.duration} s at ${fps} fps is ${total} frames; the limit is ${MAX_FRAMES} (lower the fps or shorten the scene)`);
	/** @param {number} t @param {string} idPrefix */
	const render = (t, idPrefix) => renderSvg(scene, t, { ...options, standalone: true, idPrefix });
	const frames = [];
	for (let f = 0; f <= total; f++) {
		const t = Math.min(f / fps, scene.duration);
		const inner = innerOf(render(t, base));
		const last = frames[frames.length - 1];
		if (last && last.body === inner) last.end = t;
		else frames.push({ start: t, end: t, body: inner });
	}
	// Each slice lasts until the next one starts. Slices sit in one document,
	// so a scene that defines ids gets a prefix per slice.
	for (let i = 0; i < frames.length; i++) {
		if (i < frames.length - 1) frames[i].end = frames[i + 1].start;
		if (/\sid="/.test(frames[i].body)) frames[i].body = innerOf(render(frames[i].start, `${base}-${i + 1}`));
	}

	const full = render(scene.duration, base);
	const open = full.slice(0, full.indexOf(">") + 1);
	const head = full.slice(open.length, full.indexOf("</desc>") + "</desc>".length);
	const css = [
		"@keyframes mk-show{from{visibility:visible}to{visibility:hidden}}",
		"@keyframes mk-hold{from,to{visibility:visible}}",
		".mk-f{visibility:hidden;animation-timing-function:steps(1,end);animation-fill-mode:forwards}",
		"@media (prefers-reduced-motion: reduce){.mk-f{animation:none!important;visibility:hidden}.mk-last{visibility:visible}}",
	];
	const groups = frames.map((fr, i) => {
		const isLast = i === frames.length - 1;
		const name = isLast ? "mk-hold" : "mk-show";
		const dur = isLast ? 0.001 : fr.end - fr.start;
		const style = `animation-name:${name};animation-duration:${num(dur, 3)}s;animation-delay:${num(delay + fr.start, 3)}s`;
		return `<g class="mk-f${isLast ? " mk-last" : ""}" style="${style}">${fr.body}</g>`;
	});
	return `${open}${head}<style>${css.join("")}</style>${groups.join("")}</svg>`;
}

function innerOf(svg) {
	const start = svg.indexOf("</desc>") + "</desc>".length;
	return svg.slice(start, svg.lastIndexOf("</svg>"));
}

/** How many distinct frames a bake will contain (for size budgeting). */
export function bakeStats(svg) {
	return { frames: (svg.match(/class="mk-f/g) ?? []).length, bytes: svg.length };
}
