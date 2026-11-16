// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · live player (browser only).
 *
 *   mountPlayer(container, scene, options) → controller
 *
 * - Server/no-JS fallback: put the final frame in the container; the player
 *   replaces it on mount.
 * - Plays once when ~40 % visible, then holds the final frame.
 * - Always shows pause/play (WCAG 2.2.2), one button per step (jumps, no
 *   animation unless animateSteps is enabled), an optional scrubber, and captions.
 * - prefers-reduced-motion: final frame immediately, no autoplay, no play button.
 * - Keyboard: ←/→ previous/next step, Space play/pause, Home/End.
 * - Capture hook: controller.seek(t), and window.__motionKit[id] for renderers.
 *
 * The player owns the clock (requestAnimationFrame); scenes stay pure.
 */
import { cssVars, normalizeStyle } from "./style.mjs";
import { renderSvg, stepIndexAt } from "./scene.mjs";

const CSS = `
.mk-player{font-family:var(--mk-font);color:var(--mk-ink);background:transparent}
.mk-stage svg{display:block;width:100%;height:auto}
.mk-controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
.mk-btn{font:inherit;font-size:13px;line-height:1.2;padding:6px 10px;border-radius:8px;border:1px solid var(--mk-line);background:var(--mk-surface);color:var(--mk-ink);cursor:pointer}
.mk-btn[aria-current="step"]{background:var(--mk-accent);border-color:var(--mk-accent);color:var(--mk-onAccent)}
.mk-btn:focus-visible,.mk-scrub:focus-visible{outline:2px solid var(--mk-emphasis);outline-offset:2px}
.mk-play{min-width:72px}
.mk-scrub{flex:1 1 160px;accent-color:var(--mk-accent)}
.mk-caption{margin:8px 0 0;font-size:15px;line-height:1.45;color:var(--mk-muted);min-height:1.45em}
.mk-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;

const styledDocuments = new WeakSet();

/**
 * UI strings from `labels`: either a flat `{ play, pause, … }` object or a
 * dictionary keyed by locale (`{ en: {…}, nl: {…} }`). A dictionary resolves
 * `locale`, then its language subtag (`nl-BE` → `nl`), then `en`, then its
 * first entry; keys it lacks keep the English defaults.
 * @param {Record<string, string | Record<string, string>> | undefined} labels
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
 * Mount a scene with controls and a clock owned by this player.
 * @param {HTMLElement} container
 * @param {{ id: string, title: string, description: string, width: number, height: number, duration: number, steps: { at: number, label: string, detail?: string }[], frame: (t: number) => string }} scene
 * @param {{ style?: Parameters<typeof normalizeStyle>[0], labels?: Record<string, string | Record<string, string>>, locale?: string, theme?: string, id?: string, injectCss?: boolean, scrubber?: boolean, captions?: boolean, autoplay?: string, animateSteps?: boolean }} [options]
 * @returns The player controller; call destroy() before removing or replacing it.
 */
export function mountPlayer(container, scene, options = {}) {
	const style = normalizeStyle(options.style);
	const labels = { play: "Play", pause: "Pause", replay: "Replay", steps: "Steps", scrubber: "Timeline", ...resolveLabels(options.labels, options.locale) };
	const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
	/** @type {Document} */
	const doc = container.ownerDocument;

	if (!styledDocuments.has(doc) && options.injectCss !== false) {
		const s = doc.createElement("style");
		s.textContent = CSS;
		doc.head.appendChild(s);
		styledDocuments.add(doc);
	}

	const id = options.id ?? scene.id;
	container.classList.add("mk-player");
	const applyTheme = () => {
		const dark = options.theme === "dark" || (options.theme !== "light" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
		container.setAttribute("style", `${cssVars(style, dark ? "dark" : "light")};--mk-font:${style.font}`);
	};
	applyTheme();

	container.innerHTML = "";
	const stage = doc.createElement("div");
	stage.className = "mk-stage";
	stage.tabIndex = 0;
	stage.setAttribute("aria-label", scene.title);
	container.appendChild(stage);

	const controls = doc.createElement("div");
	controls.className = "mk-controls";
	controls.setAttribute("role", "group");
	controls.setAttribute("aria-label", scene.title);
	container.appendChild(controls);

	/** @type {HTMLButtonElement | null} */
	let playBtn = null;
	if (!reduced) {
		playBtn = doc.createElement("button");
		playBtn.type = "button";
		playBtn.className = "mk-btn mk-play";
		controls.appendChild(playBtn);
	}
	const stepBtns = scene.steps.map((s, i) => {
		const b = doc.createElement("button");
		b.type = "button";
		b.className = "mk-btn";
		b.textContent = `${i + 1}. ${s.label}`;
		b.addEventListener("click", () => selectStep(i));
		controls.appendChild(b);
		return b;
	});
	/** @type {HTMLInputElement | null} */
	let scrub = null;
	if (options.scrubber) {
		const input = doc.createElement("input");
		input.type = "range";
		input.className = "mk-scrub";
		input.min = "0";
		input.max = String(scene.duration);
		input.step = "0.01";
		input.setAttribute("aria-label", labels.scrubber);
		input.addEventListener("input", () => {
			pause();
			seek(Number(input.value));
		});
		controls.appendChild(input);
		scrub = input;
	}
	const caption = doc.createElement("p");
	caption.className = "mk-caption";
	caption.setAttribute("aria-hidden", "true");
	if (options.captions !== false) container.appendChild(caption);

	const sr = doc.createElement("ol");
	sr.className = "mk-sr";
	for (const s of scene.steps) {
		const li = doc.createElement("li");
		li.textContent = s.detail ? `${s.label}: ${s.detail}` : s.label;
		sr.appendChild(li);
	}
	container.appendChild(sr);

	// Keyboard step changes are announced; autoplay and pointer use stay silent.
	const live = doc.createElement("div");
	live.className = "mk-sr mk-live";
	live.setAttribute("role", "status");
	live.setAttribute("aria-live", "polite");
	live.setAttribute("aria-atomic", "true");
	container.appendChild(live);

	let t = 0;
	let playing = false;
	let raf = 0;
	let wallStart = 0;
	let tStart = 0;
	let stopAt = scene.duration;
	let autoplayPending = false;
	let destroyed = false;
	/** @type {IntersectionObserver | undefined} */
	let visibilityObserver;

	function draw() {
		stage.innerHTML = renderSvg(scene, t, { style, idPrefix: id, live: true });
		const idx = stepIndexAt(scene, t);
		stepBtns.forEach((b, i) => (i === idx ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
		caption.textContent = idx >= 0 ? (scene.steps[idx].detail ?? "") : "";
		if (scrub) scrub.value = String(t);
		if (playBtn) playBtn.textContent = playing ? labels.pause : t >= scene.duration ? labels.replay : labels.play;
	}
	function seek(time) {
		if (destroyed) return;
		playing = false;
		cancelAnimationFrame(raf);
		t = Math.min(Math.max(time, 0), scene.duration);
		draw();
	}
	function tick(now) {
		if (destroyed || !playing) return;
		t = Math.min(tStart + (now - wallStart) / 1000, stopAt);
		if (t >= stopAt) playing = false;
		draw();
		if (playing) raf = requestAnimationFrame(tick);
	}
	function play() {
		if (reduced || destroyed) return;
		if (t >= scene.duration) t = 0;
		start(scene.duration);
	}
	function start(target) {
		autoplayPending = false;
		visibilityObserver?.disconnect();
		stopAt = target;
		playing = true;
		tStart = t;
		wallStart = performance.now();
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);
	}
	function pause() {
		playing = false;
		cancelAnimationFrame(raf);
		if (!destroyed) draw();
	}
	playBtn?.addEventListener("click", () => (playing ? pause() : play()));
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
		live.textContent = `${i + 1}. ${s.detail ? `${s.label}: ${s.detail}` : s.label}`;
	}
	function seekStep(i) {
		autoplayPending = false;
		visibilityObserver?.disconnect();
		seek(stepTime(i));
	}
	/** @param {number} i */
	function stepTime(i) {
		if (!Number.isInteger(i) || i < 0 || i >= scene.steps.length) throw new RangeError(`Invalid step index: ${i}`);
		return scene.steps[i].at;
	}
	/** Play forward to an exact settled step; backward/reduced-motion calls jump. @param {number} i */
	function playToStep(i) {
		const target = stepTime(i);
		autoplayPending = false;
		visibilityObserver?.disconnect();
		if (destroyed) return;
		if (reduced || target <= t) seek(target);
		else start(target);
	}
	function selectStep(i) {
		options.animateSteps ? playToStep(i) : seekStep(i);
	}

	// Initial state: final frame (also what reduced motion and no-autoplay keep).
	seek(scene.duration);
	const autoplay = options.autoplay ?? "visible";
	if (!reduced && autoplay !== "none") {
		if (autoplay === "visible" && typeof IntersectionObserver === "function") {
			autoplayPending = true;
			visibilityObserver = new IntersectionObserver(
				(entries) => {
					if (autoplayPending && entries.some((e) => e.isIntersecting)) {
						autoplayPending = false;
						visibilityObserver?.disconnect();
						if (destroyed) return;
						seek(0);
						play();
					}
				},
				{ threshold: 0.4 },
			);
			visibilityObserver.observe(container);
		} else {
			seek(0);
			play();
		}
	}
	const themeQuery = typeof matchMedia === "function" && !options.theme ? matchMedia("(prefers-color-scheme: dark)") : null;
	themeQuery?.addEventListener?.("change", applyTheme);

	function destroy() {
		if (destroyed) return;
		destroyed = true;
		playing = false;
		cancelAnimationFrame(raf);
		visibilityObserver?.disconnect();
		themeQuery?.removeEventListener?.("change", applyTheme);
		if (g.__motionKit[id] === controller) delete g.__motionKit[id];
	}
	const controller = { seek, play, pause, seekStep, playToStep, destroy, get time() { return t; }, scene };
	const g = globalThis;
	g.__motionKit = g.__motionKit ?? {};
	g.__motionKit[id] = controller;
	return controller;
}
