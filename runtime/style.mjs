/** @import { Motion } from "./motion.mjs" */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · visual styles.
 *
 * Scenes never contain colour literals. They reference tokens — `tok("accent")`
 * → `var(--mk-accent)` — and a style supplies the values. Live players set the
 * custom properties on their container (light + dark); standalone exports
 * resolve them to literal values, because slide apps, rasterizers and image
 * viewers do not understand CSS variables.
 *
 * A style is plain data:
 *   { name, font, radius, stroke, motion, light: {token: color}, dark: {token: color} }
 */
import { DEFAULT_MOTION } from "./motion.mjs";

/**
 * A visual style: font, shape constants, the entrance and movement curves and
 * one colour per token, per theme.
 * @typedef {{ name?: string, font: string, radius: number, stroke: number, motion: Motion, light: Record<string, string>, dark: Record<string, string> }} Style
 */

export const TOKENS = [
	"bg", // canvas behind the diagram (exports, video)
	"surface", // pending node fill
	"ink", // primary text
	"muted", // secondary text, pending labels
	"line", // pending strokes and connectors
	"accent", // active / reached state fill and path
	"onAccent", // text and glyphs on accent
	"emphasis", // the single emphasis element (marker, highlight)
];

export const NEUTRAL = Object.freeze({
	name: "neutral",
	font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
	radius: 10,
	stroke: 2,
	motion: DEFAULT_MOTION,
	light: Object.freeze({
		bg: "#ffffff",
		surface: "#f3f4f6",
		ink: "#111827",
		muted: "#4b5563",
		line: "#8b929c",
		accent: "#1d36a8",
		onAccent: "#ffffff",
		emphasis: "#d97706",
	}),
	dark: Object.freeze({
		bg: "#0f1115",
		surface: "#1c2029",
		ink: "#f3f4f6",
		muted: "#a7adb8",
		line: "#6b7280",
		accent: "#2563eb",
		onAccent: "#ffffff",
		emphasis: "#fbbf24",
	}),
});

export function tok(name) {
	if (!TOKENS.includes(name)) throw new Error(`unknown style token "${name}"`);
	return `var(--mk-${name})`;
}

/**
 * A style's `motion` with any missing curve taken from the defaults. A curve
 * is four numbers, as in CSS `cubic-bezier(x1, y1, x2, y2)`: x between 0 and 1
 * (CSS's own rule) and y between 0 and 1 too, because no motion-kit curve
 * overshoots.
 * @param {any} motion
 * @param {string} name the style's name, for the error
 * @returns {Motion}
 */
function normalizeMotion(motion, name) {
	if (motion === undefined) return DEFAULT_MOTION;
	if (!motion || typeof motion !== "object" || Array.isArray(motion)) throw new Error(`style "${name}": motion must be an object with enter and move curves`);
	for (const key of Object.keys(motion)) {
		if (key !== "enter" && key !== "move") throw new Error(`style "${name}": unknown motion curve "${key}" (known: enter, move)`);
	}
	const out = { enter: DEFAULT_MOTION.enter, move: DEFAULT_MOTION.move };
	for (const key of /** @type {const} */ (["enter", "move"])) {
		const c = motion[key];
		if (c === undefined) continue;
		if (!Array.isArray(c) || c.length !== 4 || !c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
			throw new Error(`style "${name}": motion.${key} must be four numbers from 0 to 1 (a cubic-bezier that does not overshoot), got ${JSON.stringify(c)}`);
		}
		out[key] = Object.freeze(/** @type {[number, number, number, number]} */ ([...c]));
	}
	return Object.freeze(out);
}

/** Fill in any missing fields from NEUTRAL and validate token names. */
export function normalizeStyle(style) {
	if (!style || style === "neutral") return NEUTRAL;
	const out = {
		name: style.name ?? "custom",
		font: style.font ?? NEUTRAL.font,
		radius: style.radius ?? NEUTRAL.radius,
		stroke: style.stroke ?? NEUTRAL.stroke,
		motion: normalizeMotion(style.motion, style.name ?? "custom"),
		light: { ...NEUTRAL.light, ...(style.light ?? {}) },
		dark: { ...NEUTRAL.dark, ...(style.dark ?? style.light ?? {}) },
	};
	for (const [key, min, max] of [["radius", 0, 24], ["stroke", 1, 4]]) {
		if (!Number.isFinite(out[key]) || out[key] < min || out[key] > max) throw new Error(`style "${out.name}": ${key} must be a number from ${min} to ${max}`);
	}
	// The font goes into CSS and markup: a family list never needs these characters.
	if (typeof out.font !== "string" || /[<>{};\\]/.test(out.font)) throw new Error(`style "${out.name}": font must be a CSS font-family list, got ${JSON.stringify(out.font)}`);
	for (const theme of ["light", "dark"]) {
		for (const key of Object.keys(out[theme])) {
			if (!TOKENS.includes(key)) throw new Error(`style "${out.name}": unknown token "${key}" in ${theme}`);
			if (!/^#[0-9a-f]{6}$/i.test(out[theme][key])) {
				throw new Error(`style "${out.name}": ${theme}.${key} must be a #rrggbb colour, got "${out[theme][key]}"`);
			}
		}
	}
	return out;
}

/** CSS custom-property declarations for one theme. */
export function cssVars(style, theme = "light") {
	const s = normalizeStyle(style);
	return TOKENS.map((t) => `--mk-${t}:${s[theme][t]}`).join(";");
}

/**
 * Replace every var(--mk-token) with its literal value, wherever it appears
 * in the string (markup, a bare declaration, text). Unknown tokens throw.
 * Text that must keep a literal `var(--mk-...)` is escaped by its author
 * (`drawCode` writes the first hyphen as a character reference).
 */
export function resolveTokens(markup, style, theme = "light") {
	const s = normalizeStyle(style);
	return markup.replace(/var\(--mk-([a-zA-Z]+)\)/g, (_, name) => {
		const v = s[theme][name];
		if (!v) throw new Error(`unknown style token "${name}"`);
		return v;
	});
}

/* ---------------------------------------------------------------- contrast */

function channel(c) {
	const v = c / 255;
	return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
	const n = Number.parseInt(hex.slice(1), 16);
	return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Two tokens drawn one against the other, and the contrast the pair needs in
 * both themes: 4.5 for text (WCAG 1.4.3), 3 for shapes and strokes (WCAG
 * 1.4.11). `use` says where it is drawn.
 * @typedef {{ fg: string, bg: string, min: number, use?: string }} ContrastPair
 */
/**
 * A token pair the check leaves out on purpose, and why.
 * @typedef {{ fg: string, bg: string, why: string }} ContrastExemption
 */

/**
 * The shared list: every token pair the scene types and shared parts draw
 * where the pair carries meaning in a step frame (runtime/types/*,
 * runtime/parts.mjs), with the contrast WCAG asks of it. It is the menu the
 * scene types pick from (`sharedPairs`), not what every scene must meet: a
 * scene is held to the pairs it draws (`contrastReport`). A scene that
 * declares nothing is held to all of them.
 * @type {readonly ContrastPair[]}
 */
export const CONTRAST_PAIRS = Object.freeze([
	{ fg: "ink", bg: "bg", min: 4.5, use: "labels of reached nodes, on the canvas (stateLabel)" },
	{ fg: "ink", bg: "surface", min: 4.5, use: "labels inside pending boxes (boxNode)" },
	{ fg: "muted", bg: "bg", min: 4.5, use: "labels of pending nodes, on the canvas (stateLabel)" },
	{ fg: "muted", bg: "surface", min: 4.5, use: "glyphs and icons inside pending circles (circleNode)" },
	{ fg: "onAccent", bg: "accent", min: 4.5, use: "labels, glyphs and icons inside reached nodes (boxNode, circleNode)" },
	{ fg: "line", bg: "bg", min: 3, use: "connectors and the outlines of pending nodes" },
	{ fg: "accent", bg: "bg", min: 3, use: "reached nodes and drawn connectors" },
	{ fg: "emphasis", bg: "bg", min: 3, use: "the emphasis ring (sequence, flowchart) and dot (hub-spoke, stack, walk) on the canvas, and the timeline's now pill" },
	{
		fg: "emphasis",
		bg: "accent",
		min: 3,
		use: "the emphasis ring around the reached node it marks (sequence, flowchart): 3.5 units apart, so adjacent at phone size. It tells the current node from the reached ones without relying on hue. The dot of hub-spoke, stack and walk rides over accent connectors",
	},
].map((p) => Object.freeze(p)));

/**
 * Pairs that are drawn (by the scene types, only in motion; or by the
 * motion-kit logo) but that CONTRAST_PAIRS leaves out, and why.
 * @type {readonly ContrastExemption[]}
 */
export const CONTRAST_EXEMPT = Object.freeze([
	{ fg: "line", bg: "surface", why: "a pending node's outline is its edge: it is told from the canvas outside it (line on bg), not from the node's own fill (WCAG 1.4.11)" },
	{ fg: "accent", bg: "surface", why: "the reached layer covers the pending one only while a node fills; never side by side in a step frame. A scene that draws accent on surface (a bar on a track) declares the pair" },
	{ fg: "emphasis", bg: "surface", why: "the sequence ring crosses pending nodes only mid-hop: in motion, never in a step frame" },
	{ fg: "accent", bg: "line", why: "a connector's accent draw-on covers its pending line; they meet only at the moving tip, mid-draw" },
	{ fg: "onAccent", bg: "emphasis", why: "no scene type draws it; the motion-kit logo's end keyframe does, and logos are exempt from WCAG 1.4.11" },
]);

/**
 * Why a list of pairs cannot be checked (empty = it can).
 * @param {string} name the style's name, for the message
 * @param {unknown} pairs
 * @returns {string[]}
 */
function malformedPairs(name, pairs) {
	if (!Array.isArray(pairs)) return [`${name}: contrast pairs must be an array of { fg, bg, min }`];
	const problems = [];
	for (const [i, p] of pairs.entries()) {
		const bad = !p || typeof p !== "object" ? "is not an object" : !TOKENS.includes(p.fg) ? `has unknown fg token "${p.fg}"` : !TOKENS.includes(p.bg) ? `has unknown bg token "${p.bg}"` : !(typeof p.min === "number" && p.min >= 1 && p.min <= 21) ? "needs a min contrast between 1 and 21" : "";
		if (bad) problems.push(`${name}: contrast pair ${i} ${bad}`);
	}
	return problems;
}

/**
 * Each pair a style does not reach, in both themes.
 * @param {ReturnType<typeof normalizeStyle>} s
 * @param {readonly ContrastPair[]} pairs well-formed
 */
function misses(s, pairs) {
	const out = [];
	for (const theme of /** @type {const} */ (["light", "dark"])) {
		for (const { fg, bg, min } of pairs) {
			const ratio = contrast(s[theme][fg], s[theme][bg]);
			if (ratio < min) out.push({ theme, fg, bg, min, ratio });
		}
	}
	return out;
}

/**
 * WCAG contrast checks a style must pass, in both themes.
 * @param {any} style style data or "neutral"; normalizeStyle fills the rest
 * @param {readonly ContrastPair[]} [pairs] default CONTRAST_PAIRS; a scene's
 *   own pairs (`scene.contrastPairs`) are checked with the same function
 * @returns {string[]} problems (empty = ok)
 */
export function checkContrast(style, pairs = CONTRAST_PAIRS) {
	const s = normalizeStyle(style);
	const bad = malformedPairs(s.name, pairs);
	if (bad.length) return bad;
	return misses(s, pairs).map((m) => `${s.name} ${m.theme}: ${m.fg} on ${m.bg} is ${m.ratio.toFixed(2)}:1, needs ${m.min}:1`);
}

/**
 * The shared pairs a scene type draws, picked from CONTRAST_PAIRS by their
 * `fg/bg` names, in the order of that list. A scene type records them with
 * the type (`contrastPairs` on its scenes) and a custom scene may do the same.
 * @param {...string} names `"fg/bg"`, e.g. `"ink/bg"`; throws on one that CONTRAST_PAIRS does not hold
 * @returns {readonly ContrastPair[]}
 */
export function sharedPairs(...names) {
	for (const n of names) if (!CONTRAST_PAIRS.some((p) => `${p.fg}/${p.bg}` === n)) throw new Error(`sharedPairs: "${n}" is not a shared pair (known: ${CONTRAST_PAIRS.map((p) => `${p.fg}/${p.bg}`).join(", ")})`);
	return Object.freeze(CONTRAST_PAIRS.filter((p) => names.includes(`${p.fg}/${p.bg}`)));
}

/**
 * What one scene owes the style, WCAG 1.4.3 and 1.4.11 applied to the pairs it
 * draws. A scene that declares no pairs draws, for this purpose, all of
 * CONTRAST_PAIRS: every miss is a problem. A scene that declares them
 * (`scene.contrastPairs`) is held to those; the shared pairs it does not
 * declare are only reported, as warnings, because WCAG judges what is drawn,
 * not the palette.
 * @param {any} style style data or "neutral"
 * @param {readonly ContrastPair[]} [drawn] `scene.contrastPairs`
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function contrastReport(style, drawn) {
	const s = normalizeStyle(style);
	// An empty list says nothing about what is drawn, which is no reason to drop every check.
	if (drawn === undefined || (Array.isArray(drawn) && drawn.length === 0)) return { problems: checkContrast(s), warnings: [] };
	if (!Array.isArray(drawn) || malformedPairs(s.name, drawn).length) return { problems: checkContrast(s, drawn), warnings: [] };
	// A declaration may add pairs and name shared ones, never weaken a shared threshold.
	// Contrast is symmetric, so a pair written the other way round is the same adjacency.
	/** @param {ContrastPair} p @param {ContrastPair} d */
	const same = (p, d) => (p.fg === d.fg && p.bg === d.bg) || (p.fg === d.bg && p.bg === d.fg);
	drawn = drawn.map((d) => {
		const shared = CONTRAST_PAIRS.find((p) => same(p, d));
		return shared && d.min < shared.min ? { ...d, min: shared.min } : d;
	});
	const problems = checkContrast(s, drawn);
	const undrawn = CONTRAST_PAIRS.filter((p) => !drawn.some((d) => same(p, d)));
	const warnings = misses(s, undrawn).map((m) => `${s.name} ${m.theme}: ${m.fg} on ${m.bg} is ${m.ratio.toFixed(2)}:1, ${m.min}:1 recommended (this scene does not draw it)`);
	return { problems, warnings };
}
