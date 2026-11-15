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

export function bake(scene, options = {}) {
	const fps = options.fps ?? 15;
	const delay = options.delay ?? 0.3;
	const total = Math.ceil(scene.duration * fps);
	const frames = [];
	for (let f = 0; f <= total; f++) {
		const t = Math.min(f / fps, scene.duration);
		const inner = innerOf(renderSvg(scene, t, { ...options, standalone: true, idPrefix: "mk-bake" }));
		const last = frames[frames.length - 1];
		if (last && last.body === inner) last.end = t;
		else frames.push({ start: t, end: t, body: inner });
	}
	// Each slice lasts until the next one starts.
	for (let i = 0; i < frames.length - 1; i++) frames[i].end = frames[i + 1].start;

	const full = renderSvg(scene, scene.duration, { ...options, standalone: true, idPrefix: "mk-bake" });
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
