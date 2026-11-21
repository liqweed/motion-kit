/**
 * Example custom scene: a request fans out through a diamond splitter, then a
 * result rides an isometric feeder line through three junctions.
 *
 * Shows the connector parts (runtime/connectors.mjs): dashed connectors that
 * draw on and rest as dashed lines, with open-V arrowheads; diamond junctions,
 * flat on the picture and lying in the floor plane of an isometric view, that
 * light when a pulse reaches them; and light pulses with a glow and a fading
 * tail. A pulse runs once, inside its step's beat, and is over (`pulseEnd`)
 * before the step's time, so every step frame is settled. Nothing loops: the
 * scene plays once and holds its last frame. Pure: frame(t) depends only on
 * t and constants.
 */
import { easeOut, easeStandard, linear, progress } from "../runtime/motion.mjs";
import { CAMERA_ISOMETRIC, box, drawSolid, fitCamera, labelAnchor, orderSolids, slab } from "../runtime/iso.mjs";
import { connectorPath, drawConnector, drawJunction, drawPulse, pulseEnd } from "../runtime/connectors.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { el, fade, text } from "../runtime/svg.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "A request fans out, then rides the feeder", nl: "Een verzoek splitst en volgt de aanvoerlijn" },
	description: {
		en: "A request crosses a diamond splitter and fans out to three services; a result then rides an isometric feeder line through three junctions to the shelf.",
		nl: "Een verzoek passeert een ruitvormige splitser en waaiert uit naar drie diensten; een resultaat volgt daarna een isometrische aanvoerlijn langs drie knooppunten naar het schap.",
	},
	source: { en: "Request", nl: "Verzoek" },
	targets: [
		{ en: "Search", nl: "Zoeken" },
		{ en: "Cache", nl: "Cache" },
		{ en: "Audit", nl: "Logboek" },
	],
	stations: [
		{ en: "Intake", nl: "Intake" },
		{ en: "Shelf", nl: "Schap" },
	],
	steps: [
		{ label: { en: "Request reaches the splitter", nl: "Verzoek bereikt de splitser" }, detail: { en: "One pulse crosses the first connector and lights the diamond.", nl: "Eén puls steekt de eerste verbinding over en laat de ruit oplichten." } },
		{ label: { en: "It fans out", nl: "Het waaiert uit" }, detail: { en: "Three pulses leave the splitter together and light their services.", nl: "Drie pulsen verlaten de splitser tegelijk en laten hun diensten oplichten." } },
		{ label: { en: "The feeder delivers", nl: "De aanvoerlijn levert" }, detail: { en: "A pulse rides the isometric feeder through three junctions to the shelf.", nl: "Een puls volgt de isometrische aanvoerlijn langs drie knooppunten naar het schap." } },
	],
};

// Timeline, in seconds. Every pulse is over, and its target has lit, before the
// step that follows it; the gate checks the step frames are settled.
const ENTER = 0.4;
const DRAW = 0.5;
const FILL = 0.25;
const IN = { start: 2, duration: 0.6 };
const OUT = { start: 3.2, duration: 0.7 };
const FEED = { start: 4.5, duration: 1.6, ease: linear };
const STEP_SPLIT = pulseEnd(IN) + FILL + 0.1;
const STEP_FAN = pulseEnd(OUT) + FILL + 0.1;
const STEP_FEED = pulseEnd(FEED) + FILL + 0.1;
const DURATION = STEP_FEED + 0.35;

// The feeder, in world units: a floor, two stations and a path with three turns.
const FLOOR = { w: 10, d: 6.4, h: 0.3 };
const TOP = FLOOR.h;
const STATIONS = [
	{ x: -3.6, y: -1.8, w: 1.6, d: 1.6, h: 0.8 },
	{ x: 1.8, y: 1.9, w: 1.6, d: 1.6, h: 0.8 },
];
const FEEDER = [
	{ x: -2.6, y: -1.8 },
	{ x: -0.6, y: -1.8 },
	{ x: -0.6, y: -0.4 },
	{ x: 1.8, y: -0.4 },
	{ x: 1.8, y: 0.9 },
].map((p) => ({ ...p, z: TOP }));
const TURNS = [1, 2, 3];

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const H = f.height || (format === "tall" ? 640 : 360);
	const fs = 15;

	// Two panels, one above the other: the flat fan-out, then the isometric feeder.
	const split = Math.round(H * 0.4);
	const flat = { x: 16, y: 12, w: W - 32, h: split - 16 };
	const iso = { x: 16, y: split + 4, w: W - 32, h: H - split - 16 };

	/* ---- the flat fan-out ---- */
	const along = flat.w / flat.h >= 1.4 ? "x" : "y"; // the direction the flow runs
	const span = along === "x" ? flat.w : flat.h;
	const cross = along === "x" ? flat.h : flat.w;
	const gap = along === "x" ? Math.min(64, (cross - 40) / 2.4) : Math.min(170, (cross - 16) / 3); // between targets, across the flow
	const nodeAcross = along === "x" ? 40 : Math.min(150, gap - 12);
	const nodeAlong = along === "x" ? Math.min(150, span * 0.22) : 40;
	const nodeW = along === "x" ? nodeAlong : nodeAcross;
	const nodeH = along === "x" ? nodeAcross : nodeAlong;
	/** @param {number} a along the flow, from the panel's start @param {number} b across it, from its middle */
	const at = (a, b) => (along === "x" ? { x: flat.x + a, y: flat.y + flat.h / 2 + b } : { x: flat.x + flat.w / 2 + b, y: flat.y + a });
	const ha = nodeAlong / 2;
	const aSource = ha + 6;
	const aSplit = span * 0.42;
	const aTarget = span - ha - 6;
	const spread = [-gap, 0, gap];
	const MARK = 4; // clearance between a connector's end and a node

	const toSplit = connectorPath([at(aSource + ha + MARK, 0), at(aSplit, 0)]);
	const fan = spread.map((b) => connectorPath(b === 0 ? [at(aSplit, 0), at(aTarget - ha - MARK, 0)] : [at(aSplit, 0), at(aSplit, b), at(aTarget - ha - MARK, b)]));
	const names = [COPY.source, ...COPY.targets].map((s) => wrapLabel(localize(s, locale), Math.floor((nodeW - 16) / (fs * 0.56)), 1));
	const nodes = [at(aSource, 0), ...spread.map((b) => at(aTarget, b))];

	/* ---- the isometric feeder ---- */
	const extent = [
		...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: (sx * FLOOR.w) / 2, y: (sy * FLOOR.d) / 2, z: 0 }))),
		...STATIONS.flatMap((s) => [-1, 1].flatMap((dx) => [-1, 1].map((dy) => ({ x: s.x + (dx * s.w) / 2, y: s.y + (dy * s.d) / 2, z: TOP + s.h })))),
	];
	const fitted = fitCamera(extent, CAMERA_ISOMETRIC, { width: iso.w, height: iso.h, margin: { top: 70, right: 8, bottom: 8, left: 8 } });
	const cam = { ...fitted, pan: { x: fitted.pan.x + iso.x, y: fitted.pan.y + iso.y } };
	const feeder = connectorPath(FEEDER, { camera: cam });
	// A junction lights when the pulse reaches it, at a constant speed (`ease: linear`).
	let travelled = 0;
	const reach = FEEDER.map((p, i) => {
		if (i > 0) travelled += Math.hypot(p.x - FEEDER[i - 1].x, p.y - FEEDER[i - 1].y);
		return travelled;
	}).map((d) => FEED.start + (d / travelled) * FEED.duration);
	const stationNames = COPY.stations.map((s) => wrapLabel(localize(s, locale), 12, 2));

	/** A flat node: pending, with the reached layer cross-faded over it. */
	function node(/** @type {{ x: number, y: number }} */ c, /** @type {string[]} */ lines, /** @type {number} */ lit) {
		const layer = (/** @type {string} */ fill, /** @type {string} */ stroke, /** @type {string} */ ink) =>
			el(
				"g",
				{},
				el("rect", { x: c.x - nodeW / 2, y: c.y - nodeH / 2, width: nodeW, height: nodeH, rx: 8, fill: tok(fill), stroke: tok(stroke), "stroke-width": 2 }),
				text({ x: c.x, y: c.y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fs, "font-weight": 600, fill: tok(ink) }, lines),
			);
		return layer("surface", "line", "ink") + fade(lit, {}, layer("accent", "accent", "onAccent"));
	}

	/** The feeder's stations at time t: pending, and the reached layer over the last. */
	function stations(/** @type {number} */ t) {
		const enter = progress(t, 0.2, ENTER, easeOut);
		const lit = [0, progress(t, FEED.start + FEED.duration, FILL, easeStandard)];
		const make = STATIONS.map((s, i) => ({ base: box({ x: s.x, y: s.y, w: s.w, d: s.d, h: s.h, z: TOP, fill: "surface", opacity: enter, id: String(i) }), on: box({ x: s.x, y: s.y, w: s.w, d: s.d, h: s.h, z: TOP, fill: "accent", id: String(i) }), lit: lit[i] }));
		return make;
	}

	function labels(/** @type {number} */ t) {
		const opacity = progress(t, 0.5, ENTER);
		return STATIONS.map((s, i) => labelAnchor(cam, { id: `station-${i}`, at: { x: s.x, y: s.y, z: TOP + s.h }, lines: stationNames[i], fontSize: fs, lift: 30, opacity }));
	}

	function frame(/** @type {number} */ t) {
		const out = [];
		// The flat fan-out: connectors, then the splitter and its elbows, nodes, and the pulses on top.
		const nodeIn = (/** @type {number} */ i) => progress(t, i * 0.1, ENTER, easeOut);
		const litAt = (/** @type {number} */ from) => progress(t, from, FILL, easeStandard);
		const lit = [0, ...fan.map(() => litAt(OUT.start + OUT.duration))];
		nodes.forEach((c, i) => out.push(fade(nodeIn(i), {}, node(c, names[i], lit[i]))));
		out.push(drawConnector(toSplit, progress(t, 0.35, DRAW, easeStandard)));
		fan.forEach((c, i) => out.push(drawConnector(c, progress(t, 0.7 + i * 0.05, DRAW, easeStandard))));
		spread.forEach((b, i) => {
			if (b !== 0) out.push(drawJunction({ at: at(aSplit, b), size: 5, opacity: progress(t, 0.7 + i * 0.05, ENTER, easeOut) }));
		});
		out.push(drawJunction({ at: at(aSplit, 0), size: 10, lit: litAt(IN.start + IN.duration), opacity: progress(t, 0.3, ENTER, easeOut) }));
		out.push(drawPulse(toSplit, t, IN));
		fan.forEach((c) => out.push(drawPulse(c, t, OUT)));

		// The isometric feeder: floor, stations far to near, the line, its junctions on the floor, the pulse.
		out.push(drawSolid(slab({ x: 0, y: 0, w: FLOOR.w, d: FLOOR.d, h: FLOOR.h, fill: "bg", opacity: progress(t, 0, ENTER) }), cam));
		const st = stations(t);
		for (const base of orderSolids(st.map((s) => s.base), cam)) {
			const s = st[Number(base.id)];
			out.push(drawSolid(base, cam), s.lit > 0 ? fade(s.lit, {}, drawSolid(s.on, cam)) : "");
		}
		out.push(drawConnector(feeder, progress(t, 0.9, 0.9, easeStandard)));
		for (const i of TURNS) out.push(drawJunction({ at: FEEDER[i], camera: cam, plane: "floor", size: 9, lit: progress(t, reach[i], FILL, easeStandard), opacity: progress(t, 1 + i * 0.1, ENTER, easeOut) }));
		out.push(drawPulse(feeder, t, FEED));
		out.push(...labels(t).map((l) => l.markup));
		return out.join("");
	}

	return {
		id: `connectors-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: DURATION,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// Steps are beats of the story: their labels live in the player's controls, not in the drawing.
		stepLabelsInFrame: false,
		steps: [
			{ at: STEP_SPLIT, ...COPY.steps[0] },
			{ at: STEP_FAN, ...COPY.steps[1] },
			{ at: STEP_FEED, ...COPY.steps[2] },
		].map((s) => ({ at: s.at, label: localize(s.label, locale), detail: localize(s.detail, locale) })),
		labelBoxes: (/** @type {number} */ t) => labels(t).map((l) => l.box),
		frame,
	};
}
