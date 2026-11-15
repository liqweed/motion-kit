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
 *   animation), an optional scrubber, and the active step's detail as caption.
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

let styleInjected = false;

export function mountPlayer(container, scene, options = {}) {
	const style = normalizeStyle(options.style);
	const labels = { play: "Play", pause: "Pause", replay: "Replay", steps: "Steps", ...(options.labels ?? {}) };
	const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
	const doc = container.ownerDocument;

	if (!styleInjected && options.injectCss !== false) {
		const s = doc.createElement("style");
		s.textContent = CSS;
		doc.head.appendChild(s);
		styleInjected = true;
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
		b.addEventListener("click", () => {
			pause();
			seek(s.at);
		});
		controls.appendChild(b);
		return b;
	});
	let scrub = null;
	if (options.scrubber) {
		scrub = doc.createElement("input");
		scrub.type = "range";
		scrub.className = "mk-scrub";
		scrub.min = "0";
		scrub.max = String(scene.duration);
		scrub.step = "0.01";
		scrub.setAttribute("aria-label", options.labels?.scrubber ?? "Timeline");
		scrub.addEventListener("input", () => {
			pause();
			seek(Number(scrub.value));
		});
		controls.appendChild(scrub);
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

	let t = 0;
	let playing = false;
	let raf = 0;
	let wallStart = 0;
	let tStart = 0;

	function draw() {
		stage.innerHTML = renderSvg(scene, t, { style, idPrefix: id, live: true });
		const idx = stepIndexAt(scene, t);
		stepBtns.forEach((b, i) => (i === idx ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
		caption.textContent = idx >= 0 ? (scene.steps[idx].detail ?? "") : "";
		if (scrub) scrub.value = String(t);
		if (playBtn) playBtn.textContent = playing ? labels.pause : t >= scene.duration ? labels.replay : labels.play;
	}
	function seek(time) {
		t = Math.min(Math.max(time, 0), scene.duration);
		draw();
	}
	function tick(now) {
		t = Math.min(tStart + (now - wallStart) / 1000, scene.duration);
		if (t >= scene.duration) playing = false;
		draw();
		if (playing) raf = requestAnimationFrame(tick);
	}
	function play() {
		if (reduced) return;
		if (t >= scene.duration) t = 0;
		playing = true;
		tStart = t;
		wallStart = performance.now();
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);
	}
	function pause() {
		playing = false;
		cancelAnimationFrame(raf);
		draw();
	}
	playBtn?.addEventListener("click", () => (playing ? pause() : play()));
	stage.addEventListener("keydown", (e) => {
		const idx = stepIndexAt(scene, t);
		if (e.key === "ArrowRight") seekStep(Math.min(idx + 1, scene.steps.length - 1));
		else if (e.key === "ArrowLeft") seekStep(Math.max(idx - 1, 0));
		else if (e.key === "Home") seekStep(0);
		else if (e.key === "End") seekStep(scene.steps.length - 1);
		else if (e.key === " " && !reduced) playing ? pause() : play();
		else return;
		e.preventDefault();
	});
	function seekStep(i) {
		pause();
		seek(scene.steps[i].at);
	}

	// Initial state: final frame (also what reduced motion and no-autoplay keep).
	seek(scene.duration);
	const autoplay = options.autoplay ?? "visible";
	if (!reduced && autoplay !== "none") {
		if (autoplay === "visible" && typeof IntersectionObserver === "function") {
			const io = new IntersectionObserver(
				(entries) => {
					if (entries.some((e) => e.isIntersecting)) {
						io.disconnect();
						seek(0);
						play();
					}
				},
				{ threshold: 0.4 },
			);
			io.observe(container);
		} else {
			seek(0);
			play();
		}
	}
	if (typeof matchMedia === "function" && !options.theme) {
		matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
	}

	const controller = { seek, play, pause, seekStep, get time() { return t; }, scene };
	const g = globalThis;
	g.__motionKit = g.__motionKit ?? {};
	g.__motionKit[id] = controller;
	return controller;
}
