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
import { renderSvg, validateScene } from "../runtime/scene.mjs";
import { contrastReport, normalizeStyle } from "../runtime/style.mjs";

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
	const decode = (/** @type {string} */ v) => v.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, (m, hex, dec, name) => {
		if (name) return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[/** @type {"amp"} */ (name)];
		const cp = hex ? parseInt(hex, 16) : Number(dec);
		// The HTML parser remaps these: NUL and surrogates to U+FFFD, C1 controls through windows-1252.
		if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return "\ufffd";
		if (cp >= 0x80 && cp <= 0x9f) return new TextDecoder("windows-1252").decode(Uint8Array.of(cp));
		return String.fromCodePoint(cp);
	});
	const ids = [];
	for (const tag of svg.matchAll(/<[a-zA-Z][\w:-]*((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
		for (const attr of tag[1].matchAll(/\s([\w:-]+)="([^"]*)"/g)) if (attr[1].toLowerCase() === "id") ids.push(decode(attr[2]));
	}
	return ids;
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
	/** Ids declared twice in one frame, from every frame of the timeline. */
	const duplicate = new Set();
	// The sampled times and each step's own time: a step is what export writes as a slide.
	const stepTimes = scene.steps.map((s) => s.at);
	const timeline = [...new Set([...Array.from({ length: samples + 1 }, (_, i) => at(i)), ...stepTimes])].sort((x, y) => x - y);
	for (const t of timeline) {
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

	// 3. Builds up and finishes. (Advice: something should animate.)
	const first = render(0);
	const lastFrame = render(scene.duration);
	if (first === lastFrame) found.push(newAdvice("nothing-animates", "the first and the last frame are identical"));
	if (scene.steps[scene.steps.length - 1].at > scene.duration) problems.push("last step is after duration");
	if (scene.frame(scene.duration + 5, { idPrefix: scene.id, style }) !== scene.frame(scene.duration, { idPrefix: scene.id, style })) problems.push("frames after the end differ from the final frame (must hold)");

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
	const idTimes = [...new Set([...Array.from({ length: Math.floor(samples / 10) + 1 }, (_, k) => at(k * 10)), at(samples), ...stepTimes])];
	for (const t of idTimes) {
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
	for (const id of duplicate) problems.push(`duplicate id "${printable(id)}" in one frame: every id must be unique`);
	for (const id of fixed) problems.push(`fixed id "${printable(id)}": build ids from frame(t, { idPrefix }), e.g. \`\${idPrefix}-${printable(id)}\``);

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
