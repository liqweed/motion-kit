import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene, findColourLiteral } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { bake } from "../runtime/bake.mjs";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { FORMATS, renderSvg } from "../runtime/scene.mjs";
import { NEUTRAL, contrast } from "../runtime/style.mjs";
import { blurReveal, highlightSweep, text } from "../runtime/svg.mjs";

const EXAMPLE = fileURLToPath(new URL("../examples/text-reveal.scene.mjs", import.meta.url));
const label = text({ x: 10, y: 20, "font-size": 20 }, "Faster startup");
const ids = (/** @type {string} */ svg) => [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);

describe("blurReveal", () => {
	it("draws nothing before it starts, and the bare children once it has finished", () => {
		assert.equal(blurReveal(0, { id: "a-r" }, label), "");
		assert.equal(blurReveal(-0.5, { id: "a-r" }, label), "");
		assert.equal(blurReveal(1, { id: "a-r" }, label), label);
		assert.equal(blurReveal(1.5, { id: "a-r" }, label), label);
		// fade() decides on the rounded value, so 0.9996 is finished too.
		assert.equal(blurReveal(0.9996, { id: "a-r" }, label), label);
		assert.equal(blurReveal(1, { id: "a-r" }, label, label), label + label, "several children, joined");
	});
	it("combines an opacity that rises to one and a rise and a blur that shrink to nothing as it settles", () => {
		const at = (/** @type {number} */ p) => blurReveal(p, { id: "a-r", rise: 6, blur: 4 }, label);
		const start = at(0.01);
		assert.match(start, /<filter id="a-r"[^>]*><feGaussianBlur stdDeviation="3\.96"\/><\/filter>/);
		assert.match(start, /<g transform="translate\(0 5\.94\)" opacity="0\.01" filter="url\(#a-r\)">/);
		const sd = (/** @type {number} */ p) => Number(at(p).match(/stdDeviation="([\d.]+)"/)?.[1] ?? 0);
		const dy = (/** @type {number} */ p) => Number(at(p).match(/translate\(0 ([\d.]+)\)/)?.[1] ?? 0);
		const ps = [0.05, 0.2, 0.5, 0.8, 0.95];
		for (const f of [sd, dy]) for (let i = 1; i < ps.length; i++) assert.ok(f(ps[i]) < f(ps[i - 1]), "monotonic");
		// Almost settled: no filter left to blur with, but the group has not been dropped yet.
		assert.doesNotMatch(at(0.9990), /filter/);
	});
	it("filters in sRGB over a box wide enough for the blur, and carries no colour literal", () => {
		const out = blurReveal(0.3, { id: "a-r" }, label);
		assert.match(out, /color-interpolation-filters="sRGB"/);
		assert.match(out, /x="-25%" y="-100%" width="150%" height="300%"/);
		assert.equal(findColourLiteral(out), null);
	});
	it("sizes the filter region from a box, for content too narrow for the percentages", () => {
		const out = blurReveal(0.3, { id: "a-r", blur: 4, box: { x: 10, y: 20, width: 20, height: 16 } }, label);
		assert.match(out, /<filter id="a-r" filterUnits="userSpaceOnUse" x="-2" y="8" width="44" height="40"/);
		assert.throws(() => blurReveal(0.3, { id: "a-r", box: { x: 0, y: 0, width: 0, height: 5 } }, label), /box must be/);
		assert.throws(() => blurReveal(0.3, { id: "a-r", box: /** @type {any} */ ({ x: 0 }) }, label), /box must be/);
	});
	it("leaves a rise that rounds to nothing off the group", () => {
		assert.doesNotMatch(blurReveal(0.9985, { id: "a-r", rise: 4.5 }, label), /transform/);
		assert.doesNotMatch(blurReveal(0.5, { id: "a-r", rise: 0 }, label), /transform/);
	});
	it("takes rise and blur as options, and refuses an id that is not one", () => {
		assert.doesNotMatch(blurReveal(0.5, { id: "a-r", blur: 0 }, label), /filter/);
		assert.doesNotMatch(blurReveal(0.5, { id: "a-r", rise: 0 }, label), /transform/);
		assert.throws(() => blurReveal(0.5, { id: "" }, label), /id must be a CSS-safe id/);
		assert.throws(() => blurReveal(0.5, { id: "a b" }, label), /id must be a CSS-safe id/);
		assert.throws(() => blurReveal(0.5, { id: "a)" }, label), /id must be a CSS-safe id/);
		assert.throws(() => blurReveal(0.5, /** @type {any} */ ({}), label), /id must be a CSS-safe id/);
		assert.throws(() => blurReveal(0.5, { id: "a", blur: 13 }, label), /blur must be/);
		assert.throws(() => blurReveal(0.5, { id: "a", rise: -1 }, label), /rise must be/);
	});
	it("is in kit, with highlightSweep", () => {
		assert.equal(KIT.blurReveal, blurReveal);
		assert.equal(KIT.highlightSweep, highlightSweep);
	});
});

describe("highlightSweep", () => {
	const band = { x: 10, y: 5, width: 200, height: 30 };
	it("grows from the left edge to the full width, in a token at low opacity", () => {
		assert.equal(highlightSweep(0, band), "");
		assert.equal(highlightSweep(-1, band), "");
		const half = highlightSweep(0.5, band);
		assert.match(half, /<rect x="10" y="5" width="100" height="30" rx="4" fill="var\(--mk-emphasis\)" opacity="0\.3"\/>/);
		assert.match(highlightSweep(1, band), /width="200"/);
		assert.equal(highlightSweep(2, band), highlightSweep(1, band));
		assert.match(highlightSweep(0.5, { ...band, token: "accent", opacity: 0.2 }), /fill="var\(--mk-accent\)" opacity="0\.2"/);
	});
	it("keeps the corner radius inside a short band", () => {
		assert.match(highlightSweep(0.01, { ...band, radius: 6 }), /width="2" height="30" rx="1"/);
	});
	it("refuses a band it cannot draw", () => {
		assert.throws(() => highlightSweep(0.5, { ...band, width: 0 }), /positive/);
		assert.throws(() => highlightSweep(0.5, { ...band, x: NaN }), /finite/);
		assert.throws(() => highlightSweep(0.5, { ...band, opacity: 0 }), /opacity/);
		for (const bad of [true, "0.3", null, Number.NaN]) {
			assert.throws(() => highlightSweep(0.5, { ...band, opacity: /** @type {any} */ (bad) }), /opacity/, String(bad));
		}
		assert.throws(() => highlightSweep(0.5, { ...band, token: "nope" }), /unknown style token/);
	});
	it("leaves the ink readable on its default band, in both themes", () => {
		for (const theme of /** @type {const} */ (["light", "dark"])) {
			const c = NEUTRAL[theme];
			const channel = (/** @type {string} */ hex, /** @type {number} */ i) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
			const tint = `#${[0, 1, 2].map((i) => Math.round(channel(c.bg, i) * 0.7 + channel(c.emphasis, i) * 0.3).toString(16).padStart(2, "0")).join("")}`;
			assert.ok(contrast(c.ink, tint) >= 4.5, `${theme}: ink on the 30 % band is ${contrast(c.ink, tint).toFixed(2)}:1`);
		}
	});
});

describe("the text-reveal example", () => {
	it("passes the gate in every format and both locales", async () => {
		for (const format of Object.keys(FORMATS)) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				const r = checkScene(scene);
				assert.deepEqual(r.problems, [], `${format} ${locale}`);
			}
		}
	});
	it("carries no filter in a settled frame: at every step, at the end and after it", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		for (const t of [...scene.steps.map((s) => s.at), scene.duration, scene.duration + 3]) {
			const svg = renderSvg(scene, t, { idPrefix: "p" });
			assert.doesNotMatch(svg, /filter|<defs|stdDeviation/, `t=${t}`);
		}
		// Settled frames carry no opacity either: the labels are the plain text elements.
		assert.doesNotMatch(renderSvg(scene, scene.steps[0].at, { idPrefix: "p" }), /transform=|opacity=/);
	});
	it("draws the same bytes as the same text without the reveal once it has settled", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		const settled = scene.frame(scene.steps[0].at, { idPrefix: "p" });
		for (const line of ["Faster startup", "Smaller bundles", "Clearer errors"]) {
			assert.ok(settled.includes(`>${line}</text>`), line);
		}
		// No wrapper anywhere in the settled markup: no group, filter or defs.
		assert.doesNotMatch(settled, /<g[\s>]|<filter|<defs|opacity=|transform=/);
	});
	it("shows a filter mid-reveal, so the test above can fail", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		assert.match(renderSvg(scene, 0.3, { idPrefix: "p" }), /<filter id="p-reveal-label-0"/);
	});
	it("shares no filter id between two renders with different idPrefix, across the timeline", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		let seen = 0;
		for (let i = 0; i <= 60; i++) {
			const t = (scene.duration * i) / 60;
			const a = renderSvg(scene, t, { idPrefix: "first" });
			const b = renderSvg(scene, t, { idPrefix: "second" });
			const shared = ids(a).filter((id) => ids(b).includes(id));
			assert.deepEqual(shared, [], `t=${t}`);
			seen += ids(a).filter((id) => id.includes("reveal")).length;
			assert.equal(new Set(ids(a)).size, ids(a).length, "no id twice in one frame");
			for (const id of ids(a)) assert.ok(id.startsWith("first-"), `${id} starts with the prefix`);
		}
		assert.ok(seen > 0, "the sample did see filters");
	});
	it("uses the style's entrance curve", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		const slow = { name: "slow", motion: { enter: [0.9, 0, 1, 1] } };
		assert.notEqual(renderSvg(scene, 0.2, { idPrefix: "p", style: slow }), renderSvg(scene, 0.2, { idPrefix: "p" }));
		assert.deepEqual(checkScene(scene, { style: slow }).problems, []);
	});
	it("builds from the module's default export, in the other locale too", async () => {
		const mod = await import(EXAMPLE);
		const scene = sceneFromModule(mod.default, { format: "16:9", locale: "nl" });
		assert.match(renderSvg(scene, 0.3, { idPrefix: "k" }), /id="k-reveal-/);
	});
	it("kit carries the helpers, so an import-free factory can build from kit alone", () => {
		const scene = sceneFromModule(({ kit }) => {
			const { blurReveal: reveal, highlightSweep: sweep, text: txt, easings, progress } = kit;
			return {
				id: "kit-only",
				width: 200,
				height: 100,
				duration: 1,
				title: "t",
				description: "d",
				steps: [{ at: 1, label: "a", detail: "b" }],
				frame: (/** @type {number} */ t, /** @type {{ idPrefix: string }} */ { idPrefix }) =>
					sweep(progress(t, 0, 1, easings().easeOut), { x: 0, y: 0, width: 50, height: 20 }) +
					reveal(progress(t, 0, 1, easings().easeOut), { id: `${idPrefix}-r` }, txt({ x: 0, y: 10 }, "Hi")),
			};
		});
		assert.match(renderSvg(scene, 0.4, { idPrefix: "k" }), /id="k-r"/);
		assert.equal(typeof KIT.blurReveal, "function");
		assert.equal(typeof KIT.highlightSweep, "function");
	});
	it("bakes each slice with its own filter ids, which none of the slices share", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		const svg = bake(scene, { fps: 15, idPrefix: "b" });
		const all = ids(svg).filter((id) => id.includes("reveal"));
		assert.ok(all.length > 0);
		assert.equal(new Set(all).size, all.length, "no filter id is used by two slices");
		// The last slice is the settled frame: no filter in it.
		const marker = svg.lastIndexOf('class="mk-f mk-last"');
		assert.ok(marker >= 0, "the last slice carries the mk-last class");
		const last = svg.slice(marker);
		assert.match(last, /Faster startup/, "the slice holds the settled labels");
		assert.doesNotMatch(last, /filter/);
	});
});
