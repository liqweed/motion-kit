/**
 * motion-kit logo: the standard easing curve, cubic-bezier(0.4, 0, 0.2, 1),
 * drawn as a design tool shows it — two keyframes, their handles, and the path
 * between them — on a rounded accent tile. It animates as motion-kit animates
 * anything: the tile settles, the handles appear, the curve draws on, a packet
 * runs the curve and the end keyframe lands.
 *
 * The final frame is the static mark. Square and readable down to ~32 px.
 *
 *   node cli/motion-kit.mjs icon brand/logo.scene.mjs -o .     (or: npm run media)
 *
 * Also the template the project-logo skill starts from for other projects:
 * it takes the runtime from `kit` (passed by motion-kit's CLI) instead of
 * importing it, so a copy works from any repository without vendoring.
 */

const S = 720; // square viewBox; every format renders the same square mark
const TILE = { inset: 40, radius: 168 };
// Curve box: keyframe A bottom-left, keyframe B top-right (y grows downward).
const BOX = { x0: 196, y0: 524, x1: 524, y1: 196 };
const map = (u, v) => ({ x: BOX.x0 + u * (BOX.x1 - BOX.x0), y: BOX.y0 + v * (BOX.y1 - BOX.y0) });
const A = map(0, 0);
const B = map(1, 1);
const H1 = map(0.4, 0); // handle out of A  (x1, y1)
const H2 = map(0.2, 1); // handle into B   (x2, y2)

const STROKE = 30;
const DOT = 40;
const HANDLE = 9;
const KNOB = 26;

const T_TILE = 0;
const T_HANDLES = 0.35;
const T_DRAW = 0.6;
const DRAW = 0.9;
const T_PACKET = T_DRAW + DRAW + 0.05;
const TRAVEL = 0.8;
const LAG = 0.12;
const T_LAND = T_PACKET + TRAVEL + LAG;
const OMEGA = 16; // settles in 9.24 / 16 ≈ 0.58 s
const DURATION = T_LAND + 0.65;

/** @param {{kit: any}} opts */
export default function make({ kit }) {
	const { easeOut, easeStandard, progress, splitEdge, springTo, tok, cubic, drawOn, el, fade, num, scaleAbout } = kit;
	const CURVE = cubic(A, H1, H2, B);

	function frame(t) {
		const out = [];
		// Tile: springs from 0.86 to full size while fading in.
		const grow = springTo(t, 0.86, [{ at: T_TILE, to: 1 }], OMEGA);
		const tileIn = progress(t, T_TILE, 0.3, easeOut);
		out.push(
			fade(
				tileIn,
				{ transform: grow < 0.9995 ? scaleAbout(grow, S / 2, S / 2) : undefined },
				el("rect", {
					x: TILE.inset,
					y: TILE.inset,
					width: S - 2 * TILE.inset,
					height: S - 2 * TILE.inset,
					rx: TILE.radius,
					fill: tok("accent"),
				}),
			),
		);

		// Bézier handles: thin lines with square knobs.
		const handles = progress(t, T_HANDLES, 0.35, easeOut);
		const handle = (from, to) =>
			el(
				"g",
				{},
				el("line", { x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y), stroke: tok("onAccent"), "stroke-width": HANDLE, "stroke-linecap": "round" }),
				el("rect", { x: num(to.x - KNOB / 2), y: num(to.y - KNOB / 2), width: KNOB, height: KNOB, rx: 5, fill: tok("onAccent") }),
			);
		out.push(fade(handles * 0.55, {}, handle(A, H1), handle(B, H2)));

		// The curve draws on.
		const dash = drawOn(CURVE.length, progress(t, T_DRAW, DRAW, easeStandard));
		if (dash) out.push(el("path", { d: CURVE.d, fill: "none", stroke: tok("onAccent"), "stroke-width": STROKE, "stroke-linecap": "round", ...dash }));

		// Start keyframe: a ring that appears with the handles.
		out.push(
			fade(handles, {}, el("circle", { cx: A.x, cy: A.y, r: DOT, fill: tok("accent"), stroke: tok("onAccent"), "stroke-width": 14 })),
		);

		// Packet: a capsule that stretches as it runs the curve (split edges).
		const { lead, trail } = splitEdge(t, T_PACKET, TRAVEL, LAG);
		if (lead > 0 && trail < 1) {
			const a = CURVE.at(trail);
			const b = CURVE.at(lead);
			out.push(el("line", { x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y), stroke: tok("emphasis"), "stroke-width": STROKE + 6, "stroke-linecap": "round" }));
		}

		// End keyframe lands in the emphasis colour with a spring pop.
		if (t >= T_LAND) {
			const pop = springTo(t, 0.4, [{ at: T_LAND, to: 1 }], OMEGA);
			out.push(el("circle", { cx: B.x, cy: B.y, r: num(DOT * pop), fill: tok("emphasis"), stroke: tok("onAccent"), "stroke-width": 14 }));
		}
		return out.join("");
	}

	return {
		id: "motion-kit-logo",
		width: S,
		height: S,
		duration: DURATION,
		title: "motion-kit",
		description: "An easing curve between two keyframes on a blue tile: the motion-kit logo.",
		stepLabelsInFrame: false,
		steps: [{ at: DURATION, label: "Logo" }],
		frame,
	};
}
