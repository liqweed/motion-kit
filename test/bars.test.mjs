import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { barEnd, barProgress, drawBar, drawTrack, drawValue, hatchPattern, rollingValue } from "../runtime/bars.mjs";
import { KIT } from "../runtime/kit.mjs";
import { cubicBezier } from "../runtime/motion.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { NEUTRAL, normalizeStyle } from "../runtime/style.mjs";
import { decodePng, loadResvg } from "./png-snapshots.mjs";

const Resvg = await loadResvg();
const EXAMPLE = fileURLToPath(new URL("../examples/bars.scene.mjs", import.meta.url));
const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const idsOf = (/** @type {string} */ svg) => [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);

describe("hatchPattern", () => {
	it("returns a frozen hatch, so its paint cannot be changed after issue", () => {
		const h = hatchPattern({ idPrefix: "p" });
		assert.ok(Object.isFrozen(h));
		// @ts-expect-error Hatch fields are immutable to callers too.
		assert.throws(() => { "use strict"; h.fill = "red"; }, TypeError);
		assert.equal(h.fill, "url(#p-hatch-hatch)");
	});
	it("is a 45° pattern in a token colour, anchored to the picture", () => {
		const h = hatchPattern({ idPrefix: "mk-a" });
		assert.equal(h.id, "mk-a-hatch-hatch");
		assert.equal(h.fill, "url(#mk-a-hatch-hatch)");
		assert.match(h.markup, /^<defs><pattern id="mk-a-hatch-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate\(45\)">/);
		assert.match(h.markup, /stroke="var\(--mk-line\)"/);
		assert.match(h.markup, /stroke-width="1\.5"/);
	});
	it("builds its id from the prefix and a name, so two prefixes share none", () => {
		const a = hatchPattern({ idPrefix: "mk-a", name: "track" });
		const b = hatchPattern({ idPrefix: "mk-b", name: "track" });
		assert.equal(a.id, "mk-a-hatch-track");
		assert.deepEqual(idsOf(a.markup), ["mk-a-hatch-track"]);
		assert.deepEqual(idsOf(b.markup), ["mk-b-hatch-track"]);
		assert.notEqual(a.id, b.id);
	});
	it("takes its colour, spacing and width from the caller", () => {
		const h = hatchPattern({ idPrefix: "x", stroke: "accent", spacing: 10, width: 2 });
		assert.match(h.markup, /width="10" height="10"/);
		assert.match(h.markup, /stroke="var\(--mk-accent\)" stroke-width="2"/);
		assert.match(h.markup, /M5 0 V10/);
	});
	it("makes the prefix a safe id, as renderSvg does, so the gate's raw scene id works", () => {
		assert.equal(hatchPattern({ idPrefix: "bars.16:9" }).id, "bars-16-9-hatch-hatch");
		assert.equal(hatchPattern({ idPrefix: "9x" }).id, "mk-9x-hatch-hatch");
	});
	it("refuses what it cannot draw", () => {
		assert.throws(() => hatchPattern({ idPrefix: "" }), /idPrefix/);
		// @ts-expect-error a missing prefix
		assert.throws(() => hatchPattern({}), /idPrefix/);
		assert.throws(() => hatchPattern({ idPrefix: "x", name: "a b" }), /name/);
		assert.throws(() => hatchPattern({ idPrefix: "x", name: "alt-hatch" }), /name/);
		assert.notEqual(hatchPattern({ idPrefix: "plot", name: "alt_hatch" }).id, hatchPattern({ idPrefix: "plot-alt", name: "hatch" }).id);
		assert.throws(() => hatchPattern({ idPrefix: "x", spacing: 0 }), /spacing/);
		assert.throws(() => hatchPattern({ idPrefix: "x", spacing: 4, width: 4 }), /width/);
		assert.throws(() => hatchPattern({ idPrefix: "x", spacing: 0.004, width: 0.002 }), /SVG rounding/);
		assert.throws(() => hatchPattern({ idPrefix: "x", spacing: 1e307 }), /SVG rounding/);
		assert.throws(() => hatchPattern({ idPrefix: "x", stroke: "nope" }), /nope/);
	});
});

describe("drawTrack", () => {
	const hatch = hatchPattern({ idPrefix: "x" });
	it("is a pill: a rounded rect filled with the surface, hatching over it", () => {
		const out = drawTrack({ x: 10, y: 20, width: 200, height: 24, hatch });
		assert.equal((out.match(/<rect/g) ?? []).length, 2);
		assert.match(out, /<rect x="10" y="20" width="200" height="24" rx="12" fill="var\(--mk-surface\)"\/>/);
		assert.match(out, /rx="12" fill="url\(#x-hatch-hatch\)"/);
	});
	it("takes a radius, never more than half a side, and a fill or none", () => {
		assert.match(drawTrack({ x: 0, y: 0, width: 100, height: 20, radius: 4, hatch }), /rx="4"/);
		assert.match(drawTrack({ x: 0, y: 0, width: 100, height: 20, radius: 99, hatch }), /rx="10"/);
		assert.equal((drawTrack({ x: 0, y: 0, width: 100, height: 20, hatch, fill: null }).match(/<rect/g) ?? []).length, 1);
		assert.equal((drawTrack({ x: 0, y: 0, width: 100, height: 20 }).match(/<rect/g) ?? []).length, 1);
	});
	it("fades with its opacity and is nothing at 0", () => {
		assert.match(drawTrack({ x: 0, y: 0, width: 100, height: 20, hatch, opacity: 0.5 }), /^<g opacity="0\.5">/);
		assert.equal(drawTrack({ x: 0, y: 0, width: 100, height: 20, hatch, opacity: 0 }), "");
	});
	it("refuses a track it cannot draw", () => {
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 0, height: 20, hatch }), /positive/);
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 10, height: NaN, hatch }), /finite/);
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 10, height: 10, fill: null }), /fill or a hatch/);
		// @ts-expect-error not from hatchPattern
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 10, height: 10, hatch: "url(#x)" }), /hatchPattern/);
	});
});

describe("drawBar", () => {
	const bar = (/** @type {number} */ p, /** @type {object} */ more = {}) => drawBar({ x: 10, y: 20, width: 200, height: 24, p, ...more });
	it("draws nothing at the start and the full bar once done", () => {
		assert.equal(bar(0), "");
		assert.equal(bar(-1), "");
		assert.match(bar(1), /<rect x="10" y="20" width="200" height="24" rx="12" fill="var\(--mk-accent\)" stroke="var\(--mk-accent\)" stroke-width="1"\/>/);
		assert.equal(bar(1), bar(2));
	});
	it("grows from its start, rounded at both ends all the way", () => {
		assert.match(bar(0.5), /<rect x="10" y="20" width="100" height="24" rx="12"/);
		// Narrower than it is tall: the radius follows the width, so the ends stay round.
		assert.match(bar(0.05), /width="10" height="24" rx="5"/);
	});
	it("takes its colour from a token", () => {
		assert.match(bar(1, { fill: "emphasis" }), /var\(--mk-emphasis\)/);
		assert.throws(() => bar(1, { fill: "nope" }), /nope/);
	});
	it("can clip a short bar to its track silhouette", () => {
		const out = drawBar({ x: 0, y: 0, width: 19.2, trackWidth: 100, height: 26, p: 1, idPrefix: "scene", id: "row" });
		assert.match(out, /clip-path="url\(#scene-clip-row\)"/);
		assert.match(out, /<clipPath id="scene-clip-row"><rect x="0" y="0" width="100" height="26" rx="13"/);
		assert.throws(() => drawBar({ x: 0, y: 0, width: 10, trackWidth: 20, height: 10, p: 1 }), /needs the frame idPrefix/);
		assert.equal(drawBar({ x: 0, y: 0, width: 0.004, height: 10, p: 1 }), "");
	});
	it("keeps clip and hatch identifiers in disjoint namespaces", () => {
		const hatch = hatchPattern({ idPrefix: "chart-bar-row", name: "clip" });
		const bar = drawBar({ x: 0, y: 0, width: 10, trackWidth: 20, height: 10, p: 1, idPrefix: "chart", id: "bar_row" });
		assert.match(hatch.markup, /id="chart-bar-row-hatch-clip"/);
		assert.match(bar, /id="chart-clip-bar_row"/);
		assert.doesNotMatch(bar, /chart-bar-row-hatch-clip/);
	});
	it("refuses a p that is not a number", () => {
		assert.throws(() => bar(NaN), /finite/);
	});
});

describe("barProgress", () => {
	const run = { start: 1, duration: 2 };
	it("is 0 before the bar starts and exactly 1 once it has ended", () => {
		assert.equal(barProgress(0.5, run), 0);
		assert.equal(barProgress(barEnd(run), run), 1);
		assert.equal(barProgress(99, run), 1);
		assert.equal(barEnd(run), 3);
	});
	it("follows the style's movement curve, and the default for no style", () => {
		const slow = normalizeStyle({ ...NEUTRAL, motion: { enter: NEUTRAL.motion.enter, move: [0.9, 0, 1, 0.9] } });
		const t = 2;
		assert.notEqual(barProgress(t, run, slow), barProgress(t, run, NEUTRAL));
		near(barProgress(t, run, NEUTRAL), cubicBezier(0.4, 0, 0.2, 1)(0.5));
		assert.equal(barProgress(t, run), barProgress(t, run, NEUTRAL));
		assert.equal(barProgress(t, run, null), barProgress(t, run, NEUTRAL));
	});
	it("is settled whatever curve the style names", () => {
		const linear = normalizeStyle({ ...NEUTRAL, motion: { enter: NEUTRAL.motion.enter, move: [0, 0, 1, 1] } });
		assert.equal(barProgress(barEnd(run) - 0.001, run, linear), 1);
	});
	it("settles exactly at a decimal end time and refuses invalid runs", () => {
		const decimal = { start: 0.03, duration: 0.34 };
		assert.equal(barProgress(barEnd(decimal), decimal), 1);
		assert.throws(() => barEnd({ start: 1, duration: -0.5 }), /duration/);
		assert.throws(() => barProgress(1, { start: 0, duration: NaN }), /duration/);
	});
});

describe("rollingValue", () => {
	it("goes from the start value to the end value with the bar's progress", () => {
		assert.equal(rollingValue(0, 10, 0), 0);
		near(rollingValue(0, 10, 0.25), 2.5);
		near(rollingValue(4, 6, 0.5), 5);
		assert.equal(rollingValue(10, 0, 0.5), 5);
	});
	it("is exactly the end value from the end on, never a rounded sum", () => {
		assert.equal(rollingValue(0.1, 0.3, 1), 0.3);
		assert.equal(rollingValue(0.1, 0.3, 7), 0.3);
		assert.equal(rollingValue(0.1, 0.3, -1), 0.1);
	});
	it("refuses numbers that are not finite", () => {
		assert.throws(() => rollingValue(NaN, 1, 0.5), /finite/);
		assert.throws(() => rollingValue(0, Infinity, 0.5), /finite/);
		assert.throws(() => rollingValue(0, 1, NaN), /finite/);
	});
});

describe("drawValue", () => {
	const value = (/** @type {number} */ p, /** @type {object} */ more = {}) => drawValue({ x: 100, y: 50, to: 6.5, p, ...more });
	const shown = (/** @type {string} */ svg) => svg.match(/>([^<]*)<\/text>/)?.[1];
	it("rolls through the caller's format and shows the end value at the end", () => {
		const format = (/** @type {number} */ v) => `${v.toFixed(1)} s`;
		assert.equal(shown(value(0, { format })), "0.0 s");
		assert.equal(shown(value(0.5, { format })), "3.3 s");
		assert.equal(shown(value(1, { format })), "6.5 s");
		assert.equal(shown(value(1.5, { format })), "6.5 s");
	});
	it("starts from `from`", () => {
		assert.equal(shown(value(0, { from: 2 })), "2");
		assert.equal(shown(value(1, { from: 2 })), "7");
	});
	it("takes a locale's format", () => {
		const nl = new Intl.NumberFormat("nl", { minimumFractionDigits: 1 });
		assert.equal(shown(value(1, { format: (/** @type {number} */ v) => nl.format(v) })), "6,5");
	});
	it("escapes what the format returns", () => {
		assert.equal(shown(value(1, { format: () => "<6> & 'x'" })), "&lt;6&gt; &amp; &#39;x&#39;");
	});
	it("sets its anchor, font and token colour", () => {
		const out = value(1, { anchor: "end", family: "ui-monospace, monospace", fill: "muted", fontSize: 20 });
		assert.match(out, /text-anchor="end"/);
		assert.match(out, /font-family="ui-monospace, monospace"/);
		assert.match(out, /fill="var\(--mk-muted\)"/);
		assert.match(out, /font-size="20"/);
		assert.match(out, /dominant-baseline="central"/);
	});
	it("refuses a format that does not return a string", () => {
		assert.throws(() => value(1, { format: (/** @type {number} */ v) => v }), /string/);
		assert.throws(() => value(1, { format: "x" }), /function/);
	});
	it("is the same bytes for the same input", () => {
		assert.equal(value(0.37), value(0.37));
	});
});

describe("kit", () => {
	it("hands the bar parts to custom scenes", () => {
		for (const name of ["hatchPattern", "drawTrack", "drawBar", "drawValue", "rollingValue", "barProgress", "barEnd"]) assert.equal(typeof KIT[name], "function", name);
	});
});

describe("examples/bars.scene.mjs", () => {
	it("passes the gate in every format and both locales", async () => {
		for (const format of ["16:9", "4:3", "1:1", "9:16", "wide", "tall"]) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				const r = checkScene(scene);
				assert.deepEqual(r.problems, [], `${format} ${locale}`);
			}
		}
	});
	it("reveals one row per step, top to bottom", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		assert.equal(scene.steps.length, 3);
		const rows = (/** @type {number} */ t) => [...scene.frame(t, { idPrefix: "x" }).matchAll(/data-track="row-(\d)"/g)].map((m) => Number(m[1]));
		assert.deepEqual(rows(0), []);
		scene.steps.forEach((s, i) => assert.deepEqual(rows(s.at), [...Array(i + 1).keys()], `step ${i + 1}`));
	});
	it("shows the rolling value at exactly its end value in every step frame after its bar settles", async () => {
		for (const locale of ["en", "nl"]) {
			const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale });
			const end = locale === "en" ? ["0.8 s", "2.4 s", "6.5 s"] : ["0,8 s", "2,4 s", "6,5 s"];
			/** The text of each row's value at time t, by row. */
			const values = (/** @type {number} */ t) => {
				const svg = scene.frame(t, { idPrefix: "x" });
				return [...svg.matchAll(/data-value="row-(\d)"[^>]*>(?:<text[^>]*>)([^<]*)</g)].reduce((o, m) => ({ ...o, [m[1]]: m[2] }), /** @type {Record<string, string>} */ ({}));
			};
			scene.steps.forEach((s, i) => {
				const at = values(s.at);
				for (let row = 0; row <= i; row++) assert.equal(at[row], end[row], `${locale}: row ${row + 1} at step ${i + 1}`);
				assert.equal(Object.keys(at).length, i + 1, `${locale}: only the rows revealed so far at step ${i + 1}`);
			});
			// ... and at the end of the scene, and while a bar is still growing it is not the end value yet.
			assert.deepEqual(Object.values(values(scene.duration)), end);
			const growing = values(0.2 + 0.25 + 0.35);
			assert.notEqual(growing[0], end[0], "the first value is mid-roll while its bar grows");
		}
	});
	it("grows each bar in its own step's beat and lets it rest before the step", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const widths = (/** @type {number} */ t) => [...scene.frame(t, { idPrefix: "x" }).matchAll(/data-bar="row_\d"[\s\S]*?<\/clipPath><\/defs><g[^>]*><rect[^>]* width="([\d.]+)"/g)].map((m) => Number(m[1]));
		scene.steps.forEach((s, i) => {
			const at = widths(s.at);
			assert.equal(at.length, i + 1);
			assert.deepEqual(widths(s.at - 0.05), at, `bar ${i + 1} has stopped 50 ms before its step`);
		});
		// The bars' widths are proportional to the values (0.8, 2.4, 6.5 of 8 s).
		const done = widths(scene.duration);
		near(done[1] / done[0], 3, 0.01);
		near(done[2] / done[0], 6.5 / 0.8, 0.01);
	});
	it("shares no pattern id between two renders with different idPrefix", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const style = NEUTRAL;
		for (const t of [0, scene.steps[0].at, scene.duration]) {
			const a = idsOf(renderSvg(scene, t, { idPrefix: "one", style }));
			const b = idsOf(renderSvg(scene, t, { idPrefix: "two", style }));
			const patterns = (/** @type {string} */ svg) => [...svg.matchAll(/<pattern id="([^"]*)"/g)].map((m) => m[1]);
			const pa = patterns(renderSvg(scene, t, { idPrefix: "one", style }));
			const pb = patterns(renderSvg(scene, t, { idPrefix: "two", style }));
			assert.equal(pa.length, 1, "one hatch pattern per frame");
			assert.ok(pa[0].startsWith("one-") && pb[0].startsWith("two-"));
			assert.deepEqual(a.filter((id) => b.includes(id)), [], `no id in common at t=${t}`);
			assert.equal(new Set(a).size, a.length, "no id twice in one render");
		}
	});
	it("refers to its pattern only by an id the frame defines", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const style = NEUTRAL;
		const svg = renderSvg(scene, scene.duration, { idPrefix: "p", style });
		const defined = new Set(idsOf(svg));
		const used = [...svg.matchAll(/url\(#([^)]*)\)/g)].map((m) => m[1]);
		for (const row of [0, 1, 2]) {
			const group = svg.match(new RegExp(`<g[^>]*data-track="row-${row}"[^>]*>.*?</g>`, "s"));
			assert.ok(group && /url\(#[^)]+\)/.test(group[0]), `track row-${row} uses the hatch`);
		}
		for (const id of used) assert.ok(defined.has(id), `url(#${id}) has no definition`);
	});
	it("is the same bytes whatever it was drawn after", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const style = NEUTRAL;
		const at = (/** @type {number} */ t) => renderSvg(scene, t, { idPrefix: "p", style });
		const first = at(2.1);
		at(0.3);
		at(4);
		assert.equal(at(2.1), first);
	});
});

describe("the hatch in a PNG export", { skip: !Resvg && "@resvg/resvg-js is not installed" }, () => {
	it("shows in the pixels of a step frame, as diagonal lines over the track", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const style = NEUTRAL;
		const svg = renderSvg(scene, scene.steps[2].at, { standalone: true, style, theme: "light", background: true, idPrefix: "png" });
		const img = decodePng(new Resvg(svg, { fitTo: { mode: "zoom", value: 1 }, font: { loadSystemFonts: false } }).render().asPng());
		/** The red channel at (x, y): the hatch (#8b929c) is darker than the surface (#f3f4f6) and the canvas (#ffffff). */
		const red = (/** @type {number} */ x, /** @type {number} */ y) => img.data[(y * img.width + x) * 4];
		const hatchRed = parseInt(NEUTRAL.light.line.slice(1, 3), 16);
		const surfaceRed = parseInt(NEUTRAL.light.surface.slice(1, 3), 16);
		// Row 1's track runs 190–216 px down, and its short bar ends near x = 111: scan to the right of it.
		const scan = (/** @type {number} */ y) => Array.from({ length: 400 }, (_, k) => red(300 + k, y));
		const mid = scan(203);
		assert.ok(mid.some((r) => r < hatchRed + 25), "hatch lines show in the pixels");
		assert.ok(mid.filter((r) => Math.abs(r - surfaceRed) < 6).length > 100, "the surface shows between them");
		// A line every 7 / sin 45° ≈ 9.9 px along a scan line: about 40 lines over 400 px.
		let lines = 0;
		for (let k = 1; k < mid.length; k++) if (mid[k] < 200 && mid[k - 1] >= 200) lines++;
		assert.ok(lines >= 30 && lines <= 50, `about 40 hatch lines cross the scan line, found ${lines}`);
		// Diagonal: on a scan line 3 px lower the lines have moved 3 px sideways, not stayed put.
		const lower = scan(206);
		assert.notDeepEqual(lower, mid, "the hatch lines are not vertical");
		const shift = (/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ by) => a.slice(by).every((v, k) => Math.abs(v - b[k]) < 12);
		assert.ok(shift(mid, lower, 3) || shift(lower, mid, 3), "the lines on the lower scan line are the upper ones moved by 3 px");
	});
});

describe("bars: review edge cases", () => {
	it("draws a zero-width bar as nothing", () => {
		assert.equal(drawBar({ x: 0, y: 0, width: 0, height: 24, p: 0 }), "");
		assert.equal(drawBar({ x: 0, y: 0, width: 0, height: 24, p: 1 }), "");
		assert.throws(() => drawBar({ x: 0, y: 0, width: -1, height: 24, p: 1 }));
		assert.throws(() => drawBar({ x: 0, y: 0, width: 0, height: 0, p: 1 }));
	});
	it("rejects a hatch not made by hatchPattern", () => {
		const fake = { id: "x", fill: "red", markup: "" };
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 10, height: 4, hatch: fake }), /hatchPattern/);
	});
	it("accepts an immutable, self-consistent hatch from another runtime copy", () => {
		const own = hatchPattern({ idPrefix: "copy" });
		const otherCopy = Object.freeze({ ...own });
		assert.match(drawTrack({ x: 0, y: 0, width: 10, height: 4, hatch: otherCopy }), /url\(#copy-hatch-hatch\)/);
	});
	it("reserves the picture's own id names", () => {
		for (const name of ["title", "desc"]) assert.throws(() => hatchPattern({ idPrefix: "p", name }), /reserved/);
		for (const id of ["title", "desc"]) assert.throws(() => drawBar({ x: 0, y: 0, width: 5, height: 4, p: 1, trackWidth: 10, idPrefix: "p", id }), /non-reserved/);
	});
	it("rejects descriptor accessors, missing patterns, and geometry that serializes invalidly", () => {
		const hatch = hatchPattern({ idPrefix: "safe" });
		const accessor = Object.freeze({ get id() { return hatch.id; }, fill: hatch.fill, markup: hatch.markup });
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 10, height: 4, hatch: accessor }), /hatchPattern/);
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 10, height: 4, hatch: Object.freeze({ ...hatch, markup: "<defs/>" }) }), /hatchPattern/);
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 1e307, height: 4 }), /after SVG rounding/);
		assert.throws(() => drawTrack({ x: 0, y: 0, width: 0.004, height: 4 }), /positive after SVG rounding/);
		assert.throws(() => barEnd({ start: 1e308, duration: 1e308 }), /end must be finite/);
	});
	it("rolls between far-apart endpoints without overflow", () => {
		assert.equal(rollingValue(-1e308, 1e308, 0.5), 0);
		assert.ok(Number.isFinite(rollingValue(-1e308, 1e308, 0.25)));
	});
});
