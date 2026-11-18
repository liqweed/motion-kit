/**
 * Benchmark scene for the live player: a fleet of nodes that come online,
 * fill with load and flag the hot ones. About 25 KB of SVG per frame while
 * it plays, most of it changing attributes and text, with elements appearing
 * as it goes. `npm run bench:player` draws it; test/player.test.mjs replays it.
 * Not a gallery example: it exists to be heavy.
 */
import { easeOut, easeStandard, progress } from "../runtime/motion.mjs";
import { FORMATS } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { el, fade, num, text, translate } from "../runtime/svg.mjs";

const COLS = 10;
const ROWS = 6;
const ENTER = 0.5;
const SPREAD = 1.0;
const FILL_AT = 1.7;
const FILL = 1.5;
const FLAG_AT = 3.5;
const FLAG = 0.8;

/** A load per node in 0..1, fixed (no randomness at frame time). @param {number} i */
const load = (i) => ((i * 37) % 101) / 100;

/** @param {{ format?: string }} [opts] */
export default function make({ format = "16:9" } = {}) {
	const f = FORMATS[format];
	if (!f || !f.height) throw new Error(`unsupported format "${format}"`);
	const W = f.width;
	const H = f.height;
	const top = 56;
	const gap = 8;
	const cw = (W - 2 * 24 - (COLS - 1) * gap) / COLS;
	const ch = (H - top - 24 - (ROWS - 1) * gap) / ROWS;
	const count = COLS * ROWS;
	const steps = [
		{ at: ENTER + SPREAD + 0.1, label: "Nodes online", detail: "Every node in the fleet reports in." },
		{ at: FILL_AT + FILL + 0.2, label: "Load spread", detail: "Work spreads across the fleet." },
		{ at: FLAG_AT + FLAG + 0.2, label: "Hot nodes flagged", detail: "Nodes above 80 % load are flagged." },
	];

	/** @param {number} t */
	function frame(t) {
		const out = [];
		let online = 0;
		for (let i = 0; i < count; i++) {
			const enter = progress(t, (SPREAD * i) / count, ENTER, easeOut);
			if (enter >= 1) online++;
			const fill = progress(t, FILL_AT + (0.4 * (i % COLS)) / COLS, FILL - 0.4, easeStandard) * load(i);
			const hot = load(i) > 0.8 ? progress(t, FLAG_AT + (0.3 * Math.floor(i / COLS)) / ROWS, FLAG - 0.3, easeOut) : 0;
			const x = 24 + (i % COLS) * (cw + gap);
			const y = top + Math.floor(i / COLS) * (ch + gap) + (1 - enter) * 12;
			out.push(
				fade(
					enter,
					{ transform: translate(x, y) },
					el("rect", { width: cw, height: ch, rx: 6, fill: tok(hot > 0 ? "accent" : "surface"), stroke: tok("line"), "stroke-width": 1 }),
					el("rect", { x: 6, y: ch - 14, width: (cw - 12) * fill, height: 6, rx: 3, fill: tok(hot > 0 ? "onAccent" : "accent") }),
					text({ x: 8, y: 18, "font-size": 11, fill: tok(hot > 0 ? "onAccent" : "muted") }, `N-${String(i + 1).padStart(2, "0")}`),
					text({ x: cw - 8, y: 18, "text-anchor": "end", "font-size": 11, "font-weight": 600, fill: tok(hot > 0 ? "onAccent" : "ink") }, `${Math.round(fill * 100)}%`),
					hot > 0 && el("circle", { cx: cw - 10, cy: ch / 2 + 2, r: 2 + 3 * hot, fill: tok("emphasis"), opacity: hot }),
				),
			);
		}
		const header = text({ x: 24, y: 34, "font-size": 18, "font-weight": 600, fill: tok("ink") }, `Fleet: ${online} of ${count} online`);
		const avg = progress(t, FILL_AT, FILL, easeStandard);
		const meter = el("rect", { x: W - 224, y: 24, width: num(200 * avg), height: 8, rx: 4, fill: tok("accent") });
		return header + el("rect", { x: W - 224, y: 24, width: 200, height: 8, rx: 4, fill: tok("surface") }) + meter + out.join("");
	}

	return {
		id: `bench-fleet-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: steps[2].at + 0.4,
		title: "Fleet load",
		description: "Sixty nodes come online, take on load, and the hottest are flagged.",
		stepLabelsInFrame: false,
		steps,
		frame,
	};
}
