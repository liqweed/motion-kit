import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkScene, wellFormed } from "../lib/check.mjs";
import { bundle } from "../lib/bundle.mjs";
import { buildHtml } from "../lib/build.mjs";
import { loadScene } from "../lib/load.mjs";
import { bake, bakeStats } from "../runtime/bake.mjs";
import { easeIn, easeOut, easeStandard, springStep, springTo, splitEdge, SPRING_SETTLE_X } from "../runtime/motion.mjs";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { claimId, claimStylesheet, newPageState } from "../runtime/page.mjs";
import * as motionMod from "../runtime/motion.mjs";
import * as sceneMod from "../runtime/scene.mjs";
import * as styleMod from "../runtime/style.mjs";
import * as svgMod from "../runtime/svg.mjs";
import * as wrapMod from "../runtime/wrap.mjs";
import { renderSvg, safeId, stepIndex, validateScene } from "../runtime/scene.mjs";
import { checkContrast, NEUTRAL, normalizeStyle, resolveTokens } from "../runtime/style.mjs";
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
	it("neutral passes WCAG contrast in light and dark", () => {
		assert.deepEqual(checkContrast(NEUTRAL), []);
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

// A scene with a clip path whose id follows the instance prefix, as the contract asks.
const clipped = {
	id: "clipped", width: 100, height: 40, duration: 2, title: "Clip", description: "A bar grows under a clip path.", stepLabelsInFrame: false,
	steps: [{ at: 1, label: "Half", id: "half" }, { at: 2, label: "Full", id: "full" }],
	frame: (t, { idPrefix }) => {
		const w = Math.round(Math.min(t, 1) * 50 + Math.max(t - 1, 0) * 50);
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
