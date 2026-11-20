/**
 * Example custom scene: a plan view that swivels into isometric, then three
 * work items travel a line of four stations at once.
 *
 * Shows the isometric kit (runtime/iso.mjs): a camera interpolated between the
 * plan view and true isometric, fitted to the picture each frame (pan and
 * zoom); solids (a slab, boxes and a hexagonal prism) coloured by tokens and
 * depth ordered; label anchors with stems, whose boxes the gate checks; and
 * several tokens on one path (`tokensAlong`), all inside a settled step.
 * Nothing loops: the scene plays once and holds its last frame, and the
 * swivel is one move between two settled steps. Pure: frame(t) depends only
 * on t and constants.
 */
import { easeOut, easeStandard, linear, progress } from "../runtime/motion.mjs";
import { CAMERA_ISOMETRIC, CAMERA_PLAN, box, drawSolid, fitCamera, labelAnchor, lerpCamera, orderSolids, path3, prism, project, regularPolygon, slab } from "../runtime/iso.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { el, fade, num, tokensAlong } from "../runtime/svg.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "A floor plan that turns isometric", nl: "Een plattegrond die isometrisch draait" },
	description: {
		en: "Four stations stand on one floor, seen from above. The view swivels to isometric, and three work items travel the line at once.",
		nl: "Vier stations staan op één vloer, van boven gezien. Het beeld draait naar isometrisch en drie werkitems reizen tegelijk langs de lijn.",
	},
	stations: [
		{ en: "Intake", nl: "Intake" },
		{ en: "Review", nl: "Controle" },
		{ en: "Build", nl: "Bouw" },
		{ en: "Deliver", nl: "Levering" },
	],
	steps: [
		{ label: { en: "Seen from above", nl: "Van boven gezien" }, detail: { en: "Four stations on one floor, in plan.", nl: "Vier stations op één vloer, in plattegrond." } },
		{ label: { en: "Turned isometric", nl: "Isometrisch gedraaid" }, detail: { en: "The same floor, now with height.", nl: "Dezelfde vloer, nu met hoogte." } },
		{ label: { en: "Three items arrive", nl: "Drie items aangekomen" }, detail: { en: "Three work items travelled the line together.", nl: "Drie werkitems reisden samen langs de lijn." } },
	],
};

// World, in units: a 14 × 7 floor and four stations along a diagonal.
const FLOOR = { w: 14, d: 7, h: 0.3 };
const STATIONS = [
	{ x: -4.5, y: -2, h: 0.8, hex: false },
	{ x: -1.5, y: -0.7, h: 1.6, hex: false },
	{ x: 1.5, y: 0.7, h: 1.2, hex: true },
	{ x: 4.5, y: 2, h: 0.8, hex: false },
];
const CARRY = 2.5; // the height tokens travel at, above every station
const TOP = FLOOR.h;

// Timeline, in seconds. Every beat ends before the next one starts, so each
// step frame is settled (the gate checks it).
const ENTER = 0.4;
const STAGGER = 0.1;
const LABELS_IN = 0.9;
const LABEL_FADE = 0.4;
const STEP_PLAN = 1.6;
const LABELS_OUT = 1.9;
const SWIVEL_AT = 2.25;
const SWIVEL = 1.4;
const LABELS_BACK = 3.7;
const STEP_ISO = 4.3;
const GO = 4.4;
const GAP = 0.3;
const TRIP = 1.6;
const FILL = 0.3;
const RUNS = [0, 1, 2].map((i) => ({ start: GO + i * GAP, duration: TRIP, ease: linear }));

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const H = f.height || (format === "tall" ? 520 : 400);
	const names = COPY.stations.map((s) => wrapLabel(localize(s, locale), 12, 2));
	const fs = 14;

	// The fit's room: the labels stand above the stations, so the top margin is theirs.
	// Neighbouring labels stand at two heights, further apart in a narrow picture, where they are closer.
	const lifts = W < 600 ? [36, 112, 36, 112] : [36, 80, 36, 80];
	const margin = { top: Math.max(...lifts) + 36, right: 20, bottom: 20, left: 20 };
	// What the camera must keep in view: the floor, every station at full height, and the tokens' route.
	const extent = [
		...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: (sx * FLOOR.w) / 2, y: (sy * FLOOR.d) / 2, z: 0 }))),
		...STATIONS.flatMap((s) => [-1, 1].flatMap((dx) => [-1, 1].map((dy) => ({ x: s.x + dx * 1.25, y: s.y + dy * 1.25, z: TOP + s.h })))),
		...STATIONS.map((s) => ({ x: s.x, y: s.y, z: CARRY })),
	];
	const swivel = (/** @type {number} */ t) => progress(t, SWIVEL_AT, SWIVEL, easeStandard);
	const cameraAt = (/** @type {number} */ t) => fitCamera(extent, lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, swivel(t)), { width: W, height: H, margin });

	const route = path3(STATIONS.map((s) => ({ x: s.x, y: s.y, z: CARRY })));
	// Station i is reached when the first token passes it: its share of the route, at constant speed.
	let along = 0;
	const reached = STATIONS.map((s, i) => {
		if (i > 0) along += Math.hypot(s.x - STATIONS[i - 1].x, s.y - STATIONS[i - 1].y);
		return RUNS[0].start + (along / route.length) * TRIP;
	});
	// The last token lands, and the last station has filled, before the last step.
	const landed = Math.max(RUNS[RUNS.length - 1].start + TRIP, reached[reached.length - 1] + FILL);
	const steps = [
		{ at: STEP_PLAN, ...COPY.steps[0] },
		{ at: STEP_ISO, ...COPY.steps[1] },
		{ at: landed + 0.15, ...COPY.steps[2] },
	];
	const duration = steps[2].at + 0.35;

	/** The solids at time t: the floor, then the stations (entering, rising with the swivel, filling). */
	function scene(/** @type {number} */ t) {
		const rise = progress(t, SWIVEL_AT + 0.1, SWIVEL, easeOut);
		const floor = slab({ x: 0, y: 0, w: FLOOR.w, d: FLOOR.d, h: FLOOR.h, fill: "bg", opacity: progress(t, 0, ENTER) });
		const stations = STATIONS.map((s, i) => {
			const shape = { id: String(i), z: TOP, h: Math.max(0.02, s.h * rise), opacity: progress(t, STAGGER + i * STAGGER, ENTER) };
			const make = (/** @type {string} */ fill) => (s.hex ? prism({ points: regularPolygon(s.x, s.y, 1.25, 6, 0), fill, ...shape }) : box({ x: s.x, y: s.y, w: 2, d: 2, fill, ...shape }));
			const on = progress(t, reached[i], FILL, easeStandard);
			return { base: make("surface"), on: on > 0 ? make("accent") : null, fill: on };
		});
		return { floor, stations };
	}

	/** The labels at time t, with their boxes: they stand while the camera rests. */
	function labels(/** @type {number} */ t) {
		const opacity = Math.max(progress(t, LABELS_IN, LABEL_FADE) * (1 - progress(t, LABELS_OUT, 0.25)), progress(t, LABELS_BACK, LABEL_FADE));
		const cam = cameraAt(t);
		const rise = progress(t, SWIVEL_AT + 0.1, SWIVEL, easeOut);
		return STATIONS.map((s, i) => labelAnchor(cam, { id: `station-${i}`, at: { x: s.x, y: s.y, z: TOP + Math.max(0.02, s.h * rise) }, lines: names[i], fontSize: fs, lift: lifts[i], opacity }));
	}

	function frame(/** @type {number} */ t) {
		const cam = cameraAt(t);
		const { floor, stations } = scene(t);
		const squash = Math.sin((cam.elevation * Math.PI) / 180); // a circle on the floor, seen at this elevation
		// A token's size grows in over the first 8 % of its trip and shrinks out over the last 8 %.
		const size = (/** @type {number} */ k) => Math.min(1, k / 0.08, (1 - k) / 0.08);
		const out = [drawSolid(floor, cam)];
		// A shadow under each token, on the floor, so its place in the world reads. Under the stations, which hide it.
		out.push(
			tokensAlong(route, t, RUNS, (p, { progress: k }) => {
				const g = project(cam, { x: p.x, y: p.y, z: TOP });
				return el("ellipse", { cx: g.x, cy: g.y, rx: 10 * size(k), ry: 10 * size(k) * squash, fill: tok("ink"), opacity: 0.18 });
			}),
		);
		// Stations far to near, each with its reached layer fading in over the pending one.
		for (const base of orderSolids(stations.map((s) => s.base), cam)) {
			const s = stations[Number(base.id)];
			out.push(drawSolid(base, cam), s.on ? fade(s.fill, {}, drawSolid(s.on, cam)) : "");
		}
		out.push(
			tokensAlong(route, t, RUNS, (p, { progress: k }) => {
				const a = project(cam, p);
				return el("circle", { cx: a.x, cy: a.y, r: 7 * size(k), fill: tok("emphasis"), stroke: tok("bg"), "stroke-width": 1.5 });
			}),
		);
		out.push(...labels(t).map((l) => l.markup));
		return out.join("");
	}

	return {
		id: `isometric-swivel-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// Steps are beats of the story: their labels live in the player's controls, not in the drawing.
		stepLabelsInFrame: false,
		steps: steps.map((s) => ({ at: s.at, label: localize(s.label, locale), detail: localize(s.detail, locale) })),
		labelBoxes: (/** @type {number} */ t) => labels(t).map((l) => l.box),
		frame,
	};
}
