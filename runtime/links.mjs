// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · page links: drive a player from the page around it (browser;
 * the step mapping is pure and also runs in Node).
 *
 *   scrollSteps(controller, sections, options) → dispose
 *     Each text section names a step; as the reader scrolls, the section
 *     crossing a line across the viewport selects its step. One settled step
 *     per section, down and up; never scrubs continuously.
 *   linkSteps(controller, rootOrElements, options) → dispose
 *     Elements with `data-mk-step` select their step on hover (mouse, pen),
 *     keyboard focus and click.
 *
 * `controller` is what mountPlayer returns (or `.controller` of
 * `<motion-diagram>` / the Astro adapter's root element). A step is named by
 * its id or its zero-based index; an unknown id throws RangeError when the
 * helper binds, not when the reader gets there.
 *
 * Nothing touches the DOM at import time, and neither helper moves focus or
 * layout: the active section or term gets `aria-current="step"`, which the
 * page styles without changing sizes.
 */
import { stepIndex } from "./scene.mjs";

/** The attribute that names an element's step. */
const STEP_ATTR = "data-mk-step";

/** @import { Scene } from "./scene.mjs" */
/**
 * The part of the player controller the helpers use.
 * @typedef {{ scene: Scene, time: number, onStep?: (listener: (index: number) => void) => (() => void), seek: (t: number) => void, seekStep: (ref: number | string) => void, playToStep: (ref: number | string) => void }} StepController
 */
/**
 * @typedef {object} ScrollStepsOptions
 * @property {number} [line] where the line sits, as a share of the root's height from its top (0–1, default 0.5)
 * @property {Element | Document | null} [root] the scroll container; default the viewport
 * @property {boolean} [animate] play forward to the next section's step (default true); other moves jump
 * @property {boolean} [mark] set `aria-current="step"` on the active section (default true)
 * @property {(index: number, section: Element | null) => void} [onChange] called when the active section changes; -1 and null before the first
 */
/**
 * @typedef {object} LinkStepsOptions
 * @property {boolean} [animate] play forward to a later step instead of jumping (default false)
 * @property {boolean} [restore] when hover and focus leave every term, return to the frame shown before (default false: the step stays); a click keeps its step
 * @property {boolean} [mark] set `aria-current="step"` on the terms of the selected step (default true)
 * @property {(step: number, element: Element | null) => void} [onChange] called when a term selects a step, and with -1 and null on restore
 */

/* ------------------------------------------------------- pure step mapping */

/**
 * The step index a reference names: a step id, else a whole-number index
 * (a number, or digits as `data-mk-step` gives them). An id wins over an index
 * when a step's id is digits. Throws RangeError for an unknown id or an index
 * out of range.
 * @param {Scene} scene
 * @param {number | string} ref
 * @returns {number}
 */
export function stepRef(scene, ref) {
	if (typeof ref === "string") {
		const trimmed = ref.trim();
		if (scene.steps.some((s) => s.id === trimmed)) return stepIndex(scene, trimmed);
		if (/^\d+$/.test(trimmed)) return stepIndex(scene, Number(trimmed));
		return stepIndex(scene, trimmed);
	}
	return stepIndex(scene, ref);
}

/**
 * The step of each section, in order: its own reference (`data-mk-step`) when
 * it has one, else its position (the third section shows step 2). Throws
 * RangeError when a reference is unknown or a section has no step to take.
 * @param {Scene} scene
 * @param {(number | string | null | undefined)[]} refs one per section; null or undefined to go by order
 * @returns {number[]}
 */
export function sectionSteps(scene, refs) {
	return refs.map((ref, i) => {
		if (ref != null && ref !== "") return stepRef(scene, ref);
		if (i >= scene.steps.length) throw new RangeError(`Section ${i + 1} has no ${STEP_ATTR} and the scene has only ${scene.steps.length} steps`);
		return i;
	});
}

/**
 * The active section: the last one, in order, whose top has reached the line
 * (top ≤ line). A section stays active through the gap after it until the next
 * one reaches the line, and the last one stays active below it. -1 while no
 * section has reached the line.
 * @param {number[]} tops each section's top, in the same coordinates as `line`
 * @param {number} line
 * @returns {number}
 */
export function activeSection(tops, line) {
	let active = -1;
	tops.forEach((top, i) => {
		if (top <= line) active = i;
	});
	return active;
}

/**
 * How to move between sections: "play" to the next section's step when it is
 * one section further and a later step (animation allowed, no reduced motion),
 * "seek" for every other change (back, skipping, the first section), and null
 * when there is nothing to do (no section, or the same step).
 * @param {{ from: number, to: number, fromStep: number, toStep: number, animate?: boolean, reduced?: boolean }} move
 * @returns {"play" | "seek" | null}
 */
export function scrollMove({ from, to, fromStep, toStep, animate = true, reduced = false }) {
	if (to < 0 || (from >= 0 && toStep === fromStep)) return null;
	return animate && !reduced && from >= 0 && to === from + 1 && toStep > fromStep ? "play" : "seek";
}

/* ---------------------------------------------------------------- the DOM */

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @param {Element} el @param {boolean} on */
function markCurrent(el, on) {
	if (on) el.setAttribute("aria-current", "step");
	else if (el.getAttribute("aria-current") === "step") el.removeAttribute("aria-current");
}

/** @param {unknown} controller @returns {StepController} */
function needController(controller) {
	const c = /** @type {any} */ (controller);
	if (!c || typeof c.seekStep !== "function" || !c.scene) throw new TypeError("expected a player controller (mountPlayer, or .controller of <motion-diagram> / the Astro adapter)");
	return c;
}

/**
 * Bind a player to a list of text sections: as each section's top crosses a
 * line across the viewport (or `root`), the diagram goes to that section's
 * settled step. A section names its step with `data-mk-step` (step id or
 * index), else by order. Moving one section forward plays to the next step;
 * moving back, skipping sections and reduced motion jump. Without
 * IntersectionObserver it does nothing.
 *
 * Give the page room below the last section (e.g. `padding-bottom: 50vh`), so
 * the last section's top can reach the line. Mount the player with
 * `autoplay: "none"`; the first section's step replaces any pending autoplay.
 * @param {StepController} controller
 * @param {Iterable<Element> | ArrayLike<Element>} sections in reading order
 * @param {ScrollStepsOptions} [options]
 * @returns {() => void} dispose: stops observing and clears the marks
 */
export function scrollSteps(controller, sections, options = {}) {
	const c = needController(controller);
	const els = Array.from(sections);
	const steps = sectionSteps(c.scene, els.map((el) => el.getAttribute(STEP_ATTR)));
	const line = Math.min(Math.max(options.line ?? 0.5, 0), 1);
	const { root = null, animate = true, mark = true, onChange } = options;
	let current = -1;
	let disposed = false;

	/** The line's position in viewport coordinates. */
	const lineY = () => {
		if (root && "getBoundingClientRect" in root) {
			const r = root.getBoundingClientRect();
			return r.top + line * r.height;
		}
		return line * (globalThis.innerHeight ?? 0);
	};
	const update = () => {
		if (disposed) return;
		const next = activeSection(els.map((el) => el.getBoundingClientRect().top), lineY());
		if (next === current) return;
		const move = scrollMove({ from: current, to: next, fromStep: steps[current] ?? -1, toStep: steps[next] ?? -1, animate, reduced: reducedMotion() });
		if (move === "play") c.playToStep(steps[next]);
		else if (move === "seek") c.seekStep(steps[next]);
		if (mark) els.forEach((el, i) => markCurrent(el, i === next));
		current = next;
		onChange?.(next, els[next] ?? null);
	};

	if (typeof IntersectionObserver !== "function") return () => {};
	const unsubscribe = mark ? c.onStep?.((index) => els.forEach((el, i) => markCurrent(el, steps[i] === index))) : undefined;
	// The root, cut off at the line: a section enters or leaves it exactly
	// when its top crosses the line, which is when the active one can change.
	const below = `${(1 - line) * 100}%`;
	const observer = new IntersectionObserver(update, { root, rootMargin: `0px 0px -${below} 0px`, threshold: 0 });
	for (const el of els) observer.observe(el);
	// A jump that moves every section across the line without changing which
	// are inside the observed area sends no notification, so scrolling asks
	// again, at most once per frame.
	const scroller = root && "addEventListener" in root ? root : globalThis;
	const raf = globalThis.requestAnimationFrame?.bind(globalThis);
	let queued = false;
	const onScroll = () => {
		if (queued || disposed) return;
		if (!raf) return update();
		queued = true;
		raf(() => {
			queued = false;
			update();
		});
	};
	scroller.addEventListener?.("scroll", onScroll, { passive: true });
	return () => {
		if (disposed) return;
		disposed = true;
		observer.disconnect();
		unsubscribe?.();
		scroller.removeEventListener?.("scroll", onScroll);
		if (mark) for (const el of els) markCurrent(el, false);
	};
}

/**
 * Bind a player to terms in the page: every element with `data-mk-step` (step
 * id or index) under `root`, or the elements given, selects its step on
 * pointer hover (mouse and pen; touch selects on click instead), on keyboard
 * focus (also focus inside it) and on click. Make terms focusable, e.g.
 * `<button type="button" data-mk-step="payment">`, so keyboard users get the
 * same step as pointer users. A selection jumps; `animate: true` plays forward
 * to a later step unless the reader prefers reduced motion.
 *
 * By default the selected step stays when the pointer or focus leaves.
 * `restore: true` makes hover and focus a preview: once neither is on a term,
 * the diagram returns to the frame it showed before; a click keeps its step.
 * Terms are collected when binding; bind again for terms added later.
 * @param {StepController} controller
 * @param {ParentNode | Iterable<Element> | ArrayLike<Element>} target a root to search, or the terms
 * @param {LinkStepsOptions} [options]
 * @returns {() => void} dispose: removes the listeners and clears the marks
 */
export function linkSteps(controller, target, options = {}) {
	const c = needController(controller);
	const { animate = false, restore = false, mark = true, onChange } = options;
	const t = /** @type {any} */ (target);
	/** @type {Element[]} */
	const els = typeof t?.querySelectorAll === "function" ? Array.from(t.querySelectorAll(`[${STEP_ATTR}]`)) : Array.from(t);
	const steps = els.map((el) => {
		const ref = el.getAttribute(STEP_ATTR);
		if (ref == null || ref === "") throw new RangeError(`linkSteps: an element has no ${STEP_ATTR}`);
		return stepRef(c.scene, ref);
	});
	/** @type {Element | null} */
	let hovered = null;
	/** @type {Element | null} */
	let focused = null;
	/** The time before a preview began, to restore; null when nothing is previewed. @type {number | null} */
	let before = null;
	let selected = -1;

	/** @param {number} step @param {Element | null} el */
	const show = (step, el) => {
		selected = step;
		if (mark) els.forEach((e, i) => markCurrent(e, steps[i] === step));
		onChange?.(step, el);
	};
	/** @param {number} i */
	const select = (i) => {
		const step = steps[i];
		if (animate && !reducedMotion()) c.playToStep(step);
		else c.seekStep(step);
		show(step, els[i]);
	};
	/** @param {number} i */
	const preview = (i) => {
		if (restore && before === null) before = c.time;
		select(i);
	};
	const leave = () => {
		if (!restore || hovered || focused || before === null) return;
		c.seek(before);
		before = null;
		if (selected !== -1) show(-1, null);
	};

	/** @type {[Element, string, (e: any) => void][]} */
	const bound = [];
	els.forEach((el, i) => {
		/** @type {Record<string, (e: any) => void>} */
		const on = {
			pointerenter: (e) => {
				if (e?.pointerType === "touch") return;
				hovered = el;
				preview(i);
			},
			pointerleave: (e) => {
				if (e?.pointerType === "touch" || hovered !== el) return;
				hovered = null;
				leave();
			},
			focusin: () => {
				focused = el;
				preview(i);
			},
			focusout: () => {
				if (focused !== el) return;
				focused = null;
				leave();
			},
			click: () => {
				// A click commits: nothing to restore afterwards.
				before = null;
				select(i);
			},
		};
		for (const [name, fn] of Object.entries(on)) {
			el.addEventListener(name, fn);
			bound.push([el, name, fn]);
		}
	});
	const unsubscribe = mark ? c.onStep?.((index) => els.forEach((el, i) => markCurrent(el, steps[i] === index))) : undefined;
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		unsubscribe?.();
		for (const [el, name, fn] of bound) el.removeEventListener(name, fn);
		if (mark) for (const el of els) markCurrent(el, false);
	};
}
