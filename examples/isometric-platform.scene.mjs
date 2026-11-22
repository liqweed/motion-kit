/**
 * Example custom scene: a rounded platform with a mark on its top face, seen in
 * plan, then turned isometric, and two pill tags.
 *
 * Shows the rest of the isometric kit (runtime/iso.mjs): rounded slabs whose
 * sides draw as one smooth face each (`roundedSlab`, `roundedBox`), a faint
 * diamond-grid backdrop that fades out from the centre and sits under the
 * solids (`drawGrid`), 2D content drawn on a solid's top face so it turns with
 * the camera (`top`; `drawOnPlane` does the same for any horizontal plane), and
 * stemless pill tags the label gate checks (`labelPill`). Nothing loops and the
 * backdrop is static: the scene plays once, the swivel is one move between two
 * settled steps, and the last frame holds. Pure: frame(t) depends only on t
 * and constants.
 */
import { easeOut, easeStandard, progress } from "../runtime/motion.mjs";
import { CAMERA_ISOMETRIC, CAMERA_PLAN, drawGrid, drawSolid, fitCamera, labelPill, lerpCamera, orderSolids, roundedBox, roundedSlab } from "../runtime/iso.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { el } from "../runtime/svg.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "A platform that turns isometric", nl: "Een platform dat isometrisch draait" },
	description: {
		en: "A rounded platform with a mark on its top face stands on a floor, seen from above. The view swivels to isometric, the platform rises, and two tags appear below.",
		nl: "Een afgerond platform met een teken op het bovenvlak staat op een vloer, van boven gezien. Het beeld draait naar isometrisch, het platform rijst op en twee labels verschijnen eronder.",
	},
	tags: [
		{ en: "Rounded slab", nl: "Afgeronde plaat" },
		{ en: "Mark on the top face", nl: "Teken op het bovenvlak" },
	],
	steps: [
		{ label: { en: "Seen from above", nl: "Van boven gezien" }, detail: { en: "A rounded platform on a floor, with a mark on top.", nl: "Een afgerond platform op een vloer, met een teken erop." } },
		{ label: { en: "Turned isometric", nl: "Isometrisch gedraaid" }, detail: { en: "The platform has risen; the mark turned with its face.", nl: "Het platform is gerezen; het teken draaide met het vlak mee." } },
		{ label: { en: "Tagged", nl: "Gelabeld" }, detail: { en: "Two pill tags name what the picture shows.", nl: "Twee labels benoemen wat het beeld laat zien." } },
	],
};

// World, in units: a rounded 12 × 8 floor, a rounded 4.4 × 4.4 platform on it.
const FLOOR = { w: 12, d: 8, h: 0.3, radius: 1.4 };
const PLATFORM = { w: 4.4, d: 4.4, h: 1.2, radius: 1.1 };
const TOP = FLOOR.h;
const GRID = { radius: 8, step: 1 };
// The mark, on a 24 × 24 grid: an easing curve between two keyframes.
const MARK = { view: { width: 24, height: 24 }, curve: "M5 19 C 11 19, 9 5, 19 5", a: { x: 5, y: 19 }, b: { x: 19, y: 5 } };

// Timeline, in seconds. Every beat ends before the next one starts, so each
// step frame is settled (the gate checks it).
const FLOOR_IN = 0.4;
const GRID_IN = 0.5;
const PLATFORM_IN = 0.4;
const MARK_IN = 0.4;
const STEP_PLAN = 1.5;
const SWIVEL_AT = 1.8;
const SWIVEL = 1.4;
const RISE_AT = 1.9;
const STEP_ISO = 3.4;
const TAGS_AT = 3.6;
const TAG_FADE = 0.4;
const STEP_TAGS = 4.3;
const DURATION = 4.6;

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const H = f.height || (format === "tall" ? 520 : 400);
	const stacked = W < 600; // in a narrow picture the tags stand in two rows
	const fs = 14;
	const tags = COPY.tags.map((t) => localize(t, locale));

	// The fit's room: the tags stand below the floor, so the bottom margin is theirs.
	const margin = { top: 24, right: 24, bottom: stacked ? 108 : 68, left: 24 };
	// What the camera must keep in view: the floor and the platform at full height.
	const extent = [
		...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: (sx * FLOOR.w) / 2, y: (sy * FLOOR.d) / 2, z: 0 }))),
		...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: (sx * PLATFORM.w) / 2, y: (sy * PLATFORM.d) / 2, z: TOP + PLATFORM.h }))),
	];
	const swivel = (/** @type {number} */ t) => progress(t, SWIVEL_AT, SWIVEL, easeStandard);
	const cameraAt = (/** @type {number} */ t) => fitCamera(extent, lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, swivel(t)), { width: W, height: H, margin });

	// The mark: the curve and its two keyframes, in the accent's text colour, in the view's own units.
	const mark =
		el("path", { d: MARK.curve, fill: "none", stroke: tok("onAccent"), "stroke-width": 2, "stroke-linecap": "round" }) +
		[MARK.a, MARK.b].map((p) => el("circle", { cx: p.x, cy: p.y, r: 2.2, fill: tok("onAccent") })).join("");

	/** The tags at time t, with their boxes: they stand on the picture's bottom edge, under whatever the camera shows. */
	function pills(/** @type {number} */ t) {
		const opacity = progress(t, TAGS_AT, TAG_FADE);
		const row = stacked ? [0, 1].map((i) => ({ x: W / 2, y: H - margin.bottom + 34 + i * 40 })) : [{ x: W / 2 - 110, y: H - 34 }, { x: W / 2 + 110, y: H - 34 }];
		return [
			labelPill({ id: "tag-slab", ...row[0], lines: [tags[0]], fontSize: fs, opacity }),
			labelPill({ id: "tag-mark", ...row[1], lines: [tags[1]], fontSize: fs, fill: "accent", stroke: "accent", ink: "onAccent", opacity }),
		];
	}

	function frame(/** @type {number} */ t) {
		const cam = cameraAt(t);
		const rise = progress(t, RISE_AT, SWIVEL - 0.1, easeOut);
		const floor = roundedSlab({ x: 0, y: 0, w: FLOOR.w, d: FLOOR.d, h: FLOOR.h, radius: FLOOR.radius, fill: "surface", opacity: progress(t, 0, FLOOR_IN), id: "floor" });
		const platform = roundedBox({
			x: 0,
			y: 0,
			w: PLATFORM.w,
			d: PLATFORM.d,
			radius: PLATFORM.radius,
			z: TOP,
			h: Math.max(0.02, PLATFORM.h * rise),
			fill: "accent",
			opacity: progress(t, 0.2, PLATFORM_IN),
			id: "platform",
			top: { markup: mark, view: MARK.view, inset: 0.5, opacity: progress(t, 0.6, MARK_IN) },
		});
		// The grid first: under the solids, never over one. The floor is a solid like the platform, depth ordered.
		const out = [drawGrid(cam, { ...GRID, stroke: "line", opacity: 0.6 * progress(t, 0.1, GRID_IN) })];
		for (const s of orderSolids([floor, platform], cam)) out.push(drawSolid(s, cam));
		out.push(...pills(t).map((p) => p.markup));
		return out.join("");
	}

	return {
		id: `isometric-platform-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: DURATION,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// Steps are beats of the story: their labels live in the player's controls, not in the drawing.
		stepLabelsInFrame: false,
		steps: [
			{ at: STEP_PLAN, ...COPY.steps[0] },
			{ at: STEP_ISO, ...COPY.steps[1] },
			{ at: STEP_TAGS, ...COPY.steps[2] },
		].map((s) => ({ at: s.at, label: localize(s.label, locale), detail: localize(s.detail, locale) })),
		labelBoxes: (/** @type {number} */ t) => pills(t).map((p) => p.box),
		frame,
	};
}
