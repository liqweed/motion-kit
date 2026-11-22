// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · live player (browser; the markup helpers also run on servers).
 *
 *   mountPlayer(container, scene, options) → controller
 *   playerMarkup(scene, options) → the player's first state as HTML, for a server render
 *   themeCss(selector, style, theme?) → the style's tokens as CSS for a server render
 *   PLAYER_CSS → the player's stylesheet
 *
 * - Server/no-JS fallback: render playerMarkup into the container, with
 *   PLAYER_CSS (in a `<style data-mk-player-css>`) and themeCss. It is the
 *   same markup the player builds, with the controls inert, so the final frame,
 *   the step list and the colours are there without JavaScript, and mounting
 *   moves nothing. A plain final-frame SVG also works as a fallback.
 * - Plays once when ~40 % of the diagram, or of the viewport, shows, then
 *   holds the final frame. While the diagram is out of view or not rendered
 *   (display: none), the clock waits; it resumes where it stopped.
 * - Always shows pause/play (WCAG 2.2.2), one button per step (jumps, no
 *   animation unless animateSteps is enabled), an optional scrubber, and captions.
 *   Every control is at least 44 × 44 px; captions and the play button reserve
 *   their largest size, so playback does not move the page either.
 * - prefers-reduced-motion: final frame immediately, no autoplay, no play button.
 * - Keyboard on the stage (a named group, described by a hint): ←/→ previous/next
 *   step, Space play/pause, Home/End.
 * - Capture hook: controller.seek(t), and window.__motionKit[id] for renderers.
 * - Each frame updates the stage's SVG in place (runtime/patch.mjs): nodes that
 *   persist between frames are kept, only changed attributes and text are written.
 *
 * The player owns the clock (requestAnimationFrame); scenes stay pure.
 */
import { patchMarkup } from "./patch.mjs";
import { renderSvg, safeId, stepIndex, stepIndexAt } from "./scene.mjs";
import { cssVars, normalizeStyle, TOKENS } from "./style.mjs";
import { esc } from "./svg.mjs";

/** The player's stylesheet. Inject it yourself and pass `injectCss: false` to own it. */
export const PLAYER_CSS = `
.mk-player{font-family:var(--mk-font);color:var(--mk-ink);background:transparent}
.mk-stage svg{display:block;width:100%;height:auto}
.mk-stage:focus-visible,.mk-btn:focus-visible,.mk-scrub:focus-visible{outline:2px solid var(--mk-emphasis);outline-offset:2px}
.mk-controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
.mk-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:0;font:inherit;font-size:13px;line-height:1.2;padding:6px 12px;border-radius:8px;border:1px solid var(--mk-line);background:var(--mk-surface);color:var(--mk-ink);cursor:pointer}
.mk-btn[aria-current="step"]{background:var(--mk-accent);border-color:var(--mk-accent);color:var(--mk-onAccent)}
.mk-controls[inert] .mk-btn{cursor:default}
.mk-play{flex-direction:column;min-width:72px}
.mk-play>[aria-hidden]{display:block;height:0;overflow:hidden;visibility:hidden}
.mk-scrub{flex:1 1 160px;box-sizing:border-box;min-height:44px;margin:0;accent-color:var(--mk-accent)}
.mk-caption{display:grid;margin:8px 0 0;font-size:15px;line-height:1.45;color:var(--mk-muted);min-height:1.45em}
.mk-caption>span{grid-area:1/1;visibility:hidden}
.mk-caption>.mk-on{visibility:visible}
.mk-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){.mk-play{display:none}}
@media (scripting:none){.mk-play,.mk-scrub{display:none}}
`;

const CSS_MARK = "data-mk-player-css";
const DEFAULT_LABELS = Object.freeze({ play: "Play", pause: "Pause", replay: "Replay", steps: "Steps", scrubber: "Timeline", keys: "Use the arrow keys to move between steps." });
/** Autoplay starts once this share of the diagram, or of the viewport, shows. */
const SHOWN = 0.4;
// Consecutive thresholds differ by at most 2.5×, so a diagram of any height
// reports a ratio between "fills 40 % of the viewport" and "fills all of it".
const THRESHOLDS = [0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1];

let instances = 0;

/** @type {WeakMap<HTMLElement, { destroy: () => void }>} */
const mounted = new WeakMap();

/** @import { Scene } from "./scene.mjs" */
/**
 * @typedef {Record<string, string | Record<string, string>>} Labels
 * @typedef {{ style?: any, labels?: Labels, locale?: string, theme?: string, id?: string, injectCss?: boolean, scrubber?: boolean, captions?: boolean, autoplay?: string, animateSteps?: boolean }} PlayerOptions
 */

/**
 * UI strings from `labels`: either a flat `{ play, pause, … }` object or a
 * dictionary keyed by locale (`{ en: {…}, nl: {…} }`). A dictionary resolves
 * `locale`, then its language subtag (`nl-BE` → `nl`), then `en`, then its
 * first entry; keys it lacks keep the English defaults.
 * @param {Labels | undefined} labels
 * @param {string} [locale]
 * @returns {Record<string, string>}
 */
export function resolveLabels(labels, locale = "en") {
	if (!labels) return {};
	const entries = Object.entries(labels);
	if (!entries.some(([, v]) => typeof v === "object" && v !== null)) return /** @type {Record<string, string>} */ (labels);
	const dict = /** @type {Record<string, Record<string, string>>} */ (labels);
	return dict[locale] ?? dict[locale.split("-")[0]] ?? dict.en ?? /** @type {Record<string, string>} */ (entries.find(([, v]) => typeof v === "object")?.[1]) ?? {};
}

/**
 * The style's token values as CSS custom properties on `selector`: one theme
 * when `theme` is "light" or "dark", else light with a dark override under
 * `prefers-color-scheme: dark`. For server renders, so colours show before
 * (and without) JavaScript; the mounted player sets the same values inline.
 * @param {string} selector
 * @param {any} style
 * @param {string} [theme]
 * @returns {string}
 */
export function themeCss(selector, style, theme) {
	const s = normalizeStyle(style);
	/** @param {string} t */
	const rule = (t) => `${selector}{${cssVars(s, t)};--mk-font:${s.font}}`;
	return theme === "light" || theme === "dark" ? rule(theme) : `${rule("light")}@media (prefers-color-scheme:dark){${rule("dark")}}`;
}

/* ------------------------------------------------------------- the markup */

/**
 * One element of the player's markup. `content` is text, trusted markup
 * (`{ html }`) or child elements; `ref` names it for the live player.
 * @typedef {{ tag: string, attrs: Record<string, string | undefined>, content?: string | { html: string } | (ViewNode | false | undefined)[], ref?: string }} ViewNode
 */

/**
 * @param {string} tag
 * @param {Record<string, string | undefined>} attrs
 * @param {ViewNode["content"]} [content]
 * @param {string} [ref]
 * @returns {ViewNode}
 */
const h = (tag, attrs, content, ref) => ({ tag, attrs, content, ref });

/**
 * The player's elements in their first state: the final frame, the last step
 * current, the play button offering a replay.
 * @param {Scene} scene
 * @param {{ labels: Record<string, string>, prefix: string, svg: string, scrubber?: boolean, captions?: boolean, playButton: boolean, inert: boolean }} o
 * @returns {(ViewNode | false | undefined)[]}
 */
function view(scene, o) {
	const { labels, prefix } = o;
	const last = scene.steps.length - 1;
	// Before mount (inert) the stage takes no focus and promises no keys.
	const keys = o.inert ? undefined : `${prefix}-keys`;
	return [
		h("div", { class: "mk-stage", tabindex: o.inert ? undefined : "0", role: "group", "aria-label": scene.title, "aria-describedby": keys }, { html: o.svg }, "stage"),
		h("div", { class: "mk-controls", role: "group", "aria-label": labels.steps, inert: o.inert ? "" : undefined }, [
			o.playButton &&
				h("button", { type: "button", class: "mk-btn mk-play" }, [
					h("span", {}, labels.replay, "playLabel"),
					// Hidden copies of every label reserve the widest one.
					...[labels.play, labels.pause, labels.replay].map((l) => h("span", { "aria-hidden": "true" }, l)),
				], "play"),
			...scene.steps.map((s, i) => h("button", { type: "button", class: "mk-btn", "aria-current": i === last ? "step" : undefined }, `${i + 1}. ${s.label}`, "steps[]")),
			o.scrubber && h("input", { type: "range", class: "mk-scrub", min: "0", max: String(scene.duration), step: "0.01", value: String(scene.duration), "aria-label": labels.scrubber }, undefined, "scrub"),
		]),
		// Every detail is laid out in one grid cell, so the caption keeps the height of the longest.
		o.captions !== false && h("p", { class: "mk-caption", "aria-hidden": "true" }, scene.steps.map((s, i) => h("span", { class: i === last ? "mk-on" : undefined }, s.detail ?? "", "captions[]"))),
		h("ol", { class: "mk-sr" }, scene.steps.map((s) => h("li", {}, s.detail ? `${s.label}: ${s.detail}` : s.label))),
		!o.inert && h("p", { id: keys, class: "mk-sr" }, labels.keys),
		// Keyboard step changes are announced; autoplay and pointer use stay silent.
		h("div", { class: "mk-sr mk-live", role: "status", "aria-live": "polite", "aria-atomic": "true" }, "", "live"),
	];
}

/** @param {ViewNode | false | undefined} node @returns {string} */
function toHtml(node) {
	if (!node) return "";
	const attrs = Object.entries(node.attrs)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${esc(v)}"`))
		.join("");
	if (node.tag === "input") return `<input${attrs}>`;
	const c = node.content;
	const inner = typeof c === "string" ? esc(c) : Array.isArray(c) ? c.map(toHtml).join("") : (c?.html ?? "");
	return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

/**
 * @param {Document} doc
 * @param {ViewNode} node
 * @param {Record<string, any>} refs
 * @returns {HTMLElement}
 */
function toDom(doc, node, refs) {
	const el = doc.createElement(node.tag);
	for (const [k, v] of Object.entries(node.attrs)) if (v !== undefined) el.setAttribute(k, v);
	const c = node.content;
	if (typeof c === "string") el.textContent = c;
	else if (Array.isArray(c)) {
		for (const child of c) if (child) el.appendChild(toDom(doc, child, refs));
	} else if (c) el.innerHTML = c.html;
	if (node.ref?.endsWith("[]")) (refs[node.ref.slice(0, -2)] ??= []).push(el);
	else if (node.ref) refs[node.ref] = el;
	return el;
}

/**
 * Resolve what both the server render and the live player need.
 * @param {Scene} scene
 * @param {PlayerOptions} options
 * @param {string} prefix
 */
function setup(scene, options, prefix) {
	const style = normalizeStyle(options.style);
	const labels = { ...DEFAULT_LABELS, ...resolveLabels(options.labels, options.locale) };
	const svg = renderSvg(scene, scene.duration, { style, idPrefix: prefix, live: true });
	return { style, labels, svg };
}

/**
 * The player's first state (final frame, controls, caption, step list) as
 * HTML: put it inside a container with the class `mk-player`, beside
 * PLAYER_CSS and themeCss. Until the player mounts, the controls are inert and
 * the stage takes no focus; the player replaces the markup with live controls
 * of the same size, so nothing moves.
 * The play button stays out of view under reduced motion and without scripting.
 * Pass the same options as to mountPlayer, including `id`, which is the id
 * prefix and must be unique on the page.
 * @param {Scene} scene
 * @param {PlayerOptions & { id: string }} options
 * @returns {string}
 */
export function playerMarkup(scene, options) {
	const prefix = safeId(options.id);
	const { labels, svg } = setup(scene, options, prefix);
	return view(scene, { labels, prefix, svg, scrubber: options.scrubber, captions: options.captions, playButton: true, inert: true }).map(toHtml).join("");
}

/** Add the player stylesheet unless the document has one (a page swap may have removed an earlier copy). @param {Document} doc */
function ensureStyle(doc) {
	if (doc.querySelector(`style[${CSS_MARK}]`)) return;
	const s = doc.createElement("style");
	s.setAttribute(CSS_MARK, "");
	s.textContent = PLAYER_CSS;
	doc.head.appendChild(s);
}

/* ------------------------------------------------------------- the player */

/**
 * Mount a scene with controls and a clock owned by this player.
 * @param {HTMLElement} container
 * @param {Scene} scene
 * @param {PlayerOptions} [options]
 *   `id`: the capture-hook key and the prefix of every id the player renders;
 *   unique on the page. Default: the hook key is scene.id, the prefix is
 *   scene.id plus a per-page counter.
 * @returns The player controller; call destroy() before removing or replacing it.
 */
export function mountPlayer(container, scene, options = {}) {
	const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
	/** @type {Document} */
	const doc = container.ownerDocument;
	if (options.injectCss !== false) ensureStyle(doc);

	// One player per container: mounting again releases the previous one.
	mounted.get(container)?.destroy();
	const id = options.id ?? scene.id;
	const prefix = safeId(options.id ?? `${scene.id}-${++instances}`);
	const { style, labels } = setup(scene, options, prefix);
	container.classList.add("mk-player");
	// Set each token as its own property: CSS the page put on the container stays.
	const applyTheme = () => {
		const dark = options.theme === "dark" || (options.theme !== "light" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
		const theme = dark ? "dark" : "light";
		for (const token of TOKENS) container.style.setProperty(`--mk-${token}`, style[theme][token]);
		container.style.setProperty("--mk-font", style.font);
	};
	applyTheme();

	container.innerHTML = "";
	/** @type {{ stage: HTMLElement, play?: HTMLButtonElement, playLabel?: HTMLElement, steps: HTMLButtonElement[], scrub?: HTMLInputElement, captions?: HTMLElement[], live: HTMLElement }} */
	const ui = /** @type {any} */ ({});
	const nodes = view(scene, { labels, prefix, svg: "", scrubber: options.scrubber, captions: options.captions, playButton: !reduced, inert: false });
	for (const node of nodes) if (node) container.appendChild(toDom(doc, node, ui));
	const { stage, live } = ui;

	/** @type {Set<(index: number) => void>} */
	const stepListeners = new Set();
	let lastStep = -2;
	// Bumped on every published step change, so a dispatch knows a newer one ran even
	// when nested seeks came back to its own step.
	let publication = 0;
	let t = 0;
	let playing = false;
	let raf = 0;
	let wallStart = 0;
	let tStart = 0;
	let stopAt = scene.duration;
	let autoplayPending = false;
	let destroyed = false;
	let liveRaf = 0;
	// Last visibility the observer reported; until it reports, assume in view.
	let inView = true;
	// Playing, but out of view: the clock waits for the diagram to show again.
	let suspended = false;
	/** @type {IntersectionObserver | undefined} */
	let visibilityObserver;

	/** @param {unknown} e */
	function reportListenerError(e) {
		if (typeof reportError === "function") reportError(e);
		else queueMicrotask(() => { throw e; });
	}
	function draw() {
		// In place: nodes that persist keep their identity, only what changed is written.
		patchMarkup(stage, renderSvg(scene, t, { style, idPrefix: prefix, live: true }));
		const idx = stepIndexAt(scene, t);
		ui.steps.forEach((b, i) => (i === idx ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
		ui.captions?.forEach((c, i) => (i === idx ? c.setAttribute("class", "mk-on") : c.removeAttribute("class")));
		if (ui.scrub) ui.scrub.value = String(t);
		if (ui.playLabel) ui.playLabel.textContent = playing ? labels.pause : t >= scene.duration ? labels.replay : labels.play;
		if (idx !== lastStep) {
			lastStep = idx;
			const mine = ++publication;
			// One throwing listener must not skip the rest or stop the clock: report it
			// out of band (reportError, else a rethrow on a microtask) and carry on.
			for (const listener of [...stepListeners]) {
				// A listener may destroy the player, or seek: a nested draw has then already
				// told everyone about the newer step, so this stale dispatch ends.
				if (destroyed || publication !== mine) break;
				try { listener(idx); } catch (e) { reportListenerError(e); }
			}
		}
	}
	/** @param {number} time */
	function seek(time) {
		if (destroyed) return;
		if (!Number.isFinite(time)) throw new RangeError("seek time must be finite");
		autoplayPending = false;
		playing = false;
		suspended = false;
		cancelAnimationFrame(raf);
		t = Math.min(Math.max(time, 0), scene.duration);
		draw();
	}
	/** @param {number} now */
	function tick(now) {
		if (destroyed || !playing || suspended) return;
		t = Math.min(tStart + (now - wallStart) / 1000, stopAt);
		if (t >= stopAt) playing = false;
		draw();
		if (playing) raf = requestAnimationFrame(tick);
	}
	/** Run the clock from the current time (or wait, while out of view). */
	function run() {
		cancelAnimationFrame(raf);
		suspended = !inView;
		if (suspended) return;
		tStart = t;
		wallStart = performance.now();
		raf = requestAnimationFrame(tick);
	}
	function play() {
		if (reduced || destroyed) return;
		if (t >= scene.duration) t = 0;
		start(scene.duration);
	}
	/** @param {number} target */
	function start(target) {
		autoplayPending = false;
		stopAt = target;
		playing = true;
		run();
	}
	function pause() {
		playing = false;
		suspended = false;
		cancelAnimationFrame(raf);
		if (!destroyed) draw();
	}
	ui.play?.addEventListener("click", () => (playing ? pause() : play()));
	ui.steps.forEach((b, i) => b.addEventListener("click", () => selectStep(i)));
	ui.scrub?.addEventListener("input", () => {
		pause();
		seek(Number(ui.scrub?.value));
	});
	stage.addEventListener("keydown", (e) => {
		const idx = stepIndexAt(scene, t);
		/** @param {number} i */
		const step = (i) => {
			selectStep(i);
			announce(i);
		};
		if (e.key === "ArrowRight") step(Math.min(idx + 1, scene.steps.length - 1));
		else if (e.key === "ArrowLeft") step(Math.max(idx - 1, 0));
		else if (e.key === "Home") step(0);
		else if (e.key === "End") step(scene.steps.length - 1);
		else if (e.key === " " && !reduced) playing ? pause() : play();
		else return;
		e.preventDefault();
	});
	/** @param {number} i */
	function announce(i) {
		const s = scene.steps[i];
		const text = `${i + 1}. ${s.detail ? `${s.label}: ${s.detail}` : s.label}`;
		cancelAnimationFrame(liveRaf);
		liveRaf = 0;
		if (live.textContent !== text) {
			live.textContent = text;
			return;
		}
		// Identical text may be coalesced by screen readers: clear now, rewrite next frame.
		live.textContent = "";
		liveRaf = requestAnimationFrame(() => {
			liveRaf = 0;
			if (!destroyed) live.textContent = text;
		});
	}
	/** Jump to a step, by index or by step id. @param {number | string} ref */
	function seekStep(ref) {
		const target = scene.steps[stepIndex(scene, ref)].at;
		autoplayPending = false;
		seek(target);
	}
	/** Play forward to a settled step, by index or by step id; backward/reduced-motion calls jump. @param {number | string} ref */
	function playToStep(ref) {
		const target = scene.steps[stepIndex(scene, ref)].at;
		autoplayPending = false;
		if (destroyed) return;
		if (reduced || target <= t) seek(target);
		else start(target);
	}
	/** @param {number} i */
	function selectStep(i) {
		options.animateSteps ? playToStep(i) : seekStep(i);
	}
	/** @param {IntersectionObserverEntry} e */
	function shown(e) {
		if (!e.isIntersecting) return false;
		if (e.intersectionRatio >= SHOWN) return true;
		const viewport = e.rootBounds?.height;
		return Boolean(viewport) && e.intersectionRect.height >= SHOWN * /** @type {number} */ (viewport);
	}
	/** @param {IntersectionObserverEntry[]} entries */
	function onVisibility(entries) {
		const e = entries[entries.length - 1];
		if (destroyed || !e) return;
		inView = e.isIntersecting;
		if (!inView) {
			if (playing && !suspended) {
				cancelAnimationFrame(raf);
				suspended = true;
			}
			return;
		}
		if (playing && suspended) run();
		if (autoplayPending && shown(e)) {
			autoplayPending = false;
			seek(0);
			play();
		}
	}

	// Initial state: final frame (also what reduced motion and no-autoplay keep).
	seek(scene.duration);
	const autoplay = options.autoplay ?? "visible";
	if (!reduced) {
		if (typeof IntersectionObserver === "function") {
			autoplayPending = autoplay === "visible";
			visibilityObserver = new IntersectionObserver(onVisibility, { threshold: THRESHOLDS });
			visibilityObserver.observe(container);
		}
		if (autoplay !== "none" && !autoplayPending) {
			seek(0);
			play();
		}
	}
	const themeQuery = typeof matchMedia === "function" && !options.theme ? matchMedia("(prefers-color-scheme: dark)") : null;
	themeQuery?.addEventListener?.("change", applyTheme);

	/**
	 * Subscribe to settled-step changes (including -1 before the first).
	 * Calls immediately with the current index, then once per changed index
	 * from playback, seeking or controls. Unsubscribe or destroy to release.
	 * @param {(index: number) => void} listener
	 * @returns {() => void}
	 */
	function onStep(listener) {
		if (destroyed) return () => {};
		stepListeners.add(listener);
		listener(stepIndexAt(scene, t));
		return () => { stepListeners.delete(listener); };
	}
	function destroy() {
		if (destroyed) return;
		destroyed = true;
		autoplayPending = false;
		stepListeners.clear();
		if (mounted.get(container) === controller) mounted.delete(container);
		playing = false;
		cancelAnimationFrame(raf);
		cancelAnimationFrame(liveRaf);
		visibilityObserver?.disconnect();
		themeQuery?.removeEventListener?.("change", applyTheme);
		if (g.__motionKit[id] === controller) delete g.__motionKit[id];
	}
	const controller = { seek, play, pause, seekStep, playToStep, onStep, destroy, get time() { return t; }, get playing() { return playing; }, get autoplayPending() { return autoplayPending; }, scene };
	const g = /** @type {any} */ (globalThis);
	g.__motionKit = g.__motionKit ?? {};
	g.__motionKit[id] = controller;
	mounted.set(container, controller);
	return controller;
}
