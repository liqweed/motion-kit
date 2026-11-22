import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkScene, colourLiteral, elementIds, findColourLiteral, wellFormed } from "../lib/check.mjs";
import { bundle } from "../lib/bundle.mjs";
import { buildHtml } from "../lib/build.mjs";
import { loadScene } from "../lib/load.mjs";
import { ADVICE_RULES, REASON_MAX, advice, adviceLines, applyAcknowledgements, printable, validateAcknowledgements } from "../runtime/advice.mjs";
import { bake, bakeStats } from "../runtime/bake.mjs";
import { DEFAULT_MOTION, cubicBezier, easeIn, easeOut, easeStandard, easings, progress, springStep, springTo, splitEdge, SPRING_SETTLE_X } from "../runtime/motion.mjs";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { maxFontSize } from "../runtime/parts.mjs";
import { claimId, claimStylesheet, newPageState } from "../runtime/page.mjs";
import * as motionMod from "../runtime/motion.mjs";
import * as sceneMod from "../runtime/scene.mjs";
import * as styleMod from "../runtime/style.mjs";
import * as svgMod from "../runtime/svg.mjs";
import * as barsMod from "../runtime/bars.mjs";
import * as connectorsMod from "../runtime/connectors.mjs";
import * as isoMod from "../runtime/iso.mjs";
import * as wrapMod from "../runtime/wrap.mjs";
import { renderSvg, safeId, stepIndex, validateScene } from "../runtime/scene.mjs";
import { checkContrast, contrast, contrastReport, CONTRAST_EXEMPT, CONTRAST_PAIRS, NEUTRAL, normalizeStyle, resolveTokens, sharedPairs } from "../runtime/style.mjs";
import { cubic, drawOn, esc, num, polyline } from "../runtime/svg.mjs";
import { createScene, SCENE_TYPE_PAIRS, SCENE_TYPES } from "../runtime/types/index.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

const EXAMPLES = ["order-flow", "smart-home"].map((n) => JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url), "utf8")));
const FORMATS = ["16:9", "4:3", "1:1", "9:16", "wide", "tall"];
const LOCALES = ["en", "nl"];

describe("motion", () => {
	for (const [name, ease] of Object.entries({ easeOut, easeStandard, easeIn })) {
		it(`${name} is monotonic 0→1 without overshoot`, () => {
			let prev = 0;
			for (let i = 0; i <= 1000; i++) {
				const v = ease(i / 1000);
				assert.ok(v >= prev - 1e-9 && v <= 1 + 1e-9, `${name}(${i / 1000}) = ${v}`);
				prev = v;
			}
			assert.equal(ease(0), 0);
			assert.equal(ease(1), 1);
		});
	}
	it("critically damped spring never overshoots and snaps to exactly 1", () => {
		let prev = 0;
		for (let i = 0; i <= 2000; i++) {
			const v = springStep(i / 1000, 12);
			assert.ok(v >= prev && v <= 1, `s(${i / 1000}) = ${v}`);
			prev = v;
		}
		assert.equal(springStep(SPRING_SETTLE_X / 12 + 1e-6, 12), 1);
		assert.equal(springStep(0, 12), 0);
	});
	it("retargeted spring is continuous at the change and reaches the last target", () => {
		const changes = [
			{ at: 0, to: 100 },
			{ at: 0.3, to: 40 },
		];
		const a = springTo(0.3 - 1e-6, 0, changes);
		const b = springTo(0.3 + 1e-6, 0, changes);
		assert.ok(Math.abs(a - b) < 1e-3, `jump ${a} → ${b}`);
		assert.equal(springTo(5, 0, changes), 40);
	});
	it("split edge: trailing edge never leads", () => {
		for (let i = 0; i <= 100; i++) {
			const { lead, trail } = splitEdge(i / 100, 0.1, 0.5);
			assert.ok(trail <= lead + 1e-12);
		}
	});
});

describe("svg", () => {
	it("escapes and rounds", () => {
		assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
		assert.equal(num(0.000025017378), "0");
		assert.equal(num(-0.001), "0");
		assert.equal(num(1.23456, 4), "1.2346");
		assert.throws(() => num(Number.NaN));
	});
	it("drawOn skips zero progress (no round-cap dot)", () => {
		assert.equal(drawOn(100, 0), null);
		assert.deepEqual(drawOn(100, 1), {});
	});
	it("polyline and cubic walk at constant arc length", () => {
		const pl = polyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
		assert.equal(pl.length, 20);
		assert.deepEqual(pl.at(0.75), { x: 10, y: 5 });
		const c = cubic({ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }, 256);
		const mid = c.at(0.5);
		assert.ok(Math.abs(mid.x - 50) < 0.5, `mid.x ${mid.x}`);
	});
});

describe("wrapLabel", () => {
	it("breaks at spaces and after a slash, no leading space", () => {
		assert.deepEqual(wrapLabel("Archive / Dispose", 9), ["Archive /", "Dispose"]);
		assert.deepEqual(wrapLabel("Pick/Pack", 6), ["Pick/", "Pack"]);
		assert.deepEqual(wrapLabel("Verzamelen / Inpakken", 12), ["Verzamelen /", "Inpakken"]);
		assert.throws(() => wrapLabel("Verzamelen / Inpakken", 11), /longer than/);
	});
	it("throws on an unbreakable word and on too many lines", () => {
		assert.throws(() => wrapLabel("Onvoorstelbaarheid", 10));
		assert.throws(() => wrapLabel("one two three four five", 5, 2));
	});
});

describe("styles", () => {
	it("neutral passes WCAG contrast in light and dark, and styles/neutral.json is NEUTRAL", () => {
		assert.deepEqual(checkContrast(NEUTRAL), []);
		assert.deepEqual(JSON.parse(readFileSync(new URL("../styles/neutral.json", import.meta.url), "utf8")), JSON.parse(JSON.stringify(NEUTRAL)));
	});
	it("fails a style whose emphasis is 1.13:1 on accent", () => {
		assert.deepEqual(checkContrast({ name: "blue", light: { accent: "#2563eb", emphasis: "#3b6cf0" } }), [
			"blue light: emphasis on accent is 1.13:1, needs 3:1",
			"blue dark: emphasis on accent is 1.13:1, needs 3:1",
		]);
	});
	it("checks every pair the scene types draw, at 4.5 for text and 3 for shapes", () => {
		const text = ["ink/bg", "ink/surface", "muted/bg", "muted/surface", "onAccent/accent"];
		const shapes = ["line/bg", "accent/bg", "emphasis/bg", "emphasis/accent"];
		assert.deepEqual(CONTRAST_PAIRS.map((p) => `${p.fg}/${p.bg}:${p.min}`), [...text.map((p) => `${p}:4.5`), ...shapes.map((p) => `${p}:3`)]);
		for (const { fg, bg, use } of CONTRAST_PAIRS) {
			assert.ok(use, `${fg} on ${bg} says where it is drawn`);
			// The fg token painted in the bg colour: 1:1, in the theme changed only.
			const problems = checkContrast({ name: "probe", light: { [fg]: NEUTRAL.light[bg] }, dark: {} });
			assert.ok(problems.includes(`probe light: ${fg} on ${bg} is 1.00:1, needs ${fg === "onAccent" || ["ink", "muted"].includes(fg) ? 4.5 : 3}:1`), `${fg} on ${bg}: ${problems.join("; ")}`);
			assert.ok(problems.every((p) => p.startsWith("probe light:")), "the dark theme is untouched");
		}
	});
	it("leaves out each exempt pair, with a reason, though a passing style fails it", () => {
		const raised = { name: "raised", dark: { surface: "#2b3242" } }; // a lighter dark surface: accent on it is 2.48:1
		assert.deepEqual(checkContrast(raised), []);
		for (const { fg, bg, why } of CONTRAST_EXEMPT) {
			assert.ok(why.length > 20, `${fg} on ${bg} says why`);
			assert.ok(!CONTRAST_PAIRS.some((p) => p.fg === fg && p.bg === bg), `${fg} on ${bg} is not checked`);
			const failing = [NEUTRAL, normalizeStyle(raised)].flatMap((s) => ["light", "dark"].map((th) => contrast(s[th][fg], s[th][bg]))).filter((r) => r < 3);
			assert.ok(failing.length > 0, `${fg} on ${bg}: some passing style is below 3:1 on it`);
		}
	});
	it("checks the pairs a scene declares against the style, and refuses malformed ones", () => {
		const pairs = [{ fg: "accent", bg: "surface", min: 3 }];
		assert.deepEqual(checkContrast({ name: "raised", dark: { surface: "#2b3242" } }, pairs), ["raised dark: accent on surface is 2.48:1, needs 3:1"]);
		assert.deepEqual(checkContrast(NEUTRAL, pairs), []);
		assert.deepEqual(checkContrast(NEUTRAL, [{ fg: "brand", bg: "bg", min: 3 }, { fg: "ink", bg: "bg", min: 0 }]), [
			'neutral: contrast pair 0 has unknown fg token "brand"',
			"neutral: contrast pair 1 needs a min contrast between 1 and 21",
		]);
		const scene = { ...clipped, contrastPairs: pairs };
		assert.deepEqual(checkScene(scene).problems, []);
		assert.deepEqual(checkScene(scene, { style: { name: "raised", dark: { surface: "#2b3242" } } }).problems, ["contrast: raised dark: accent on surface is 2.48:1, needs 3:1"]);
	});
	it("picks shared pairs by name, in the order of the shared list, and refuses an unknown one", () => {
		assert.deepEqual(sharedPairs("emphasis/bg", "ink/bg").map((p) => `${p.fg}/${p.bg}`), ["ink/bg", "emphasis/bg"]);
		assert.throws(() => sharedPairs("ink/bg", "accent/surface"), /"accent\/surface" is not a shared pair/);
	});
	it("holds a scene to the pairs it declares and only warns about the shared pairs it leaves out", () => {
		// Blue accent, a mid-tone emphasis one shade off it: fine on the canvas, 1.13:1 on the accent.
		const blue = { name: "blue", light: { accent: "#2563eb", emphasis: "#3b6cf0" } };
		// Emphasis on accent is advice, not a WCAG failure: a scene that declares nothing is still held to every other shared pair.
		assert.equal(contrastReport(blue).problems.length, 0);
		assert.deepEqual(contrastReport(blue).advice.map((a) => a.rule), ["emphasis-on-accent", "emphasis-on-accent"]);
		assert.deepEqual(contrastReport(blue).warnings, []);
		assert.ok(contrastReport({ name: "low", light: { muted: "#9a9a9a" } }).problems.length > 0, "a scene that declares nothing is held to every shared pair");
		const drawn = sharedPairs("ink/bg", "line/bg", "accent/bg", "emphasis/bg");
		assert.deepEqual(contrastReport(blue, drawn), {
			problems: [],
			advice: [],
			warnings: [
				"blue light: emphasis on accent is 1.13:1, 3:1 recommended (this scene does not draw it)",
				"blue dark: emphasis on accent is 1.13:1, 3:1 recommended (this scene does not draw it)",
			],
		});
		// Both themes, with ratio and threshold, for each pair.
		const bleak = { name: "bleak", light: { onAccent: "#9ab0ff", emphasis: "#3b6cf0", accent: "#2563eb" }, dark: { emphasis: "#2563eb" } };
		assert.deepEqual(contrastReport(bleak, drawn).warnings.map((w) => w.replace(/ is .*/, "")), ["bleak light: onAccent on accent", "bleak light: emphasis on accent", "bleak dark: emphasis on accent"]);
		assert.deepEqual(contrastReport(NEUTRAL, drawn), { problems: [], warnings: [], advice: [] });
		// What a scene declares is held to the threshold it declares, text at 4.5 included.
		assert.deepEqual(contrastReport({ name: "low", light: { muted: "#9a9a9a" } }, sharedPairs("muted/bg")).problems, ["low light: muted on bg is 2.81:1, needs 4.5:1"]);
		// A declaration cannot weaken a shared threshold, and the shared entries cannot be edited.
		assert.deepEqual(contrastReport({ name: "w", light: { ink: "#ffffff" } }, [{ fg: "ink", bg: "bg", min: 1 }]).problems.length, 1);
		// A declaration cannot classify its own pair: a hard pair stays hard whatever `advice` it carries,
		// and a stricter minimum on the advisory pair is a drawn requirement.
		const white = { name: "w", light: { ink: "#ffffff" } };
		const forged = contrastReport(white, [{ fg: "ink", bg: "bg", min: 4.5, advice: "duration" }]);
		assert.equal(forged.problems.length, 1);
		assert.deepEqual(forged.advice, []);
		assert.equal(contrastReport(blue, [{ fg: "emphasis", bg: "accent", min: 4.5 }]).problems.length > 0, true);
		assert.equal(contrastReport(blue, [{ fg: "emphasis", bg: "accent", min: 3 }]).problems.length, 0);
		// The same adjacency written the other way round meets the same floor.
		const reversed = contrastReport({ name: "r", light: { emphasis: "#2563eb", accent: "#2563eb" } }, [{ fg: "accent", bg: "emphasis", min: 1 }]);
		assert.equal(reversed.problems.length, 0);
		assert.match(reversed.advice.map((a) => a.found).join("\n"), /accent on emphasis is 1\.00:1, 3:1 recommended/);
		assert.throws(() => { "use strict"; sharedPairs("ink/bg")[0].min = 1; }, TypeError);
		// A malformed declaration is a problem and nothing else.
		assert.deepEqual(contrastReport(NEUTRAL, [{ fg: "brand", bg: "bg", min: 3 }]), { problems: ['neutral: contrast pair 0 has unknown fg token "brand"'], warnings: [], advice: [] });
	});
	it("each scene type records the shared pairs it draws, and neutral meets them all without a warning", () => {
		const shared = new Set(CONTRAST_PAIRS);
		for (const [type, pairs] of Object.entries(SCENE_TYPE_PAIRS)) {
			assert.ok(pairs.length > 0 && pairs.every((p) => shared.has(p)), `${type} draws pairs from the shared list`);
			assert.deepEqual(contrastReport(NEUTRAL, pairs), { problems: [], warnings: [], advice: [] }, type);
		}
		// Pinned per type, so dropping one (the timeline's emphasis/accent) fails here.
		const expected = {
			sequence: "ink/bg muted/bg muted/surface onAccent/accent line/bg accent/bg emphasis/bg emphasis/accent",
			"hub-spoke": "ink/surface onAccent/accent line/bg accent/bg emphasis/bg emphasis/accent",
			timeline: "ink/bg muted/bg line/bg accent/bg emphasis/bg emphasis/accent",
			stack: "ink/surface onAccent/accent line/bg accent/bg emphasis/bg emphasis/accent",
			flowchart: "ink/bg muted/bg ink/surface onAccent/accent line/bg accent/bg emphasis/bg emphasis/accent",
		};
		for (const [type, list] of Object.entries(expected)) assert.deepEqual(SCENE_TYPE_PAIRS[type].map((p) => `${p.fg}/${p.bg}`).sort(), list.split(" ").sort(), type);
		assert.equal(SCENE_TYPE_PAIRS["state-machine"], SCENE_TYPE_PAIRS["request-journey"]);
		assert.ok(Object.keys(SCENE_TYPES).every((t) => SCENE_TYPE_PAIRS[t]), "every registered type has pairs");
		for (const spec of EXAMPLES) assert.equal(createScene(spec, { format: "16:9", locale: "en" }).contrastPairs, SCENE_TYPE_PAIRS[spec.type], spec.type);
		// The ring of a sequence or flowchart sits next to the reached node, the dots of hub-spoke,
		// stack and walk ride over accent links and the timeline's axis runs into its now pill; no type draws all nine.
		const names = (type) => SCENE_TYPE_PAIRS[type].map((p) => `${p.fg}/${p.bg}`);
		assert.ok(names("sequence").includes("emphasis/accent") && names("hub-spoke").includes("emphasis/bg"));
		assert.ok(!names("timeline").includes("ink/surface") && !names("hub-spoke").includes("ink/bg"));
		assert.ok(Object.keys(SCENE_TYPE_PAIRS).every((t) => SCENE_TYPE_PAIRS[t].length < CONTRAST_PAIRS.length));
	});
	it("fails the built-in types on the pairs they draw, and a custom scene on the pairs it declares or, declaring none, on all", () => {
		const blue = { name: "blue", light: { accent: "#2563eb", emphasis: "#3b6cf0" } };
		const nothing = checkScene(clipped, { style: blue });
		assert.deepEqual(nothing.problems, [], "emphasis on accent is advice, not a failure");
		assert.deepEqual(nothing.advice.filter((a) => a.rule === "emphasis-on-accent").map((a) => a.acknowledged), [false], "declares nothing: every shared pair, so emphasis on accent is told once, for both themes");
		assert.match(nothing.advice.find((a) => a.rule === "emphasis-on-accent")?.found ?? "", /blue light: emphasis on accent is 1\.13:1, 3:1 recommended; blue dark: emphasis on accent is 1\.13:1/);
		// Declares what it draws, never emphasis: passes, with the warning.
		const scene = { ...clipped, contrastPairs: sharedPairs("ink/surface", "onAccent/accent", "line/bg", "accent/bg") };
		const r = checkScene(scene, { style: blue });
		assert.deepEqual(r.problems, []);
		assert.equal(r.ok, true);
		assert.deepEqual(r.warnings, [
			"blue light: emphasis on accent is 1.13:1, 3:1 recommended (this scene does not draw it)",
			"blue dark: emphasis on accent is 1.13:1, 3:1 recommended (this scene does not draw it)",
		]);
		// A declared text pair under 4.5:1 fails.
		const dull = { name: "dull", light: { muted: "#9a9a9a" } };
		assert.deepEqual(checkScene({ ...clipped, contrastPairs: sharedPairs("muted/bg") }, { style: dull }).problems, ["contrast: dull light: muted on bg is 2.81:1, needs 4.5:1"]);
		assert.equal(checkScene({ ...clipped, contrastPairs: sharedPairs("muted/bg") }, { style: dull }).ok, false);
		// The built-in types fail on the pairs they draw: a sequence on emphasis on accent, and
		// a sequence or a hub-spoke on an emphasis under 3:1 on the canvas.
		const hub = JSON.parse(readFileSync(new URL("../examples/smart-home.json", import.meta.url), "utf8"));
		const seq = JSON.parse(readFileSync(new URL("../examples/order-flow.json", import.meta.url), "utf8"));
		const ring = checkScene(createScene(seq, { format: "16:9", locale: "en" }), { style: blue });
		assert.equal(ring.ok, true);
		assert.ok(ring.advice.some((a) => a.rule === "emphasis-on-accent" && /emphasis on accent is 1\.13:1/.test(a.found)));
		assert.ok(checkScene(createScene(seq, { format: "16:9", locale: "en" }), { style: blue, strict: true }).problems.some((p) => /^strict mode: unacknowledged advice \[emphasis-on-accent\]/.test(p)));
		const faint = { name: "faint", light: { emphasis: "#f2f2f2" } }; // 1.1:1 on the white canvas
		for (const spec of [seq, hub]) {
			const { problems } = checkScene(createScene(spec, { format: "16:9", locale: "en" }), { style: faint });
			assert.ok(problems.some((p) => /faint light: emphasis on bg is 1\.1\d:1, needs 3:1/.test(p)), `${spec.type}: ${problems.join("; ")}`);
		}
		// A type does not fail on a pair it does not draw: the timeline has no text on a surface.
		const incident = JSON.parse(readFileSync(new URL("../examples/incident.json", import.meta.url), "utf8"));
		const dim = { name: "dim", light: { surface: "#202020" } };
		const t = checkScene(createScene(incident, { format: "16:9", locale: "en" }), { style: dim });
		assert.deepEqual(t.problems, []);
		assert.deepEqual(t.warnings.map((w) => w.replace(/ is .*/, "")), ["dim light: ink on surface", "dim light: muted on surface"]);
		// A type that does draw it fails: a hub-spoke labels its boxes in ink.
		assert.ok(checkScene(createScene(hub, { format: "16:9", locale: "en" }), { style: dim }).problems.some((p) => /dim light: ink on surface/.test(p)));
		// An empty declaration is no declaration: every shared pair is still held.
		assert.deepEqual(checkScene({ ...clipped, contrastPairs: [] }, { style: blue }).advice, nothing.advice);
		assert.deepEqual(checkScene(createScene(incident, { format: "16:9", locale: "en" })).warnings, [], "neutral: no warnings");
	});
	it("rejects unknown tokens and non-hex colours", () => {
		assert.throws(() => normalizeStyle({ light: { brand: "#000000" } }));
		assert.throws(() => normalizeStyle({ light: { accent: "blue" } }));
		assert.throws(() => resolveTokens("var(--mk-nope)", NEUTRAL));
	});
	it("rejects a font that could break out of CSS or markup", () => {
		assert.equal(normalizeStyle({ font: 'Inter, "Segoe UI", sans-serif' }).font, 'Inter, "Segoe UI", sans-serif');
		for (const font of ["x}body{color:red", "x</style>", "x;--mk-bg:red"]) assert.throws(() => normalizeStyle({ font }), /font must be/);
	});
});

describe("scenes", () => {
	for (const spec of EXAMPLES) {
		for (const format of FORMATS) {
			for (const locale of LOCALES) {
				it(`${spec.id} · ${format} · ${locale} passes the gate`, () => {
					const scene = createScene(spec, { format, locale });
					const { problems } = checkScene(scene);
					assert.deepEqual(problems, []);
				});
			}
		}
	}
	it("escapes label text", () => {
		const spec = { ...EXAMPLES[0], nodes: [{ label: "<script>x</script>" }, { label: "A & B" }] };
		const svg = renderSvg(createScene(spec, { format: "16:9" }), 99);
		assert.ok(!svg.includes("<script>"));
		assert.ok(svg.includes("A &amp; B"));
		assert.equal(wellFormed(svg), null);
	});
	it("standalone export resolves every token", () => {
		const svg = renderSvg(createScene(EXAMPLES[1], { format: "16:9" }), 99, { standalone: true, theme: "dark" });
		assert.ok(!svg.includes("var(--"));
		assert.ok(svg.includes(NEUTRAL.dark.accent));
	});
	it("refuses a layout that cannot fit", () => {
		const many = { ...EXAMPLES[1], spokes: Array.from({ length: 10 }, (_, i) => ({ label: `Spoke ${i}` })) };
		assert.throws(() => createScene(many, { format: "1:1" }), /overlap|outside/);
	});
});

// A scene with a clip path whose id follows the instance prefix, as the
// contract asks. The bar grows to half by 0.8 s, holds through the first
// step, and grows to full from 1.1 s to 1.9 s.
const clipped = {
	id: "clipped", width: 100, height: 40, duration: 2, title: "Clip", description: "A bar grows under a clip path.", stepLabelsInFrame: false,
	steps: [{ at: 1, label: "Half", id: "half" }, { at: 2, label: "Full", id: "full" }],
	frame: (t, { idPrefix }) => {
		const w = Math.round(50 * Math.min(t / 0.8, 1) + 50 * Math.min(Math.max((t - 1.1) / 0.8, 0), 1));
		return `<defs><clipPath id="${idPrefix}-clip"><rect width="${w}" height="40"/></clipPath></defs><rect width="100" height="40" fill="var(--mk-accent)" clip-path="url(#${idPrefix}-clip)"/>`;
	},
};
const ids = (svg) => [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);

describe("instance ids", () => {
	it("renderSvg passes its id prefix to frame(), as a safe id token", () => {
		const a = renderSvg(clipped, 2, { idPrefix: "a" });
		const b = renderSvg(clipped, 2, { idPrefix: "b" });
		assert.deepEqual(ids(a), ["a-title", "a-desc", "a-clip"]);
		assert.deepEqual(ids(a).filter((id) => ids(b).includes(id)), []);
		assert.ok(a.includes('clip-path="url(#a-clip)"'));
		assert.deepEqual(ids(renderSvg(clipped, 2)), ["clipped-title", "clipped-desc", "clipped-clip"]);
		assert.equal(safeId("order-flow-16x9"), "order-flow-16x9");
		assert.equal(safeId('x" onload="y'), "x-onload-y");
		assert.equal(safeId("16:9"), "mk-16-9");
	});
	it("the gate accepts prefixed ids and refuses fixed ones, without mistaking url(#…) for a colour", () => {
		assert.deepEqual(checkScene(clipped).problems, []);
		const hexy = { ...clipped, id: "face", frame: (t) => clipped.frame(t, { idPrefix: "face" }) };
		const { problems } = checkScene(hexy);
		assert.equal(problems.length, 1);
		assert.match(problems[0], /fixed id "face-clip"/);
	});
	it("the gate refuses one id twice in a single frame", () => {
		const twice = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}${clipped.frame(t, o)}` };
		const { problems } = checkScene(twice);
		assert.ok(problems.some((p) => /duplicate id ".*-clip"/.test(p)), problems.join("; "));
	});
	it("the id scan reads element attributes, decoded, on every sampled frame", () => {
		// A stylesheet selector on an id is no declaration.
		const styled = { ...clipped, frame: (t, o) => `<style>[ id="${o.idPrefix}-clip"] { opacity: 1 }</style>${clipped.frame(t, o)}` };
		assert.deepEqual(checkScene(styled).problems, []);
		// "c" and its character reference are one id.
		const spelled = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="${o.idPrefix}-&#99;lip"/>` };
		assert.ok(checkScene(spelled).problems.some((p) => /duplicate id/.test(p)));
		// A duplicate only between the sparse id probes (t = 0.1 … 0.15 s) is still found.
		const brief = { id: "brief", width: 100, height: 40, duration: 1, title: "B", description: "B", stepLabelsInFrame: false, steps: [{ at: 1, label: "End" }], frame: (t, { idPrefix }) => `<rect id="${idPrefix}-a" width="${Math.round(t * 50)}" height="4" fill="var(--mk-accent)"/>${t > 0.1 && t < 0.15 ? `<rect id="${idPrefix}-a" width="1" height="1" fill="var(--mk-accent)"/>` : ""}` };
		assert.ok(checkScene(brief).problems.some((p) => /duplicate id/.test(p)));
		// The live patcher lowercases attribute names: ID and id are one declaration.
		const upper = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g ID="${o.idPrefix}-clip"/>` };
		assert.ok(checkScene(upper).problems.some((p) => /duplicate id/.test(p)));
		// A C1 reference is remapped by the HTML parser (&#150; is an en dash): same id as the dash.
		const c1 = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="${o.idPrefix}-a&#150;b"/><g id="${o.idPrefix}-a\u2013b"/>` };
		assert.ok(checkScene(c1).problems.some((p) => /duplicate id/.test(p)));
		// The fixed id of one prefix's wrapper (mk-gate-a-title) collides only in that render.
		const wrapperId = { ...clipped, id: "other", frame: (t, o) => `${clipped.frame(t, o)}<g id="mk-gate-a-title"/>` };
		assert.ok(checkScene(wrapperId).problems.some((p) => /duplicate id "mk-gate-a-title"/.test(p)));
		// The patcher keeps an element's first id: a second, differently cased attribute declares nothing.
		const twoAttrs = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="${o.idPrefix}-p" ID="${o.idPrefix}-q"/><g id="${o.idPrefix}-q"/>` };
		assert.deepEqual(checkScene(twoAttrs).problems, []);
		// Uppercase hex references and CRLF in an id read as the parser reads them.
		const hexX = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="${o.idPrefix}-&#X61;"/><g id="${o.idPrefix}-a"/>` };
		assert.ok(checkScene(hexX).problems.some((p) => /duplicate id/.test(p)));
		const crlf = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="${o.idPrefix}-a\r\nb"/><g id="${o.idPrefix}-a\nb"/>` };
		assert.ok(checkScene(crlf).problems.some((p) => /duplicate id/.test(p)));
		// Fixed ids that appear at different times for each prefix still collide across seekable players.
		const split = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="shared-${t < 0.5 ? (o.idPrefix === "mk-gate-a" ? "x" : "y") : o.idPrefix === "mk-gate-a" ? "y" : "x"}"/>` };
		assert.ok(checkScene(split).problems.some((p) => /fixed id "shared-/.test(p)));
		// Control characters in an id never reach a diagnostic raw.
		const ctrl = { ...clipped, frame: (t, o) => `${clipped.frame(t, o)}<g id="x&#27;[2J"/><g id="x&#27;[2J"/>` };
		const msg = checkScene(ctrl).problems.join("\n");
		assert.match(msg, /duplicate id "x\\u001b\[2J"/);
		assert.ok(!msg.includes("\u001b"));
	});
	it("G10 reads a drawn label by what it displays, not how its characters are spelled", () => {
		const s = { id: "ship", width: 100, height: 40, duration: 1, title: "Ship", description: "A label spelled with a reference.", steps: [{ at: 1, label: "Ship" }], frame: (t) => `<rect width="${t < 0.5 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text>&#83;hip</text>` };
		assert.ok(!checkScene(s).advice.some((a) => a.rule === "step-labels-in-frame"));
	});
	it("bake prefixes slices whose only id attribute is uppercase", () => {
		const upper = { ...clipped, frame: (t, o) => clipped.frame(t, o).replaceAll(' id="', ' ID="') };
		const all = elementIds(bake(upper, { fps: 4 }));
		assert.ok(all.length > 2);
		assert.equal(new Set(all).size, all.length);
	});
	it("bake gives each slice that defines ids its own prefix", () => {
		const svg = bake(clipped, { fps: 4 });
		const all = ids(svg);
		assert.equal(new Set(all).size, all.length);
		assert.ok(all.filter((id) => id.endsWith("-clip")).length > 2);
		assert.equal(wellFormed(svg), null);
		assert.ok(!bake(clipped, { fps: 4, idPrefix: "other" }).includes('id="mk-bake'));
	});
});

/**
 * A probe scene: the settled `clipped` bar plus `extra(t)` markup.
 * @param {(t: number) => string} extra
 */
const probe = (extra) => ({ ...clipped, id: "probe", frame: (t, ctx) => clipped.frame(t, ctx) + extra(t) });

describe("gate probes", () => {
	it("refuses named colours and other literal forms where a token is expected", () => {
		for (const markup of ['<circle r="4" fill="red"/>', '<path d="M0 0" stroke="RebeccaPurple"/>', '<stop stop-color="white"/>', '<rect style="fill: navy"/>', '<feFlood flood-color="black"/>', '<rect fill="var(--brand)"/>', '<rect fill="var(--mk-accent, red)"/>', '<rect fill="oklch(70% 0.1 200)"/>', '<style>.x{stroke:teal}</style>']) {
			const { problems } = checkScene(probe(() => markup));
			assert.ok(problems.length > 0, markup);
			for (const p of problems) assert.match(p, /^colour literal .* at t=[\d.]+ \(use tok\(\)\)$/, markup);
		}
		assert.equal(colourLiteral("red"), "red");
		assert.equal(colourLiteral("var(--mk-accent) !important"), null);
	});
	it("accepts tokens, references and colourless keywords, and ignores text", () => {
		const ok = '<g fill="none" stroke="currentColor" color="inherit"><rect fill="url(#probe-g) var(--mk-accent)" stroke="transparent"/><text fill="var(--mk-ink)">#1 red: rgb(0 0 0)</text><use href="#probe-g"/></g>';
		assert.deepEqual(checkScene(probe(() => ok)).problems, []);
		assert.equal(findColourLiteral('<rect style="fill: var(--mk-accent); stroke: none"/>'), null);
	});
	it("reads declarations, not selectors, in a stylesheet", () => {
		assert.equal(findColourLiteral('<style>#face-node{fill:var(--mk-accent)} @media print{#abc .x{stroke:none}}</style>'), null);
		assert.match(findColourLiteral('<style>#face-node{fill:#abcdef}</style>') ?? "", /fill/);
	});
	it("rejects a fontSize that would stall the fit search", () => {
		for (const fontSize of [1e20, Infinity, NaN, 3]) {
			assert.throws(() => maxFontSize({ fontSize }, 16, "x"), /fontSize must be/);
		}
		assert.equal(maxFontSize({}, 16, "x"), 16);
		assert.equal(maxFontSize({ fontSize: 20 }, 16, "x"), 20);
	});
	it("catches the clock or randomness read in a helper the frame calls", () => {
		const originals = [Date, Date.now, performance.now, Math.random];
		const year = () => new Date().getUTCFullYear();
		const jitter = () => (Math.random() < 0.5 ? 1 : 2);
		const later = () => (performance.now() > 1e8 ? "late" : "early");
		for (const helper of [year, jitter, later]) {
			const scene = probe(() => `<text fill="var(--mk-ink)">${helper()}</text>`);
			assert.ok(!/Date|random|performance/.test(scene.frame.toString()), "the frame's own source is clean");
			const { problems } = checkScene(scene);
			assert.ok(problems.some((p) => /reads the clock or randomness/.test(p)), `${helper.name}: ${problems.join("; ")}`);
		}
		// The globals are restored afterwards: the same functions, not stand-ins.
		assert.deepEqual([Date, Date.now, performance.now, Math.random], originals);
	});
	it("catches a slow fade passing through a step, which the 1 ms look-back misses", () => {
		// 0.23 at 0.9 s, 0.25 at 1 s (the step), 0.28 at 1.1 s.
		const fade = (t) => `<circle r="4" fill="var(--mk-emphasis)" opacity="${num(0.25 + 0.25 * (Math.min(Math.max(t, 0.2), 1.8) - 1), 3)}"/>`;
		const scene = probe(fade);
		assert.equal(renderSvg(scene, 0.999), renderSvg(scene, 1), "invisible over 1 ms after rounding");
		const { problems } = checkScene(scene);
		assert.deepEqual(problems, ['step "Half" at 1.000s is not settled: the frame 15 ms after differs (something is still moving)']);
		// An eased motion that comes to rest at the step, and the next beat 50 ms later, are settled.
		const beat = (t) => `<circle r="4" fill="var(--mk-emphasis)" opacity="${num(0.2 + 0.3 * progress(t, 0.6, 0.4, easeStandard) + 0.3 * progress(t, 1.05, 0.4, easeStandard), 3)}"/>`;
		assert.deepEqual(checkScene(probe(beat)).problems, []);
		// A linear one that stops abruptly at the step still moves 1 ms before it.
		const abrupt = (t) => `<circle r="4" fill="var(--mk-emphasis)" opacity="${num(0.2 + 0.6 * Math.min(Math.max((t - 0.6) / 0.4, 0), 1), 3)}"/>`;
		assert.deepEqual(checkScene(probe(abrupt)).problems, ['step "Half" at 1.000s is not settled: the frame 1 ms before differs (something is still moving)']);
	});
});

describe("step ids", () => {
	it("validates and looks up step ids", () => {
		assert.equal(stepIndex(clipped, "full"), 1);
		assert.equal(stepIndex(clipped, 0), 0);
		assert.throws(() => stepIndex(clipped, "nope"), RangeError);
		assert.throws(() => stepIndex(clipped, 2), RangeError);
		assert.throws(() => validateScene({ ...clipped, steps: [{ at: 1, label: "a", id: "x" }, { at: 2, label: "b", id: "x" }] }), /share the id "x"/);
		assert.throws(() => validateScene({ ...clipped, steps: [{ at: 1, label: "a", id: "" }] }), /not a non-empty string/);
	});
	it("scene types pass a spec's ids on to their steps", () => {
		const seq = { ...EXAMPLES[0], nodes: EXAMPLES[0].nodes.map((n, i) => (i === 1 ? { ...n, id: "payment" } : n)) };
		const scene = createScene(seq, { format: "16:9", locale: "nl" });
		assert.equal(scene.steps[1].id, "payment");
		assert.equal(scene.steps[0].id, undefined);
		assert.ok(!("id" in scene.steps[0]));
		const hub = { ...EXAMPLES[1], hub: { ...EXAMPLES[1].hub, id: "hub" }, spokes: EXAMPLES[1].spokes.map((s, i) => ({ ...s, id: `spoke-${i}` })) };
		assert.deepEqual(createScene(hub, { format: "1:1" }).steps.map((s) => s.id), ["hub", ...EXAMPLES[1].spokes.map((_, i) => `spoke-${i}`)]);
	});
});

describe("custom scene modules", () => {
	const make = (opts) => ({ ...clipped, title: opts.labels?.title ?? "Clip", id: `m-${opts.format}-${opts.locale}`, seen: opts });
	it("pass the caller's options to the factory unchanged, with format, locale and kit", () => {
		const labels = { title: "Twee stappen" };
		const scene = /** @type {any} */ (sceneFromModule(make, { format: "tall", locale: "nl", options: { labels, view: "short" } }));
		assert.equal(scene.title, "Twee stappen");
		assert.equal(scene.seen.labels, labels);
		assert.equal(scene.seen.view, "short");
		assert.equal(scene.seen.kit, KIT);
		assert.equal(scene.id, "m-tall-nl");
		assert.equal(typeof KIT.tok, "function");
	});
	it("refuse reserved option names and a default export that is not a factory", () => {
		for (const key of ["format", "locale", "kit"]) assert.throws(() => sceneFromModule(make, { options: { [key]: "x" } }), new RegExp(`must not set "${key}"`));
		assert.throws(() => sceneFromModule(make, { options: /** @type {any} */ ([]) }), /plain object/);
		assert.throws(() => sceneFromModule({}), /must be \(opts\) => scene/);
	});
});

describe("bake", () => {
	it("produces one well-formed zero-JS SVG that holds the final frame", () => {
		const scene = createScene(EXAMPLES[0], { format: "16:9" });
		const svg = bake(scene, { fps: 12 });
		assert.equal(wellFormed(svg), null);
		assert.ok(!/<script/i.test(svg));
		const { frames, bytes } = bakeStats(svg);
		assert.ok(frames > 10 && frames <= Math.ceil(scene.duration * 12) + 1, `frames ${frames}`);
		assert.ok(bytes < 1_500_000, `bytes ${bytes}`);
		assert.ok(svg.includes("mk-last"));
		assert.ok(svg.includes("prefers-reduced-motion"));
	});
});

describe("bundle", () => {
	it("keeps a runtime-only global that a later entry cannot shadow", () => {
		const root = fileURLToPath(new URL("../runtime/", import.meta.url));
		const custom = fileURLToPath(new URL("./fixtures-shadow.mjs", import.meta.url));
		writeFileSync(custom, "export const progress = 1;\n");
		try {
			const ctx = vm.createContext({});
			vm.runInContext(bundle([`${root}motion.mjs`, custom], { runtimeName: "MotionKitRuntime", runtimeCount: 1 }), ctx);
			assert.equal(ctx.MotionKit.progress, 1);
			assert.equal(typeof ctx.MotionKitRuntime.progress, "function");
		} finally {
			rmSync(custom, { force: true });
		}
	});
	it("inlines the runtime into one script that renders the same bytes as Node", () => {
		const root = fileURLToPath(new URL("../runtime/", import.meta.url));
		const code = bundle([`${root}types/index.mjs`, `${root}scene.mjs`, `${root}bake.mjs`]);
		assert.ok(!/^\s*import\s/m.test(code));
		assert.ok(!/https?:\/\//.test(code.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")));
		const ctx = vm.createContext({});
		vm.runInContext(code, ctx);
		const scene = ctx.MotionKit.createScene(EXAMPLES[0], { format: "wide", locale: "nl" });
		const ref = createScene(EXAMPLES[0], { format: "wide", locale: "nl" });
		for (const t of [0, 0.7, 2.2, ref.duration]) {
			assert.equal(ctx.MotionKit.renderSvg(scene, t), renderSvg(ref, t));
		}
	});
});

describe("buildHtml", () => {
	it("cannot be broken out of its inline script by an option string", async () => {
		const file = fileURLToPath(new URL("../examples/custom-pulse.scene.mjs", import.meta.url));
		const options = { labels: { title: "</script><b>x" } };
		const loaded = await loadScene(file, { format: "wide", locale: "en", options });
		const html = buildHtml(loaded, { style: normalizeStyle("neutral"), format: "wide", locale: "en", options });
		const script = html.slice(html.lastIndexOf("<script>"));
		assert.equal(script.match(/<\/script>/g)?.length, 1, "only the closing tag ends the script");
		assert.ok(script.includes("\\u003c/script>"));
		assert.match(script, /MotionKitRuntime\.validateScene\(/);
		assert.match(script, /MotionKitRuntime\.mountPlayer\(/);
	});
	it("bundles the page-link helpers, so a built page can bind scroll and hover", async () => {
		const loaded = await loadScene(fileURLToPath(new URL("../examples/order-flow.json", import.meta.url)), { format: "wide", locale: "en" });
		const html = buildHtml(loaded, { style: normalizeStyle("neutral"), format: "wide", locale: "en" });
		const script = html.slice(html.lastIndexOf("<script>") + "<script>".length, html.lastIndexOf("(function () {"));
		const ctx = vm.createContext({});
		vm.runInContext(script, ctx);
		for (const name of ["scrollSteps", "linkSteps"]) assert.equal(typeof ctx.MotionKitRuntime[name], "function", name);
	});
});

/**
 * A custom module that takes the isometric helpers from `kit` alone (no import),
 * and keeps the `kit` it was handed on `globalThis` for the test to inspect.
 */
const KIT_ONLY_SCENE = `
export default function make({ format = "16:9", kit }) {
	const { box, camera, drawSolids, labelAnchor, num, tok } = kit;
	globalThis.__seenKit = kit;
	const cam = camera({ azimuth: 45, zoom: 20, pan: { x: 200, y: 150 } });
	const label = (t) => labelAnchor(cam, { id: "a", at: { x: 0, y: 0, z: 2 }, lines: ["Box"], opacity: num(Math.min(1, t)) });
	return {
		id: "kit-only-" + format.replace(":", "x"),
		width: 400,
		height: 300,
		duration: 1,
		title: "Kit only",
		description: "A box drawn through kit alone.",
		stepLabelsInFrame: false,
		steps: [{ at: 1, label: "Done", detail: "The box stands." }],
		labelBoxes: (t) => [label(t).box],
		frame: (t) => drawSolids([box({ x: 0, y: 0, w: 2, d: 2, h: 2, fill: "accent", id: "b" })], cam) + label(t).markup,
	};
}
`;

describe("buildHtml with a custom module that reaches the kit only through kit", () => {
	/** Build the page for the module, run its bundle in a fresh context and return the scene it makes. */
	async function built() {
		const dir = mkdtempSync(join(tmpdir(), "mk-kit-only-"));
		try {
			const file = join(dir, "kit-only.scene.mjs");
			writeFileSync(file, KIT_ONLY_SCENE);
			const loaded = await loadScene(file, { format: "wide", locale: "en" });
			const html = buildHtml(loaded, { style: normalizeStyle("neutral"), format: "wide", locale: "en" });
			const script = html.slice(html.lastIndexOf("<script>") + "<script>".length, html.lastIndexOf("(function () {"));
			const make = /var scene = (.*);\n/.exec(html)?.[1];
			assert.ok(make, "the page makes its scene in one expression");
			const ctx = vm.createContext({});
			vm.runInContext(script, ctx);
			return { loaded, ctx, scene: vm.runInContext(make, ctx) };
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}
	it("renders the same bytes in the page as in Node, without throwing", async () => {
		const { loaded, scene } = await built();
		assert.equal(scene.id, loaded.scene.id);
		for (const t of [0, 0.4, 1]) {
			const svg = scene.frame(t);
			assert.ok(svg.includes("<polygon") || svg.includes("<path"), "the box is drawn");
			assert.equal(svg, loaded.scene.frame(t));
		}
	});
	it("hands the module the same names as the Node kit", async () => {
		const { ctx } = await built();
		assert.deepEqual(Object.keys(ctx.__seenKit).sort(), Object.keys(KIT).sort());
	});
});

describe("KIT", () => {
	it("holds every export of the motion, scene, style, svg, iso, connectors, bars and wrap modules", () => {
		for (const mod of [motionMod, sceneMod, styleMod, svgMod, isoMod, connectorsMod, barsMod, wrapMod]) {
			for (const name of Object.keys(mod)) assert.ok(name in KIT, `KIT lacks ${name}`);
		}
	});
});

describe("page state", () => {
	it("claims generated and requested ids, once each", () => {
		const page = newPageState();
		assert.equal(claimId(page, undefined, "flow"), "mk-flow-1");
		assert.equal(claimId(page, undefined, "flow"), "mk-flow-2");
		assert.equal(claimId(page, "mine", "flow"), "mine");
		assert.equal(claimId(page, "mk-flow-3", "flow"), "mk-flow-3");
		assert.equal(claimId(page, undefined, "flow"), "mk-flow-4", "a generated id skips one a request took");
		assert.throws(() => claimId(page, "mine", "flow"), /already used/);
		assert.throws(() => claimId(page, "1bad", "flow"), /must be letters/);
	});
	it("hands out the stylesheet once", () => {
		const page = newPageState();
		assert.equal(claimStylesheet(page), true);
		assert.equal(claimStylesheet(page), false);
	});
});

describe("style motion", () => {
	const CUSTOM = { enter: [0.16, 1, 0.3, 1], move: [0.23, 1, 0.32, 1] };
	const NAMES = ["order-flow", "smart-home", "incident", "web-stack", "checkout", "player-states", "pull-request"];
	const load = (name) => createScene(JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8")));

	it("defaults to the curves the runtime names, and fills in a missing one", () => {
		assert.equal(NEUTRAL.motion, DEFAULT_MOTION);
		assert.equal(easings(NEUTRAL.motion).easeOut, easeOut);
		assert.equal(easings().easeStandard, easeStandard);
		assert.deepEqual(normalizeStyle({ motion: { move: [0.2, 0, 0, 1] } }).motion, { enter: DEFAULT_MOTION.enter, move: [0.2, 0, 0, 1] });
		const custom = easings(normalizeStyle({ motion: CUSTOM }).motion);
		assert.equal(custom.easeOut, easings(normalizeStyle({ motion: CUSTOM }).motion).easeOut, "one curve is built once");
		assert.ok(custom.easeOut(0.2) > easeOut(0.2), "a steeper curve is further along early");
	});
	it("rejects a curve that is not four numbers from 0 to 1, and unknown names", () => {
		for (const motion of [{ enter: [0, 0, 1] }, { enter: [0, 0, 0.2, 1.2] }, { move: [0.4, -0.1, 0.2, 1] }, { move: [1.1, 0, 0.2, 1] }, { move: [0, 0, 0, NaN] }, { move: "ease" }, []]) {
			assert.throws(() => normalizeStyle({ name: "bad", motion }), /motion/, JSON.stringify(motion));
		}
		assert.throws(() => normalizeStyle({ name: "bad", motion: { exit: [0, 0, 1, 1] } }), /unknown motion curve "exit"/);
	});
	it("moves every scene type on the style's curves between steps and leaves settled frames alone", () => {
		for (const name of NAMES) {
			const scene = load(name);
			const style = { motion: CUSTOM };
			let differs = false;
			for (let t = 0.05; t < scene.duration; t += 0.05) differs ||= renderSvg(scene, t) !== renderSvg(scene, t, { style });
			assert.ok(differs, `${name}: a custom curve changes some frame`);
			for (const step of scene.steps) assert.equal(renderSvg(scene, step.at, { style }), renderSvg(scene, step.at), `${name}: step "${step.label}" is settled`);
			assert.equal(renderSvg(scene, scene.duration, { style }), renderSvg(scene, scene.duration), `${name}: final frame`);
			assert.deepEqual(checkScene(scene, { style }).problems, [], name);
			assert.equal(renderSvg(scene, 0.7, { style }), renderSvg(scene, 0.7, { style }), `${name}: same t, same bytes`);
		}
	});
	it("keeps every step settled, one millisecond before and after, for every permitted curve", () => {
		// Linear, slow-ending, ease-in and steep-ending curves are the ones that still move at a fill's end.
		const CURVES = [[0, 0, 1, 1], [0.4, 0, 0.9, 1], [0.42, 0, 1, 1], [0.1, 0.9, 0.9, 0.8], [0, 0, 0.58, 1], [0.23, 1, 0.32, 1]];
		for (const curve of CURVES) {
			const style = { motion: { enter: curve, move: curve } };
			for (const name of NAMES) {
				const scene = load(name);
				assert.deepEqual(checkScene(scene, { style }).problems, [], `${name} on [${curve}]`);
				for (const step of scene.steps) {
					assert.equal(renderSvg(scene, step.at - 0.001, { style }), renderSvg(scene, step.at, { style }), `${name} "${step.label}" 1 ms before, on [${curve}]`);
				}
			}
		}
	});
	it("holds a curve that does not settle by itself at 1 for the last 5 % of a move, and leaves a flat-ending one exact", () => {
		const linear = easings({ enter: [0, 0, 1, 1], move: [0, 0, 1, 1] }).easeStandard;
		assert.equal(linear(0), 0);
		assert.ok(Math.abs(linear(0.5) - 0.5 / 0.95) < 1e-9, "the same curve, finished early");
		for (const p of [0.95, 0.99, 0.995, 1]) assert.equal(linear(p), 1);
		const ends = normalizeStyle({ motion: { enter: [0.16, 1, 0.3, 1], move: [0.23, 1, 0.32, 1] } }).motion;
		assert.equal(easings(ends).easeStandard(0.97), cubicBezier(0.23, 1, 0.32, 1)(0.97), "a curve that ends flat is the CSS curve");
	});
	it("hands custom scenes the normalized motion", () => {
		let seen;
		const scene = sceneFromModule(() => ({ id: "m", width: 10, height: 10, duration: 1, title: "t", description: "d", steps: [{ at: 1, label: "s" }], frame: (t, ctx) => ((seen = ctx.style.motion), "") }));
		renderSvg(scene, 0, { style: { motion: CUSTOM } });
		assert.deepEqual(seen, CUSTOM);
	});
});

describe("advice and acknowledgements", () => {
	const still = { id: "still", width: 100, height: 40, duration: 1, title: "Still", description: "A mark that does not move.", steps: [{ at: 1, label: "Mark" }], frame: () => `<rect width="100" height="40" fill="var(--mk-accent)"/><text x="4" y="20">Mark</text>` };
	const ruleOf = (r) => r.advice.map((a) => a.rule);
	it("says what a scene that breaks the canon is told, in the rule's own words", () => {
		const r = checkScene(still);
		assert.equal(r.ok, true);
		assert.deepEqual(ruleOf(r), ["nothing-animates"]);
		const [a] = r.advice;
		assert.equal(a.acknowledged, false);
		for (const k of ["found", "why", "whenFine", "alternative"]) assert.ok(a[k].length > 20, k);
		assert.deepEqual(adviceLines(a)[0], "advice [nothing-animates]: the first and the last frame are identical");
		assert.equal(adviceLines(a).length, 5);
		// A step label the frame does not draw, and a scene over 12 s.
		const loose = checkScene({ ...still, duration: 14, steps: [{ at: 14, label: "Elsewhere" }], frame: (t) => `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/>` });
		assert.equal(loose.ok, true, "advice alone leaves an otherwise valid scene passing");
		assert.deepEqual(ruleOf(loose).sort(), ["duration", "step-labels-in-frame"]);
		assert.match(loose.advice.find((x) => x.rule === "step-labels-in-frame")?.found ?? "", /"Elsewhere" not found in the final frame/);
	});
	it("reports an acknowledged rule with its reason, and fails only unacknowledged advice, only in strict mode", () => {
		const said = { ...still, acknowledge: [{ rule: "nothing-animates", reason: "A still logo mark." }] };
		const r = checkScene(said, { strict: true });
		assert.equal(r.ok, true);
		assert.deepEqual(r.advice.map((a) => [a.rule, a.acknowledged, a.reason]), [["nothing-animates", true, "A still logo mark."]]);
		assert.deepEqual(adviceLines(r.advice[0]), ["acknowledged [nothing-animates]: A still logo mark."]);
		const strict = checkScene(still, { strict: true });
		assert.equal(strict.ok, false);
		assert.match(strict.problems[0], /^strict mode: unacknowledged advice \[nothing-animates\] \(fix it, or acknowledge it with a reason\)$/);
		assert.equal(checkScene(still).ok, true, "off by default");
		// Acknowledging a rule nothing broke is said; a narrative scene's flag is its own acknowledgement.
		assert.deepEqual(checkScene({ ...said, frame: (t) => `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text>Mark</text>` }).unusedAcknowledgements, ["nothing-animates"]);
		const narrative = checkScene({ ...clipped, steps: [{ at: 1, label: "Half" }, { at: 2, label: "Not drawn" }] }, { strict: true });
		assert.equal(narrative.ok, true);
		assert.deepEqual(narrative.advice.map((a) => [a.rule, a.reason]), [["step-labels-in-frame", "narrative steps (stepLabelsInFrame: false)"]]);
	});
	it("strict mode names every open rule once and leaves the acknowledged one out", () => {
		const scene = { ...still, duration: 14, steps: [{ at: 14, label: "Elsewhere" }], acknowledge: [{ rule: "step-labels-in-frame", reason: "Narrative steps." }] };
		const r = checkScene(scene, { strict: true });
		assert.deepEqual(ruleOf(r).sort(), ["duration", "nothing-animates", "step-labels-in-frame"]);
		assert.deepEqual(r.advice.filter((a) => a.acknowledged).map((a) => a.rule), ["step-labels-in-frame"]);
		assert.deepEqual(r.problems, ["strict mode: unacknowledged advice [nothing-animates, duration] (fix it, or acknowledge it with a reason)"]);
	});
	it("strict mode with two open rules and one acknowledged names exactly the open two", () => {
		const scene = { ...still, duration: 14, steps: [{ at: 14, label: "Elsewhere" }], acknowledge: [{ rule: "duration", reason: "Voice-over sets the pace." }] };
		const r = checkScene(scene, { strict: true });
		assert.deepEqual(r.problems, ["strict mode: unacknowledged advice [nothing-animates, step-labels-in-frame] (fix it, or acknowledge it with a reason)"]);
		assert.deepEqual(r.advice.filter((a) => a.acknowledged).map((a) => a.rule), ["duration"]);
	});
	it("checks the hard frame rules at every step time, however long the scene", () => {
		const long = { ...still, duration: 1200, steps: [{ at: 10.5, label: "Mark" }, { at: 1200, label: "Mark" }], frame: (t) => (t > 10.4 && t < 10.6 ? "<g" : `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text>Mark</text>`) };
		assert.match(checkScene(long).problems.join("\n"), /malformed at t=10\.500/);
	});
	it("finds a step label wrapped at a slash", () => {
		const wrapped = { ...still, steps: [{ at: 1, label: "Archive/Dispose" }], frame: (t) => `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text x="4" y="20"><tspan>Archive/</tspan><tspan>Dispose</tspan></text>` };
		assert.deepEqual(ruleOf(checkScene(wrapped)), []);
	});
	it("matches a step label by whole words of the drawing, not by the title, description or a longer word", () => {
		const ship = { ...still, title: "Ship", description: "Ship it", steps: [{ at: 1, label: "Ship" }], frame: (t) => `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text x="4" y="20">Shipping</text>` };
		assert.deepEqual(ruleOf(checkScene(ship)), ["step-labels-in-frame"]);
		assert.deepEqual(ruleOf(checkScene({ ...ship, frame: (t) => `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text x="4" y="20"><tspan>Ship</tspan><tspan>now</tspan></text>` })), []);
	});
	it("keeps the timeline sampling dense on a long scene, within a bound", () => {
		let calls = 0;
		const long = { ...still, duration: 100, steps: [{ at: 100, label: "Mark" }], frame: (t) => (calls++, `<rect width="${t < 1 ? 50 : 100}" height="40" fill="var(--mk-accent)"/><text>Mark</text>`) };
		// A 0.2 s beat of bad markup is caught: 10 samples per second.
		const beat = checkScene({ ...long, frame: (t) => (t >= 0.2 && t < 0.4 ? "<g" : long.frame(t)) });
		assert.match(beat.problems.join("\n"), /malformed/);
		calls = 0;
		checkScene({ ...long, duration: 100000, steps: [{ at: 100000, label: "Mark" }] });
		// 1,201 timeline samples, each rendered a few times, plus the ID probes: far below what 5,000 would cost.
		assert.ok(calls < 12000, `bounded work (${calls} frame calls)`);
	});
	it("bake refuses a frame count past the limit, whatever the scene acknowledges", () => {
		const huge = { ...still, duration: 1e9, steps: [{ at: 1e9, label: "Mark" }], acknowledge: [{ rule: "duration", reason: "Narration." }] };
		assert.throws(() => bake(huge, { fps: 15 }), /frames; the limit is/);
		assert.throws(() => bake({ ...still, duration: Number.MAX_VALUE, steps: [{ at: 1, label: "Mark" }] }, { fps: 15 }), /the limit is/);
	});
	it("bake and video pin the frame limit and reject bad fps, lead and hold", async () => {
		const mk = (duration) => ({ ...still, duration, steps: [{ at: 1, label: "Mark" }] });
		// bake samples frame 0 through ceil(duration × fps): 19,999 intervals fit, 20,000 do not.
		assert.doesNotThrow(() => bake(mk(19999 / 15), { fps: 15 }));
		assert.throws(() => bake(mk(20000 / 15), { fps: 15 }), /20001 frames; the limit is 20000/);
		for (const fps of [0, -1, NaN]) assert.throws(() => bake(mk(2), { fps }), /fps must be a finite number above 0/);
		// video rejects before it starts the encoder (the error names lead/hold or the limit, not ffmpeg).
		const { renderVideo, hasFfmpeg } = await import("../lib/video.mjs");
		if (hasFfmpeg()) {
			await assert.rejects(renderVideo(mk(2), { out: "x.mp4", hold: -1 }), /lead and hold must be finite and not negative/);
			await assert.rejects(renderVideo(mk(2), { out: "x.mp4", fps: 0 }), /fps must be a finite number above 0/);
			await assert.rejects(renderVideo(mk(2000), { out: "x.mp4", fps: 30 }), /the limit is 20000/);
		}
	});
	it("prints a scene's own text safely and counts a reason in characters", () => {
		const a = advice("step-labels-in-frame", "\"a\nb\u202e\"");
		assert.equal(a.found, "\"a\\u000ab\\u202e\"");
		assert.throws(() => validateAcknowledgements("x", [{ rule: "duration", reason: "a\u202eb" }]), /bidirectional/);
		assert.throws(() => validateAcknowledgements("x", [{ rule: "duration", reason: "a\u061cb" }]), /bidirectional/);
		assert.equal(printable("a\u061cb"), "a\\u061cb");
		assert.doesNotThrow(() => validateAcknowledgements("x", [{ rule: "duration", reason: "😀".repeat(200) }]));
	});
	it("refuses an acknowledgement that gives no reason, names no advice rule or names one twice", () => {
		const ack = (acknowledge) => () => validateScene({ ...still, acknowledge });
		assert.doesNotThrow(ack(undefined));
		assert.doesNotThrow(ack([{ rule: "duration", reason: "Voice-over sets the pace." }]));
		assert.throws(ack("duration"), /acknowledge must be a list of \{ rule, reason \}/);
		assert.throws(ack(["duration"]), /entry 0 must be \{ rule, reason \}/);
		assert.throws(ack([{ rule: "duration" }]), /"duration" needs a reason/);
		assert.throws(ack([{ rule: "duration", reason: " " }]), /"duration" needs a reason/);
		assert.throws(ack([{ rule: "duration", reason: "one\ntwo" }]), /must be one line/);
		assert.throws(ack([{ rule: "duration", reason: "x".repeat(REASON_MAX + 1) }]), /keep it to 240/);
		assert.throws(ack([{ rule: "duration", reason: "a" }, { rule: "duration", reason: "b" }]), /acknowledged twice/);
		// Hard rules are no advice rules: nothing acknowledges them away.
		for (const rule of ["contrast", "determinism", "settled-steps", "markup", "wcag"]) assert.throws(ack([{ rule, reason: "no" }]), /is not an advice rule .*hard rule .* cannot be acknowledged/, rule);
	});
	it("lets a spec of any type acknowledge advice, and refuses a bad acknowledgement", () => {
		const spec = { ...EXAMPLES[0], acknowledge: [{ rule: "step-labels-in-frame", reason: "The labels are captions." }] };
		assert.deepEqual(createScene(spec, { format: "16:9", locale: "en" }).acknowledge, spec.acknowledge);
		assert.equal(createScene(EXAMPLES[0], { format: "16:9", locale: "en" }).acknowledge, undefined);
		assert.throws(() => createScene({ ...EXAMPLES[0], acknowledge: [{ rule: "duration" }] }, { format: "16:9", locale: "en" }), /needs a reason/);
	});
	it("keeps every rule's text complete, and the hard rules' ids out of it", () => {
		for (const [rule, text] of Object.entries(ADVICE_RULES)) {
			for (const k of ["title", "why", "whenFine", "alternative"]) assert.ok(text[k].length > 20, `${rule}.${k}`);
			assert.equal(advice(rule, "x").rule, rule);
		}
		assert.throws(() => advice("nope", "x"), /unknown advice rule/);
		assert.deepEqual(applyAcknowledgements([advice("duration", "16 s")], [{ rule: "duration", reason: " fine " }]).advice[0].reason, "fine");
	});
});
