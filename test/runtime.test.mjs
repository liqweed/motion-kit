import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";
import { checkScene, wellFormed } from "../lib/check.mjs";
import { bundle } from "../lib/bundle.mjs";
import { bake, bakeStats } from "../runtime/bake.mjs";
import { easeIn, easeOut, easeStandard, springStep, springTo, splitEdge, SPRING_SETTLE_X } from "../runtime/motion.mjs";
import { renderSvg } from "../runtime/scene.mjs";
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
	it("inlines the runtime into one script that renders the same bytes as Node", () => {
		const root = new URL("../runtime/", import.meta.url).pathname;
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
