// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · cell grids, for custom scenes (`kit`).
 *
 * Parts for a grid of small rounded squares (a pixel grid, a glyph atlas, a
 * corner of a distance field), as pure functions of time:
 *
 * - a **layout**: rows × columns of square cells fitted to a box or given a
 *   size (`cellGrid`);
 * - a **lighting**: when each cell lights, one by one, all at once or ordered
 *   by any function of the cell, and how far (a field such as a signed
 *   distance gives each cell its own end alpha) (`cellLighting`, `coverage`);
 * - a **drawing**: each cell's fill is a token and its opacity a number the
 *   scene computes per cell and frame; a cell may carry a glyph and an
 *   outline (`drawCells`).
 *
 * A cell is drawn only while its opacity is above 0 (after rounding to three
 * decimals, as `el` rounds it); the empty grid underneath is one pattern, not
 * one element per cell, so a frame costs its lit cells. Nothing here repeats:
 * a lighting ends at `end` and rests.
 *
 * Imports stay single-line named imports: lib/bundle.mjs inlines only that form.
 */
import { clamp01, easings, progress } from "./motion.mjs";
import { safeId } from "./scene.mjs";
import { tok } from "./style.mjs";
import { el, num, text } from "./svg.mjs";

/** @import { Style } from "./style.mjs" */

/** The most cells one grid may hold. The measured budget (skills/animated-diagram/references/custom-scenes.md) sits far below it. */
export const MAX_CELLS = 10000;

/** @param {unknown} n */
const finite = (n) => typeof n === "number" && Number.isFinite(n);
/** What may stand in an id: the characters `safeId` leaves. */
const ID_PART = /^[A-Za-z0-9_]+$/;
/** @param {unknown} n */
/** Geometry beyond this overflows `num()`, which multiplies by 100 before rounding. */
const COORD_LIMIT = 1e300;

const count = (n) => typeof n === "number" && Number.isInteger(n) && n >= 1;

/**
 * @typedef {{ readonly x: number, readonly y: number, readonly size: number, readonly cx: number, readonly cy: number }} Cell
 * A cell's top-left corner, edge length and centre.
 *
 * @typedef {{
 *   readonly rows: number, readonly cols: number, readonly count: number,
 *   readonly x: number, readonly y: number, readonly width: number, readonly height: number,
 *   readonly size: number, readonly gap: number, readonly radius: number,
 *   at: (row: number, col: number) => Cell,
 *   index: (row: number, col: number) => number,
 * }} CellGrid
 * `x`, `y`, `width` and `height` are the grid's own extent (the cells and the gaps between them).
 */

/**
 * A grid of `rows` × `cols` square cells with `gap` between them, rounded by
 * `radius` (default 22 % of the size, never more than half). Give it a `size`
 * (the cell's edge; the grid starts at `x`, `y`) or a box (`width` × `height`:
 * the largest cell that fits, to a hundredth, the grid centred in the box). A `gap`
 * of at most two decimals keeps the empty grid's pattern on the lit cells.
 * @param {{ rows: number, cols: number, x?: number, y?: number, width?: number, height?: number, size?: number, gap?: number, radius?: number }} o
 * @returns {CellGrid}
 */
export function cellGrid({ rows, cols, x = 0, y = 0, width, height, size, gap = 2, radius }) {
	if (!count(rows) || !count(cols)) throw new Error(`cellGrid: rows and cols must be whole numbers from 1, got ${rows} × ${cols}`);
	if (rows * cols > MAX_CELLS) throw new Error(`cellGrid: ${rows * cols} cells; the limit is ${MAX_CELLS}`);
	if (!finite(x) || !finite(y)) throw new Error(`cellGrid: x and y must be finite numbers, got ${x}, ${y}`);
	if (!finite(gap) || gap < 0) throw new Error(`cellGrid: gap must be a finite number of 0 or more, got ${gap}`);
	gap = Number(num(gap));
	const boxed = width !== undefined || height !== undefined;
	if (boxed && size !== undefined) throw new Error("cellGrid: give a size or a box (width and height), not both");
	let edge;
	if (boxed) {
		if (!finite(width) || !finite(height) || /** @type {number} */ (width) <= 0 || /** @type {number} */ (height) <= 0) throw new Error(`cellGrid: width and height must be finite and above 0, got ${width} × ${height}`);
		// Floored to two decimals (with a margin for 0.29 * 100 = 28.999…), so the pitch is as exact as the rounding of the markup and the empty grid's pattern stays on the lit cells.
		edge = Math.floor(Math.min((/** @type {number} */ (width) - gap * (cols - 1)) / cols, (/** @type {number} */ (height) - gap * (rows - 1)) / rows) * 100 + 1e-7) / 100;
	} else {
		edge = size;
	}
	if (boxed && finite(edge)) {
		// The floor above carries a margin for 0.29 * 100 = 28.999…; step down while the cell still does not fit the box.
		const fits = (/** @type {number} */ e) => e * cols + gap * (cols - 1) <= /** @type {number} */ (width) * (1 + 1e-12) && e * rows + gap * (rows - 1) <= /** @type {number} */ (height) * (1 + 1e-12);
		while (edge > 0 && !fits(edge)) edge = Math.round(edge * 100 - 1) / 100;
	}
	if (!finite(edge) || /** @type {number} */ (edge) <= 0 || Number(num(/** @type {number} */ (edge))) <= 0) throw new Error(`cellGrid: the cell size must be finite and above 0 after SVG rounding, got ${edge}${boxed ? " (the box is too small for its cells and gaps)" : ""}`);
	let s = Number(num(/** @type {number} */ (edge)));
	/** The grid's extent and rounded origin at cell size `e`; null when it is not finite or too large for `num()`. */
	const layout = (/** @type {number} */ e) => {
		const w = cols * e + (cols - 1) * gap;
		const h = rows * e + (rows - 1) * gap;
		const ox = boxed ? x + (/** @type {number} */ (width) - w) / 2 : x;
		const oy = boxed ? y + (/** @type {number} */ (height) - h) / 2 : y;
		if (![w, h, ox, oy, cols * (e + gap), rows * (e + gap), ox + w, oy + h].every(finite) || Math.max(Math.abs(ox) + w, Math.abs(ox), Math.abs(oy) + h, Math.abs(oy)) > COORD_LIMIT) return null;
		return { gw: w, gh: h, gx: Number(num(ox)), gy: Number(num(oy)) };
	};
	let lay = layout(s);
	if (boxed) {
		// The origin is rounded to the markup's hundredth after the size was fitted; step the size down until the rounded grid still lies inside the requested box.
		const inside = (/** @type {NonNullable<ReturnType<typeof layout>>} */ l) => l.gx >= x - 1e-9 && l.gy >= y - 1e-9 && l.gx + l.gw <= x + /** @type {number} */ (width) + 1e-9 && l.gy + l.gh <= y + /** @type {number} */ (height) + 1e-9;
		while (lay && !inside(lay) && s > 0.01) {
			s = Math.round(s * 100 - 1) / 100;
			lay = layout(s);
		}
		if (lay && !inside(lay)) throw new Error("cellGrid: the box is too small for its cells and gaps after SVG rounding");
	}
	if (!lay) throw new Error(`cellGrid: the grid's extent is not finite (size ${s}, gap ${gap}, ${rows} × ${cols})`);
	const r = radius ?? s * 0.22;
	if (!finite(r) || r < 0) throw new Error(`cellGrid: radius must be a finite number of 0 or more, got ${radius}`);
	const { gw, gh, gx, gy } = lay;
	/** @param {number} row @param {number} col */
	const inRange = (row, col) => Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < rows && col < cols;
	return Object.freeze({
		rows,
		cols,
		count: rows * cols,
		x: gx,
		y: gy,
		width: gw,
		height: gh,
		size: s,
		gap,
		radius: Math.min(r, s / 2),
		at(/** @type {number} */ row, /** @type {number} */ col) {
			if (!inRange(row, col)) throw new Error(`cellGrid: no cell at row ${row}, column ${col} in a ${rows} × ${cols} grid`);
			const cx0 = gx + col * (s + gap);
			const cy0 = gy + row * (s + gap);
			return Object.freeze({ x: cx0, y: cy0, size: s, cx: cx0 + s / 2, cy: cy0 + s / 2 });
		},
		index(/** @type {number} */ row, /** @type {number} */ col) {
			if (!inRange(row, col)) throw new Error(`cellGrid: no cell at row ${row}, column ${col} in a ${rows} × ${cols} grid`);
			return row * cols + col;
		},
	});
}

/**
 * How much of a cell a shape covers, from its signed distance: `d` is the
 * distance from the cell's centre to the shape's edge, negative inside, in the
 * same unit as `softness` (cells, for a field computed in cell units). 1 well
 * inside, 0 well outside, and 0.5 on the edge, falling off over `softness / 2`
 * on either side (`softness` is the full width of the fall-off): the partial alpha of the cells along an edge.
 * @param {number} d
 * @param {number} [softness] the width of the edge's fall-off (default 1)
 * @returns {number} 0 to 1
 */
export function coverage(d, softness = 1) {
	if (!finite(d)) throw new Error(`coverage: d must be a finite number, got ${d}`);
	if (!finite(softness) || softness <= 0) throw new Error(`coverage: softness must be a finite number above 0, got ${softness}`);
	return clamp01(0.5 - d / softness);
}

/**
 * @typedef {{ readonly start: number, readonly end: number, delay: (row: number, col: number) => number, level: (t: number, row: number, col: number) => number }} CellLighting
 */

/**
 * When and how far each cell lights. Every cell takes `duration` s to reach its
 * end level; the cells start between `start` and `start + spread` s, in the
 * order of `order`:
 *
 * - `"all"` (or `spread` 0): every cell at once;
 * - `"cells"` (default): one by one, row by row; `"rows"`, `"columns"`: a row
 *   or a column at a time;
 * - a function `(row, col) => number`: cells with the lowest value start first
 *   and the highest last, equal values together (a ripple out of a centre is
 *   the distance to it).
 *
 * A cell's end level is `field(row, col)` (0 to 1, default 1): a signed
 * distance through `coverage` makes the cells along an edge partly lit. It is
 * read once per cell, never per frame. `level(t, row, col)` is 0 before the
 * cell starts and exactly its end level from `end` on, on the style's entrance
 * curve (`style.motion`, or the default). A scene's step comes at least 50 ms
 * after `end`.
 * @param {CellGrid} grid
 * @param {{ start: number, duration: number, spread?: number, order?: "all" | "cells" | "rows" | "columns" | ((row: number, col: number) => number), field?: (row: number, col: number) => number, style?: Pick<Style, "motion"> | null, ease?: (p: number) => number }} o
 * @returns {CellLighting}
 */
export function cellLighting(grid, { start, duration, spread = 0, order = "cells", field, style, ease }) {
	if (!finite(start)) throw new Error(`cellLighting: start must be a finite number, got ${start}`);
	if (!finite(duration) || duration <= 0) throw new Error(`cellLighting: duration must be a finite number above 0, got ${duration}`);
	if (!finite(spread) || spread < 0) throw new Error(`cellLighting: spread must be a finite number of 0 or more, got ${spread}`);
	if (order !== "all" && order !== "cells" && order !== "rows" && order !== "columns" && typeof order !== "function") throw new Error(`cellLighting: order must be "all", "cells", "rows", "columns" or a function, got ${JSON.stringify(order)}`);
	if (field !== undefined && typeof field !== "function") throw new Error("cellLighting: field must be a function (row, col) => number from 0 to 1");
	if (ease !== undefined && typeof ease !== "function") throw new Error("cellLighting: ease must be a function (p) => number");
	const last = start + spread + duration;
	if (!finite(last) || !(start + duration > start) || !(last > start + spread)) throw new Error(`cellLighting: start ${start}, spread ${spread} and duration ${duration} do not make a finite, advancing schedule`);
	const curve = ease ?? easings(style?.motion).easeOut;
	const { rows, cols } = grid;
	const ranks = new Float64Array(rows * cols);
	const ends = new Float64Array(rows * cols);
	let lo = Infinity;
	let hi = -Infinity;
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const i = row * cols + col;
			const rank = order === "all" ? 0 : order === "cells" ? i : order === "rows" ? row : order === "columns" ? col : order(row, col);
			if (!finite(rank)) throw new Error(`cellLighting: order must return finite numbers, got ${rank} at row ${row}, column ${col}`);
			const end = field ? field(row, col) : 1;
			if (!finite(end) || end < 0 || end > 1) throw new Error(`cellLighting: field must return numbers from 0 to 1, got ${end} at row ${row}, column ${col}`);
			ranks[i] = rank;
			ends[i] = end;
			if (rank < lo) lo = rank;
			if (rank > hi) hi = rank;
		}
	}
	// The exact span; halved first only when it would overflow (ranks near ±1e308), so a tiny span is not erased.
	const exact = finite(hi - lo);
	const half = exact ? hi - lo : hi / 2 - lo / 2;
	/** @param {number} i */
	const delayOf = (i) => (half > 0 ? spread * Math.min(1, (exact ? ranks[i] - lo : ranks[i] / 2 - lo / 2) / half) : 0);
	return Object.freeze({
		start,
		end: half > 0 ? last : start + duration,
		delay(/** @type {number} */ row, /** @type {number} */ col) {
			return delayOf(grid.index(row, col));
		},
		level(/** @type {number} */ t, /** @type {number} */ row, /** @type {number} */ col) {
			if (!finite(t)) throw new Error(`cellLighting: t must be finite, got ${t}`);
			const i = grid.index(row, col);
			const from = start + delayOf(i);
			if (t < from) return 0;
			if (t >= from + duration) return ends[i];
			const p = progress(t, from, duration, curve);
			if (!finite(p)) throw new Error(`cellLighting: ease must return a finite number, got ${p} at row ${row}, column ${col}`);
			return clamp01(p) * ends[i];
		},
	});
}

/** The `<rect` opening, with a cell's geometry, as `el` would write it; kept per grid, because it never changes. @type {WeakMap<CellGrid, string[]>} */
const OPENINGS = new WeakMap();

/** @param {CellGrid} grid */
function openings(grid) {
	let list = OPENINGS.get(grid);
	if (list) return list;
	list = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			const c = grid.at(row, col);
			list.push(`<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.size)}" height="${num(c.size)}" rx="${num(grid.radius)}"`);
		}
	}
	OPENINGS.set(grid, list);
	return list;
}

/** @typedef {string | { text: string, fill?: string, opacity?: number }} Glyph */

/**
 * Draw the grid at one instant, from the back: the empty grid, the lit cells,
 * the outlines, the glyphs.
 *
 * - `opacity(row, col, index)`: each lit cell's opacity, a number from 0 to 1
 *   the scene computes from the cell and `t` (usually `lighting.level(t, row, col)`);
 *   rounded to three decimals like every opacity, and a cell at 0 draws nothing.
 * - `fill`: the token of a lit cell, or `(row, col) => token`. Default `accent`.
 * - `base`: the token of the empty grid underneath (default `surface`, `null` for none): one
 *   `<pattern>` of the rounded cell, so it costs the same for 6 cells or 2,400. It needs `idPrefix`, the
 *   frame's, and a `name` (letters, digits, `_`; default `cells`) when one scene draws several grids; its id is
 *   `${safeId(idPrefix)}-cells-${name}`.
 * - `outline(row, col)`: `true`, or an opacity from 0 to 1, for a highlighted cell: a stroke in the token
 *   `outlineFill` (default `emphasis`) `outlineWidth` wide (default 2), inside the cell's edge.
 * - `glyph(row, col)`: a string, or `{ text, fill, opacity }`, for the content of a cell, centred, in the token `fill`
 *   (default `ink`) at `glyphSize` (default 60 % of the cell), set in `family` (a monospace face keeps columns even);
 *   `null` for none. A glyph is one character or short mark: the caller fits `text` and `glyphSize` to the cell, nothing clips or shrinks it.
 *
 * @param {CellGrid} grid
 * @param {{ opacity: (row: number, col: number, index: number) => number, fill?: string | ((row: number, col: number) => string), base?: string | null, idPrefix?: string, name?: string, outline?: (row: number, col: number) => boolean | number | null, outlineFill?: string, outlineWidth?: number, glyph?: (row: number, col: number) => Glyph | null, glyphSize?: number, family?: string }} o
 * @returns {string}
 */
export function drawCells(grid, { opacity, fill = "accent", base = "surface", idPrefix, name = "cells", outline, outlineFill = "emphasis", outlineWidth = 2, glyph, glyphSize, family }) {
	if (typeof opacity !== "function") throw new Error("drawCells: opacity must be a function (row, col, index) => number from 0 to 1");
	if (typeof name !== "string" || !ID_PART.test(name)) throw new Error(`drawCells: name must use letters, digits and "_", got ${JSON.stringify(name)}`);
	if (base !== null && (typeof idPrefix !== "string" || idPrefix === "")) throw new Error(`drawCells: an empty grid (base) needs the frame's idPrefix, a non-empty string, got ${JSON.stringify(idPrefix)}`);
	if (outline && (!finite(outlineWidth) || outlineWidth <= 0 || Number(num(outlineWidth)) <= 0 || Number(num(grid.size - 2 * Number(num(outlineWidth / 2)))) <= 0 || 2 * Number(num(outlineWidth / 2)) <= 0)) throw new Error(`drawCells: outlineWidth must be a finite number above 0 and less than the cell size (${grid.size}), got ${outlineWidth}`);
	const gsize = glyphSize ?? grid.size * 0.6;
	if (glyph && (!finite(gsize) || gsize <= 0 || gsize > COORD_LIMIT || Number(num(gsize)) <= 0)) throw new Error(`drawCells: glyphSize must be a finite number above 0, got ${glyphSize}`);
	const { rows, cols } = grid;
	const pitch = grid.size + grid.gap;

	let empty = "";
	if (base !== null) {
		const id = `${safeId(/** @type {string} */ (idPrefix))}-cells-${name}`;
		const tile = el("rect", { width: grid.size, height: grid.size, rx: grid.radius, fill: tok(base) });
		const pattern = el("pattern", { id, x: grid.x, y: grid.y, width: pitch, height: pitch, patternUnits: "userSpaceOnUse" }, tile);
		empty = el("defs", {}, pattern) + el("rect", { x: grid.x, y: grid.y, width: grid.width, height: grid.height, fill: `url(#${id})` });
	}

	const open = openings(grid);
	/** @type {Map<string, string>} */
	const fills = new Map();
	/** @param {string} token */
	const fillAttr = (token) => {
		let attr = fills.get(token);
		if (attr === undefined) fills.set(token, (attr = ` fill="${tok(token)}"`));
		return attr;
	};
	/** @type {string[]} */
	const lit = [];
	/** @type {string[]} */
	const rings = [];
	/** @type {string[]} */
	const glyphs = [];
	// Whole hundredths for the inset and twice it for the stroke, so the painted ring ends on the cell's edge after rounding.
	const inset = outline ? Number(num(outlineWidth / 2)) : 0;
	const ow = inset * 2;
	const ringRadius = Math.max(0, grid.radius - inset);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const i = row * cols + col;
			const raw = opacity(row, col, i);
			if (!finite(raw)) throw new Error(`drawCells: opacity must return a finite number, got ${raw} at row ${row}, column ${col}`);
			const o = Math.round(clamp01(raw) * 1000) / 1000;
			if (o > 0) lit.push(`${open[i]}${fillAttr(typeof fill === "function" ? fill(row, col) : fill)}${o >= 1 ? "" : ` opacity="${num(o, 3)}"`}/>`);
			if (outline) {
				const v = outline(row, col);
				const ro = v === true ? 1 : typeof v === "number" ? v : 0;
				if (v !== null && v !== undefined && typeof v !== "boolean" && !(typeof v === "number" && finite(v))) throw new Error(`drawCells: outline must return a boolean, a number from 0 to 1 or null, got ${JSON.stringify(v)} at row ${row}, column ${col}`);
				if (ro > 0) {
					const c = grid.at(row, col);
					rings.push(el("rect", { x: c.x + inset, y: c.y + inset, width: c.size - ow, height: c.size - ow, rx: ringRadius, fill: "none", stroke: tok(outlineFill), "stroke-width": ow, opacity: clamp01(ro) }));
				}
			}
			if (glyph) {
				const g = glyph(row, col);
				if (g === null || g === undefined) continue;
				const spec = typeof g === "string" ? { text: g } : g;
				if (!spec || typeof spec !== "object" || Array.isArray(spec) || typeof spec.text !== "string") throw new Error(`drawCells: glyph must return a string or { text, fill?, opacity? }, got ${JSON.stringify(g)} at row ${row}, column ${col}`);
				if (spec.opacity !== undefined && !finite(spec.opacity)) throw new Error(`drawCells: a glyph's opacity must be a finite number, got ${JSON.stringify(spec.opacity)} at row ${row}, column ${col}`);
				if (typeof spec.opacity === "number" && Math.round(spec.opacity * 1000) <= 0) continue;
				const c = grid.at(row, col);
				glyphs.push(
					text({ x: c.cx, y: c.cy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": gsize, "font-weight": 600, "font-family": family, fill: tok(spec.fill ?? "ink"), opacity: spec.opacity }, spec.text),
				);
			}
		}
	}
	// Three groups, always present, so a cell lighting or a glyph leaving changes one group and not its neighbours' positions.
	return `<g data-cells="${name}">${empty}<g data-cells-lit="">${lit.join("")}</g><g data-cells-outline="">${rings.join("")}</g><g data-cells-glyphs="">${glyphs.join("")}</g></g>`;
}
