// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · shared site code (browser only).
 *
 * Three primitives carry the chrome: commandBlock (every copyable command),
 * chipGroup (every switch) and the badge markup in the page modules. The
 * diagrams themselves are the unmodified runtime: mountPlayer, createScene,
 * renderSvg. Nothing here animates; the player owns the clock.
 */
import { mountPlayer } from "../../../runtime/player.mjs";
import { createScene } from "../../../runtime/types/index.mjs";
import { renderSvg, stepIndexAt } from "../../../runtime/scene.mjs";
import { KIT } from "./kit.mjs";
import * as scene from "../../../runtime/scene.mjs";
import * as style from "../../../runtime/style.mjs";


/** @type {(sel: string, root?: ParentNode) => any} */
export const $ = (sel, root = document) => root.querySelector(sel);
/** @type {(sel: string, root?: ParentNode) => any[]} */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Tiny element builder: h("a", { href, class }, "text", child…).
 * `on*` attributes are listeners; `false`/null attributes are skipped.
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs]
 * @param {...any} kids
 * @returns {any}
 */
export function h(tag, attrs, ...kids) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs ?? {})) {
		if (v === false || v == null) continue;
		if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
		else if (k === "html") el.innerHTML = v;
		else if (k === "class") el.className = v;
		else el.setAttribute(k, v === true ? "" : String(v));
	}
	for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
	return el;
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const prefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Site theme: ?theme=light|dark overrides the OS setting (handy for review). */
export function applyThemeParam() {
	const t = new URLSearchParams(location.search).get("theme");
	if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
}
export function siteTheme() {
	const t = document.documentElement.dataset.theme;
	return t === "light" || t === "dark" ? t : prefersDark() ? "dark" : "light";
}

/* ----------------------------------------------------------------- scenes */

/**
 * Repo files are bundled by Vite: specs and sources as raw text, custom scene
 * modules as lazy chunks. Keys are paths relative to this file.
 */
const raw = import.meta.glob(["../../../examples/*", "../../../brand/*.mjs"], { query: "?raw", import: "default" });
const modules = import.meta.glob(["../../../examples/*.scene.mjs", "../../../brand/*.scene.mjs"]);
const key = (file) => `../../../${file}`;

/** Source text of a repo file, e.g. "examples/order-flow.json". @param {string} file @returns {Promise<string>} */
export async function fetchText(file) {
	const load = raw[key(file)];
	if (!load) throw new Error(`${file}: not bundled`);
	return /** @type {string} */ (await load());
}

/**
 * Build a live example in one format and locale. Throws when the scene is not
 * built for that combination (the gate's G13), which callers show as such.
 * @param {import("./catalog.mjs").LiveExample} entry
 * @param {{ format?: string, locale?: string }} [opts]
 */
export async function loadScene(entry, { format = "wide", locale = "en" } = {}) {
	if (entry.kind === "spec") return createScene(JSON.parse(await fetchText(entry.file)), { format, locale });
	const load = modules[key(entry.file)];
	if (!load) throw new Error(`${entry.file}: not bundled`);
	const mod = /** @type {any} */ (await load());
	return scene.validateScene(mod.default({ format, locale, kit: KIT }));
}

export { styleFor } from "./site-style.mjs";

/**
 * Standalone SVG markup of one settled frame (what a slide would get).
 * @param {any} sc
 * @param {number} t
 * @param {{ style?: any, theme?: "light" | "dark", background?: boolean }} [o]
 */
export function frameMarkup(sc, t, { style: st, theme = "light", background = true } = {}) {
	return renderSvg(sc, t, { standalone: true, style: st, theme, background, idPrefix: `f${++frameCount}` });
}
let frameCount = 0;

/* ---------------------------------------------------------------- players */

let playerCount = 0;
/** Theme to pass a player: the explicit ?theme= override, else undefined (follow the OS). */
export const themeOpt = () => (document.documentElement.dataset.theme === "light" || document.documentElement.dataset.theme === "dark" ? document.documentElement.dataset.theme : undefined);

/** Subscribe to the runtime's step notifications. */
export function onStep(controller, cb) {
	return controller.onStep(cb);
}

/**
 * Mount the runtime player. `mini` swaps the full control row for a compact
 * play + numbered-steps bar (the player's own controls stay for everything else).
 * @param {HTMLElement} el
 * @param {any} sc
 * @param {{ style?: any, theme?: "light" | "dark", autoplay?: "visible" | "none" | "now", mini?: boolean, scrubber?: boolean, captions?: boolean, controls?: boolean }} [o]
 */
export function mount(el, sc, { style: st, theme, autoplay = "visible", mini = false, scrubber = false, captions = true, controls = true } = {}) {
	el.classList.toggle("mk-mini", mini);
	el.classList.toggle("mk-hide-controls", !controls && !mini);
	// A page can hold several players of one scene; ids must stay unique.
	const c = mountPlayer(el, sc, { id: `${sc.id}-${++playerCount}`, style: st, theme, autoplay, scrubber, captions: mini ? false : captions });
	if (!mini) return { controller: c, bar: null };
	const bar = h("div", { class: "mini-bar", role: "group", "aria-label": sc.title });
	const cap = h("p", { class: "mini-cap", "aria-live": "off" });
	const steps = sc.steps.map((s, i) => h("button", { type: "button", "aria-label": `Step ${i + 1}: ${s.label}`, onClick: () => c.seekStep(i) }, String(i + 1)));
	if (!reducedMotion()) {
		bar.append(h("button", { type: "button", class: "play", "aria-label": "Play", onClick: () => { c.seek(0); c.play(); } }, "▶"));
	}
	bar.append(...steps);
	el.after(bar, cap);
	onStep(c, (i) => {
		steps.forEach((b, j) => (j === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
		cap.textContent = i >= 0 ? `${sc.steps[i].label}${sc.steps[i].detail ? ` — ${sc.steps[i].detail}` : ""}` : "";
	});
	return { controller: c, bar };
}

/** Shown where a scene cannot be built (never crash a page for one card). */
export function failNote(el, err) {
	el.replaceChildren(h("p", { class: "player-fallback" }, err instanceof Error ? err.message : String(err)));
}

/* -------------------------------------------------------------- primitives */

export async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * Every copyable command on the site: one style, one copy button.
 * @param {string} cmd
 * @param {{ label?: string }} [o]
 */
export function commandBlock(cmd, { label = "Copy" } = {}) {
	const btn = h("button", { type: "button", class: "copy", "aria-label": label }, "Copy");
	let timer = 0;
	btn.addEventListener("click", async () => {
		const ok = await copyText(cmd);
		btn.textContent = ok ? "Copied" : "Select + copy";
		clearTimeout(timer);
		timer = window.setTimeout(() => (btn.textContent = "Copy"), 1600);
	});
	return h("div", { class: "cmd" }, h("pre", { tabindex: "0" }, h("code", null, cmd)), btn);
}

/**
 * Every switch on the site: style, defect, filter, format, locale, theme.
 * Arrow keys move and select, like a native radio group.
 * @param {{ label: string, options: { value: string, label: string, hint?: string, content?: any[] }[], value: string, onChange: (v: string) => void, className?: string, showLabel?: boolean }} o
 */
export function chipGroup({ label, options, value, onChange, className = "chip", showLabel = true }) {
	const root = h("div", { class: "group", role: "radiogroup", "aria-label": label });
	if (showLabel) root.append(h("span", { class: "label" }, label));
	const buttons = options.map((o) => {
		const b = h("button", { type: "button", role: "radio", class: className, "data-value": o.value }, ...(o.content ?? [o.label, o.hint ? h("small", null, o.hint) : null]));
		b.addEventListener("click", () => select(o.value));
		return b;
	});
	root.append(...buttons);
	const paint = (v) =>
		buttons.forEach((b) => {
			const on = b.dataset.value === v;
			b.setAttribute("aria-checked", String(on));
			b.tabIndex = on ? 0 : -1;
		});
	function select(v, focus = false) {
		value = v;
		paint(v);
		if (focus) buttons.find((b) => b.dataset.value === v)?.focus();
		onChange(v);
	}
	root.addEventListener("keydown", (e) => {
		const i = options.findIndex((o) => o.value === value);
		const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
		if (!next) return;
		e.preventDefault();
		select(options[(i + next + options.length) % options.length].value, true);
	});
	paint(value);
	return Object.assign(root, { set: (/** @type {string} */ v) => { value = v; paint(v); } });
}

/* ----------------------------------------------------------------- figures */

/**
 * The step squares in a plate's header: done, now, still to come.
 * @param {Element | null} el the `[data-progress]` element
 * @param {number} index current step, -1 before the first
 * @param {number} total
 */
export function paintProgress(el, index, total) {
	if (!el) return;
	el.replaceChildren(...Array.from({ length: total }, (_, i) => h("i", { class: i < index ? "done" : i === index ? "now" : "" })));
}

/**
 * Number the controls under a mounted player, as the Module design numbers a
 * figure: a square per control (leader down from it), keyed to a legend. The
 * leaders draw once, one at a time, after the scene has settled (the design's one
 * motion moment); under reduced motion, or without scripts, they are simply there.
 * @param {HTMLElement} root the player container
 * @param {any} controller
 * @param {{ legend: HTMLElement, callouts: HTMLElement, plate: HTMLElement }} into
 * @returns {() => void} stop
 */
export function keyControls(root, controller, { legend, callouts, plate }) {
	const visible = (/** @type {Element | null} */ e) => !!e && /** @type {HTMLElement} */ (e).offsetParent !== null;
	const play = root.querySelector(".mk-play");
	const steps = [...root.querySelectorAll(".mk-btn:not(.mk-play)")];
	const caption = root.querySelector(".mk-caption");
	/** @type {{ label: string, els: Element[] }[]} */
	const parts = [
		{ label: "Play and pause", els: visible(play) && play ? [play] : [] },
		{ label: "Steps, one button each", els: steps },
		{ label: "Caption", els: caption ? [caption] : [] },
	].filter((p) => p.els.length);
	legend.replaceChildren(...parts.map((p, i) => h("li", null, h("span", { class: "mark", "aria-hidden": "true" }, String(i + 1)), p.label)));
	const place = () => {
		const box = callouts.getBoundingClientRect();
		callouts.replaceChildren(
			...parts.map((p, i) => {
				const rects = p.els.map((e) => e.getBoundingClientRect());
				const left = Math.min(...rects.map((r) => r.left));
				const right = Math.max(...rects.map((r) => r.right));
				// The caption spans the row, so its marker sits three quarters along, clear of the steps'.
				const at = p.els[0] === caption ? left + (right - left) * 0.75 : (left + right) / 2;
				const x = Math.min(Math.max(at - box.left, 12), box.width - 12);
				return h("div", { class: "callout", style: `left:${x}px;--n:${i}` }, h("span", { class: "leader" }), h("span", { class: "mark" }, String(i + 1)));
			}),
		);
	};
	place();
	const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
	ro?.observe(callouts);
	ro?.observe(root); // the controls' own boxes supply the coordinates, so a reflow of the player moves the leaders too
	// A late web font changes button widths and row wrapping without resizing the strip.
	document.fonts?.ready.then(() => !off.signal.aborted && place());
	let timer = 0;
	let raf = 0;
	// The leaders belong to the layout that shows them: a hidden one neither arms nor draws them.
	let drawn = !visible(callouts);
	const draw = () => {
		if (drawn) return;
		drawn = true;
		cancelAnimationFrame(raf);
		plate.classList.add("leaders-draw");
	};
	const off = new AbortController();
	// A shared plate may still carry the armed class from a layout that was torn down, so reduced motion shows the final state outright.
	// A player restored already settled (a handoff after the scene finished) has nothing left to wait for either.
	const settled = !controller.playing && !controller.autoplayPending && controller.time >= controller.scene.duration - 0.02;
	if (!drawn && reducedMotion()) draw();
	if (!drawn && !reducedMotion() && !plate.classList.contains("leaders-draw")) {
		plate.classList.add("leaders-armed");
		// The player rests on its final frame until autoplay starts, so only a playback that has begun can end.
		let started = false;
		const watch = () => {
			if (drawn) return;
			const end = controller.scene.duration - 0.02;
			if (!started && (controller.playing || controller.time < end)) started = true;
			if (started && controller.time >= end) return draw();
			raf = requestAnimationFrame(watch);
		};
		// A player restored already settled has nothing to wait for: draw on the second frame, so the armed state is painted first and the leaders still animate.
		raf = requestAnimationFrame(settled ? () => (raf = requestAnimationFrame(draw)) : watch);
		timer = window.setTimeout(draw, (controller.scene.duration + 4) * 1000); // a paused or hidden player still gets its leaders
		// Turning reduced motion on later shows the leaders at once rather than leaving them hidden.
		matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => e.matches && draw(), { signal: off.signal });
		root.addEventListener("pointerdown", draw, { once: true, signal: off.signal });
		root.addEventListener("keydown", draw, { once: true, signal: off.signal });
	}
	return () => {
		off.abort();
		ro?.disconnect();
		cancelAnimationFrame(raf);
		clearTimeout(timer);
	};
}

/* ------------------------------------------------------------ page setup */

/** Header, footer and the logo are rendered by Astro at build time; this applies ?theme= and wires copy buttons. */
export function initPage() {
	applyThemeParam();
	wireCopyButtons();
}

/** Progressive enhancement for server-rendered command blocks: <button data-copy="…">. */
export function wireCopyButtons(root = document) {
	for (const btn of $$("button[data-copy]", root)) {
		let timer = 0;
		btn.addEventListener("click", async () => {
			const ok = await copyText(btn.dataset.copy ?? "");
			btn.textContent = ok ? "Copied" : "Select + copy";
			clearTimeout(timer);
			timer = window.setTimeout(() => (btn.textContent = "Copy"), 1600);
		});
	}
}

/**
 * The pairs the gate's G12 checks (runtime/style.mjs CONTRAST_PAIRS): [label, fg, bg, minimum].
 * @type {[string, string, string, number][]}
 */
export const CONTRAST_PAIRS = style.CONTRAST_PAIRS.map((p) => [`${p.fg} on ${p.bg}`, p.fg, p.bg, p.min]);
export const contrastOf = style.contrast;
export const contrastProblems = style.checkContrast;
