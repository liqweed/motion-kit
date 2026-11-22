// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene gate. Every scene, every format/locale it ships in, must
 * pass these before anything is exported or mounted.
 *
 *   checkScene(scene, { style, strict }) → { ok, problems, warnings, advice, unusedAcknowledgements }
 *
 * `problems` are every message that fails the scene: the hard failures
 * (determinism, markup, settled steps, WCAG contrast of the drawn pairs, …)
 * and, in strict mode, one line naming the advice left unacknowledged. `advice` is what the library's canon says
 * about the scene (runtime/advice.mjs): it never fails the scene, unless
 * `strict` is set and the scene has not acknowledged it.
 *
 * Over files, formats and locales (the CLI and the vendored gate): lib/gate.mjs.
 */
import { advice as newAdvice, applyAcknowledgements, printable } from "../runtime/advice.mjs";
import { labelProblems } from "../runtime/iso.mjs";
import { renderSvg, safeId, validateScene } from "../runtime/scene.mjs";
import { OPTIONAL_TOKENS, TOKENS, contrastReport, normalizeStyle, paintSource, styleBodies, svgTags, unescapeAttr, usesToken } from "../runtime/style.mjs";

const SAMPLES = 120;
/** Timeline samples per second of scene, up to MAX_SAMPLES: the 12 s the canon allows was sampled every 0.1 s; a longer scene keeps that spacing, within a bound. */
const SAMPLES_PER_SECOND = 10;
const MAX_SAMPLES = 1200;

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

/**
 * The ids a rendered SVG declares: the `id` attribute of each element's start
 * tag (any letter case, as the live patcher reads it), entity references decoded as a renderer resolves them. Text, comments
 * and stylesheet content declare none, so a selector like `[id="a"]` in a
 * <style> never counts. (Markup is checked well-formed before this is used.)
 * @param {string} svg
 * @returns {string[]}
 */
export function elementIds(svg) {
	const decode = (/** @type {string} */ raw) => raw.replace(/\r\n?/g, "\n").replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, (m, hex, dec, name) => {
		if (name) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[/** @type {"amp"} */ (name)];
		const cp = hex ? parseInt(hex, 16) : Number(dec);
		// The HTML parser remaps these: NUL, surrogates and out-of-range to U+FFFD, C1 controls through its replacement table.
		if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return "\ufffd";
		if (cp >= 0x80 && cp <= 0x9f) return String.fromCodePoint(C1_REPLACEMENT[cp - 0x80]);
		return String.fromCodePoint(cp);
	});
	const ids = [];
	for (const tag of svg.matchAll(/<[a-zA-Z][\w:-]*((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
		// The live patcher keeps the first `id` of an element, whatever its letter case.
		for (const attr of tag[1].matchAll(/\s([\w:-]+)="([^"]*)"/g)) {
			if (attr[1].toLowerCase() === "id") {
				ids.push(decode(attr[2]));
				break;
			}
		}
	}
	return ids;
}

/** HTML's replacement table for numeric references U+0080 to U+009F (the windows-1252 mapping; the five undefined ones stay as they are). */
const C1_REPLACEMENT = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178];

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
	const rest = value.replace(/!important/gi, "").replace(ID_REF, " ").replace(/var\([ \t\n\r\f]*--mk-([a-zA-Z]+)[ \t\n\r\f]*\)/g, (m, name) => (TOKENS.includes(name) ? " " : m)).trim();
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
		for (const { name: rawName, raw } of tag.attrs) {
			const name = rawName.toLowerCase(); // the live renderer lowercases attribute names
			if (name === "href" || name === "xlink:href") continue; // href="#id"
			const value = unescapeAttr(raw);
			let lit;
			if (name === "style") lit = cssColourLiteral(value);
			else if (COLOUR_ATTRS.has(name)) lit = colourLiteral(value);
			else lit = value.replace(ID_REF, "").match(COLOUR_SYNTAX)?.[0] ?? null;
			if (lit) return `${name}="${lit}"`;
		}
	}
	for (const css of styleBodies(markup)) {
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
	// `inherit` is a CSS keyword, so any case; the configured stacks compare as written.
	const okFamily = (/** @type {string} */ v) => allowed.has(v) || v.toLowerCase() === "inherit";
	/** @param {string} source declarations, or a whole stylesheet */
	const inCss = (/** @type {string} */ source) => {
		// CSS input preprocessing: CRLF and CR are one newline, form feed is a newline.
		const css = source.replace(/\r\n?|\f/g, "\n");
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
				// An unescaped newline ends a bad string (CSS Syntax, consume a string token); it is not part of it.
				while (j < css.length && css[j] !== c && !/[\n\r\f]/.test(css[j])) j += css[j] === "\\" ? 2 : 1;
				const bad = j < css.length && css[j] !== c;
				const str = css.slice(i, bad ? j : j + 1);
				plain += str;
				masked += bad ? c + "_".repeat(str.length - 1) : c + "_".repeat(Math.max(0, str.length - 2)) + (str.length > 1 ? c : "");
				i = bad ? j : j + 1;
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
				masked += depth > 0 ? "_".repeat(ch.length) : ch;
			} else {
				plain += c;
				if (c === "(") depth++;
				masked += depth > 0 && c !== "(" && c !== ")" ? "_" : c;
				if (c === ")" && depth > 0) depth--;
				i++;
			}
		}
		for (const m of masked.matchAll(/(?:^|[;{}])\s*(font-family|font)\s*:\s*([^;{}]+)/gi)) {
			const prop = m[1].toLowerCase();
			const at = m.index + m[0].length - m[2].length;
			// `font:hover{…}` is a selector prelude, not a declaration.
			if (masked[at + m[2].length] === "{") continue;
			const value = plain.slice(at, at + m[2].length).trim().replace(/\s*!\s*important\s*$/i, "");
			if (prop === "font") return `font: ${value} (the shorthand names a family)`;
			if (!okFamily(value)) return `font-family: ${value}`;
		}
		return null;
	};
	for (const tag of svgTags(markup)) {
		// The live renderer lowercases attribute names, so the scan does too.
		for (const { name: rawName, raw } of tag.attrs) {
			const name = rawName.toLowerCase();
			const value = unescapeAttr(raw);
			if (name === "font-family" && !okFamily(value.trim())) return `font-family="${value}"`;
			if (name === "font") return `font="${value}" (the shorthand names a family)`;
			if (name === "style") {
				const css = inCss(value);
				if (css) return `style="${css}"`;
			}
		}
	}
	for (const css of styleBodies(markup)) {
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

/** The most problems a scene reports before the gate stops looking. */
const MAX_PROBLEMS = 13;

/**
 * Run the scene gate on one built scene.
 * @param {import("../runtime/scene.mjs").Scene} scene
 * @param {{ samples?: number, style?: any, strict?: boolean }} [options]
 *   samples: timeline samples; by default 10 per second of the scene (at least 120, at most 1200).
 *   style: what the scene's pairs are checked against (neutral if absent): its
 *   own `contrastPairs` if it declares them, else all of CONTRAST_PAIRS. The
 *   shared pairs a declaring scene leaves out come back as `warnings`.
 *   strict: advice the scene has not acknowledged becomes a problem.
 * @returns {{ ok: boolean, problems: string[], warnings: string[], advice: import("../runtime/advice.mjs").AdviceReport[], unusedAcknowledgements: string[] }}
 *   advice: every advisory rule the scene breaks, acknowledged or not.
 *   unusedAcknowledgements: rules the scene acknowledges that it does not break.
 */
export function checkScene(scene, { samples, style, strict = false } = {}) {
	const problems = [];
	style = normalizeStyle(style);
	try { validateScene(scene); } catch (e) { return { ok: false, problems: [e instanceof Error ? e.message : String(e)], warnings: [], advice: [], unusedAcknowledgements: [] }; }
	samples ??= Math.min(MAX_SAMPLES, Math.max(SAMPLES, Math.ceil(scene.duration * SAMPLES_PER_SECOND)));
	/** What the canon says about this scene (runtime/advice.mjs): never a failure by itself. */
	const found = [];
	// The style against the pairs this scene draws (G12): all the shared ones
	// unless it declares its own (`scene.contrastPairs`), which then stand in
	// for them; the shared pairs it leaves out are only warnings. A drawn pair
	// no WCAG criterion asks for (emphasis on accent) is advice.
	const { problems: contrastProblems, warnings, advice: contrastAdvice } = contrastReport(style, scene.contrastPairs);
	for (const p of contrastProblems) problems.push(`contrast: ${p}`);
	for (const a of contrastAdvice) found.push(newAdvice(a.rule, a.found));
	const render = (/** @type {number} */ t) => renderSvg(scene, t, { style });
	const at = (/** @type {number} */ i) => scene.duration * (i / samples);

	// 1. Deterministic + well-formed + rounded + token-only, across the timeline,
	//    and the same bytes under two stubbed clocks: no clock or randomness,
	//    also not in the helpers the frame calls.
	let clockRead = false;
	/** @type {Set<string>} */
	const usedOptional = new Set();
	/** Ids declared twice in one frame, from every frame of the timeline. */
	const duplicate = new Set();
	// Colour and font literals, and the optional tokens a frame paints, at one time.
	const markupChecks = (/** @type {number} */ t) => {
		const frame = scene.frame(Math.min(t, scene.duration), { idPrefix: safeId(scene.id), style });
		const lit = findColourLiteral(frame);
		if (lit) problems.push(`colour literal ${lit} at t=${t.toFixed(3)} (use tok())`);
		const face = findFontLiteral(frame, style);
		if (face) problems.push(`font literal ${face} at t=${t.toFixed(3)} (use the style: frame(t, { style }) gives style.font and style.mono)`);
		const paint = paintSource(frame);
		for (const token of OPTIONAL_TOKENS) if (usesToken(paint, token)) usedOptional.add(token);
		return frame;
	};
	// The sampled times and each step's own time: a step is what export writes as a slide.
	const stepTimes = scene.steps.map((s) => Math.min(s.at, scene.duration));
	const timeline = [...new Set([...Array.from({ length: samples + 1 }, (_, i) => at(i)), ...stepTimes])].sort((x, y) => x - y);
	// Everything checked at one time.
	const checkAt = (/** @type {number} */ t) => {
		const a = render(t);
		if (a !== render(t)) problems.push(`not deterministic at t=${t.toFixed(3)}`);
		const wf = wellFormed(a);
		if (wf) problems.push(`malformed at t=${t.toFixed(3)}: ${wf}`);
		else {
			// One id twice in a single frame: a reference can resolve to the wrong definition.
			const seenIds = new Set();
			for (const id of elementIds(a)) {
				if (seenIds.has(id)) duplicate.add(id);
				seenIds.add(id);
			}
		}
		const long = a.match(/-?\d+\.\d{5,}/);
		if (long) problems.push(`unrounded number ${long[0]} at t=${t.toFixed(3)} (use num())`);
		const frame = markupChecks(t);
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
	};
	// The grid and the step frames, which are what readers see: each exactly, not only at the grid.
	for (const t of timeline) {
		if (problems.length >= MAX_PROBLEMS) break;
		checkAt(t);
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

	// 3. Builds up and finishes. (Advice: something should animate.)
	const first = render(0);
	const lastFrame = render(scene.duration);
	if (first === lastFrame) found.push(newAdvice("nothing-animates", "the first and the last frame are identical"));
	if (scene.steps[scene.steps.length - 1].at > scene.duration) problems.push("last step is after duration");
	if (scene.frame(scene.duration + 5, { idPrefix: safeId(scene.id), style }) !== scene.frame(scene.duration, { idPrefix: safeId(scene.id), style })) problems.push("frames after the end differ from the final frame (must hold)");

	// 4. Advice: 12 s. Authoring target: 8 s; these are distinct.
	if (scene.duration > 12) found.push(newAdvice("duration", `duration ${Number(scene.duration.toPrecision(12))} s exceeds 12 s (aim for ≤ 8 s)`));

	// 5. Advice: every step label is visible in the final frame (escaped form).
	//    A scene that declares narrative steps (stepLabelsInFrame: false)
	//    acknowledges it, so the report shows why.
	const escd = (/** @type {string} */ s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	//    Only the drawing counts (not the <title> and <desc> the wrapper adds),
	//    and a word is a whole word of a drawn label, not a part of one.
	const drawing = lastFrame.replace(/<title\b[^>]*>[\s\S]*?<\/title>|<desc\b[^>]*>[\s\S]*?<\/desc>/g, "");
	// A label wrapped at a slash (Archive/ + Dispose) is drawn as adjacent tspans: split both sides at slashes.
	const drawn = new Set(drawing.replace(/<\/tspan><tspan[^>]*>/g, " ").replace(/<[^>]+>/g, "\u0000").split(/[\s\u0000/]+/));
	const unseen = scene.steps.filter((s) => !escd(s.label).split(/[\s/]+/).filter(Boolean).every((w) => drawn.has(w)));
	if (unseen.length) found.push(newAdvice("step-labels-in-frame", `${unseen.map((s) => `"${s.label}"`).join(", ")} not found in the final frame`));

	// 6. No clock or randomness named in the frame function's own source: a
	//    hint for code paths the samples miss (rule 1 catches what they reach).
	const src = scene.frame.toString();
	if (!clockRead && /Date\.now|new Date|Math\.random|performance\.now|Temporal\.Now/.test(src)) problems.push("frame() reads the clock or randomness");

	// 7. Every id comes from the instance prefix, so two instances on a page
	//    never share one: render with two prefixes and look for common ids.
	const fixed = new Set();
	/** Every id each prefix produced anywhere on the timeline: an id both prefixes ever produce is fixed. */
	const byPrefix = { "mk-gate-a": new Set(), "mk-gate-b": new Set() };
	for (const t of timeline) {
		for (const prefix of /** @type {("mk-gate-a" | "mk-gate-b")[]} */ (Object.keys(byPrefix))) {
			const seen = new Set();
			for (const id of elementIds(renderSvg(scene, t, { idPrefix: prefix, style }))) {
				// A duplicate in either prefix's render counts: a fixed id can collide only with the wrapper's id built from that prefix.
				if (seen.has(id)) duplicate.add(id);
				seen.add(id);
				byPrefix[prefix].add(id);
			}
		}
	}
	for (const id of byPrefix["mk-gate-a"]) if (byPrefix["mk-gate-b"].has(id)) fixed.add(id);
	// A duplicate id is always reported, whatever the count: it is rare, and other problems must not hide it.
	for (const id of duplicate) problems.push(`duplicate id "${printable(id)}" in one frame: every id must be unique`);
	for (const id of fixed) {
		if (problems.length >= MAX_PROBLEMS) break;
		problems.push(`fixed id "${printable(id)}": build ids from frame(t, { idPrefix }), e.g. \`\${idPrefix}-${printable(id)}\``);
	}

	// 8. (Contrast, G12: checked first, above, by contrastReport.)

	// 9. Labels the scene declares (scene.labelBoxes): at the sampled times, each
	//    step and the end, no two overlap, no stem crosses another label and none
	//    leaves the picture. Each problem is reported once, at its first time.
	if (scene.labelBoxes) {
		const seen = new Set();
		const times = [...Array.from({ length: samples + 1 }, (_, i) => at(i)), ...scene.steps.map((s) => s.at)].sort((a, b) => a - b);
		for (const t of times) {
			if (problems.length >= MAX_PROBLEMS) break; // the cap: nothing more is asked of labelBoxes()
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
			const bad = boxes.findIndex((b) => !b || typeof b !== "object" || typeof b.id !== "string" || !["x", "y", "width", "height"].every((k) => Number.isFinite(b[k])) || b.width < 0 || b.height < 0 || (b.opacity !== undefined && !Number.isFinite(b.opacity)) || (b.stem !== undefined && (!b.stem || typeof b.stem !== "object" || !["x1", "y1", "x2", "y2"].every((k) => Number.isFinite(b.stem[k])))));
			if (bad >= 0) {
				problems.push(`labelBoxes() entry ${bad} must be { id, x, y, width, height } with finite numbers (width and height not negative; and a stem, when given, { x1, y1, x2, y2 }), at t=${t.toFixed(3)}`);
				break;
			}
			// The limit is what is left of the 13-problem cap (the loop entry guarantees some); problems already seen are skipped, not counted.
			for (const p of labelProblems(boxes, { width: scene.width, height: scene.height, limit: MAX_PROBLEMS - problems.length, ignore: seen })) {
				seen.add(p);
				problems.push(`${p} at t=${t.toFixed(3)}`);
			}
		}
	}

	// Advice: acknowledged ones are reported with their reason; with `strict`,
	// the others fail the scene. `stepLabelsInFrame: false` is the older way to
	// acknowledge the step-label rule, and its own reason.
	const acknowledge = [...(scene.acknowledge ?? [])];
	const narrative = scene.stepLabelsInFrame === false && !acknowledge.some((a) => a.rule === "step-labels-in-frame");
	if (narrative) acknowledge.push({ rule: "step-labels-in-frame", reason: "narrative steps (stepLabelsInFrame: false)" });
	// One piece of advice per rule: the style's misses in both themes read as one.
	/** @type {Map<string, import("../runtime/advice.mjs").Advice>} */
	const byRule = new Map();
	for (const f of found) {
		const earlier = byRule.get(f.rule);
		byRule.set(f.rule, earlier ? { ...earlier, found: `${earlier.found}; ${f.found}` } : f);
	}
	const merged = [...byRule.values()];
	const { advice, unused } = applyAcknowledgements(merged, acknowledge);
	if (strict) {
		// The finding itself is told once, by the advice report; the failure names the rules.
		const open = advice.filter((a) => !a.acknowledged).map((a) => a.rule);
		if (open.length) problems.push(`strict mode: unacknowledged advice [${open.join(", ")}] (fix it, or acknowledge it with a reason)`);
	}
	return { ok: problems.length === 0, problems, warnings, advice, unusedAcknowledgements: narrative ? unused.filter((r) => r !== "step-labels-in-frame") : unused };
}
