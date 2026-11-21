/**
 * Example custom scene: a request travelling Client → API → Database and back.
 *
 * Shows the escape hatch for diagrams no scene type covers, and exercises the
 * derived motion helpers: a packet that stretches in flight (split edges) along
 * curved links (arc-length lookup), and a retargetable spring for the response
 * counter bar. Pure: frame(t) depends only on t and constants.
 */
import { easeOut, easeStandard, progress, splitEdge, springTo } from "../runtime/motion.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { sharedPairs, tok } from "../runtime/style.mjs";
import { cubic, drawOn, el, fade, num, text } from "../runtime/svg.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "A request, there and back", nl: "Een verzoek, heen en terug" },
	description: {
		en: "The client asks the API, the API reads the database, and the answer travels back.",
		nl: "De client vraagt de API, de API leest de database en het antwoord gaat terug.",
	},
	nodes: [
		{ en: "Client", nl: "Client" },
		{ en: "API", nl: "API" },
		{ en: "Database", nl: "Database" },
	],
	steps: [
		{ label: { en: "Request sent", nl: "Verzoek verstuurd" }, detail: { en: "The client calls the API.", nl: "De client roept de API aan." } },
		{ label: { en: "Data read", nl: "Gegevens gelezen" }, detail: { en: "The API queries the database.", nl: "De API bevraagt de database." } },
		{ label: { en: "Answer returned", nl: "Antwoord terug" }, detail: { en: "The response travels back to the client.", nl: "Het antwoord gaat terug naar de client." } },
	],
};

const ENTER = 0.4;
const GAP = 0.12;
const TRAVEL = 0.7;
const FILL = 0.25;

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const H = f.height || (format === "tall" ? 560 : 300);
	const horizontal = W / H >= 1;
	const boxW = horizontal ? Math.min(180, W / 5) : Math.min(220, W - 80);
	const boxH = 56;
	const fs = 17;
	const centers = [0, 1, 2].map((i) =>
		horizontal ? { x: W * (0.18 + 0.32 * i), y: H / 2 } : { x: W / 2, y: H * (0.18 + 0.32 * i) },
	);
	const labels = COPY.nodes.map((n) => wrapLabel(localize(n, locale), Math.floor((boxW - 16) / (fs * 0.56)), 1));
	// Curved links bow out (forward) and back (return) so they don't overlap.
	const link = (a, b, bow) => {
		// Leave from the side of `a` that faces `b`, arrive at the side of `b` that faces `a`.
		const sx = Math.sign(b.x - a.x) || 1;
		const sy = Math.sign(b.y - a.y) || 1;
		const ax = horizontal ? a.x + sx * (boxW / 2 + 6) : a.x;
		const ay = horizontal ? a.y : a.y + sy * (boxH / 2 + 6);
		const bx = horizontal ? b.x - sx * (boxW / 2 + 6) : b.x;
		const by = horizontal ? b.y : b.y - sy * (boxH / 2 + 6);
		return horizontal
			? cubic({ x: ax, y: ay }, { x: ax + sx * 40, y: ay + bow }, { x: bx - sx * 40, y: by + bow }, { x: bx, y: by })
			: cubic({ x: ax, y: ay }, { x: ax + bow, y: ay + sy * 40 }, { x: bx + bow, y: by - sy * 40 }, { x: bx, y: by });
	};
	const fwd = [link(centers[0], centers[1], -44), link(centers[1], centers[2], -44)];
	const back = [link(centers[1], centers[0], 44), link(centers[2], centers[1], 44)];
	const legs = [fwd[0], fwd[1], back[1], back[0]];

	const T0 = ENTER + 2 * GAP + 0.15;
	// Beats never overlap: a leg starts only after the previous arrival has
	// filled and the packet's trailing edge has landed (settled step frames).
	const LAG = 0.09;
	const BEAT = TRAVEL + LAG + FILL + 0.05;
	const legStart = (i) => T0 + i * BEAT;
	const arrive = (i) => legStart(i) + TRAVEL + LAG;
	const activeAt = [T0, arrive(0), arrive(1)];
	const steps = [
		{ at: arrive(0) + FILL, ...COPY.steps[0] },
		{ at: arrive(1) + FILL, ...COPY.steps[1] },
		{ at: arrive(3) + 0.05, ...COPY.steps[2] },
	];
	const duration = steps[2].at + 0.4;
	// Progress bar: a critically damped spring retargeted at each leg; ω = 14
	// settles in 9.24/14 ≈ 0.66 s, before each step's time.
	const OMEGA = 14;
	const bar = (t) => springTo(t, 0, [{ at: legStart(0), to: 0.33 }, { at: legStart(1), to: 0.66 }, { at: legStart(3), to: 1 }], OMEGA);

	function frame(t) {
		const out = [];
		legs.forEach((leg, i) => {
			const shown = progress(t, GAP * Math.min(i, 2), ENTER, easeOut);
			if (shown > 0) out.push(el("path", { d: leg.d, fill: "none", stroke: tok("line"), "stroke-width": 2, "stroke-dasharray": "4 6", opacity: shown }));
			const dash = drawOn(leg.length, progress(t, legStart(i), TRAVEL, easeStandard));
			if (dash) out.push(el("path", { d: leg.d, fill: "none", stroke: tok("accent"), "stroke-width": 3, "stroke-linecap": "round", ...dash }));
		});
		centers.forEach((c, i) => {
			const enter = progress(t, i * GAP, ENTER, easeOut);
			const on = progress(t, activeAt[i], FILL, easeStandard);
			const box = (fill, stroke, ink) =>
				el(
					"g",
					{},
					el("rect", { x: c.x - boxW / 2, y: c.y - boxH / 2, width: boxW, height: boxH, rx: 10, fill, stroke, "stroke-width": 2 }),
					text({ x: c.x, y: c.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fs, "font-weight": 600, fill: ink }, labels[i]),
				);
			out.push(
				fade(enter, {}, fade(1 - on, {}, box(tok("surface"), tok("line"), tok("ink"))), fade(on, {}, box(tok("accent"), tok("accent"), tok("onAccent")))),
			);
		});
		// The packet: a capsule from the trailing to the leading edge (split edges).
		legs.forEach((leg, i) => {
			const { lead, trail } = splitEdge(t, legStart(i), TRAVEL, LAG);
			if (lead <= 0 || trail >= 1) return;
			const a = leg.at(trail);
			const b = leg.at(lead);
			out.push(el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: tok("emphasis"), "stroke-width": 10, "stroke-linecap": "round" }));
		});
		const p = bar(t);
		if (p > 0.0005) {
			const bw = horizontal ? W * 0.5 : W * 0.7;
			const x = (W - bw) / 2;
			const y = H - 28;
			out.push(el("rect", { x, y, width: bw, height: 6, rx: 3, fill: tok("surface") }));
			out.push(el("rect", { x, y, width: num(bw * p), height: 6, rx: 3, fill: tok("accent") }));
		}
		return out.join("");
	}

	return {
		id: `request-roundtrip-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// Steps here are events, not nodes: their labels live in the player's
		// step buttons and captions, not in the drawing.
		stepLabelsInFrame: false,
		// The pairs this scene draws, and the only ones the gate holds the style
		// to (the shared pairs it leaves out, text on the canvas for one, are
		// warnings): the shared ones its nodes, links and comet use, and the
		// progress bar's accent fill on its surface track.
		contrastPairs: [
			...sharedPairs("ink/surface", "onAccent/accent", "line/bg", "accent/bg", "emphasis/bg", "emphasis/accent"),
			{ fg: "accent", bg: "surface", min: 3, use: "the progress bar's fill on its track" },
		],
		steps: steps.map((s) => ({ at: s.at, label: localize(s.label, locale), detail: localize(s.detail, locale) })),
		frame,
	};
}
