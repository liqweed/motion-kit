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
		accent: "#2563eb",
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
		emphasis: "#f59e0b",
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
 * WCAG checks a style must pass: text ≥ 4.5:1, strokes and shapes ≥ 3:1.
 * @returns {string[]} problems (empty = ok)
 */
export function checkContrast(style) {
	const s = normalizeStyle(style);
	/** @type {[string, string, number][]} */
	const rules = [
		["ink", "bg", 4.5],
		["ink", "surface", 4.5],
		["muted", "bg", 4.5],
		["muted", "surface", 4.5],
		["onAccent", "accent", 4.5],
		["line", "bg", 3],
		["accent", "bg", 3],
		["emphasis", "bg", 3],
	];
	const problems = [];
	for (const theme of ["light", "dark"]) {
		for (const [fg, bg, min] of rules) {
			const r = contrast(s[theme][fg], s[theme][bg]);
			if (r < min) problems.push(`${s.name} ${theme}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
		}
	}
	return problems;
}
