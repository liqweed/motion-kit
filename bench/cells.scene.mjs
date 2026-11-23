/**
 * Benchmark scene for the cell-grid part: a grid of `rows` × `cols` cells that
 * a ripple lights out of the centre towards a disc (edge cells partly lit), then
 * all at once. Every cell changes in most frames of the ripple, which is the
 * costly case. `npm run bench:player` draws it at about 100, 600 and 2,400 cells;
 * `motion-kit bake` and `video` take it with `--options '{"rows":40,"cols":60}'`.
 * Not a gallery example: it exists to be heavy.
 */
import { cellGrid, cellLighting, coverage, drawCells } from "../runtime/cells.mjs";
import { FORMATS } from "../runtime/scene.mjs";

const RIPPLE = { start: 0.2, spread: 2, duration: 0.5 }; // ends at 2.7
const ALL = { start: 3.0, duration: 0.5 }; // ends at 3.5

/** @param {{ format?: string, rows?: number, cols?: number }} [opts] */
export default function make({ format = "16:9", rows = 10, cols = 10 } = {}) {
	const f = FORMATS[format];
	if (!f || !f.height) throw new Error(`unsupported format "${format}"`);
	const pad = 24;
	const grid = cellGrid({ rows, cols, x: pad, y: pad, width: f.width - 2 * pad, height: f.height - 2 * pad, gap: rows * cols > 1000 ? 1 : 2 });
	const cx = (cols - 1) / 2;
	const cy = (rows - 1) / 2;
	const radius = Math.min(rows, cols) * 0.45;
	const ripple = cellLighting(grid, { ...RIPPLE, order: (r, c) => Math.hypot(r - cy, c - cx), field: (r, c) => coverage(Math.hypot(r - cy, c - cx) - radius) });
	const all = cellLighting(grid, { ...ALL, order: "all" });
	const steps = [
		{ at: ripple.end + 0.1, label: "Ripple", detail: "A ripple lights the cells of a disc, the cells on its edge partly." },
		{ at: all.end + 0.1, label: "All lit", detail: "Every cell lights in one beat." },
	];

	/** @param {number} t @param {{ idPrefix: string }} ctx */
	function frame(t, { idPrefix }) {
		return drawCells(grid, { idPrefix, opacity: (r, c) => Math.max(ripple.level(t, r, c), all.level(t, r, c)) });
	}

	return {
		id: `bench-cells-${rows}x${cols}-${format.replace(":", "x")}`,
		width: f.width,
		height: f.height,
		duration: steps[1].at + 0.4,
		title: `${rows * cols} cells`,
		description: `A grid of ${rows} by ${cols} cells that a ripple lights, then all at once.`,
		stepLabelsInFrame: false,
		steps,
		frame,
	};
}
