/**
 * Example custom scene: a pixel grid that lights cell by cell, then all at once,
 * and a glyph atlas whose letters fly out along arcs.
 *
 * Shows the cell-grid parts (runtime/cells.mjs). Step 1: a 12 × 6 grid lights
 * one by one, row by row, towards an ellipse; its edge cells end partly lit,
 * from a signed distance (`coverage`), and their opacity is a rounded number
 * like any other. Step 2: every cell lights at once. Step 3: four letters of an
 * 8 × 3 atlas are outlined and fly to the empty slots of a word along Bézier
 * arcs (`cubic`, `tokensAlong`), one after another, and stay there. The grid
 * lights once per step, and the atlas has no cursor: each step is a single beat
 * that ends before the step's time, so every step frame is settled.
 * Nothing loops. Pure: frame(t) depends only on t and constants.
 */
import { cellGrid, cellLighting, coverage, drawCells } from "../runtime/cells.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { NEUTRAL, sharedPairs, tok } from "../runtime/style.mjs";
import { cubic, text, tokensAlong } from "../runtime/svg.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "Cells that light, then letters that fly", nl: "Cellen die oplichten, daarna vliegende letters" },
	description: {
		en: "A grid of 12 by 6 cells lights one by one towards an ellipse, then all at once. Four letters of a glyph atlas are outlined and fly along arcs into a word.",
		nl: "Een raster van 12 bij 6 cellen licht één voor één op naar een ellips, daarna allemaal tegelijk. Vier letters van een glyphenatlas krijgen een omlijning en vliegen langs bogen naar een woord.",
	},
	grid: { en: "12 × 6 pixels", nl: "12 × 6 pixels" },
	atlas: { en: "8 × 3 glyph atlas", nl: "8 × 3 glyphenatlas" },
	steps: [
		{ label: { en: "One by one", nl: "Eén voor één" }, detail: { en: "The cells light in turn towards an ellipse; the cells on its edge stay partly lit.", nl: "De cellen lichten om de beurt op naar een ellips; de cellen op de rand blijven deels verlicht." } },
		{ label: { en: "All at once", nl: "Allemaal tegelijk" }, detail: { en: "Every cell lights in the same beat.", nl: "Elke cel licht in dezelfde tel op." } },
		{ label: { en: "Letters fly out", nl: "Letters vliegen uit" }, detail: { en: "Four letters leave the atlas along arcs and spell a word.", nl: "Vier letters verlaten de atlas langs bogen en vormen een woord." } },
	],
};

// The atlas, row by row, and the letters that leave it: [row, column] of G, R, I, D.
const ATLAS = ["ABCDEFGH", "IJKLMNOP", "QRSTUVWX"];
const FLYERS = [
	[0, 6],
	[2, 1],
	[1, 0],
	[0, 3],
];

// Timeline, in seconds. Each beat ends well before its step, 100 ms after.
const ONE = { start: 0.3, spread: 1.2, duration: 0.3 }; // ends at 1.8
const ALL = { start: 2.1, duration: 0.4 }; // ends at 2.5
const RING = { start: 2.9, duration: 0.25 }; // the outline on the cells a letter leaves
const FLY = { start: 3.0, each: 0.12, duration: 0.7 }; // the last letter lands at 4.06
const SETTLE = 0.1;

/** The ellipse the first step lights towards, in cell units from the grid's centre; the signed distance, negative inside. @param {number} row @param {number} col */
function ellipse(row, col) {
	const dx = col - 5.5;
	const dy = row - 2.5;
	const rx = 4.4;
	const ry = 2.2;
	return (Math.hypot(dx / rx, dy / ry) - 1) * Math.min(rx, ry);
}

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const pad = 32;
	const fs = 15;
	const capH = fs * 1.25 + 10; // a caption and its gap to the grid
	const gapY = 24; // between a grid and the next caption or row
	const fixed = 2 * pad + 2 * capH + 2 * gapY;
	// One pitch for all three grids: the widest (12 cells) must fit the width, the 10 rows (6 + the word + 3) the height.
	const pitch = Math.floor(Math.min((W - 2 * pad) / 12, 56, f.height ? (f.height - fixed) / 10 : Infinity));
	const gap = Math.max(2, Math.round(pitch * 0.14));
	const size = pitch - gap;
	const total = 10 * pitch - gap + 2 * capH + 2 * gapY;
	const H = f.height || Math.round(total + 2 * pad);
	const top = Math.round((H - total) / 2);
	const centred = (/** @type {number} */ cols) => Math.round((W - (cols * pitch - gap)) / 2);
	const y1 = top + capH;
	const grid = cellGrid({ rows: 6, cols: 12, x: centred(12), y: y1, size, gap });
	const yWord = y1 + 6 * pitch - gap + gapY;
	const word = cellGrid({ rows: 1, cols: 4, x: centred(4), y: yWord, size, gap });
	const y3 = yWord + size + gapY + capH;
	const atlas = cellGrid({ rows: 3, cols: 8, x: centred(8), y: y3, size, gap });
	const capW = Math.floor((W - 2 * pad) / (fs * 0.56));
	const captions = [wrapLabel(localize(COPY.grid, locale), capW, 1), wrapLabel(localize(COPY.atlas, locale), capW, 1)];

	const one = cellLighting(grid, { ...ONE, order: "cells", field: (row, col) => coverage(ellipse(row, col)) });
	const all = cellLighting(grid, { ...ALL, order: "all" });
	const ringAt = cellLighting(atlas, { ...RING, order: "all" }); // the outline's own beat
	const isFlyer = (/** @type {number} */ row, /** @type {number} */ col) => FLYERS.findIndex(([r, c]) => r === row && c === col);
	// Each letter's arc, from its atlas cell to its slot in the word: the control points swing sideways, to opposite sides in turn.
	const runs = FLYERS.map(([row, col], i) => {
		const a = atlas.at(row, col);
		const b = word.at(0, i);
		const swing = (i % 2 === 0 ? 1 : -1) * pitch * 1.6;
		const path = cubic({ x: a.cx, y: a.cy }, { x: a.cx + swing, y: a.cy + (b.cy - a.cy) * 0.35 }, { x: b.cx + swing * 0.5, y: a.cy + (b.cy - a.cy) * 0.85 }, { x: b.cx, y: b.cy });
		return { start: FLY.start + i * FLY.each, duration: FLY.duration, path, hold: true };
	});
	const glyphSize = Math.round(size * 0.6);
	const fixedAt = FLY.start + (FLYERS.length - 1) * FLY.each + FLY.duration;

	/** @param {number} t @param {{ idPrefix: string, style?: any }} ctx */
	function frame(t, { idPrefix, style }) {
		const family = (style ?? NEUTRAL).mono;
		const caption = (/** @type {string[]} */ s, /** @type {number} */ y) => text({ x: pad, y: y + (fs * 1.25) / 2, "dominant-baseline": "central", "font-size": fs, "font-weight": 600, fill: tok("muted") }, s);
		const ring = ringAt.level(t, 0, 0);
		const flown = (/** @type {number} */ row, /** @type {number} */ col) => {
			const i = isFlyer(row, col);
			return i >= 0 && t > runs[i].start;
		};
		return [
			caption(captions[0], top),
			drawCells(grid, { idPrefix, name: "pixels", opacity: (row, col) => Math.max(one.level(t, row, col), all.level(t, row, col)) }),
			drawCells(word, { idPrefix, name: "word", opacity: () => 0 }),
			caption(captions[1], y3 - capH),
			drawCells(atlas, {
				idPrefix,
				name: "atlas",
				opacity: () => 0,
				outline: (row, col) => (isFlyer(row, col) >= 0 ? ring : 0),
				glyph: (row, col) => (flown(row, col) ? null : ATLAS[row][col]),
				glyphSize,
				family,
			}),
			tokensAlong(runs[0].path, t, runs, (p, { index }) =>
				text({ x: p.x, y: p.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": glyphSize, "font-weight": 600, "font-family": family, fill: tok("ink") }, ATLAS[FLYERS[index][0]][FLYERS[index][1]]),
			),
		].join("");
	}

	const stepAt = [one.end + SETTLE, all.end + SETTLE, fixedAt + SETTLE];
	const steps = COPY.steps.map((s, i) => ({ at: stepAt[i], label: localize(s.label, locale), detail: localize(s.detail, locale) }));

	return {
		id: `cell-grid-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: steps[steps.length - 1].at + 0.4,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// Narrative steps: the frame shows the grids, not the step labels.
		stepLabelsInFrame: false,
		// The pairs this scene draws: captions on the canvas, lit cells on the empty grid, letters on the atlas's cells, the outline on the canvas.
		contrastPairs: [...sharedPairs("ink/bg", "muted/bg"), { fg: "accent", bg: "surface", min: 3, use: "a lit cell on the empty grid" }, { fg: "ink", bg: "surface", min: 4.5, use: "a letter on its atlas cell" }, { fg: "emphasis", bg: "bg", min: 3, use: "the outline of a cell" }],
		steps,
		frame,
	};
}
