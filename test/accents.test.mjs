import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene, findFontLiteral } from "../lib/check.mjs";
import { styleWarnings } from "../lib/gate.mjs";
import { loadScene } from "../lib/load.mjs";
import { KIT } from "../runtime/kit.mjs";
import { FORMATS, renderSvg } from "../runtime/scene.mjs";
import { num } from "../runtime/svg.mjs";
import { CONTRAST_PAIRS, NEUTRAL, OPTIONAL_TOKENS, TOKENS, checkContrast, contrast, contrastReport, cssVars, normalizeStyle, resolveTokens, sharedPairs, tok } from "../runtime/style.mjs";

const EXAMPLE = fileURLToPath(new URL("../examples/release-check.scene.mjs", import.meta.url));
const ORIGINAL = ["bg", "surface", "ink", "muted", "line", "accent", "onAccent", "emphasis"];

describe("caution and alert tokens, and the monospace face", () => {
	it("add four tokens and keep the original eight in their order", () => {
		assert.deepEqual(TOKENS.slice(0, 8), ORIGINAL);
		assert.deepEqual(OPTIONAL_TOKENS, ["caution", "onCaution", "alert", "onAlert"]);
		assert.deepEqual(TOKENS.slice(8), [...OPTIONAL_TOKENS]);
		assert.equal(tok("caution"), "var(--mk-caution)");
		assert.equal(tok("onAlert"), "var(--mk-onAlert)");
	});

	it("come from neutral in light and dark, and meet their pairs there", () => {
		for (const theme of /** @type {const} */ (["light", "dark"])) {
			for (const t of OPTIONAL_TOKENS) assert.match(NEUTRAL[theme][t], /^#[0-9a-f]{6}$/, `${theme}.${t}`);
		}
		const pairs = sharedPairs("caution/bg", "onCaution/caution", "alert/bg", "onAlert/alert");
		assert.equal(pairs.length, 4);
		assert.deepEqual(checkContrast(NEUTRAL, pairs), []);
		// Caution is not the emphasis colour: a scene tells them apart without relying on the name.
		for (const theme of /** @type {const} */ (["light", "dark"])) assert.notEqual(NEUTRAL[theme].caution, NEUTRAL[theme].emphasis);
	});

	it("fall back to neutral in a style that does not set them", () => {
		const s = normalizeStyle({ name: "plain", light: { accent: "#0a2a8a" } });
		for (const theme of /** @type {const} */ (["light", "dark"])) for (const t of OPTIONAL_TOKENS) assert.equal(s[theme][t], NEUTRAL[theme][t]);
		const own = normalizeStyle({ name: "own", light: { caution: "#8a5a00" }, dark: { alert: "#ff8080" } });
		assert.equal(own.light.caution, "#8a5a00");
		assert.equal(own.dark.alert, "#ff8080");
		assert.equal(own.dark.caution, NEUTRAL.dark.caution);
	});

	it("still throw on an unknown token name, and on a colour that is not #rrggbb", () => {
		assert.throws(() => normalizeStyle({ name: "x", light: { cautions: "#ffffff" } }), /unknown token "cautions" in light/);
		assert.throws(() => normalizeStyle({ name: "x", dark: { warning: "#ffffff" } }), /unknown token "warning" in dark/);
		assert.throws(() => normalizeStyle({ name: "x", light: { alert: "red" } }), /light\.alert must be a #rrggbb colour/);
		assert.throws(() => tok("warning"), /unknown style token "warning"/);
		assert.throws(() => resolveTokens("fill:var(--mk-warning)", NEUTRAL), /unknown style token "warning"/);
	});

	it("resolve to literals in standalone exports", () => {
		assert.equal(resolveTokens("var(--mk-caution) var(--mk-onAlert)", NEUTRAL, "dark"), `${NEUTRAL.dark.caution} ${NEUTRAL.dark.onAlert}`);
	});

	it("name a monospace stack in the style, neutral's by default", () => {
		assert.match(NEUTRAL.mono, /monospace$/);
		assert.equal(normalizeStyle({ name: "x" }).mono, NEUTRAL.mono);
		assert.equal(normalizeStyle({ name: "x", mono: '"JetBrains Mono", monospace' }).mono, '"JetBrains Mono", monospace');
		assert.throws(() => normalizeStyle({ name: "x", mono: "a;b" }), /mono must be a CSS font-family list/);
		assert.throws(() => normalizeStyle({ name: "x", mono: 12 }), /mono must be a CSS font-family list/);
	});

	it("travel in the kit handed to custom scenes", () => {
		for (const name of ["OPTIONAL_TOKENS", "setsOptionalToken"]) assert.ok(name in KIT, name);
	});
});

describe("optional tokens in the markup a scene produces", () => {
	const scene = (/** @type {string} */ body) => ({ id: "s", width: 100, height: 50, duration: 1, title: "t", description: "d", steps: [{ at: 1, label: "x" }], frame: () => body });

	it("are declared on a live SVG only when the frame uses them", () => {
		const plain = renderSvg(scene(`<rect fill="${tok("accent")}"/>`), 0);
		assert.equal(plain.match(/style="([^"]*)"/)?.[1], cssVars(NEUTRAL, "light", ""), "no optional token");
		assert.ok(!plain.includes("--mk-caution:"));
		const using = renderSvg(scene(`<rect fill="${tok("caution")}"/>`), 0);
		assert.ok(using.includes(`--mk-caution:${NEUTRAL.light.caution}`));
		assert.ok(!using.includes("--mk-alert:"));
		// The original eight come first and unchanged, so a frame that uses none renders as it did.
		assert.equal(cssVars(NEUTRAL, "light", ""), ORIGINAL.map((t) => `--mk-${t}:${NEUTRAL.light[t]}`).join(";"));
		// A host page or player gets every token.
		assert.equal(cssVars(NEUTRAL, "dark").split(";").length, TOKENS.length);
	});

	it("leave a standalone export of a scene that does not use them unchanged", () => {
		const s = scene(`<rect fill="${tok("accent")}"/>`);
		for (const theme of ["light", "dark"]) {
			const svg = renderSvg(s, 0, { standalone: true, theme });
			assert.ok(!svg.includes("var("), "resolved");
			assert.ok(svg.includes(`fill="${NEUTRAL[theme].accent}"`));
		}
	});
});

describe("the gate and the new tokens", () => {
	const draws = (/** @type {string[]} */ names, /** @type {readonly any[] | undefined} */ contrastPairs = undefined) => ({
		id: "d",
		width: 100,
		height: 50,
		duration: 1,
		title: "t",
		description: "d",
		stepLabelsInFrame: false,
		steps: [{ at: 0.9, label: "x" }],
		// Grows for the first half second, then holds: settled at its step, rounded, and still after the end.
		frame: (/** @type {number} */ t) => `<rect width="${num(Math.min(t / 0.5, 1) * 100)}" height="50" fill="${tok(names[0])}"/>`,
		...(contrastPairs ? { contrastPairs } : {}),
	});
	const lowCaution = { name: "pale", light: { caution: "#fde68a" }, dark: {} };

	it("fails a style whose new tokens miss the pairs a scene declares", () => {
		const pairs = sharedPairs("caution/bg", "onCaution/caution");
		const scene = draws(["caution"], pairs);
		assert.deepEqual(checkScene(scene).problems, []);
		const r = checkScene(scene, { style: lowCaution });
		assert.equal(r.ok, false);
		assert.ok(r.problems.some((p) => /contrast: pale light: caution on bg is 1\.\d\d:1, needs 3:1/.test(p)), r.problems.join("; "));
		assert.ok(r.problems.some((p) => /contrast: pale light: onCaution on caution is 1\.\d\d:1, needs 4\.5:1/.test(p)), r.problems.join("; "));
		const alert = checkScene(draws(["alert"], sharedPairs("alert/bg", "onAlert/alert")), { style: { name: "pink", light: { alert: "#fecaca" } } });
		assert.ok(alert.problems.some((p) => /pink light: alert on bg/.test(p)));
	});

	it("does not fail a scene on a new pair it does not declare, and says nothing about a style that leaves them at neutral's", () => {
		const scene = draws(["accent"], sharedPairs("accent/bg"));
		assert.deepEqual(checkScene(scene, { style: lowCaution }).problems, []);
		// A scene that declares nothing is held to the shared pairs of the original eight only.
		const none = contrastReport({ name: "dim", dark: { bg: "#facc15" } });
		assert.ok(none.problems.every((p) => !/caution|alert/.test(p)), none.problems.join("; "));
		assert.deepEqual(styleWarnings({ name: "dim", dark: { bg: "#facc15" } }).filter((w) => /caution|alert/.test(w)), []);
		// A style that sets one is told when it misses its pairs, as a warning.
		const warned = styleWarnings(lowCaution);
		assert.ok(warned.some((w) => /caution on bg/.test(w) && /scenes that declare this pair/.test(w)), warned.join("; "));
		// And a declaring scene that leaves the pair out gets the same, as a warning only.
		assert.ok(contrastReport(lowCaution, sharedPairs("ink/bg")).warnings.some((w) => /caution on bg/.test(w)));
		assert.deepEqual(contrastReport(lowCaution, sharedPairs("ink/bg")).problems, []);
	});

	it("fails a scene that draws caution or alert without declaring a pair for it", () => {
		for (const token of ["caution", "alert"]) {
			const undeclared = checkScene(draws([token]));
			assert.ok(undeclared.problems.some((p) => p.startsWith(`draws ${token} but declares no contrast pair for it`)), undeclared.problems.join("; "));
			const elsewhere = checkScene(draws([token], sharedPairs("ink/bg")));
			assert.ok(elsewhere.problems.some((p) => p.startsWith(`draws ${token}`)), elsewhere.problems.join("; "));
			assert.deepEqual(checkScene(draws([token], sharedPairs(`${token}/bg`))).problems, []);
		}
		// The on-colour is covered by the pair that names it.
		assert.deepEqual(checkScene(draws(["onCaution"], sharedPairs("onCaution/caution"))).problems, []);
	});

	it("fails a font family that is not the style's, in an attribute or a style property", () => {
		const style = normalizeStyle({ name: "s", mono: '"Fira Code", monospace' });
		assert.equal(findFontLiteral(`<text font-family="${style.mono.replace(/"/g, "&quot;")}">1</text>`, style), null);
		assert.equal(findFontLiteral(`<text font-family="${style.font.replace(/"/g, "&quot;")}">1</text>`, style), null);
		assert.equal(findFontLiteral(`<text font-family="inherit">1</text>`, style), null);
		assert.equal(findFontLiteral(`<text font-family="monospace">1</text>`, style), 'font-family="monospace"');
		assert.match(findFontLiteral(`<text style="font-family: Courier">1</text>`, style) ?? "", /Courier/);
		const scene = { ...draws(["accent"], sharedPairs("accent/bg")), frame: () => `<text font-family="Courier" fill="${tok("accent")}">1</text>` };
		assert.ok(checkScene(scene).problems.some((p) => p.startsWith('font literal font-family="Courier"')));
	});
});

describe("examples/release-check.scene.mjs", () => {
	const styles = [
		["neutral", undefined],
		["own accents and mono", { name: "own", mono: '"Fira Code", monospace', light: { caution: "#8a5a00", alert: "#b3261e" }, dark: { caution: "#ffd166", alert: "#ff8a80", onAlert: "#14090a" } }],
	];

	it("uses caution, alert and the monospace face, and passes the gate in every format and two locales, in light and dark", async () => {
		for (const format of Object.keys(FORMATS)) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				for (const [name, style] of styles) {
					const r = checkScene(scene, { style });
					assert.deepEqual(r.problems, [], `${format} ${locale} ${name}`);
				}
			}
		}
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		const frame = scene.frame(scene.duration, { idPrefix: "x", style: normalizeStyle(styles[1][1]) });
		for (const t of ["caution", "onCaution", "alert", "onAlert", "accent"]) assert.ok(frame.includes(`var(--mk-${t})`), t);
		assert.ok(frame.includes("&quot;Fira Code&quot;, monospace"), "the monospace face comes from the style");
		for (const theme of ["light", "dark"]) {
			const svg = renderSvg(scene, scene.duration, { standalone: true, theme, style: styles[1][1] });
			assert.ok(!svg.includes("var("), `${theme} resolved`);
		}
	});

	it("fails with a style whose caution misses the pairs the scene declares", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		const r = checkScene(scene, { style: { name: "pale", light: { caution: "#fde68a" } } });
		assert.equal(r.ok, false);
		assert.ok(r.problems.some((p) => /caution on bg|onCaution on caution/.test(p)), r.problems.join("; "));
	});

	it("keeps the contrast of every pair it names in both neutral themes", () => {
		for (const [fg, bg] of [["caution", "bg"], ["alert", "bg"]]) for (const theme of /** @type {const} */ (["light", "dark"])) assert.ok(contrast(NEUTRAL[theme][fg], NEUTRAL[theme][bg]) >= 3);
		assert.ok(CONTRAST_PAIRS.some((p) => p.fg === "onCaution" && p.bg === "caution" && p.min === 4.5));
	});
});
