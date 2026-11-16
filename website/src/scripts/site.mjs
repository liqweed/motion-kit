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
import { normalizeStyle } from "../../../runtime/style.mjs";
import { KIT } from "./kit.mjs";
import { STYLES } from "./catalog.mjs";
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

/** A site style as a runtime style object. @param {string} name */
export function styleFor(name) {
	const s = STYLES[name] ?? STYLES.studio;
	return normalizeStyle({ name: s.name, font: s.fontStack, light: s.light, dark: s.dark });
}

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

/**
 * Poll a controller for step changes. The runtime has no onStep event yet
 * (roadmap #9), so this reads controller.time; it stops when `stop()` is called.
 * @param {any} controller
 * @param {(index: number) => void} cb
 */
export function onStep(controller, cb) {
	let last = -2;
	let raf = 0;
	let on = true;
	const tick = () => {
		if (!on) return;
		const i = stepIndexAt(controller.scene, controller.time);
		if (i !== last) {
			last = i;
			cb(i);
		}
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);
	return () => {
		on = false;
		cancelAnimationFrame(raf);
	};
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
 * @param {{ label?: string, variant?: "dark" | "hero" | "" }} [o]
 */
export function commandBlock(cmd, { label = "Copy", variant = "" } = {}) {
	const btn = h("button", { type: "button", "aria-label": label }, "Copy");
	let timer = 0;
	btn.addEventListener("click", async () => {
		const ok = await copyText(cmd);
		btn.textContent = ok ? "Copied" : "Select + copy";
		clearTimeout(timer);
		timer = window.setTimeout(() => (btn.textContent = "Copy"), 1600);
	});
	return h("div", { class: `cmd ${variant}`.trim() }, h("pre", { tabindex: "0" }, h("code", null, cmd)), btn);
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
 * The pairs the gate's G12 checks (runtime/style.mjs checkContrast): [label, fg, bg, minimum].
 * @type {[string, string, string, number][]}
 */
export const CONTRAST_PAIRS = [
	["ink on bg", "ink", "bg", 4.5],
	["ink on surface", "ink", "surface", 4.5],
	["muted on bg", "muted", "bg", 4.5],
	["muted on surface", "muted", "surface", 4.5],
	["onAccent on accent", "onAccent", "accent", 4.5],
	["line on bg", "line", "bg", 3],
	["accent on bg", "accent", "bg", 3],
	["emphasis on bg", "emphasis", "bg", 3],
];
export const contrastOf = style.contrast;
export const contrastProblems = style.checkContrast;
