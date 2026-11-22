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
 *   { name, font, mono, radius, stroke, motion, light: {token: color}, dark: {token: color} }
 */
import { DEFAULT_MOTION } from "./motion.mjs";

/**
 * A visual style: the font and the monospace font, shape constants, the
 * entrance and movement curves and one colour per token, per theme.
 * @typedef {{ name?: string, font: string, mono: string, radius: number, stroke: number, motion: Motion, light: Record<string, string>, dark: Record<string, string> }} Style
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
	"caution", // a shared concern or a regression: amber, not the emphasis marker
	"onCaution", // text and glyphs on caution
	"alert", // a warning, a failure or a struck-out idea: red
	"onAlert", // text and glyphs on alert
];

/**
 * The tokens beyond the original eight. A style that does not set them gets
 * neutral's, and a frame that never draws one renders as it always did: the
 * inline `style` of a live SVG names an optional token only when the frame
 * uses it (`cssVars`), and the shared contrast pairs that involve one are held
 * only against scenes that declare them (`CONTRAST_PAIRS`).
 */
export const OPTIONAL_TOKENS = Object.freeze(["caution", "onCaution", "alert", "onAlert"]);

/** Where a normalized style remembers which optional tokens its author set. */
const SET_TOKENS = Symbol("mk.setTokens");

export const NEUTRAL = Object.freeze({
	name: "neutral",
	font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
	mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
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
		caution: "#a16207",
		onCaution: "#ffffff",
		alert: "#dc2626",
		onAlert: "#ffffff",
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
		caution: "#facc15",
		onCaution: "#111827",
		alert: "#f87171",
		onAlert: "#0f1115",
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
		mono: style.mono ?? NEUTRAL.mono,
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
	for (const key of /** @type {const} */ (["font", "mono"])) {
		if (typeof out[key] !== "string" || !out[key].trim() || /[<>{};\\]/.test(out[key])) throw new Error(`style "${out.name}": ${key} must be a CSS font-family list, got ${JSON.stringify(out[key])}`);
	}
	// Which optional tokens the author set, kept (not enumerable, so the style
	// still compares and serializes as data) for `setsOptionalToken`: the
	// filled-in colours no longer say.
	// A style already normalized carries them filled in: what it remembers counts,
	// and so does any optional colour a caller has since moved off the neutral one.
	const set = style[SET_TOKENS]
		? OPTIONAL_TOKENS.filter((t) => style[SET_TOKENS].includes(t) || style.light?.[t] !== NEUTRAL.light[t] || style.dark?.[t] !== NEUTRAL.dark[t])
		: OPTIONAL_TOKENS.filter((t) => style.light?.[t] !== undefined || style.dark?.[t] !== undefined);
	Object.defineProperty(out, SET_TOKENS, { value: Object.freeze([...set]), enumerable: false });
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

/**
 * CSS custom-property declarations for one theme. With `markup` (a frame), an
 * optional token is declared only if the markup uses it, so a scene that draws
 * none of them is styled byte for byte as before they existed; without it,
 * every token is declared, as a host page or player should.
 * @param {any} style style data or "neutral"
 * @param {string} [theme] "light" | "dark"
 * @param {string} [markup]
 */
export function cssVars(style, theme = "light", markup) {
	const s = normalizeStyle(style);
	// A token can only be used through `--mk-`, or through a numeric reference spelling it.
	const paint = markup === undefined || !/--mk-|&#|CDATA/.test(markup) ? "" : paintSource(markup);
	const used = (/** @type {string} */ t) => markup === undefined || !OPTIONAL_TOKENS.includes(t) || usesToken(paint, t);
	return TOKENS.filter(used).map((t) => `--mk-${t}:${s[theme][t]}`).join(";");
}

/**
 * Whether paint source (`paintSource`) uses a token: `var(--mk-token)`, with the
 * optional whitespace CSS allows inside the parentheses.
 * @param {string} paint
 * @param {string} token
 */
export function usesToken(paint, token) {
	return new RegExp(`var\\([ \\t\\n\\r\\f]*--mk-${token}[ \\t\\n\\r\\f]*\\)`).test(paint);
}

/**
 * Every tag of a frame, opening and closing, read with its quoted attributes
 * whole (a `>` inside a value does not end the tag). Comments are skipped.
 * `inMetadata` is true for the tags inside a `<metadata>` element: they
 * describe the document and paint nothing. This is the one reader of tags;
 * the other readers (`svgTags`, `styleBodies`, `paintSource`) build on it.
 * @param {string} markup
 * @returns {{ name: string, attrs: { name: string, raw: string }[], closing: boolean, selfClosing: boolean, inMetadata: boolean, end: number, bare: string }[]}
 */
function scanTags(markup) {
	const bare = markup.replace(/<!--[\s\S]*?-->/g, "");
	const tags = [];
	let metadata = 0;
	for (const m of bare.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
		const closing = m[1] === "/";
		const selfClosing = !closing && m[3].endsWith("/");
		const isMeta = m[2].toLowerCase() === "metadata";
		if (closing && isMeta) metadata = Math.max(0, metadata - 1);
		const attrs = [];
		if (!closing) for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) attrs.push({ name: a[1], raw: a[3] });
		tags.push({ name: m[2], attrs, closing, selfClosing, inMetadata: metadata > 0 || (isMeta && !closing), end: m.index + m[0].length, bare });
		if (!closing && isMeta && !selfClosing) metadata++;
	}
	return tags;
}

/**
 * The opening tags of a frame, read with their quoted attributes whole (a `>`
 * inside a value does not end the tag). Comments are skipped.
 * @param {string} markup
 * @returns {{ name: string, attrs: { name: string, raw: string }[], inMetadata: boolean }[]}
 */
export function svgTags(markup) {
	return scanTags(markup).filter((t) => !t.closing);
}

/**
 * The bodies of the frame's `<style>` elements, found with the same tag
 * boundaries as `svgTags` (a quoted `>` in an attribute does not start the
 * body early). Those inside `<metadata>` are left out unless `all` is set.
 * @param {string} markup
 * @param {boolean} [all]
 * @returns {string[]}
 */
export function styleBodies(markup, all = false) {
	const out = [];
	for (const t of scanTags(markup)) {
		if (t.closing || t.selfClosing || t.name.toLowerCase() !== "style" || (t.inMetadata && !all)) continue;
		// Only a CSS stylesheet styles anything: another `type` is plain data.
		const type = t.attrs.find((a) => a.name === "type");
		// An empty `type` is the default, CSS.
		if (type && !/^(?:text\/css)?$/i.test(unescapeAttr(type.raw).trim())) continue;
		const close = /<\/style\s*>/i.exec(t.bare.slice(t.end));
		const body = t.bare.slice(t.end, close ? t.end + close.index : undefined);
		out.push(decodeCharacterData(body));
	}
	return out;
}

/**
 * Character data as an XML parser reads it: references decoded, CDATA
 * sections joined to the text around them as their literal payload (their
 * delimiters are no text, so a token can span them).
 * @param {string} body
 */
function decodeCharacterData(body) {
	return body.split(/<!\[CDATA\[([\s\S]*?)\]\]>/).map((part, i) => (i % 2 ? part : unescapeAttr(part))).join("");
}

/**
 * Decode the XML references a quoted attribute value can carry, in one pass
 * (`&amp;quot;` is `&quot;`, never `"`): the five named entities and numeric
 * references, decimal or hex. Anything else stays as written.
 */
export const unescapeAttr = (/** @type {string} */ v) =>
	v.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(quot|apos|lt|gt|amp));/g, (m, dec, hex, name) => {
		if (name) return { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" }[/** @type {"quot"} */ (name)];
		const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
		return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
	});

const CSS_STRING = /(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/;

/** Replace the content of CSS strings (escapes aware) with `_`, same length. */
function maskCssStrings(/** @type {string} */ css) {
	return css.replace(new RegExp(CSS_STRING, "g"), (m) => m[0] + "_".repeat(m.length - 2) + m[0]);
}

/** Remove CSS comments that are not inside a string. */
function stripCssComments(/** @type {string} */ css) {
	return css.replace(new RegExp(`${CSS_STRING.source}|/\\*[\\s\\S]*?\\*/`, "g"), (m) => (m[0] === "/" ? " " : m));
}

/** Attributes that describe, label or identify an element and paint nothing. */
const NON_PAINT_ATTR = /^(data-|aria-)|^(id|class|title|xlink:title|href|xlink:href|lang|xml:lang|xml:space|role|tabindex|alt)$/i;

/**
 * The part of a frame that can paint: the attributes of its tags that are not
 * metadata (`data-*`, `aria-*`, `id`, `class`) and `<style>` bodies, without
 * comments, CSS strings, text content, `<title>`, `<desc>` or metadata
 * elements (their `<style>` bodies are kept: a stylesheet applies document-wide). A
 * label, a data attribute or a `content:` string that spells
 * `var(--mk-caution)` out is not a use of the token.
 * @param {string} markup
 * @returns {string}
 */
export function paintSource(markup) {
	const out = [];
	for (const tag of scanTags(markup)) {
		if (tag.closing || tag.inMetadata) continue;
		for (const { name, raw } of tag.attrs) {
			if (NON_PAINT_ATTR.test(name)) continue;
			const value = unescapeAttr(raw);
			out.push(name.toLowerCase() === "style" ? maskCssStrings(stripCssComments(value)) : value);
		}
	}
	// A stylesheet inside <metadata> still styles elements outside it (SVG 1.1, styling scope).
	for (const css of styleBodies(markup, true)) out.push(maskCssStrings(stripCssComments(css)));
	return out.join("\n");
}

/** Replace every var(--mk-token) with its literal value. Unknown tokens throw. */
export function resolveTokens(markup, style, theme = "light") {
	const s = normalizeStyle(style);
	const resolve = (/** @type {string} */ text) =>
		text.replace(/var\([ \t\n\r\f]*--mk-([a-zA-Z]+)[ \t\n\r\f]*\)/g, (_, name) => {
			// An own token only: `constructor` is no token.
			const v = Object.hasOwn(s[theme], name) ? s[theme][name] : undefined;
			if (!v) throw new Error(`unknown style token "${name}"`);
			return v;
		});
	// A reference spelling (`var(&#45;&#45;mk-caution)`) reads as the same token to an XML parser:
	// decode such a value or style body, resolve it, and write it back with the markup characters escaped.
	const escaped = (/** @type {string} */ v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
	const viaDecodedBody = (/** @type {string} */ body) => {
		const decoded = decodeCharacterData(body);
		if (!/var\([ \t\n\r\f]*--mk-/.test(decoded)) return resolve(body);
		return resolve(decoded).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	};
	const viaDecoded = (/** @type {string} */ raw) => {
		if (!raw.includes("&#")) return resolve(raw);
		const decoded = unescapeAttr(raw);
		if (!/var\([ \t\n\r\f]*--mk-/.test(decoded)) return resolve(raw);
		return escaped(resolve(decoded));
	};
	// Only tag spans and style bodies are rewritten: a quote in text content is text.
	const attrs = (/** @type {string} */ span) => span.replace(/(\s)([\w:.-]+)(\s*=\s*)(["'])([\s\S]*?)\4/g, (m, sp, an, eq, q, raw) => (raw.includes("&#") && !NON_PAINT_ATTR.test(an) ? `${sp}${an}${eq}${q}${viaDecoded(raw)}${q}` : m));
	// Without a reference or CDATA section there is nothing to decode: the plain pass above is all of it.
	if (!/&#|<!\[CDATA\[/.test(markup)) return resolve(markup);
	const A = `((?:"[^"]*"|'[^']*'|[^>"'])*)`;
	return resolve(markup).replace(new RegExp(`<!--[\\s\\S]*?-->|<(style)(?=[\\s>/])${A}(?<!/)>([\\s\\S]*?)(</style\\s*>)|<([a-zA-Z][\\w:-]*)${A}>`, "gi"), (m, sName, sAttrs, body, close, name, tAttrs) => {
		if (m.startsWith("<!--")) return m;
		if (name !== undefined) return `<${name}${attrs(tAttrs)}>`;
		return `<${sName}${attrs(sAttrs)}>${/&#|<!\[CDATA\[/.test(body) ? viaDecodedBody(body) : body}${close}`;
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
	{ fg: "caution", bg: "bg", min: 3, use: "a caution mark, rule or outline on the canvas (optional token: held only against scenes that declare the pair)" },
	{ fg: "onCaution", bg: "caution", min: 4.5, use: "text and glyphs on a caution fill (optional token: held only against scenes that declare the pair)" },
	{ fg: "alert", bg: "bg", min: 3, use: "an alert mark, rule or outline on the canvas (optional token: held only against scenes that declare the pair)" },
	{ fg: "onAlert", bg: "alert", min: 4.5, use: "text and glyphs on an alert fill (optional token: held only against scenes that declare the pair)" },
].map((p) => Object.freeze(p)));

/**
 * Whether a shared pair involves one of the optional tokens (caution, alert).
 * No scene type draws them, so such a pair is not part of "a scene that
 * declares nothing is held to all of them": a scene that draws one declares it
 * (the gate fails a scene that uses the token and does not).
 * @param {ContrastPair} p
 */
const isOptionalPair = (p) => OPTIONAL_TOKENS.includes(p.fg) || OPTIONAL_TOKENS.includes(p.bg);

/**
 * Whether the style's author set an optional token of this pair themselves.
 * Only then is a miss on a pair no scene declares worth a warning: a style
 * that leaves them at neutral's has not asked for them. Works on style data as
 * given and on a normalized style (`normalizeStyle` remembers what was set);
 * `NEUTRAL` sets none.
 * @param {any} style
 * @param {ContrastPair} p
 */
export function setsOptionalToken(style, p) {
	if (!style || typeof style !== "object" || style === NEUTRAL) return false;
	const tokens = [p.fg, p.bg].filter((t) => OPTIONAL_TOKENS.includes(t));
	const remembered = style[SET_TOKENS];
	if (remembered) return tokens.some((t) => remembered.includes(t));
	return tokens.some((t) => style.light?.[t] !== undefined || style.dark?.[t] !== undefined);
}

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
		const bad = !p || typeof p !== "object" ? "is not an object" : !TOKENS.includes(p.fg) ? `has unknown fg token "${p.fg}"` : !TOKENS.includes(p.bg) ? `has unknown bg token "${p.bg}"` : p.fg === p.bg ? `pairs "${p.fg}" with itself, which shows no contrast` : !(typeof p.min === "number" && p.min >= 1 && p.min <= 21) ? "needs a min contrast between 1 and 21" : "";
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
 * CONTRAST_PAIRS but the optional tokens' (caution, alert): every miss is a
 * problem. A scene that draws those declares them, and the gate fails one that
 * uses the token without. A scene that declares them
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
	if (drawn === undefined || (Array.isArray(drawn) && drawn.length === 0)) {
		// The optional pairs are not owed, but a style that sets their token and misses is still told.
		const optional = CONTRAST_PAIRS.filter((p) => isOptionalPair(p) && setsOptionalToken(style, p));
		return {
			problems: checkContrast(s, CONTRAST_PAIRS.filter((p) => !isOptionalPair(p))),
			warnings: misses(s, optional).map((m) => `${s.name} ${m.theme}: ${m.fg} on ${m.bg} is ${m.ratio.toFixed(2)}:1, ${m.min}:1 recommended (this scene does not draw it)`),
		};
	}
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
	const undrawn = CONTRAST_PAIRS.filter((p) => !drawn.some((d) => same(p, d)) && (!isOptionalPair(p) || setsOptionalToken(style, p)));
	const warnings = misses(s, undrawn).map((m) => `${s.name} ${m.theme}: ${m.fg} on ${m.bg} is ${m.ratio.toFixed(2)}:1, ${m.min}:1 recommended (this scene does not draw it)`);
	return { problems, warnings };
}
