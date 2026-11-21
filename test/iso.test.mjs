import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene, findColourLiteral } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { CAMERA_ISOMETRIC, CAMERA_PLAN, ISO_ELEVATION, box, camera, drawSolid, drawSolids, fitCamera, labelAnchor, labelProblems, lerpCamera, orderSolids, path3, prism, project, projector, regularPolygon, slab } from "../runtime/iso.mjs";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { FORMATS, validateScene } from "../runtime/scene.mjs";
import { estimateWidth } from "../runtime/wrap.mjs";
import { cubic, polyline, tokenPoints, tokensAlong } from "../runtime/svg.mjs";

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const EXAMPLE = fileURLToPath(new URL("../examples/isometric-swivel.scene.mjs", import.meta.url));

describe("camera and projection", () => {
	it("gives the plan view at 90° elevation: north up, east right, and height does not move a point", () => {
		const cam = camera({ azimuth: 0, elevation: 90, zoom: 10, pan: { x: 100, y: 200 } });
		const at = (/** @type {number} */ z) => project(cam, { x: 3, y: 4, z });
		assert.deepEqual([at(0).x, at(0).y], [130, 160]); // east +30, north −40 on the screen
		for (const z of [1, 5, 20]) assert.deepEqual([at(z).x, at(z).y], [at(0).x, at(0).y], `z = ${z}`);
		assert.deepEqual([project(CAMERA_PLAN, { x: 1, y: 0 }).x, project(CAMERA_PLAN, { x: 0, y: 1 }).y], [1, -1]);
	});
	it("turns the plan view with the azimuth: 90° puts east at the bottom", () => {
		const p = project(camera({ azimuth: 90, elevation: 90 }), { x: 2, y: 0 });
		assert.deepEqual([p.x, p.y], [0, 2]);
	});
	it("gives true isometric at 45° and ISO_ELEVATION: the three axes are drawn the same length", () => {
		near(ISO_ELEVATION, 35.26438968275465, 1e-9);
		const axis = (/** @type {Point} */ p) => {
			const o = project(CAMERA_ISOMETRIC, { x: 0, y: 0, z: 0 });
			const s = project(CAMERA_ISOMETRIC, p);
			return Math.hypot(s.x - o.x, s.y - o.y);
		};
		const [x, y, z] = [axis({ x: 1, y: 0, z: 0 }), axis({ x: 0, y: 1, z: 0 }), axis({ x: 0, y: 0, z: 1 })];
		near(x, y);
		near(x, z);
		near(x, Math.sqrt(2 / 3));
		// East goes right and down, north right and up, up goes up.
		const e = project(CAMERA_ISOMETRIC, { x: 1, y: 0 });
		const n = project(CAMERA_ISOMETRIC, { x: 0, y: 1 });
		assert.ok(e.x > 0 && e.y > 0 && n.x > 0 && n.y < 0 && project(CAMERA_ISOMETRIC, { x: 0, y: 0, z: 1 }).y < 0);
	});
	it("scales by the zoom and moves by the pan", () => {
		const p = { x: 2, y: -1, z: 1.5 };
		const a = project(camera({ zoom: 1 }), p);
		const b = project(camera({ zoom: 3, pan: { x: 10, y: -20 } }), p);
		near(b.x, 3 * a.x + 10);
		near(b.y, 3 * a.y - 20);
	});
	it("reports depth: what is nearer to the viewer is larger, and height from above is nearer", () => {
		const cam = camera({ azimuth: 0, elevation: 30 });
		const to = projector(cam);
		assert.ok(to({ x: 0, y: -1 }).depth > to({ x: 0, y: 1 }).depth, "south is toward a camera in the south");
		assert.ok(to({ x: 0, y: 0, z: 2 }).depth > to({ x: 0, y: 0, z: 0 }).depth);
	});
	it("interpolates between cameras, and is exactly each camera at the ends", () => {
		assert.equal(lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0), CAMERA_PLAN);
		assert.equal(lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 1), CAMERA_ISOMETRIC);
		const mid = lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.5);
		near(mid.azimuth, 22.5);
		near(mid.elevation, (90 + ISO_ELEVATION) / 2);
		const a = camera({ zoom: 1, pan: { x: 0, y: 0 } });
		const b = camera({ zoom: 3, pan: { x: 10, y: 20 } });
		const m = lerpCamera(a, b, 0.5);
		assert.deepEqual([m.zoom, m.pan.x, m.pan.y], [2, 5, 10]);
	});
	it("rejects a camera that cannot project", () => {
		assert.throws(() => camera({ elevation: 91 }), /elevation/);
		assert.throws(() => camera({ elevation: -1 }), /elevation/);
		assert.throws(() => camera({ zoom: 0 }), /zoom/);
		assert.throws(() => camera({ azimuth: NaN }), /azimuth/);
		assert.throws(() => camera({ pan: { x: 0, y: Infinity } }), /pan/);
	});
	it("fits points into the picture, centred in the room the margins leave", () => {
		const points = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [0, 2].map((z) => ({ x: x * 7, y: y * 3.5, z }))));
		for (const cam of [CAMERA_PLAN, CAMERA_ISOMETRIC, lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.4)]) {
			const area = { width: 960, height: 540, margin: { top: 100, right: 20, bottom: 20, left: 20 } };
			const fitted = fitCamera(points, cam, area);
			assert.equal(fitted.azimuth, cam.azimuth);
			const screen = points.map((p) => project(fitted, p));
			const xs = screen.map((p) => p.x);
			const ys = screen.map((p) => p.y);
			assert.ok(Math.min(...xs) >= 20 - 1e-6 && Math.max(...xs) <= 940 + 1e-6, "inside left and right");
			assert.ok(Math.min(...ys) >= 100 - 1e-6 && Math.max(...ys) <= 520 + 1e-6, "inside top and bottom");
			// Tight on the limiting side, centred on the other.
			const tightX = Math.abs(Math.min(...xs) - 20) < 1e-6;
			const tightY = Math.abs(Math.min(...ys) - 100) < 1e-6;
			assert.ok(tightX || tightY);
			near((Math.min(...xs) + Math.max(...xs)) / 2, 480, 1e-6);
			near((Math.min(...ys) + Math.max(...ys)) / 2, 310, 1e-6);
		}
		assert.throws(() => fitCamera([], CAMERA_PLAN, { width: 10, height: 10 }), /at least one point/);
		assert.throws(() => fitCamera(points, CAMERA_PLAN, { width: 10, height: 10, margin: 6 }), /no room/);
	});
	it("walks a path at a constant speed in the world", () => {
		const p = path3([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4, z: 0 }]);
		assert.equal(p.length, 7);
		assert.deepEqual(p.at(0), { x: 0, y: 0, z: 0 });
		assert.deepEqual(p.at(3 / 7), { x: 3, y: 0, z: 0 });
		const mid = p.at(0.5);
		near(mid.x, 3);
		near(mid.y, 0.5);
		assert.deepEqual(p.at(1), { x: 3, y: 4, z: 0 });
		assert.deepEqual(p.at(2), p.at(1));
		assert.throws(() => path3([{ x: 0, y: 0 }]), /two points/);
	});
});

/** @typedef {{ x: number, y: number, z: number }} Point */

describe("solids", () => {
	const count = (/** @type {string} */ s, /** @type {string} */ what) => s.split(what).length - 1;
	it("draws only the top of a box in the plan view", () => {
		const svg = drawSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 3 }), camera({ azimuth: 0, elevation: 90, zoom: 10 }));
		assert.equal(count(svg, "<path"), 1);
	});
	it("draws the top and the two faces that face the camera in isometric, the sides shaded", () => {
		const svg = drawSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 3 }), CAMERA_ISOMETRIC);
		assert.equal(count(svg, "<path"), 5, "top + 2 sides × (face + shade layer)");
		assert.equal(count(svg, "var(--mk-ink)"), 2, "one shade layer per side");
		const shades = [...svg.matchAll(/fill="var\(--mk-ink\)" opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
		assert.equal(shades.length, 2);
		assert.notEqual(shades[0], shades[1], "the two sides take different shades");
		assert.ok(shades.every((o) => o >= 0.1 && o <= 0.26));
	});
	it("shows the faces that turn to the camera as it swivels", () => {
		const faces = (/** @type {number} */ azimuth) => count(drawSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1, shade: null }), camera({ azimuth, elevation: 30 })), "<path");
		for (const az of [0, 45, 90, 135, 180, 270, 300]) assert.ok(faces(az) === 3 || faces(az) === 2, `azimuth ${az}`);
		assert.equal(faces(0), 2, "square on to the camera: the top and one side");
		assert.equal(faces(45), 3, "turned: the top and two sides");
		assert.equal(count(drawSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1 }), camera({ azimuth: 45, elevation: 0 })), "<path"), 4, "from the horizon the top is edge on: two sides");
	});
	it("draws a prism's visible sides: three of a hexagon in isometric", () => {
		const hex = prism({ points: regularPolygon(0, 0, 1, 6), h: 1, shade: null });
		assert.equal(count(drawSolid(hex, CAMERA_ISOMETRIC), "<path"), 4);
	});
	it("draws nothing for a solid with zero opacity, and no sides for one with no height", () => {
		assert.equal(drawSolid(box({ x: 0, y: 0, w: 1, d: 1, h: 1, opacity: 0 }), CAMERA_ISOMETRIC), "");
		assert.equal(count(drawSolid(box({ x: 0, y: 0, w: 1, d: 1, h: 0 }), CAMERA_ISOMETRIC), "<path"), 1);
	});
	it("takes every colour from tokens, never literals", () => {
		const svg = drawSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1, fill: "accent", sides: "surface", stroke: "ink" }), CAMERA_ISOMETRIC);
		assert.match(svg, /fill="var\(--mk-accent\)"/);
		assert.match(svg, /fill="var\(--mk-surface\)"/);
		assert.match(svg, /stroke="var\(--mk-ink\)"/);
		assert.equal(findColourLiteral(svg), null);
		assert.throws(() => box({ x: 0, y: 0, w: 1, d: 1, h: 1, fill: "#ff0000" }), /unknown style token/);
		assert.throws(() => box({ x: 0, y: 0, w: 1, d: 1, h: 1, shade: "red" }), /unknown style token/);
	});
	it("is the same bytes for the same input", () => {
		const make = () => drawSolids([box({ x: 1, y: 2, w: 2, d: 2, h: 1 }), slab({ x: 0, y: 0, w: 8, d: 8 })], lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.37));
		assert.equal(make(), make());
	});
	it("builds slabs, boxes and prisms, and rejects footprints that are not convex polygons", () => {
		const s = slab({ x: 0, y: 0, w: 4, d: 4 });
		assert.equal(s.z1 - s.z0, 0.25);
		assert.equal(box({ x: 0, y: 0, w: 2, d: 2, h: 1, z: 3 }).z0, 3);
		const clockwise = prism({ points: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }], h: 1 });
		const area = clockwise.points.reduce((n, p, i, all) => n + p.x * all[(i + 1) % all.length].y - all[(i + 1) % all.length].x * p.y, 0);
		assert.ok(area > 0, "wound counter-clockwise, whatever the input");
		assert.throws(() => prism({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], h: 1 }), /three points/);
		assert.throws(() => prism({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], h: 1 }), /no area/);
		assert.throws(() => prism({ points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 4 }], h: 1 }), /convex/);
		// a self-intersecting star passes the consecutive-turn check
		assert.throws(() => prism({ points: [{ x: 0, y: 3 }, { x: 2, y: -3 }, { x: -3, y: 1 }, { x: 3, y: 1 }, { x: -2, y: -3 }], h: 1 }), /convex/);
		assert.throws(() => prism({ points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], h: 1 }), /repeated point/);
		// The unit square traversed twice: positive area, every turn and half-plane right.
		const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
		assert.throws(() => prism({ points: [...square, ...square], h: 1 }), /repeated point/);
		assert.throws(() => prism({ points: [...square, ...square].reverse(), h: 1, fill: "surface" }), /repeated point/);
		assert.throws(() => box({ x: 0, y: 0, w: 0, d: 1, h: 1 }), /positive/);
		assert.throws(() => box({ x: 0, y: 0, w: 1, d: 1, h: -1 }), /height/);
		assert.throws(() => regularPolygon(0, 0, 1, 2), /3 sides/);
	});
});

describe("depth order", () => {
	const at = (/** @type {number} */ x, /** @type {number} */ y, extra = {}) => box({ x, y, w: 2, d: 2, h: 1, ...extra });
	const ids = (/** @type {ReturnType<typeof at>[]} */ list) => list.map((s) => s.id);

	it("draws the farther solid first, whatever the input order", () => {
		// At 45° the camera is to the south-east: larger x and smaller y are nearer.
		const far = at(-2, 2, { id: "far" });
		const nearer = at(2, -2, { id: "near" });
		const cam = camera({ azimuth: 45, elevation: 35 });
		assert.deepEqual(ids(orderSolids([far, nearer], cam)), ["far", "near"]);
		assert.deepEqual(ids(orderSolids([nearer, far], cam)), ["far", "near"]);
	});
	it("turns the order with the camera", () => {
		const a = at(-2, 2, { id: "a" });
		const b = at(2, -2, { id: "b" });
		assert.deepEqual(ids(orderSolids([a, b], camera({ azimuth: 45 }))), ["a", "b"]);
		assert.deepEqual(ids(orderSolids([a, b], camera({ azimuth: 225 }))), ["b", "a"]);
	});
	it("draws what stands in front over what it hides: a row seen along its length", () => {
		// Three boxes in a row along y, the camera in the south: the southern one is in front and drawn last.
		const row = [at(0, 4, { id: "n" }), at(0, 0, { id: "m" }), at(0, -4, { id: "s" })];
		assert.deepEqual(ids(orderSolids([row[1], row[2], row[0]], camera({ azimuth: 0, elevation: 20 }))), ["n", "m", "s"]);
	});
	it("puts a box over the slab it stands on, and a tall box behind a low one before it", () => {
		const floor = slab({ x: 0, y: 0, w: 10, d: 10, id: "floor" });
		const onIt = at(0, 0, { id: "on", z: 0.25 });
		assert.deepEqual(ids(orderSolids([onIt, floor], CAMERA_ISOMETRIC)), ["floor", "on"]);
		assert.deepEqual(ids(orderSolids([floor, onIt], CAMERA_ISOMETRIC)), ["floor", "on"]);
		const tall = box({ x: -2, y: 2, w: 2, d: 2, h: 6, id: "tall" });
		const low = box({ x: 2, y: -2, w: 2, d: 2, h: 1, id: "low" });
		assert.deepEqual(ids(orderSolids([low, tall], CAMERA_ISOMETRIC)), ["tall", "low"]);
	});
	it("puts the taller solid last in the plan view, where only height tells them apart", () => {
		const low = at(0, 0, { id: "low" });
		const high = at(0, 0, { id: "high", z: 1 });
		assert.deepEqual(ids(orderSolids([high, low], CAMERA_PLAN)), ["low", "high"]);
	});
	it("orders prisms by their footprints", () => {
		const hexNear = prism({ points: regularPolygon(2, -2, 1, 6), h: 1, id: "near" });
		const hexFar = prism({ points: regularPolygon(-2, 2, 1, 6), h: 1, id: "far" });
		assert.deepEqual(ids(orderSolids([hexNear, hexFar], CAMERA_ISOMETRIC)), ["far", "near"]);
	});
	it("returns every solid once, in a fixed order, even when the order would be a cycle", () => {
		// A pinwheel of long boxes: each is in front of the next.
		const pinwheel = [at(0, 0, { id: "0" }), at(1, 1, { id: "1" })].concat([box({ x: 3, y: 0, w: 6, d: 1, h: 1, id: "2" }), box({ x: 0, y: 3, w: 1, d: 6, h: 1, id: "3" })]);
		const once = ids(orderSolids(pinwheel, CAMERA_ISOMETRIC));
		assert.deepEqual([...once].sort(), ["0", "1", "2", "3"]);
		assert.deepEqual(ids(orderSolids(pinwheel, CAMERA_ISOMETRIC)), once);
	});
});

describe("label anchors", () => {
	const cam = camera({ azimuth: 0, elevation: 90, zoom: 20, pan: { x: 200, y: 200 } });
	const anchor = (/** @type {string} */ id, x = 0, y = 0, extra = {}) => labelAnchor(cam, { id, at: { x, y }, lines: ["Label"], lift: 40, ...extra });

	it("places the label in the projected view: a stem up from the point, the box above it", () => {
		const { box: b, markup } = anchor("a", 2, 1);
		assert.equal(b.stem?.x1, 240);
		assert.equal(b.stem?.y1, 180);
		assert.equal(b.stem?.y2, 140);
		near(b.x + b.width / 2, 240);
		near(b.y + b.height, 140);
		assert.match(markup, /<line /);
		assert.match(markup, /<text /);
		assert.equal(findColourLiteral(markup), null);
	});
	it("follows the camera: the same world point, another place on the screen", () => {
		const a = labelAnchor(camera({ azimuth: 0, elevation: 90, zoom: 20 }), { id: "a", at: { x: 3, y: 0 }, lines: ["A"] });
		const b = labelAnchor(camera({ azimuth: 45, elevation: 35 }), { id: "a", at: { x: 3, y: 0 }, lines: ["A"] });
		assert.notEqual(a.box.x, b.box.x);
		assert.notEqual(a.box.y, b.box.y);
	});
	it("sits beside the stem's top for left and right", () => {
		const right = anchor("r", 0, 0, { side: "right" }).box;
		const left = anchor("l", 0, 0, { side: "left" }).box;
		near(right.x, 200);
		near(left.x + left.width, 200);
		near(right.y + right.height / 2, 160);
	});
	it("sizes the box to the longest line and the number of lines", () => {
		const one = anchor("a").box;
		const two = labelAnchor(cam, { id: "b", at: { x: 0, y: 0 }, lines: ["Label", "a longer second line"] }).box;
		assert.ok(two.width > one.width && two.height > one.height);
		assert.throws(() => labelAnchor(cam, { id: "x", at: { x: 0, y: 0 }, lines: [] }), /no text/);
	});
	it("draws nothing at opacity 0", () => {
		assert.equal(anchor("a", 0, 0, { opacity: 0 }).markup, "");
	});

	describe("the overlap check", () => {
		const view = { width: 400, height: 400 };
		it("does not pay for thousands of identical boxes", () => {
			const one = anchor("a", 0, 0).box;
			const many = Array.from({ length: 20000 }, () => ({ ...one }));
			assert.deepEqual(labelProblems(many, view).filter((p) => !p.includes("stem")), ['labels "a" and "a" overlap']);
		});
		it("matches copies on stem coordinates only, ignoring extra properties on the stem", () => {
			const one = anchor("a", 0, 0).box;
			/** @type {any} */
			const circular = { ...one.stem };
			circular.self = circular;
			const boxes = /** @type {any[]} */ ([
				{ ...one, stem: circular },
				{ ...one, stem: { ...one.stem, extra: 1n } },
				{ ...one, stem: { ...one.stem, extra: 2n } },
			]);
			// Serializing the whole stem would throw on the cycle and the BigInts.
			assert.deepEqual(labelProblems(boxes, view).filter((p) => !p.includes("stem")), ['labels "a" and "a" overlap']);
		});
		it("passes labels that are apart", () => {
			assert.deepEqual(labelProblems([anchor("a", -4, 0).box, anchor("b", 4, 0).box], view), []);
		});
		it("names two labels that overlap", () => {
			assert.deepEqual(labelProblems([anchor("a", 0, 0).box, anchor("b", 0.5, 0).box], view).filter((p) => !p.includes("stem")), ['labels "a" and "b" overlap']);
		});
		it("counts labels that nearly touch as overlapping", () => {
			const a = anchor("a", -2, 0).box;
			const b = { ...a, id: "b", x: a.x + a.width + 2, stem: undefined };
			assert.equal(labelProblems([a, b], view).length, 1);
			assert.deepEqual(labelProblems([a, { ...b, x: a.x + a.width + 10 }], view), []);
		});
		it("names a stem that runs through another label", () => {
			const high = anchor("high", 0, 3, { lift: 120 }); // its stem climbs through the next label
			const low = labelAnchor(cam, { id: "low", at: { x: 0, y: 1 }, lines: ["Label"], lift: 40 });
			assert.deepEqual(labelProblems([high.box, low.box], view).filter((p) => p.includes("stem")), ['the stem of label "high" crosses label "low"']);
		});
		it("names a label outside the picture", () => {
			assert.deepEqual(labelProblems([anchor("a", -20, 0).box], view), ['label "a" is outside the picture']);
		});
		it("ignores a label that fades out, as fade() does", () => {
			const faint = anchor("b", 0, 0, { opacity: 0.0004 });
			assert.equal(faint.markup, "");
			assert.deepEqual(labelProblems([anchor("a").box, faint.box], view), []);
		});
		it("stops at the limit", () => {
			const same = Array.from({ length: 1000 }, (_, i) => ({ id: `l${i}`, x: 10, y: 10, width: 50, height: 20 }));
			assert.equal(labelProblems(same, { ...view, limit: 5 }).length, 5);
			assert.equal(labelProblems(same.slice(0, 4), view).length, 6);
		});
		it("returns nothing at limit 0 and refuses a negative or NaN limit", () => {
			const outside = [anchor("a", -20, 0).box];
			assert.deepEqual(labelProblems(outside, { ...view, limit: 0 }), []);
			assert.throws(() => labelProblems(outside, { ...view, limit: -1 }), RangeError);
			assert.throws(() => labelProblems(outside, { ...view, limit: NaN }), RangeError);
		});
		it("reports a repeated sentence once and skips ignored ones without counting them", () => {
			const dup = Array.from({ length: 20 }, () => ({ id: "a", x: 10, y: 10, width: 50, height: 20 }));
			const out = { id: "o", x: -50, y: 0, width: 10, height: 10 };
			assert.deepEqual(labelProblems([...dup, out], { ...view, limit: 5 }), ['labels "a" and "a" overlap', 'label "o" is outside the picture']);
			assert.deepEqual(labelProblems([...dup, out], { ...view, limit: 1, ignore: new Set(['labels "a" and "a" overlap']) }), ['label "o" is outside the picture']);
		});
		it("checks the box the SVG draws, rounded to two decimals", () => {
			// A raw left edge of -0.004 is drawn at x="0": inside the picture.
			const edge = labelAnchor(cam, { id: "e", at: { x: -200.004 / 20, y: 0 }, lines: ["Label"], side: "right" });
			assert.match(edge.markup, /<rect x="0" /);
			assert.equal(edge.box.x, 0);
			assert.deepEqual(labelProblems([edge.box], view), []);
			// A raw gap of 3.999 is drawn as the required 4 px.
			const a = anchor("a", 0, 0, { side: "right" });
			const rawWidth = estimateWidth("Label", 14 * 1.08) + 16;
			assert.notEqual(rawWidth, a.box.width, "the box width is rounded, so the raw gap differs");
			const b = labelAnchor(cam, { id: "b", at: { x: (rawWidth + 3.999) / 20, y: 0 }, lines: ["Label"], side: "right" });
			assert.ok(rawWidth + 3.999 - rawWidth < 4 && b.box.x - a.box.x - rawWidth > 4 - 0.01, "raw gap 3.999 is below 4, its drawn gap is not");
			assert.match(b.markup, new RegExp(`<rect x="${b.box.x}" `));
			near(b.box.x - (a.box.x + a.box.width), 4);
			assert.deepEqual(labelProblems([a.box, b.box].map((x) => ({ ...x, stem: undefined })), view), []);
		});
		it("ignores labels that are not drawn", () => {
			assert.deepEqual(labelProblems([anchor("a").box, anchor("b", 0, 0, { opacity: 0 }).box], view), []);
		});
	});
});

describe("several tokens", () => {
	const line = polyline([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
	const lin = (/** @type {number} */ p) => p;
	const runs = [0, 1, 2].map((i) => ({ start: i * 0.5, duration: 2, ease: lin }));

	it("moves several tokens along one path at once", () => {
		const now = tokenPoints(line, 1.2, runs);
		assert.deepEqual(now.map((n) => n.index), [0, 1, 2]);
		near(now[0].point.x, 60);
		near(now[1].point.x, 35);
		near(now[2].point.x, 10);
	});
	it("leaves out a token before it starts and after it arrives", () => {
		assert.deepEqual(tokenPoints(line, 0.25, runs).map((n) => n.index), [0]);
		assert.deepEqual(tokenPoints(line, 2.25, runs).map((n) => n.index), [1, 2]);
		assert.deepEqual(tokenPoints(line, 4.5, runs), []);
	});
	it("holds a token at the end of its path when it asks to", () => {
		const held = tokenPoints(line, 5, [{ start: 0, duration: 1, hold: true }]);
		assert.equal(held[0].point.x, 100);
	});
	it("lets each token take its own path", () => {
		const other = cubic({ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 60, y: 10 }, { x: 90, y: 10 });
		const now = tokenPoints(line, 1, [{ start: 0, duration: 2, ease: lin }, { start: 0, duration: 2, ease: lin, path: other }]);
		assert.equal(now[0].point.y, 0);
		assert.equal(now[1].point.y, 10);
	});
	it("draws each token in flight with the callback", () => {
		const svg = tokensAlong(line, 1.2, runs, (p, { index }) => `<c i="${index}" x="${Math.round(p.x)}"/>`);
		assert.equal(svg, '<c i="0" x="60"/><c i="1" x="35"/><c i="2" x="10"/>');
		assert.equal(tokensAlong(line, 9, runs, () => "x"), "");
	});
	it("is a pure function of time: the same t gives the same tokens, in any order of asking", () => {
		const at = (/** @type {number} */ t) => tokensAlong(line, t, runs, (p, { index }) => `${index}:${p.x}`);
		const first = at(1.3);
		at(0.1);
		at(3);
		assert.equal(at(1.3), first);
	});
});

describe("the scene gate and labels", () => {
	/** A scene with two labels at the given points, otherwise valid. */
	function sceneWithLabels(/** @type {{ x: number, y: number }[]} */ points, extra = {}) {
		const cam = camera({ azimuth: 0, elevation: 90, zoom: 20, pan: { x: 200, y: 200 } });
		const labels = points.map((p, i) => labelAnchor(cam, { id: `l${i}`, at: p, lines: ["Label"] }));
		return {
			id: "labelled", width: 400, height: 400, duration: 2, title: "Labelled", description: "Labels",
			stepLabelsInFrame: false,
			steps: [{ at: 1, label: "Shown" }],
			frame: (/** @type {number} */ t) => `<rect width="${t < 0.5 ? 10 : 20}" height="10" fill="var(--mk-accent)"/>` + labels.map((l) => l.markup).join(""),
			labelBoxes: () => labels.map((l) => l.box),
			...extra,
		};
	}
	it("fails a scene in which two label anchors overlap", () => {
		const r = checkScene(sceneWithLabels([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]));
		assert.equal(r.ok, false);
		assert.ok(r.problems.some((p) => /^labels "l0" and "l1" overlap at t=/.test(p)), r.problems.join("\n"));
	});
	it("reports each overlap once, at its first time", () => {
		const r = checkScene(sceneWithLabels([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]));
		assert.equal(r.problems.filter((p) => p.includes("overlap")).length, 1);
		assert.match(r.problems.find((p) => p.includes("overlap")) ?? "", /t=0\.000$/);
	});
	it("passes a scene whose labels are apart", () => {
		assert.deepEqual(checkScene(sceneWithLabels([{ x: -4, y: 0 }, { x: 4, y: 0 }])), { ok: true, problems: [] });
	});
	it("fails a label outside the picture", () => {
		const r = checkScene(sceneWithLabels([{ x: -12, y: 0 }]));
		assert.ok(r.problems.some((p) => /label "l0" is outside the picture/.test(p)));
	});
	it("fails a scene whose labelBoxes throws or does not return an array", () => {
		assert.ok(checkScene(sceneWithLabels([], { labelBoxes: () => { throw new Error("boom"); } })).problems.some((p) => /labelBoxes\(\) threw .*boom/.test(p)));
		assert.ok(checkScene(sceneWithLabels([], { labelBoxes: () => 3 })).problems.some((p) => /must return an array/.test(p)));
	});
	it("reports a malformed label box instead of passing or throwing", () => {
		for (const bad of [{ id: "a" }, { id: "a", x: NaN, y: 0, width: 1, height: 1 }, null, { x: 0, y: 0, width: 1, height: 1 }, { id: "a", x: 0, y: 0, width: 1, height: 1, stem: { x1: NaN, y1: 0, x2: 20, y2: 10 } }, { id: "a", x: 0, y: 0, width: 1, height: 1, stem: 5 }]) {
			const r = checkScene(sceneWithLabels([], { labelBoxes: () => [bad] }));
			assert.ok(r.problems.some((p) => /labelBoxes\(\) entry 0 must be/.test(p)), JSON.stringify(bad));
		}
	});
	it("fails a label box with a negative width or height", () => {
		for (const bad of [{ id: "a", x: 10, y: 10, width: -20, height: 10 }, { id: "a", x: 10, y: 10, width: 20, height: -10 }]) {
			const r = checkScene(sceneWithLabels([], { labelBoxes: () => [bad] }));
			assert.ok(r.problems.some((p) => /labelBoxes\(\) entry 0 must be/.test(p)), JSON.stringify(bad));
		}
	});
	it("bounds the work and the messages for a scene of many colliding labels", () => {
		const same = Array.from({ length: 1000 }, (_, i) => ({ id: `l${i}`, x: 10, y: 10, width: 50, height: 20 }));
		const r = checkScene(sceneWithLabels([], { labelBoxes: () => same }));
		assert.ok(r.problems.length > 0 && r.problems.length <= 13, `${r.problems.length} problems`);
	});
	it("checks a label that is on screen only at one moment", () => {
		const cam = camera({ azimuth: 0, elevation: 90, zoom: 20, pan: { x: 200, y: 200 } });
		const a = labelAnchor(cam, { id: "a", at: { x: 0, y: 0 }, lines: ["Label"] });
		const b = labelAnchor(cam, { id: "b", at: { x: 0.5, y: 0 }, lines: ["Label"] });
		const scene = sceneWithLabels([], { labelBoxes: (/** @type {number} */ t) => (t >= 1.5 ? [a.box, b.box] : [a.box]) });
		const r = checkScene(scene);
		assert.ok(r.problems.some((p) => /overlap at t=1\.5|overlap at t=1\.6/.test(p)), r.problems.join("\n"));
	});
	it("needs labelBoxes to be a function when present", () => {
		assert.throws(() => validateScene(sceneWithLabels([], { labelBoxes: [] })), /labelBoxes must be a function/);
		assert.doesNotThrow(() => validateScene(sceneWithLabels([])));
	});
	it("hands the whole kit to a custom scene, the isometric parts included", () => {
		for (const name of ["camera", "lerpCamera", "fitCamera", "projector", "project", "box", "slab", "prism", "orderSolids", "drawSolids", "labelAnchor", "labelProblems", "path3", "tokensAlong", "tokenPoints"]) {
			assert.equal(typeof KIT[name], "function", name);
		}
		const scene = sceneFromModule((/** @type {any} */ { kit }) => sceneWithLabels([{ x: 0, y: 0 }], { seen: kit.camera({ azimuth: 10 }).azimuth }));
		assert.equal(/** @type {any} */ (scene).seen, 10);
	});
});

describe("examples/isometric-swivel.scene.mjs", () => {
	it("passes the gate in every format and in two locales", async () => {
		for (const format of Object.keys(FORMATS)) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				const r = checkScene(scene);
				assert.deepEqual(r.problems, [], `${format} ${locale}`);
			}
		}
	});
	it("lasts at most 12 s, and in practice under the 8 s target", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		assert.ok(scene.duration <= 8, `${scene.duration} s`);
	});
	it("swivels from plan to isometric, and shows several tokens at once", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const [plan, iso, done] = scene.steps.map((s) => scene.frame(s.at, { idPrefix: "x" }));
		assert.equal((plan.match(/<path/g) ?? []).length < (iso.match(/<path/g) ?? []).length, true, "the plan view draws tops only; isometric adds sides");
		assert.equal(/<circle[^>]*fill="var\(--mk-emphasis\)"/.test(done), false, "no token is in flight at a settled step");
		const flight = scene.frame(5.2, { idPrefix: "x" });
		assert.equal((flight.match(/fill="var\(--mk-emphasis\)"/g) ?? []).length, 3, "three tokens in flight at once");
	});
	it("holds still at every step and after the end: nothing loops", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const last = scene.frame(scene.duration, { idPrefix: "x" });
		for (const dt of [0, 0.5, 2, 30, 3600]) assert.equal(scene.frame(scene.duration + dt, { idPrefix: "x" }), last);
	});
	it("keeps its labels apart and in the picture at every sampled time, in every format", async () => {
		for (const format of Object.keys(FORMATS)) {
			const { scene } = await loadScene(EXAMPLE, { format });
			for (let i = 0; i <= 140; i++) {
				const t = (scene.duration * i) / 140;
				assert.deepEqual(labelProblems(scene.labelBoxes?.(t) ?? [], scene), [], `${format} at t=${t.toFixed(3)}`);
			}
		}
	});
});
