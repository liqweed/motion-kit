import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkScene, colourLiteral, findColourLiteral, wellFormed } from "../lib/check.mjs";
import { bundle } from "../lib/bundle.mjs";
import { buildHtml } from "../lib/build.mjs";
import { loadScene } from "../lib/load.mjs";
import { bake, bakeStats } from "../runtime/bake.mjs";
import { easeIn, easeOut, easeStandard, progress, springStep, springTo, splitEdge, SPRING_SETTLE_X } from "../runtime/motion.mjs";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { claimId, claimStylesheet, newPageState } from "../runtime/page.mjs";
import * as motionMod from "../runtime/motion.mjs";
import * as sceneMod from "../runtime/scene.mjs";
import * as styleMod from "../runtime/style.mjs";
import * as svgMod from "../runtime/svg.mjs";
import * as wrapMod from "../runtime/wrap.mjs";
import { renderSvg, safeId, stepIndex, validateScene } from "../runtime/scene.mjs";
import { checkContrast, contrast, CONTRAST_EXEMPT, CONTRAST_PAIRS, NEUTRAL, normalizeStyle, resolveTokens } from "../runtime/style.mjs";
import { cubic, drawOn, esc, num, polyline } from "../runtime/svg.mjs";
import { createScene } from "../runtime/types/index.mjs";
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
	it("catches the clock or randomness read in a helper the frame calls", () => {
		const year = () => new Date().getUTCFullYear();
		const jitter = () => (Math.random() < 0.5 ? 1 : 2);
		const later = () => (performance.now() > 1e8 ? "late" : "early");
		for (const helper of [year, jitter, later]) {
			const scene = probe(() => `<text fill="var(--mk-ink)">${helper()}</text>`);
			assert.ok(!/Date|random|performance/.test(scene.frame.toString()), "the frame's own source is clean");
			const { problems } = checkScene(scene);
			assert.ok(problems.some((p) => /reads the clock or randomness/.test(p)), `${helper.name}: ${problems.join("; ")}`);
		}
		// The globals are restored afterwards.
		assert.equal(typeof Date.now(), "number");
		assert.ok(Date.now() > 1.7e12);
		assert.notEqual(Math.random(), Math.random());
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

describe("KIT", () => {
	it("holds every export of the motion, scene, style, svg and wrap modules", () => {
		for (const mod of [motionMod, sceneMod, styleMod, svgMod, wrapMod]) {
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
