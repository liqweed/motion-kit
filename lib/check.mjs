// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene gate. Every scene, every format/locale it ships in, must
 * pass these before anything is exported or mounted.
 *
 *   checkScene(scene, { style }) → { ok, problems: string[], warnings: string[] }
 *
 * Over files, formats and locales (the CLI and the vendored gate): lib/gate.mjs.
 */
import { labelProblems } from "../runtime/iso.mjs";
import { renderSvg, validateScene } from "../runtime/scene.mjs";
import { OPTIONAL_TOKENS, contrastReport, normalizeStyle, paintSource, styleBodies, svgTags, unescapeAttr } from "../runtime/style.mjs";

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


/**
 * The first colour literal in a frame's markup, or null. Looks inside tags
 * and <style> elements, not at text content: a label may say "#1".
 * @param {string} markup
 * @returns {string | null}
 */
export function findColourLiteral(markup) {
	for (const tag of svgTags(markup)) {
		for (const { name, raw } of tag.attrs) {
			if (name === "href" || name === "xlink:href") continue; // href="#id"
			const value = unescapeAttr(raw);
			let lit;
			if (name === "style") lit = cssColourLiteral(value);
			else if (COLOUR_ATTRS.has(name)) lit = colourLiteral(value);
			else lit = value.replace(ID_REF, "").match(COLOUR_SYNTAX)?.[0] ?? null;
			if (lit) return `${name}="${lit}"`;
		}
	}
	for (const css of styleBodies(markup, true)) {
		const lit = cssColourLiteral(css);
		if (lit) return `<style> ${lit}`;
	}
	return null;
}

/* ------------------------------------------------------------------- fonts */

/**
 * The first font family in a frame that is neither the style's `font` nor its
 * `mono` (nor `inherit`), or null. A scene reaches a face through the style,
 * `frame(t, { style })`, never with a family of its own: the family would look
 * the same under every style, as a colour literal would. Looks at the
 * `font-family` attribute, at `font-family` in `style` attributes and `<style>`
 * elements, and at the `font` shorthand, which names a family too and so is
 * never allowed: set `font-size` and `font-weight` and take the family from
 * the style.
 * @param {string} markup
 * @param {{ font: string, mono: string }} style
 * @returns {string | null}
 */
export function findFontLiteral(markup, style) {
	const allowed = new Set([style.font.trim(), style.mono.trim(), "inherit"]);
	/** @param {string} css declarations, or a whole stylesheet */
	const inCss = (css) => {
		// Comments are no declarations; escapes (`font-\66 amily`) are the names they spell;
		// quoted strings are masked, same length, so a `font:` inside one is not a property.
		// One pass, so a comment marker inside a string stays text and an escaped
		// quote does not end its string; escapes inside a string stay as written.
		let plain = "";
		let masked = "";
		// Inside parentheses (an @supports or @media prelude) nothing is a declaration.
		let depth = 0;
		for (let i = 0; i < css.length; ) {
			const c = css[i];
			if (c === '"' || c === "'") {
				let j = i + 1;
				while (j < css.length && css[j] !== c) j += css[j] === "\\" ? 2 : 1;
				const str = css.slice(i, j + 1);
				plain += str;
				masked += c + "_".repeat(Math.max(0, str.length - 2)) + (str.length > 1 ? c : "");
				i = j + 1;
			} else if (css.startsWith("/*", i)) {
				const end = css.indexOf("*/", i + 2);
				i = end < 0 ? css.length : end + 2;
				plain += " ";
				masked += " ";
			} else if (c === "\\" && i + 1 < css.length) {
				const hex = /^\\([0-9a-f]{1,6})\s?/i.exec(css.slice(i, i + 9));
				const ch = hex ? String.fromCodePoint(Math.min(parseInt(hex[1], 16) || 0xfffd, 0x10ffff)) : css[i + 1];
				i += hex ? hex[0].length : 2;
				plain += ch;
				masked += depth > 0 ? "_" : ch;
			} else {
				plain += c;
				if (c === "(") depth++;
				masked += depth > 0 && c !== "(" && c !== ")" ? "_" : c;
				if (c === ")" && depth > 0) depth--;
				i++;
			}
		}
		for (const m of masked.matchAll(/(?:^|[;{\s])(font-family|font)\s*:\s*([^;{}]+)/gi)) {
			const prop = m[1].toLowerCase();
			const at = m.index + m[0].length - m[2].length;
			const value = plain.slice(at, at + m[2].length).trim().replace(/\s*!important$/i, "");
			if (prop === "font") return `font: ${value} (the shorthand names a family)`;
			if (!allowed.has(value)) return `font-family: ${value}`;
		}
		return null;
	};
	for (const tag of svgTags(markup)) {
		for (const { name, raw } of tag.attrs) {
			const value = unescapeAttr(raw);
			if (name === "font-family" && !allowed.has(value.trim())) return `font-family="${value}"`;
			if (name === "font") return `font="${value}" (the shorthand names a family)`;
			if (name === "style") {
				const css = inCss(value);
				if (css) return `style="${css}"`;
			}
		}
	}
	for (const css of styleBodies(markup, true)) {
		const found = inCss(css);
		if (found) return `<style> ${found}`;
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
 *   style: what the scene's pairs are checked against (neutral if absent): its
 *   own `contrastPairs` if it declares them, else all of CONTRAST_PAIRS. The
 *   shared pairs a declaring scene leaves out come back as `warnings`.
 * @returns {{ ok: boolean, problems: string[], warnings: string[] }}
 */
export function checkScene(scene, { samples = SAMPLES, style } = {}) {
	const problems = [];
	style = normalizeStyle(style);
	try { validateScene(scene); } catch (e) { return { ok: false, problems: [e instanceof Error ? e.message : String(e)], warnings: [] }; }
	// The style against the pairs this scene draws (G12): all the shared ones
	// unless it declares its own (`scene.contrastPairs`), which then stand in
	// for them; the shared pairs it leaves out are only warnings.
	const { problems: contrastProblems, warnings } = contrastReport(style, scene.contrastPairs);
	for (const p of contrastProblems) problems.push(`contrast: ${p}`);
	const render = (/** @type {number} */ t) => renderSvg(scene, t, { style });
	const at = (/** @type {number} */ i) => (scene.duration * i) / samples;

	// 1. Deterministic + well-formed + rounded + token-only, across the timeline,
	//    and the same bytes under two stubbed clocks: no clock or randomness,
	//    also not in the helpers the frame calls.
	let clockRead = false;
	/** @type {Set<string>} */
	const usedOptional = new Set();
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
		const face = findFontLiteral(frame, style);
		if (face) problems.push(`font literal ${face} at t=${t.toFixed(3)} (use the style: frame(t, { style }) gives style.font and style.mono)`);
		const paint = paintSource(frame);
		for (const token of OPTIONAL_TOKENS) if (paint.includes(`var(--mk-${token})`)) usedOptional.add(token);
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

	// 1b. A scene that draws caution or alert says so: the gate holds the style
	//     to the pairs a scene draws, and those pairs are in no default set.
	for (const token of usedOptional) {
		const declared = Array.isArray(scene.contrastPairs) && scene.contrastPairs.some((p) => p?.fg === token || p?.bg === token);
		if (!declared) problems.push(`draws ${token} but declares no contrast pair for it: add kit.sharedPairs("${token}/${token.startsWith("on") ? token.slice(2).toLowerCase() : "bg"}") to contrastPairs`);
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

	// 8. (Contrast, G12: checked first, above, by contrastReport.)

	// 9. Labels the scene declares (scene.labelBoxes): at the sampled times, each
	//    step and the end, no two overlap, no stem crosses another label and none
	//    leaves the picture. Each problem is reported once, at its first time.
	if (scene.labelBoxes) {
		const seen = new Set();
		const times = [...Array.from({ length: samples + 1 }, (_, i) => at(i)), ...scene.steps.map((s) => s.at)].sort((a, b) => a - b);
		for (const t of times) {
			let boxes;
			try {
				boxes = scene.labelBoxes(Math.min(t, scene.duration));
			} catch (e) {
				problems.push(`labelBoxes() threw at t=${t.toFixed(3)}: ${e instanceof Error ? e.message : String(e)}`);
				break;
			}
			if (!Array.isArray(boxes)) {
				problems.push("labelBoxes() must return an array of label boxes");
				break;
			}
			const bad = boxes.findIndex((b) => !b || typeof b !== "object" || typeof b.id !== "string" || !["x", "y", "width", "height"].every((k) => Number.isFinite(b[k])) || (b.opacity !== undefined && !Number.isFinite(b.opacity)) || (b.stem !== undefined && (!b.stem || typeof b.stem !== "object" || !["x1", "y1", "x2", "y2"].every((k) => Number.isFinite(b.stem[k])))));
			if (bad >= 0) {
				problems.push(`labelBoxes() entry ${bad} must be { id, x, y, width, height } with finite numbers (and a stem, when given, { x1, y1, x2, y2 }), at t=${t.toFixed(3)}`);
				break;
			}
			for (const p of labelProblems(boxes, { width: scene.width, height: scene.height })) {
				if (seen.has(p)) continue;
				seen.add(p);
				problems.push(`${p} at t=${t.toFixed(3)}`);
			}
			if (problems.length > 12) break;
		}
	}

	return { ok: problems.length === 0, problems, warnings };
}
