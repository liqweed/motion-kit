// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene gate. Every scene, every format/locale it ships in, must
 * pass these before anything is exported or mounted.
 *
 *   checkScene(scene, { style }) → { ok, problems: string[] }
 *
 * Over files, formats and locales (the CLI and the vendored gate): lib/gate.mjs.
 */
import { renderSvg, validateScene } from "../runtime/scene.mjs";
import { checkContrast, normalizeStyle } from "../runtime/style.mjs";

const SAMPLES = 120;

/** Minimal well-formedness check: balanced tags, no raw "<" in text, entities ok. */
export function wellFormed(svg) {
	const stack = [];
	const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|#39|#\d+);)/g;
	let m;
	let last = 0;
	while ((m = re.exec(svg))) {
		if (m[0] === "<") return `stray "<" at ${m.index}`;
		if (m[0].startsWith("&")) return `bare "&" at ${m.index}`;
		last = re.lastIndex;
		const [, close, tag, , self] = m;
		if (self) continue;
		if (close) {
			const open = stack.pop();
			if (open !== tag) return `</${tag}> closes <${open}>`;
		} else stack.push(tag);
	}
	if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
	if (last === 0) return "no markup";
	return null;
}

/* ------------------------------------------------------------ colour literals */

/** Presentation attributes whose value is a colour. */
const COLOUR_ATTRS = new Set(["fill", "stroke", "stop-color", "color", "flood-color", "lighting-color"]);
/** CSS properties (in style="…" or a <style> element) whose value is a colour. */
const isColourProperty = (/** @type {string} */ name) => COLOUR_ATTRS.has(name) || name === "background" || /-colou?r$/.test(name);
/**
 * Values that name no colour, so they look the same under every style and
 * theme: no paint, the inherited or current colour, `transparent` (no hue,
 * invisible in light and dark alike), marker context paint, CSS-wide keywords.
 */
const NOT_A_COLOUR = /^(none|currentcolor|transparent|inherit|initial|unset|revert|revert-layer|context-fill|context-stroke)$/i;
/** Literal colour syntax anywhere in markup or CSS: hex and colour functions. */
const COLOUR_SYNTAX = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
/** References to ids, which are not colours: url(#x). */
const ID_REF = /url\(\s*['"]?#[^)]*\)/g;

/**
 * The literal colour in one colour value (`fill`, `stroke`, a style
 * property), or null when it uses only tokens (`var(--mk-x)`), id references
 * and the keywords in NOT_A_COLOUR. Named colours (`red`), hex, colour
 * functions and other custom properties are literals.
 * @param {string} value
 * @returns {string | null}
 */
export function colourLiteral(value) {
	const rest = value.replace(/!important/gi, "").replace(ID_REF, " ").replace(/var\(--mk-[a-zA-Z]+\)/g, " ").trim();
	if (!rest || rest.split(/\s+/).every((word) => NOT_A_COLOUR.test(word))) return null;
	return rest;
}

/**
 * @param {string} css declarations, or a whole stylesheet
 * @returns {string | null}
 */
function cssColourLiteral(css) {
	for (const [, prop, value] of css.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
		if (!isColourProperty(prop.toLowerCase())) continue;
		const lit = colourLiteral(value);
		if (lit) return `${prop}: ${lit}`;
	}
	// Colour syntax in a declaration, never in a selector: `#face-node` is an id.
	const declarations = css.includes("{") ? [...css.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).join(";") : css;
	return declarations.replace(ID_REF, "").match(COLOUR_SYNTAX)?.[0] ?? null;
}

/** @param {string} v */
const unescapeAttr = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * The first colour literal in a frame's markup, or null. Looks inside tags
 * and <style> elements, not at text content: a label may say "#1".
 * @param {string} markup
 * @returns {string | null}
 */
export function findColourLiteral(markup) {
	for (const [, tag] of markup.matchAll(/<([a-zA-Z][^>]*)>/g)) {
		for (const [, name, raw] of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) {
			if (name === "href" || name === "xlink:href") continue; // href="#id"
			const value = unescapeAttr(raw);
			let lit;
			if (name === "style") lit = cssColourLiteral(value);
			else if (COLOUR_ATTRS.has(name)) lit = colourLiteral(value);
			else lit = value.replace(ID_REF, "").match(COLOUR_SYNTAX)?.[0] ?? null;
			if (lit) return `${name}="${lit}"`;
		}
	}
	for (const [, css] of markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
		const lit = cssColourLiteral(css);
		if (lit) return `<style> ${lit}`;
	}
	return null;
}

/* ------------------------------------------------------- clock and randomness */

/**
 * Two fixed clocks far apart (1970 and 2100; random 0 and almost 1). A frame
 * that reads Date, performance.now, Temporal.Now or Math.random, itself or in
 * a helper it calls, renders differently under at least one of them than
 * under the real ones.
 */
const STUB_CLOCKS = [
	{ now: 0, perf: 0, random: 0 },
	{ now: 4102444800000, perf: 1e9, random: 0.999999 },
];

/**
 * Run `fn` with Date, performance.now, Temporal.Now and Math.random replaced
 * by a fixed clock; the originals are restored before it returns or throws.
 * @template T
 * @param {{ now: number, perf: number, random: number }} clock
 * @param {() => T} fn
 * @returns {T}
 */
function underStubbedClock({ now, perf, random }, fn) {
	const g = /** @type {any} */ (globalThis);
	const RealDate = g.Date;
	const realRandom = Math.random;
	const performance = g.performance;
	const ownNow = performance && Object.getOwnPropertyDescriptor(performance, "now");
	const temporal = g.Temporal;
	const realTemporalNow = temporal?.Now;
	/** @param {...any} args */
	function FakeDate(...args) {
		if (!new.target) return new RealDate(now).toString();
		return args.length ? new RealDate(...args) : new RealDate(now);
	}
	FakeDate.now = () => now;
	FakeDate.parse = RealDate.parse;
	FakeDate.UTC = RealDate.UTC;
	FakeDate.prototype = RealDate.prototype;
	try {
		g.Date = FakeDate;
		Math.random = () => random;
		if (performance) Object.defineProperty(performance, "now", { value: () => perf, configurable: true, writable: true });
		if (realTemporalNow) {
			const instant = () => temporal.Instant.fromEpochMilliseconds(now);
			const zoned = (tz = "UTC") => instant().toZonedDateTimeISO(tz);
			temporal.Now = {
				instant,
				timeZoneId: () => "UTC",
				zonedDateTimeISO: zoned,
				plainDateTimeISO: (/** @type {string | undefined} */ tz) => zoned(tz).toPlainDateTime(),
				plainDateISO: (/** @type {string | undefined} */ tz) => zoned(tz).toPlainDate(),
				plainTimeISO: (/** @type {string | undefined} */ tz) => zoned(tz).toPlainTime(),
			};
		}
		return fn();
	} finally {
		g.Date = RealDate;
		Math.random = realRandom;
		if (performance) {
			if (ownNow) Object.defineProperty(performance, "now", ownNow);
			else delete performance.now;
		}
		if (realTemporalNow) temporal.Now = realTemporalNow;
	}
}

/* --------------------------------------------------------------------- gate */

/**
 * Offsets (s) after a step's `at` at which the frame must still be the step
 * frame. The canon leaves at least 50 ms between a step and the next beat
 * (motion-vocabulary.md, "Pause between beats"), so motion passing through
 * `at` shows inside this window, while the next beat, which may start at
 * exactly `at` + 50 ms, never does.
 */
export const SETTLE_AFTER = Object.freeze([0.001, 0.015, 0.03, 0.045]);

/**
 * Run the scene gate on one built scene.
 * @param {import("../runtime/scene.mjs").Scene} scene
 * @param {{ samples?: number, style?: any }} [options]
 *   style: what the scene's own `contrastPairs` are checked against (neutral
 *   if absent). The pairs every scene draws (CONTRAST_PAIRS) are a property of
 *   the style alone, checked once per style by lib/gate.mjs.
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkScene(scene, { samples = SAMPLES, style } = {}) {
	const problems = [];
	style = normalizeStyle(style);
	try { validateScene(scene); } catch (e) { return { ok: false, problems: [e instanceof Error ? e.message : String(e)] }; }
	for (const p of checkContrast(style)) problems.push(`contrast: ${p}`);
	const render = (/** @type {number} */ t) => renderSvg(scene, t, { style });
	const at = (/** @type {number} */ i) => (scene.duration * i) / samples;

	// 1. Deterministic + well-formed + rounded + token-only, across the timeline,
	//    and the same bytes under two stubbed clocks: no clock or randomness,
	//    also not in the helpers the frame calls.
	let clockRead = false;
	for (let i = 0; i <= samples; i++) {
		const t = at(i);
		const a = render(t);
		if (a !== render(t)) problems.push(`not deterministic at t=${t.toFixed(3)}`);
		const wf = wellFormed(a);
		if (wf) problems.push(`malformed at t=${t.toFixed(3)}: ${wf}`);
		const long = a.match(/-?\d+\.\d{5,}/);
		if (long) problems.push(`unrounded number ${long[0]} at t=${t.toFixed(3)} (use num())`);
		const frame = scene.frame(Math.min(t, scene.duration), { idPrefix: scene.id, style });
		const lit = findColourLiteral(frame);
		if (lit) problems.push(`colour literal ${lit} at t=${t.toFixed(3)} (use tok())`);
		if (/NaN|undefined|Infinity/.test(frame)) problems.push(`NaN/undefined/Infinity in frame at t=${t.toFixed(3)}`);
		for (const clock of clockRead ? [] : STUB_CLOCKS) {
			let stubbed;
			try {
				stubbed = underStubbedClock(clock, () => render(t));
			} catch (e) {
				stubbed = e;
			}
			if (stubbed !== a) {
				clockRead = true;
				problems.push(`frame() reads the clock or randomness: at t=${t.toFixed(3)} it renders differently under a stubbed Date, performance.now or Math.random`);
				break;
			}
		}
		if (problems.length > 12) break;
	}

	// 2. Settled steps: nothing moves at a step's time. The step's own motion
	//    is at rest 1 ms before `at`, and nothing changes in the SETTLE_AFTER
	//    window after it (up to the next step), so no motion passes through `at`.
	for (const [i, s] of scene.steps.entries()) {
		const still = render(s.at);
		const next = scene.steps[i + 1]?.at ?? Infinity;
		const offsets = [-0.001, ...SETTLE_AFTER.filter((d) => s.at + d < next)];
		const moved = offsets.find((d) => render(Math.max(0, s.at + d)) !== still);
		if (moved !== undefined) {
			const when = moved < 0 ? "1 ms before" : `${Math.round(moved * 1000)} ms after`;
			problems.push(`step "${s.label}" at ${s.at.toFixed(3)}s is not settled: the frame ${when} differs (something is still moving)`);
		}
	}

	// 3. Builds up and finishes.
	const first = render(0);
	const lastFrame = render(scene.duration);
	if (first === lastFrame) problems.push("first and last frame are identical: nothing animates");
	if (scene.steps[scene.steps.length - 1].at > scene.duration) problems.push("last step is after duration");
	if (scene.frame(scene.duration + 5, { idPrefix: scene.id, style }) !== scene.frame(scene.duration, { idPrefix: scene.id, style })) problems.push("frames after the end differ from the final frame (must hold)");

	// 4. Hard limit: 12 s. Authoring target: 8 s; these are distinct.
	if (scene.duration > 12) problems.push(`duration ${scene.duration.toFixed(1)}s exceeds the 12 s limit (aim for ≤ 8 s)`);

	// 5. Every step label is visible in the final frame (escaped form), unless
	//    the scene declares narrative steps (stepLabelsInFrame: false).
	const escd = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	const plain = lastFrame.replace(/<\/tspan><tspan[^>]*>/g, " ").replace(/<[^>]+>/g, "\u0000");
	for (const s of scene.stepLabelsInFrame === false ? [] : scene.steps) {
		const words = escd(s.label).split(/\s+/);
		if (!words.every((w) => plain.includes(w.replace(/\/$/, "")))) problems.push(`step label "${s.label}" not found in the final frame`);
	}

	// 6. No clock or randomness named in the frame function's own source: a
	//    hint for code paths the samples miss (rule 1 catches what they reach).
	const src = scene.frame.toString();
	if (!clockRead && /Date\.now|new Date|Math\.random|performance\.now|Temporal\.Now/.test(src)) problems.push("frame() reads the clock or randomness");

	// 7. Every id comes from the instance prefix, so two instances on a page
	//    never share one: render with two prefixes and look for common ids.
	const fixed = new Set();
	for (let i = 0; i <= samples; i += 10) {
		const ids = (/** @type {string} */ prefix) => new Set([...renderSvg(scene, at(i), { idPrefix: prefix, style }).matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]));
		const second = ids("mk-gate-b");
		for (const id of ids("mk-gate-a")) if (second.has(id)) fixed.add(id);
	}
	for (const id of fixed) problems.push(`fixed id "${id}": build ids from frame(t, { idPrefix }), e.g. \`\${idPrefix}-${id}\``);

	// 8. The token pairs this scene draws beyond the shared ones
	//    (scene.contrastPairs) meet their contrast in the style, both themes.
	if (scene.contrastPairs !== undefined) {
		for (const p of checkContrast(style, scene.contrastPairs)) problems.push(`contrast: ${p}`);
	}

	return { ok: problems.length === 0, problems };
}
