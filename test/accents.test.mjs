import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene, findColourLiteral, findFontLiteral } from "../lib/check.mjs";
import { styleWarnings } from "../lib/gate.mjs";
import { loadScene } from "../lib/load.mjs";
import { KIT } from "../runtime/kit.mjs";
import { FORMATS, renderSvg } from "../runtime/scene.mjs";
import { num } from "../runtime/svg.mjs";
import { CONTRAST_PAIRS, NEUTRAL, OPTIONAL_TOKENS, TOKENS, checkContrast, contrast, contrastReport, cssVars, normalizeStyle, paintSource, resolveTokens, setsOptionalToken, sharedPairs, tok } from "../runtime/style.mjs";

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
		assert.deepEqual(styleWarnings(normalizeStyle(lowCaution)), warned, "the same on the normalized style the CLI passes");
		assert.ok(contrastReport(lowCaution, sharedPairs("ink/bg")).warnings.some((w) => /caution on bg/.test(w)));
		assert.deepEqual(contrastReport(lowCaution, sharedPairs("ink/bg")).problems, []);
	});

	it("tells a style that sets a token from one that only overrides the canvas, raw or normalized", () => {
		const canvas = { name: "brand", light: { bg: "#a16207", surface: "#a16207" } };
		for (const style of [canvas, normalizeStyle(canvas), normalizeStyle(normalizeStyle(canvas))]) {
			assert.deepEqual(styleWarnings(style).filter((w) => /caution|alert/.test(w)), []);
			assert.ok(!contrastReport(style, sharedPairs("ink/bg")).warnings.some((w) => /caution|alert/.test(w)));
		}
		const set = normalizeStyle({ name: "set", light: { alert: "#fecaca" } });
		assert.ok(styleWarnings(set).some((w) => /alert on bg/.test(w)));
		assert.ok(!styleWarnings(set).some((w) => /caution/.test(w)), "only the token that was set");
		assert.ok(!JSON.stringify(set).includes("mk.setTokens"), "not part of the style's data");
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
		// CRLF after a backslash continues the string: no font declaration inside it.
		assert.equal(findFontLiteral('<style>text{content:"a\\\r\n;font-family:Courier"}</style>', style), null);
		// Attribute names are read in any case, as the live renderer does.
		assert.equal(findColourLiteral('<rect FILL="red"/>'), 'fill="red"');
		// <metadata> is no exemption: its SVG children can be drawn through <use>.
		assert.equal(findColourLiteral('<metadata><rect id="s-box" FILL="red"/></metadata><use href="#s-box"/>'), 'fill="red"');
		assert.match(findColourLiteral('<metadata><style>rect{fill:red}</style></metadata>') ?? "", /red/);
		// A non-breaking space is no CSS whitespace, and an unknown token is no token.
		assert.notEqual(findColourLiteral('<rect fill="var(\u00a0--mk-caution)"/>'), null);
		// The runtime agrees: no declaration, no substitution for the same spelling.
		const nbsp = '<rect fill="var(\u00a0--mk-caution)"/>';
		assert.ok(!cssVars(NEUTRAL, "light", nbsp).includes("--mk-caution"));
		assert.equal(resolveTokens(nbsp, NEUTRAL), nbsp);
		// Every XML-legal CSS whitespace (space, tab, newline, CR) is read alike by the gate, the live collector and the standalone resolver.
		const ws = '<rect fill="var(\t\n\r --mk-caution \t\n\r)"/>';
		assert.equal(findColourLiteral(ws), null);
		assert.ok(cssVars(NEUTRAL, "light", ws).includes("--mk-caution"));
		assert.ok(!resolveTokens(ws, NEUTRAL).includes("var("));
		assert.notEqual(findColourLiteral('<rect fill="var( --mk-unknown )"/>'), null);
		assert.equal(findColourLiteral('<rect fill="var( --mk-caution )"/>'), null);
		assert.match(findFontLiteral(`<text style="font-family: Courier">1</text>`, style) ?? "", /Courier/);
		assert.match(findFontLiteral(`<text style='font-family:Courier'>1</text>`, style) ?? "", /Courier/);
		assert.match(findFontLiteral(`<style>text{fill:red;font-family:Courier}</style>`, style) ?? "", /<style> font-family: Courier/);
		assert.match(findFontLiteral(`<text style="font: 12px Courier">1</text>`, style) ?? "", /shorthand/);
		assert.match(findFontLiteral(`<text font="12px Courier">1</text>`, style) ?? "", /shorthand/);
		assert.equal(findFontLiteral(`<text style="font-size:12px;font-weight:600">1</text><style>text{font-size:9px}</style>`, style), null);
		// Multiline values, comments, escapes and quoted strings.
		assert.match(findFontLiteral(`<text font-family="Courier\n New">1</text>`, style) ?? "", /Courier/);
		assert.match(findFontLiteral(`<text style="fill:red;\nfont-family: Courier">1</text>`, style) ?? "", /Courier/);
		assert.match(findFontLiteral(`<style>text{font-family/**/:Courier}</style>`, style) ?? "", /Courier/);
		assert.match(findFontLiteral(`<style>text{font-\\66 amily:Courier}</style>`, style) ?? "", /Courier/);
		assert.equal(findFontLiteral(`<style>/* font: 12px Courier */text{font-size:12px}</style>`, style), null);
		assert.equal(findFontLiteral(`<style>text{content:"font: x";font-size:12px}</style>`, style), null);
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

describe("optional token use and warnings", () => {
	it("does not count a token spelled in text, a comment or a title as a use", () => {
		const scene = { id: "d", width: 100, height: 50, duration: 1, title: "t", description: "d", stepLabelsInFrame: false, steps: [{ at: 0.9, label: "x" }], contrastPairs: sharedPairs("ink/bg"), frame: () => `<!-- var(--mk-caution) --><title>var(--mk-alert)</title><text fill="${tok("ink")}">var(--mk-caution)</text>` };
		assert.deepEqual(checkScene(scene).problems.filter((p) => p.startsWith("draws")), []);
		assert.ok(!cssVars("neutral", "light", scene.frame()).includes("--mk-caution"));
		assert.ok(cssVars("neutral", "light", `<rect fill="var(--mk-caution)"/>`).includes("--mk-caution"));
	});

	it("warns an undeclared scene about an optional pair the style sets and misses", () => {
		const style = { name: "weak", light: { caution: "#fde68a" } };
		const r = contrastReport(style, undefined);
		assert.ok(r.warnings.some((w) => w.includes("caution on bg")), r.warnings.join("; "));
		assert.deepEqual(contrastReport("neutral", undefined).warnings, []);
	});

	describe("tag and string tokenizing", () => {
		const style = normalizeStyle("neutral");
		it("keeps a > inside a quoted attribute", () => {
			assert.ok(paintSource(`<rect data-note=">" fill="var(--mk-caution)"/>`).includes("var(--mk-caution)"));
		});
		it("ignores data attributes and CSS strings", () => {
			assert.ok(!paintSource(`<text data-example="var(--mk-caution)" fill="var(--mk-ink)">x</text>`).includes("caution"));
			assert.ok(!paintSource(`<style>t::after{content:"var(--mk-alert)"}</style>`).includes("alert"));
			assert.ok(paintSource(`<style>t{fill:var(--mk-alert)}</style>`).includes("alert"));
		});
		it("finds a <style> body after a quoted > in its attributes", () => {
			const m = `<style data-note=">">text{fill:var(--mk-caution);font-family:"Courier"}</style>`;
			assert.ok(paintSource(m).includes("var(--mk-caution)"));
			assert.match(findFontLiteral(m, style) ?? "", /Courier/);
		});
		it("decodes style attribute entities", () => {
			assert.ok(!paintSource(`<text style="content:&quot;var(--mk-caution)&quot;">x</text>`).includes("caution"));
			assert.ok(paintSource(`<metadata><linearGradient id="g"><stop stop-color="var(--mk-caution)"/></linearGradient></metadata>`).includes("caution"));
		});
		it("decodes numeric character references in one pass", () => {
			assert.match(findFontLiteral(`<text style="&#70;ont-family:Courier">x</text>`, style) ?? "", /Courier/);
			assert.match(findFontLiteral(`<text style="&#x46;ont:12px Courier">x</text>`, style) ?? "", /shorthand/);
			assert.ok(paintSource(`<rect style="fill:var(&#x2d;&#45;mk-caution)"/>`).includes("var(--mk-caution)"));
			assert.equal(findFontLiteral(`<text style="&amp;#70;ont-family:Courier">x</text>`, style), null);
		});
		it("keeps stylesheets and graphics inside metadata", () => {
			assert.ok(paintSource(`<metadata><style>rect{fill:var(--mk-caution)}</style></metadata><rect/>`).includes("var(--mk-caution)"));
		});
		it("ignores font properties in conditional-rule preludes", () => {
			assert.equal(findFontLiteral(`<style>@supports ( font-family:Courier){text{font-weight:600}}</style>`, style), null);
			assert.equal(findFontLiteral(`<style>@media (min-width:1px) and (font:x){text{font-size:9px}}</style>`, style), null);
			assert.match(findFontLiteral(`<style>@supports (display:grid){text{font-family:Courier}}</style>`, style) ?? "", /Courier/);
		});
		it("trims configured families before comparing", () => {
			const s = normalizeStyle({ ...NEUTRAL, name: "t", mono: " monospace " });
			assert.equal(findFontLiteral(`<text font-family="monospace">1</text>`, s), null);
		});
		it("does not lose an escaped quote's string boundary", () => {
			assert.match(findFontLiteral(`<style>text{content:"\\"";font-family:Courier} text::after{content:"x"}</style>`, style) ?? "", /Courier/);
		});
		it("decodes a <style> body, leading zeroes and presentation attributes", () => {
			assert.match(findFontLiteral(`<style>text{font&#45;family:Courier}</style>`, style) ?? "", /Courier/);
			assert.ok(paintSource(`<rect style="fill:var(&#000000045;&#x00002d;mk-caution)"/>`).includes("var(--mk-caution)"));
			assert.ok(paintSource(`<rect fill="var(&#45;&#45;mk-caution)"/>`).includes("var(--mk-caution)"));
			assert.equal(findFontLiteral(`<style>text{font-family:Courier}</style>`.replace("Courier", "Inherit"), style), null);
			assert.equal(findFontLiteral(`<text font-family="INHERIT">x</text>`, style), null);
		});
		it("resolves an encoded token reference in a standalone export", () => {
			const out = resolveTokens(`<rect style="fill:var(&#45;&#45;mk-caution)"/><style>r{fill:var(&#45;&#45;mk-alert)}</style>`, "neutral");
			assert.ok(!out.includes("var(") && !out.includes("&#"), out);
			assert.ok(out.includes(NEUTRAL.light.caution) && out.includes(NEUTRAL.light.alert));
		});
		it("ignores a stylesheet that is not CSS", () => {
			const m = `<style type="text/plain">rect{fill:var(--mk-caution);font-family:Courier}</style>`;
			assert.ok(!paintSource(m).includes("caution"));
			assert.equal(findFontLiteral(m, style), null);
			assert.match(findFontLiteral(m.replace("text/plain", "text/css"), style) ?? "", /Courier/);
		});
		it("keeps a surrogate-pair escape from shifting the declaration match", () => {
			assert.equal(findFontLiteral(`<style>@supports (selector(.\\1f600)){text{font-family:inherit}}</style>`, style), null);
		});
		it("reads a declaration only at a declaration boundary", () => {
			assert.equal(findFontLiteral(`<style>text font:hover{font-weight:600}</style>`, style), null);
			assert.equal(findFontLiteral(`<style>text{--label: font:sample}</style>`, style), null);
			assert.match(findFontLiteral(`<style>text{font-weight:600; font:12px Courier}</style>`, style) ?? "", /shorthand/);
		});
		it("rejects a pair of one token with itself", () => {
			assert.ok(checkContrast(style, [{ fg: "caution", bg: "caution", min: 1 }])[0].includes("itself"));
		});
		it("checks the exact step frames, not only the sampled grid", () => {
			const caution = `<rect width="5" height="5" fill="var(--mk-caution)"/>`;
			const sc = { id: "s", width: 100, height: 50, duration: 4, title: "t", description: "d", stepLabelsInFrame: false, steps: [{ at: 0.5035, label: "a" }, { at: 0.53, label: "c" }, { at: 4, label: "b" }], frame: (/** @type {number} */ t) => (t > 0.5 && t < 0.52 ? caution : t >= 3.5 ? "<g/>" : "<circle r=\"1\"/>") };
			const problems = checkScene(sc).problems;
			assert.ok(problems.some((p) => p.includes("draws caution")), problems.join("; "));
			// The draw covers the step's whole look-ahead (the next step cuts it short) and no grid sample, so the draw is the only problem it causes.
			assert.ok(!problems.some((p) => p.includes("not settled")), problems.join("; "));
		});
		it("reads an empty stylesheet type as CSS and attribute names in any case", () => {
			assert.match(findFontLiteral(`<style type="">text{font-family:Courier}</style>`, style) ?? "", /Courier/);
			assert.ok(paintSource(`<style type="">rect{fill:var(--mk-caution)}</style>`).includes("caution"));
			assert.match(findFontLiteral(`<text FONT-FAMILY="Courier">x</text>`, style) ?? "", /Courier/);
			assert.match(findFontLiteral(`<text STYLE="font-family:Courier">x</text>`, style) ?? "", /Courier/);
			assert.ok(paintSource(`<rect STYLE="fill:var(--mk-caution)"/>`).includes("caution"));
		});
		it("accepts !important with spaces or comments, and a bare font: selector", () => {
			assert.equal(findFontLiteral(`<style>text{font-family:inherit !/**/important}</style>`, style), null);
			assert.equal(findFontLiteral(`<style>text{font-family:inherit ! important}</style>`, style), null);
			assert.equal(findFontLiteral(`<style>font:hover{font-weight:600}</style>`, style), null);
			assert.equal(findFontLiteral(`<style>a{x:y}font:hover{font-weight:600}</style>`, style), null);
		});
		it("does not treat a title-like attribute as paint, and decodes text beside CDATA", () => {
			assert.ok(!paintSource(`<a xlink:title="var(&#45;&#45;mk-caution)"/>`).includes("caution"));
			assert.ok(paintSource(`<style>rect{fill:var(&#45;&#45;mk-caution)}<![CDATA[ ]]></style>`).includes("var(--mk-caution)"));
		});
		it("resolves a standalone export only inside tags and stylesheets", () => {
			const out = resolveTokens(`<style data-note=">">rect{fill:var(&#45;&#45;mk-caution)}</style><text>Example x="var(&#45;&#45;mk-caution)"</text>`, "neutral");
			assert.ok(out.includes(`<style data-note=">">rect{fill:${NEUTRAL.light.caution}}</style>`), out);
			assert.ok(out.includes(`<text>Example x="var(&#45;&#45;mk-caution)"</text>`), out);
		});
		it("validates malformed or unrounded markup at a step between grid samples", () => {
			const sc = { id: "n", width: 100, height: 50, duration: 12, title: "t", description: "d", steps: [{ at: 0.242, label: "a" }, { at: 12, label: "b" }], frame: (/** @type {number} */ t) => (t > 0.24 && t < 0.29 ? `<circle r="NaN"/>` : t >= 12 ? "<g/>" : `<circle r="1"/>`) };
			assert.ok(checkScene(sc).problems.some((p) => p.includes("NaN") && p.includes("t=0.242")));
		});
		it("holds an exact step to the determinism checks, and an empty settled step to the grid's", () => {
			const year = () => (new Date().getFullYear() > 2050 ? "<g/>" : "<circle r=\"1\"/>");
			const sc = { id: "d", width: 100, height: 50, duration: 12, title: "t", description: "d", steps: [{ at: 0.242, label: "a" }, { at: 12, label: "b" }], frame: (/** @type {number} */ t) => (t > 0.24 && t < 0.29 ? year() : t >= 12 ? "<g/>" : "<rect width=\"1\" height=\"1\"/>") };
			assert.ok(checkScene(sc).problems.some((p) => p.includes("clock or randomness")));
			const empty = { id: "e", width: 100, height: 50, duration: 4, title: "t", description: "d", stepLabelsInFrame: false, steps: [{ at: 0, label: "a" }, { at: 4, label: "b" }], frame: (/** @type {number} */ t) => (t < 1 ? "" : "<g/>") };
			assert.ok(!checkScene(empty).problems.some((p) => p.includes("malformed")));
		});
		it("ends a CSS string at an unescaped newline", () => {
			assert.match(findFontLiteral(`<style>text{--label:"bad\n;font-family:Courier}</style>`, style) ?? "", /Courier/);
		});
		it("resolves a token across CDATA, with CSS whitespace, in own palette entries only", () => {
			const css = `<style>rect{fill:var(&#45;<![CDATA[-mk-caution]]>)}</style>`;
			assert.ok(paintSource(css).includes("--mk-caution"));
			assert.ok(resolveTokens(css, "neutral").includes(`fill:${NEUTRAL.light.caution}`));
			assert.ok(resolveTokens(`<rect style="fill:var( --mk-caution )"/>`, "neutral").includes(NEUTRAL.light.caution));
			assert.ok(cssVars("neutral", "light", `<rect style="fill:var( --mk-caution )"/>`).includes("--mk-caution"));
			assert.throws(() => resolveTokens(`<rect fill="var(&#45;&#45;mk-constructor)"/>`, "neutral"), /unknown style token/);
		});
		it("leaves data attributes, self-closing styles and the spelling of the tag alone", () => {
			const note = `<g data-note="var(&#45;&#45;mk-caution)"/>`;
			assert.equal(resolveTokens(note, "neutral"), note);
			const out = resolveTokens(`<style/><rect fill="var(&#45;&#45;mk-caution)"/><STYLE>a{}</STYLE>`, "neutral");
			assert.ok(out.includes(`<rect fill="${NEUTRAL.light.caution}"/>`) && out.endsWith("<STYLE>a{}</STYLE>"), out);
		});
		it("refuses a blank font and keeps a moved optional palette as set", () => {
			assert.throws(() => normalizeStyle({ mono: "  " }), /font-family list/);
			const n = normalizeStyle({ name: "t" });
			const moved = normalizeStyle({ ...n, light: { ...n.light, caution: "#123456" } });
			assert.ok(setsOptionalToken(moved, { fg: "caution", bg: "bg", min: 3 }));
		});
		it("keeps a comment marker inside a quoted family", () => {
			const s = normalizeStyle({ ...NEUTRAL, name: "t", mono: '"ACME/*Mono*/", monospace' });
			assert.equal(findFontLiteral(`<style>text{font-family:${s.mono}}</style>`, s), null);
		});
	});
});
