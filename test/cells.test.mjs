import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { MAX_CELLS, cellGrid, cellLighting, coverage, drawCells } from "../runtime/cells.mjs";
import { KIT } from "../runtime/kit.mjs";
import { num } from "../runtime/svg.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { el } from "../runtime/svg.mjs";

const EXAMPLE = fileURLToPath(new URL("../examples/cell-grid.scene.mjs", import.meta.url));
const idsOf = (/** @type {string} */ svg) => [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
/** Every number in the markup's attributes and text, as written. */
const numbersOf = (/** @type {string} */ svg) => svg.match(/-?\d+(?:\.\d+)?/g) ?? [];
const litCount = (/** @type {string} */ svg) => (svg.match(/<g data-cells-lit="">(.*?)<\/g>/)?.[1].match(/<rect/g) ?? []).length;

describe("cellGrid", () => {
	it("fits square cells to a box and centres the grid in it", () => {
		const g = cellGrid({ rows: 6, cols: 12, x: 10, y: 20, width: 480, height: 300, gap: 4 });
		const s = 36.33; // the width allows 36.333…, floored to a hundredth; the height (300 - 5·4) / 6 = 46.67
		assert.equal(g.size, s);
		assert.equal(g.count, 72);
		assert.equal(g.width, 12 * s + 11 * 4);
		assert.equal(g.height, 6 * s + 5 * 4);
		assert.equal(g.x, Number(num(10 + (480 - g.width) / 2)));
		assert.equal(g.y, Number(num(20 + (300 - g.height) / 2)));
		assert.deepEqual({ ...g.at(1, 2) }, { x: g.x + 2 * (s + 4), y: g.y + (s + 4), size: s, cx: g.x + 2 * (s + 4) + s / 2, cy: g.y + (s + 4) + s / 2 });
		assert.equal(g.index(1, 2), 14);
	});
	it("takes a size and starts at x, y", () => {
		const g = cellGrid({ rows: 2, cols: 3, x: 5, y: 6, size: 10, gap: 2 });
		assert.deepEqual([g.x, g.y, g.width, g.height], [5, 6, 3 * 10 + 2 * 2, 2 * 10 + 2]);
		assert.ok(Math.abs(g.radius - 2.2) < 1e-9, "22 % of the size by default");
		assert.equal(cellGrid({ rows: 1, cols: 1, size: 10, radius: 99 }).radius, 5, "never more than half");
	});
	it("refuses what it cannot draw", () => {
		const bad = [
			[{ rows: 0, cols: 3, size: 10 }, /whole numbers/],
			[{ rows: 2.5, cols: 3, size: 10 }, /whole numbers/],
			[{ rows: 101, cols: 100, size: 1 }, /limit/],
			[{ rows: 2, cols: 2 }, /cell size/],
			[{ rows: 2, cols: 2, size: 10, width: 100, height: 100 }, /not both/],
			[{ rows: 2, cols: 2, width: 100 }, /width and height/],
			[{ rows: 10, cols: 10, width: 20, height: 20, gap: 4 }, /too small/],
			[{ rows: 2, cols: 2, size: 10, gap: -1 }, /gap/],
			[{ rows: 2, cols: 2, size: NaN }, /cell size/],
			[{ rows: 2, cols: 2, size: 10, x: Infinity }, /finite/],
			[{ rows: 2, cols: 2, size: 10, radius: -1 }, /radius/],
		];
		for (const [o, re] of bad) assert.throws(() => cellGrid(/** @type {any} */ (o)), re, JSON.stringify(o));
		assert.equal(MAX_CELLS, 10000);
	});
	it("says which cell is out of range", () => {
		const g = cellGrid({ rows: 2, cols: 3, size: 10 });
		assert.throws(() => g.at(2, 0), /no cell at row 2, column 0/);
		assert.throws(() => g.index(0, 3), /no cell/);
		assert.throws(() => g.at(0.5, 0), /no cell/);
	});
});

describe("coverage", () => {
	it("is 1 inside, 0 outside and 0.5 on the edge", () => {
		assert.equal(coverage(-5), 1);
		assert.equal(coverage(5), 0);
		assert.equal(coverage(0), 0.5);
		assert.equal(coverage(-0.25), 0.75);
		assert.equal(coverage(1, 4), 0.25);
	});
	it("refuses a non-finite distance and a softness of 0", () => {
		assert.throws(() => coverage(NaN), /finite/);
		assert.throws(() => coverage(0, 0), /softness/);
	});
});

describe("cellLighting", () => {
	const grid = cellGrid({ rows: 3, cols: 4, size: 10 });
	it("lights cells one by one, in reading order, between start and start + spread", () => {
		const l = cellLighting(grid, { start: 1, duration: 0.2, spread: 1.1 });
		assert.ok(Math.abs(l.end - 2.3) < 1e-9);
		assert.equal(l.delay(0, 0), 0);
		assert.ok(Math.abs(l.delay(2, 3) - 1.1) < 1e-9);
		assert.ok(l.delay(0, 1) < l.delay(0, 2) && l.delay(0, 3) < l.delay(1, 0), "row by row");
		assert.equal(l.level(0.99, 0, 0), 0);
		assert.ok(l.level(1.1, 0, 0) > 0 && l.level(1.1, 0, 0) < 1, "the first cell is mid-way");
		assert.equal(l.level(1.1, 2, 3), 0, "the last has not started");
		assert.equal(l.level(l.end, 2, 3), 1);
	});
	it("lights every cell at once with order all, or with no spread", () => {
		for (const o of [{ order: /** @type {const} */ ("all"), spread: 2 }, { spread: 0 }]) {
			const l = cellLighting(grid, { start: 1, duration: 0.4, ...o });
			assert.ok(Math.abs(l.end - 1.4) < 1e-9);
			for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) assert.equal(l.level(1.2, r, c), l.level(1.2, 0, 0));
		}
	});
	it("lights a row or a column at a time, and by any function of the cell", () => {
		const rows = cellLighting(grid, { start: 0, duration: 0.1, spread: 1, order: "rows" });
		assert.equal(rows.delay(1, 0), rows.delay(1, 3));
		assert.ok(rows.delay(0, 0) < rows.delay(1, 0));
		const cols = cellLighting(grid, { start: 0, duration: 0.1, spread: 1, order: "columns" });
		assert.equal(cols.delay(0, 2), cols.delay(2, 2));
		assert.ok(cols.delay(0, 2) < cols.delay(0, 3));
		const ripple = cellLighting(grid, { start: 0, duration: 0.1, spread: 1, order: (r, c) => Math.hypot(r - 1, c - 1.5) });
		assert.ok(ripple.delay(1, 1) < ripple.delay(0, 0), "the centre first");
		assert.equal(ripple.delay(0, 0), ripple.delay(2, 3), "equal distance, together");
	});
	it("ends each cell at its field value, exactly", () => {
		const l = cellLighting(grid, { start: 0, duration: 0.3, spread: 0.5, field: (r, c) => coverage(c - 1.7) });
		assert.equal(l.level(l.end, 0, 0), 1);
		assert.equal(l.level(l.end, 0, 2), coverage(2 - 1.7));
		assert.equal(l.level(l.end, 0, 3), 0);
		assert.equal(l.level(l.end + 5, 0, 2), l.level(l.end, 0, 2), "it holds");
		assert.ok(l.level(0.2, 0, 2) <= coverage(2 - 1.7), "never above its end level");
	});
	it("is exactly the end level at end for every cell, however the times add up", () => {
		const g = cellGrid({ rows: 6, cols: 12, size: 5 });
		const l = cellLighting(g, { start: 2.1, duration: 0.3, spread: 0.3 });
		for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) assert.equal(l.level(l.end, r, c), 1);
	});
	it("takes the style's entrance curve", () => {
		const slow = { motion: { enter: /** @type {[number, number, number, number]} */ ([0.9, 0, 1, 1]), move: /** @type {[number, number, number, number]} */ ([0.4, 0, 0.2, 1]) } };
		const a = cellLighting(grid, { start: 0, duration: 1 });
		const b = cellLighting(grid, { start: 0, duration: 1, style: slow });
		assert.ok(b.level(0.5, 0, 0) < a.level(0.5, 0, 0));
	});
	it("refuses what it cannot schedule", () => {
		const bad = [
			[{ start: NaN, duration: 1 }, /start/],
			[{ start: 0, duration: 0 }, /duration/],
			[{ start: 0, duration: 1, spread: -1 }, /spread/],
			[{ start: 0, duration: 1, order: "diagonal" }, /order/],
			[{ start: 0, duration: 1, order: () => NaN }, /finite/],
			[{ start: 0, duration: 1, field: () => 2 }, /0 to 1/],
			[{ start: 0, duration: 1, field: 3 }, /field must be a function/],
		];
		for (const [o, re] of bad) assert.throws(() => cellLighting(grid, /** @type {any} */ (o)), re, JSON.stringify(o));
		assert.throws(() => cellLighting(grid, { start: 0, duration: 1 }).level(NaN, 0, 0), /finite/);
	});
});

describe("drawCells", () => {
	const grid = cellGrid({ rows: 2, cols: 3, x: 4, y: 6, size: 20, gap: 4 });
	it("draws a lit cell exactly as el would, and nothing for a cell at 0", () => {
		const svg = drawCells(grid, { idPrefix: "p", base: null, opacity: (r, c) => (r === 0 && c === 1 ? 0.5 : r === 1 && c === 2 ? 1 : 0) });
		const half = el("rect", { x: 28, y: 6, width: 20, height: 20, rx: 4.4, fill: "var(--mk-accent)", opacity: 0.5 });
		const full = el("rect", { x: 52, y: 30, width: 20, height: 20, rx: 4.4, fill: "var(--mk-accent)" });
		assert.equal(svg, `<g data-cells="cells"><g data-cells-lit="">${half}${full}</g><g data-cells-outline=""></g><g data-cells-glyphs=""></g></g>`);
	});
	it("takes the fill as a token, or a token per cell", () => {
		const one = drawCells(grid, { idPrefix: "p", base: null, fill: "emphasis", opacity: () => 1 });
		assert.equal(litCount(one), 6);
		assert.ok(!one.includes("accent"));
		const per = drawCells(grid, { idPrefix: "p", base: null, fill: (r) => (r === 0 ? "accent" : "ink"), opacity: () => 1 });
		assert.equal(per.match(/--mk-accent/g)?.length, 3);
		assert.equal(per.match(/--mk-ink/g)?.length, 3);
	});
	it("draws the empty grid as one pattern, its id built from the prefix and the name", () => {
		const a = drawCells(grid, { idPrefix: "mk-a", name: "pixels", opacity: () => 0 });
		const b = drawCells(grid, { idPrefix: "mk-b", name: "pixels", opacity: () => 0 });
		assert.deepEqual(idsOf(a), ["mk-a-cells-pixels"]);
		assert.deepEqual(idsOf(b), ["mk-b-cells-pixels"]);
		assert.match(a, /<pattern id="mk-a-cells-pixels" x="4" y="6" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="20" height="20" rx="4\.4" fill="var\(--mk-surface\)"\/><\/pattern>/);
		assert.match(a, /<rect x="4" y="6" width="68" height="44" fill="url\(#mk-a-cells-pixels\)"\/>/, "the grid's own extent, not its trailing gap");
		assert.equal(drawCells(cellGrid({ rows: 40, cols: 60, size: 12 }), { idPrefix: "p", opacity: () => 0 }).length, drawCells(grid, { idPrefix: "p", opacity: () => 0 }).length + 3, "the same size for 2,400 empty cells as for 6 (three more digits of extent)");
	});
	it("draws an outline inside the cell's edge and a glyph at its centre", () => {
		const svg = drawCells(grid, { idPrefix: "p", base: null, opacity: () => 0, outline: (r, c) => r === 1 && c === 0, glyph: (r, c) => (c === 1 ? { text: "A&B", fill: "onAccent", opacity: 0.5 } : r === 0 && c === 0 ? "Z" : null), glyphSize: 12, family: "monospace" });
		assert.match(svg, /<g data-cells-outline=""><rect x="5" y="31" width="18" height="18" rx="3\.4" fill="none" stroke="var\(--mk-emphasis\)" stroke-width="2"\/><\/g>/);
		assert.match(svg, /<text x="14" y="16" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" font-family="monospace" fill="var\(--mk-ink\)">Z<\/text>/);
		assert.match(svg, /fill="var\(--mk-onAccent\)" opacity="0\.5">A&amp;B<\/text>/, "the glyph text is escaped");
		const half = drawCells(grid, { idPrefix: "p", base: null, opacity: () => 0, outline: () => 0.4 });
		assert.equal(half.match(/opacity="0\.4"/g)?.length, 6);
	});
	it("skips a glyph whose opacity rounds to 0, and an outline of 0", () => {
		const svg = drawCells(grid, { idPrefix: "p", base: null, opacity: () => 0, outline: () => 0, glyph: () => ({ text: "x", opacity: 0.0004 }) });
		assert.ok(!svg.includes("<text") && !svg.includes("stroke"));
	});
	it("keeps its three groups, so a cell lighting or a glyph leaving shifts no other group", () => {
		for (const opacity of [() => 0, () => 1]) {
			const svg = drawCells(grid, { idPrefix: "p", base: null, opacity });
			assert.deepEqual(svg.match(/<g data-cells[^>]*>/g), ['<g data-cells="cells">', '<g data-cells-lit="">', '<g data-cells-outline="">', '<g data-cells-glyphs="">']);
		}
	});
	it("refuses what it cannot draw", () => {
		const ok = { idPrefix: "p", opacity: () => 1 };
		assert.throws(() => drawCells(grid, /** @type {any} */ ({ idPrefix: "p" })), /opacity must be a function/);
		assert.throws(() => drawCells(grid, { opacity: () => 1 }), /idPrefix/);
		assert.throws(() => drawCells(grid, { ...ok, name: "a-b" }), /name/);
		assert.throws(() => drawCells(grid, { ...ok, outline: () => true, outlineWidth: 0 }), /outlineWidth/);
		assert.throws(() => drawCells(grid, { ...ok, outline: () => true, outlineWidth: 20 }), /less than the cell size/);
		assert.throws(() => drawCells(grid, { ...ok, glyph: () => /** @type {any} */ ({ fill: "ink" }) }), /glyph must return a string/);
		assert.throws(() => drawCells(grid, { ...ok, glyph: () => /** @type {any} */ (["A"]) }), /glyph must return a string/);
		assert.throws(() => drawCells(grid, { ...ok, glyph: () => "A", glyphSize: -1 }), /glyphSize/);
		assert.throws(() => drawCells(grid, { ...ok, glyph: () => ({ text: "A", opacity: /** @type {any} */ ("opaque") }) }), /glyph's opacity/);
		assert.throws(() => drawCells(grid, { ...ok, glyph: () => ({ text: "A", opacity: Infinity }) }), /glyph's opacity/);
		assert.equal(drawCells(cellGrid({ rows: 1, cols: 1, size: 1 }), { ...ok }).includes("<rect"), true, "a 1 × 1 grid of size 1 draws without outline or glyph");
		assert.equal(drawCells(cellGrid({ rows: 1, cols: 1, size: 0.005 }), { ...ok }).includes("<rect"), true);
		assert.throws(() => cellGrid({ rows: 2, cols: 2, size: 1e308 }), /finite/);
		assert.throws(() => cellLighting(grid, { start: 0, duration: 1, ease: /** @type {any} */ (3) }), /ease must be a function/);
		assert.throws(() => drawCells(grid, { ...ok, opacity: () => NaN }), /finite number, got NaN at row 0, column 0/);
		assert.throws(() => drawCells(grid, { ...ok, outline: () => NaN }), /outline must return/);
		assert.throws(() => drawCells(grid, { ...ok, fill: "#ff0000" }), /unknown style token/);
		assert.equal(drawCells(grid, { opacity: () => 1, base: null }).includes("pattern"), false, "no prefix needed without a base");
	});
	it("clamps an opacity outside 0 to 1", () => {
		const svg = drawCells(grid, { idPrefix: "p", base: null, opacity: (r, c) => (c === 0 ? -3 : 7) });
		assert.equal(litCount(svg), 4);
		assert.ok(!svg.includes("opacity="), "all four are 1");
	});
});

describe("a grid's frame", () => {
	// A grid with partial-alpha edge cells: a disc's signed distance, lit one by one.
	const make = (rows = 8, cols = 12, soft = 1) => {
		const grid = cellGrid({ rows, cols, x: 10, y: 10, size: 17.3, gap: 2.7 });
		const field = (/** @type {number} */ r, /** @type {number} */ c) => coverage(Math.hypot(c - cols / 2 + 0.5, r - rows / 2 + 0.5) - Math.min(rows, cols) / 2.4, soft);
		const lighting = cellLighting(grid, { start: 0.1, duration: 0.37, spread: 1.3, field });
		/** @param {number} t */
		const frame = (t) => drawCells(grid, { idPrefix: "d", opacity: (r, c) => lighting.level(t, r, c) });
		return { grid, lighting, frame };
	};
	it("is the same string for the same t, whatever was drawn before", () => {
		const { frame } = make();
		const times = [0, 0.3, 0.77, 1.234, 1.9, 5];
		const first = times.map(frame);
		const shuffled = [...times].reverse().map(frame).reverse();
		assert.deepEqual(first, shuffled);
		assert.deepEqual(times.map(frame), first);
	});
	it("has no number with five or more decimals, at a partial-alpha cell or anywhere", () => {
		const { frame, lighting } = make(8, 12, 1.37);
		let partial = 0;
		for (let f = 0; f <= 200; f++) {
			const t = f * 0.0123;
			const svg = frame(t);
			for (const n of numbersOf(svg)) assert.ok(!/\.\d{5,}/.test(n), `${n} at t = ${t}`);
			partial += (svg.match(/opacity="0\.\d+"/g) ?? []).length;
		}
		assert.ok(partial > 500, "the frames did have partial-alpha cells");
		// A cell whose end level is a long fraction still comes out with at most three decimals, at its end.
		const edge = coverage(0.123456789, 1.37);
		assert.ok(/\.\d{5,}/.test(String(edge)), "the raw level has many decimals");
		const svg = frame(lighting.end);
		const alphas = [...svg.matchAll(/opacity="([\d.]+)"/g)].map((m) => m[1]);
		assert.ok(alphas.length > 0, "settled partial-alpha cells exist");
		for (const a of alphas) assert.ok(a.split(".")[1]?.length <= 3, a);
		// Passed through the renderer: the long fraction comes out as its exact three-decimal opacity.
		const one = drawCells(cellGrid({ rows: 1, cols: 1, size: 8 }), { idPrefix: "q", base: null, opacity: () => edge });
		assert.ok(one.includes(`opacity="${(Math.round(edge * 1000) / 1000).toString()}"`), one);
	});
	it("is settled from the lighting's end on, and a lit cell holds its end level", () => {
		const { frame, lighting } = make();
		assert.equal(frame(lighting.end), frame(lighting.end + 3));
		assert.notEqual(frame(lighting.end - 0.2), frame(lighting.end));
	});
	it("grows by one rect per lit cell, in the lit group only, and the empty grid is byte-identical in every frame", () => {
		const { frame, grid } = make();
		const base = (/** @type {string} */ svg) => svg.slice(0, svg.indexOf('<g data-cells-lit="">'));
		assert.equal(base(frame(0)), base(frame(1)));
		assert.equal(litCount(frame(0)), 0);
		assert.ok(litCount(frame(1)) > 0 && litCount(frame(1)) <= grid.count);
		assert.ok(litCount(frame(5)) >= litCount(frame(1)));
	});
	it("holds 2,400 cells", () => {
		const grid = cellGrid({ rows: 40, cols: 60, x: 0, y: 0, size: 10, gap: 2 });
		const svg = drawCells(grid, { idPrefix: "d", opacity: (r, c) => coverage(Math.hypot(r - 20, c - 30) - 15) });
		assert.ok(litCount(svg) > 600 && litCount(svg) <= 2400);
		assert.equal(litCount(drawCells(grid, { idPrefix: "d", opacity: () => 1 })), 2400, "a fully lit grid draws every cell");
	});
});

describe("kit", () => {
	it("hands the cell grid parts to a custom scene", () => {
		for (const k of ["MAX_CELLS", "cellGrid", "cellLighting", "coverage", "drawCells"]) assert.ok(k in KIT, k);
	});
});

describe("examples/cell-grid.scene.mjs", () => {
	it("passes the gate in every format and both locales", async () => {
		for (const format of ["16:9", "4:3", "1:1", "9:16", "wide", "tall"]) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				const r = checkScene(scene, { strict: true });
				assert.deepEqual(r.problems, [], `${format} ${locale}`);
			}
		}
	});
	it("lights the pixel grid once per step: one by one, then all at once", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const [one, all] = scene.steps;
		const pixels = (/** @type {number} */ t) => litCount(renderSvg(scene, t, { idPrefix: "x" }).match(/<g data-cells="pixels">.*?<g data-cells="word">/s)?.[0] ?? "");
		assert.equal(pixels(0), 0);
		const mid = pixels(0.9);
		assert.ok(mid > 0 && mid < pixels(one.at), "cells are lighting one at a time");
		assert.ok(pixels(one.at) < 72, "only the ellipse is lit at the first step");
		assert.equal(pixels(all.at), 72, "every cell is lit at the second step");
	});
	it("has partial-alpha cells on the ellipse's edge at the first step, rounded to three decimals", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const svg = renderSvg(scene, scene.steps[0].at, { idPrefix: "x" });
		const alphas = [...svg.matchAll(/opacity="(0\.\d+)"/g)].map((m) => m[1]);
		assert.ok(alphas.length >= 10, "edge cells are partly lit");
		for (const a of alphas) assert.ok(a.split(".")[1].length <= 3, a);
	});
	it("flies four letters out along arcs, and they rest in the word", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const letters = (/** @type {number} */ t) => [...renderSvg(scene, t, { idPrefix: "x" }).matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([A-X])<\/text>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), ch: m[3] }));
		const before = letters(scene.steps[1].at);
		assert.equal(before.length, 24);
		const mid = letters(3.45).find((l) => l.ch === "G");
		const g0 = before.find((l) => l.ch === "G");
		const end = letters(scene.steps[2].at);
		const g1 = end.find((l) => l.ch === "G");
		assert.equal(end.length, 24, "four atlas cells emptied, four letters in the word");
		assert.ok(mid && g0 && g1);
		// On an arc: mid-flight it is off the straight line between its two ends.
		const t = (mid.y - g0.y) / (g1.y - g0.y);
		const online = g0.x + (g1.x - g0.x) * t;
		assert.ok(Math.abs(mid.x - online) > 5, `mid-flight x ${mid.x} is off the straight line at ${online}`);
		assert.deepEqual(letters(scene.duration), end, "they hold");
	});
	it("has no blinking cursor: nothing changes between the last step and the end", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const last = scene.steps[2].at;
		const settled = renderSvg(scene, last, { idPrefix: "x" });
		for (let i = 1; i <= 20; i++) assert.equal(renderSvg(scene, last + ((scene.duration - last) * i) / 20, { idPrefix: "x" }), settled, `unchanged at ${i}/20 of the hold`);
	});
	it("keeps two instances on one page apart", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const a = idsOf(renderSvg(scene, 1, { idPrefix: "a" }));
		const b = idsOf(renderSvg(scene, 1, { idPrefix: "b" }));
		assert.ok(a.length >= 3);
		assert.equal(new Set(a).size, a.length, "no id twice within one instance");
		assert.ok(a.every((id) => !b.includes(id)));
	});
});

describe("review fixes", () => {
	it("keeps the box size exact when the largest fitting square is a whole hundredth", () => {
		assert.equal(cellGrid({ rows: 1, cols: 1, width: 0.29, height: 0.29 }).size, 0.29);
	});
	it("keeps the pattern pitch equal to the lit cells' pitch for a size with many decimals", () => {
		const g = cellGrid({ rows: 1, cols: 60, size: 10.004, gap: 0 });
		assert.equal(g.at(0, 59).x, 59 * g.size);
		assert.equal(num(g.at(0, 59).x), num(59 * (g.size + g.gap)));
	});
	it("delays ranks near the float limits without NaN, and the last cell starts at the spread", () => {
		const g = cellGrid({ rows: 1, cols: 3, size: 4 });
		const l = cellLighting(g, { start: 0, duration: 1, spread: 0.3, order: (_r, c) => [-1e308, 0, 1e308][c] });
		assert.deepEqual([0, 1, 2].map((c) => l.delay(0, c)), [0, 0.15, 0.3]);
		assert.equal(l.level(l.end, 0, 2), 1);
		const m = cellLighting(g, { start: 0, duration: 1, spread: 0.003, order: "cells" });
		assert.equal(m.delay(0, 2), 0.003);
	});
	it("keeps a level within its end level whatever the curve returns", () => {
		const g = cellGrid({ rows: 1, cols: 1, size: 4 });
		const l = cellLighting(g, { start: 0, duration: 1, ease: () => 2, field: () => 0.5 });
		assert.equal(l.level(0.5, 0, 0), 0.5);
	});
	it("draws the pattern on the same origin and pitch as the lit cells, for a fractional origin and rounded sizes", () => {
		const g = cellGrid({ rows: 1, cols: 3, x: 1.005, y: 0.005, size: 1.004, gap: 0.01 });
		const svg = drawCells(g, { opacity: () => 1, idPrefix: "t" });
		const pat = /<pattern[^>]*x="([^"]+)"[^>]*width="([^"]+)"/.exec(svg);
		const xs = [...svg.matchAll(/<rect x="([^"]+)" y="[^"]+" width="[^"]+" height="[^"]+" rx/g)].map((m) => Number(m[1]));
		assert.equal(xs.length, 3);
		assert.equal(Number(pat?.[1]), xs[0]);
		assert.equal(num(xs[1] - xs[0]), pat?.[2]);
		assert.equal(num(xs[2] - xs[1]), pat?.[2]);
	});
	it("does not let a box round up past its dimensions", () => {
		assert.equal(cellGrid({ rows: 1, cols: 1, width: 0.2899999995, height: 1 }).size, 0.28);
	});
	it("keeps a tiny rank difference", () => {
		const g = cellGrid({ rows: 1, cols: 2, size: 4 });
		const l = cellLighting(g, { start: 0, duration: 1, spread: 1, order: (_r, c) => [0, Number.MIN_VALUE][c] });
		assert.equal(l.delay(0, 1), 1);
		assert.equal(l.end, 2);
	});
	it("lights nothing before the start and rejects a curve that is not a number", () => {
		const g = cellGrid({ rows: 1, cols: 1, size: 4 });
		assert.equal(cellLighting(g, { start: 1, duration: 1, ease: () => 0.5 }).level(0.5, 0, 0), 0);
		assert.throws(() => cellLighting(g, { start: 0, duration: 1, ease: () => Number.NaN }).level(0.5, 0, 0), /ease must return a finite number/);
	});
	it("rejects a schedule whose end is not finite or is lost in the start", () => {
		const g = cellGrid({ rows: 1, cols: 1, size: 4 });
		assert.throws(() => cellLighting(g, { start: 1e308, duration: 1e308 }), /finite, advancing schedule/);
		assert.throws(() => cellLighting(g, { start: 1e17, duration: 1 }), /finite, advancing schedule/);
	});
	it("keeps the outline inside the cell after rounding, and rejects an outline that is not a boolean, number or null", () => {
		const g = cellGrid({ rows: 1, cols: 1, size: 0.03, gap: 0, radius: 0 });
		const svg = drawCells(g, { opacity: () => 0, base: null, outline: () => true, outlineWidth: 0.015 });
		const m = /x="([^"]+)" y="[^"]+" width="([^"]+)" height="[^"]+" rx="[^"]+" fill="none" stroke="[^"]+" stroke-width="([^"]+)"/.exec(svg);
		assert.ok(m);
		assert.ok(Number(m[1]) + Number(m[2]) + Number(m[3]) / 2 <= 0.03 + 1e-9);
		assert.throws(() => drawCells(g, { opacity: () => 0, base: null, outline: /** @type {any} */ (() => "yes"), outlineWidth: 0.01 }), /outline must return/);
	});
	it("rejects geometry beyond what the markup can print", () => {
		assert.throws(() => cellGrid({ rows: 1, cols: 1, x: 1e307, size: 1 }), /extent is not finite/);
	});
});
