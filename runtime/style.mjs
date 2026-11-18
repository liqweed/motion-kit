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
 *   { name, font, radius, stroke, light: {token: color}, dark: {token: color} }
 */

/**
 * A visual style: font, shape constants and one colour per token, per theme.
 * @typedef {{ name?: string, font: string, radius: number, stroke: number, light: Record<string, string>, dark: Record<string, string> }} Style
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

/** Fill in any missing fields from NEUTRAL and validate token names. */
export function normalizeStyle(style) {
	if (!style || style === "neutral") return NEUTRAL;
	const out = {
		name: style.name ?? "custom",
		font: style.font ?? NEUTRAL.font,
		radius: style.radius ?? NEUTRAL.radius,
		stroke: style.stroke ?? NEUTRAL.stroke,
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

/** Replace every var(--mk-token) with its literal value. Unknown tokens throw. */
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
 * Every token pair the scene types and shared parts draw where the pair
 * carries meaning in a step frame (runtime/types/*, runtime/parts.mjs). A
 * scene that draws other pairs declares them in `scene.contrastPairs`; the
 * gate checks those too (lib/check.mjs).
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
	{ fg: "emphasis", bg: "bg", min: 3, use: "the emphasis ring (sequence) and dot (hub-spoke) on the canvas" },
	{
		fg: "emphasis",
		bg: "accent",
		min: 3,
		use: "the emphasis ring around the reached node it marks (sequence): 3.5 units apart, so adjacent at phone size. It tells the current node from the reached ones without relying on hue",
	},
]);

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
 * WCAG contrast checks a style must pass, in both themes.
 * @param {any} style style data or "neutral"; normalizeStyle fills the rest
 * @param {readonly ContrastPair[]} [pairs] default CONTRAST_PAIRS; a scene's
 *   own pairs (`scene.contrastPairs`) are checked with the same function
 * @returns {string[]} problems (empty = ok)
 */
export function checkContrast(style, pairs = CONTRAST_PAIRS) {
	const s = normalizeStyle(style);
	if (!Array.isArray(pairs)) return [`${s.name}: contrast pairs must be an array of { fg, bg, min }`];
	const problems = [];
	for (const [i, p] of pairs.entries()) {
		const bad = !p || typeof p !== "object" ? "is not an object" : !TOKENS.includes(p.fg) ? `has unknown fg token "${p.fg}"` : !TOKENS.includes(p.bg) ? `has unknown bg token "${p.bg}"` : !(typeof p.min === "number" && p.min >= 1 && p.min <= 21) ? "needs a min contrast between 1 and 21" : "";
		if (bad) problems.push(`${s.name}: contrast pair ${i} ${bad}`);
	}
	if (problems.length) return problems;
	for (const theme of ["light", "dark"]) {
		for (const { fg, bg, min } of pairs) {
			const r = contrast(s[theme][fg], s[theme][bg]);
			if (r < min) problems.push(`${s.name} ${theme}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
		}
	}
	return problems;
}
