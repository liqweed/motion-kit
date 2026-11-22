import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene, findColourLiteral } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { CAMERA_ISOMETRIC, CAMERA_PLAN, ISO_ELEVATION, box, camera, drawGrid, drawOnPlane, drawSolid, drawSolids, fitCamera, labelAnchor, labelPill, labelProblems, lerpCamera, orderSolids, path3, planeMatrix, prism, project, projector, regularPolygon, rotateSolid, roundedBox, roundedSlab, slab } from "../runtime/iso.mjs";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { FORMATS, validateScene } from "../runtime/scene.mjs";
import { estimateWidth } from "../runtime/wrap.mjs";
import { cubic, polyline, tokenPoints, tokensAlong } from "../runtime/svg.mjs";

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const EXAMPLE = fileURLToPath(new URL("../examples/isometric-swivel.scene.mjs", import.meta.url));
const PLATFORM = fileURLToPath(new URL("../examples/isometric-platform.scene.mjs", import.meta.url));

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

/** The polygons drawn for a solid, as screen points, in drawing order (the shade layers left out: they carry no stroke, the faces do). */
const polygons = (/** @type {import("../runtime/iso.mjs").Solid} */ solid, /** @type {import("../runtime/iso.mjs").Camera} */ cam) =>
	[...drawSolid(solid, cam).matchAll(/<path d="([^"]+)" fill="var\(--mk-[a-z]+\)" stroke=/g)].map((m) => [...m[1].matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((q) => [Number(q[1]), Number(q[2])]));

/** Whether two solids cover a common area of the screen: some point of a half-pixel grid lies inside a drawn face of each. */
function coverCommonArea(/** @type {import("../runtime/iso.mjs").Solid} */ a, /** @type {import("../runtime/iso.mjs").Solid} */ b, /** @type {import("../runtime/iso.mjs").Camera} */ cam) {
	const [pa, pb] = [polygons(a, cam), polygons(b, cam)];
	const inside = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number[][]} */ poly) => {
		let hit = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			if (poly[i][1] > y !== poly[j][1] > y && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) hit = !hit;
		}
		return hit;
	};
	const all = [...pa.flat(), ...pb.flat()];
	const [x0, x1, y0, y1] = [Math.min(...all.map((q) => q[0])), Math.max(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), Math.max(...all.map((q) => q[1]))];
	for (let x = x0 + 0.25; x < x1; x += 0.5) {
		for (let y = y0 + 0.25; y < y1; y += 0.5) if (pa.some((f) => inside(x, y, f)) && pb.some((f) => inside(x, y, f))) return true;
	}
	return false;
}

describe("oriented solids", () => {
	const sameShape = (/** @type {number[][][]} */ got, /** @type {number[][][]} */ want, /** @type {string} */ what) => {
		assert.equal(got.length, want.length, `${what}: ${got.length} faces, expected ${want.length}`);
		for (const [i, face] of want.entries()) {
			assert.equal(got[i].length, face.length, `${what}: face ${i}`);
			for (const [j, pt] of face.entries()) {
				assert.ok(Math.abs(got[i][j][0] - pt[0]) <= 0.011 && Math.abs(got[i][j][1] - pt[1]) <= 0.011, `${what}: face ${i} corner ${j} is ${got[i][j]}, expected ${pt}`);
			}
		}
	};
	// A 2 × 2 × 1 box centred on the origin, pitched about the y axis through the origin: a point (x, y, z) goes
	// to x' = x·cos θ + z·sin θ, z' = −x·sin θ + z·cos θ (positive turns up toward east).
	const pitched = (/** @type {number} */ deg) => rotateSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1 }), { axis: "y", deg });
	const PLAN = camera({ azimuth: 0, elevation: 90, zoom: 100 });

	it("pitched 0°, 30°, 60° and 90°, shows in plan the faces that turn up, at hand-computed corners", () => {
		const c30 = Math.sqrt(3) / 2;
		// Plan: screen x = 100·x', screen y = −100·y. The faces drawn are the -x side (once it turns up) and the top (until it is edge on).
		// −x side corners (−1, 1, 0), (−1, −1, 0), (−1, −1, 1), (−1, 1, 1); top corners (−1, −1, 1), (1, −1, 1), (1, 1, 1), (−1, 1, 1).
		sameShape(polygons(pitched(0), PLAN), [[[-100, 100], [100, 100], [100, -100], [-100, -100]]], "0°");
		sameShape(
			polygons(pitched(30), PLAN),
			[
				[[-100 * c30, -100], [-100 * c30, 100], [-100 * c30 + 50, 100], [-100 * c30 + 50, -100]],
				[[-100 * c30 + 50, 100], [100 * c30 + 50, 100], [100 * c30 + 50, -100], [-100 * c30 + 50, -100]],
			],
			"30°",
		);
		sameShape(
			polygons(pitched(60), PLAN),
			[
				[[-50, -100], [-50, 100], [-50 + 100 * c30, 100], [-50 + 100 * c30, -100]],
				[[-50 + 100 * c30, 100], [50 + 100 * c30, 100], [50 + 100 * c30, -100], [-50 + 100 * c30, -100]],
			],
			"60°",
		);
		// At 90° the top is edge on and the −x side lies flat, facing up: x' = z, so it spans east from 0 to 1.
		sameShape(polygons(pitched(90), PLAN), [[[0, -100], [0, 100], [100, 100], [100, -100]]], "90°");
	});
	it("pitched 90°, draws in isometric the top, the −x side and the −y side at hand-computed corners", () => {
		// (x, y, z) → world (z, y, −x). In isometric (zoom 100): screen x = 100·(X + Y)/√2, screen y = −100·((Y − X) + 2Z)/√6.
		const to = (/** @type {number[]} */ [X, Y, Z]) => [(100 * (X + Y)) / Math.SQRT2, (-100 * (Y - X + 2 * Z)) / Math.sqrt(6)];
		const world = [
			[[0, -1, 1], [0, -1, -1], [1, -1, -1], [1, -1, 1]], // the −y side
			[[0, 1, 1], [0, -1, 1], [1, -1, 1], [1, 1, 1]], // the −x side
			[[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], // the top
		];
		sameShape(polygons(pitched(90), camera({ zoom: 100 })), world.map((f) => f.map(to)), "isometric 90°");
	});
	it("shows the cap at the bottom, as a side, once the solid is upside down", () => {
		const up = polygons(rotateSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1, fill: "accent", sides: "surface" }), { axis: "y", deg: 180 }), PLAN);
		assert.equal(up.length, 1);
		const svg = drawSolid(rotateSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1, fill: "accent", sides: "surface" }), { axis: "y", deg: 180 }), PLAN);
		assert.match(svg, /fill="var\(--mk-surface\)"/, "the side token");
		assert.doesNotMatch(svg, /fill="var\(--mk-accent\)"/, "not the top's");
	});
	it("is the plain solid at 0°, and the same bytes for the same input, with token colours", () => {
		const b = box({ x: 1, y: 2, w: 2, d: 1, h: 3, fill: "accent" });
		assert.equal(rotateSolid(b, { axis: "x", deg: 0 }), b);
		const make = () => drawSolids([rotateSolid(b, { axis: { x: 1, y: 1, z: 0 }, deg: 37, about: { x: 1, y: 2, z: 0 } }), slab({ x: 0, y: 0, w: 8, d: 8 })], lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.37));
		assert.equal(make(), make());
		assert.equal(findColourLiteral(make()), null);
	});
	it("turns about a point, composes turns and is exact at multiples of 90°", () => {
		const b = box({ x: 1, y: 0, w: 1, d: 1, h: 1 });
		// About (1, 0, 0) a quarter turn about y: that point stays put.
		const q = /** @type {NonNullable<import("../runtime/iso.mjs").Solid["pose"]>} */ (rotateSolid(b, { axis: "y", deg: 90, about: { x: 1, y: 0, z: 0 } }).pose);
		assert.deepEqual([...q.m], [0, 0, 1, 0, 1, 0, -1, 0, 0]);
		assert.deepEqual([q.t.x, q.t.y, q.t.z], [1, 0, 1]); // t = p − R·p = (1,0,0) − (0,0,−1)
		const half = /** @type {NonNullable<import("../runtime/iso.mjs").Solid["pose"]>} */ (rotateSolid(rotateSolid(b, { axis: "z", deg: 90 }), { axis: "z", deg: 90 }).pose);
		assert.deepEqual(half.m.map((v) => v + 0), [-1, 0, 0, 0, -1, 0, 0, 0, 1]);
	});
	it("reads a direction as an axis whatever its length, and composes turns about different axes and pivots", () => {
		const b = box({ x: 1, y: 0, w: 1, d: 1, h: 1 });
		const m = (/** @type {any} */ s) => [...s.pose.m].map((v) => v + 0);
		assert.deepEqual(m(rotateSolid(b, { axis: { x: 0, y: 3, z: 0 }, deg: 90 })), m(rotateSolid(b, { axis: "y", deg: 90 })));
		assert.deepEqual(m(rotateSolid(b, { axis: { x: 1e-12, y: 0, z: 0 }, deg: 90 })), m(rotateSolid(b, { axis: "x", deg: 90 })));
		near(m(rotateSolid(b, { axis: { x: 1.5e308, y: 1.5e308, z: 0 }, deg: 180 }))[1], 1);
		// A quarter turn about x through the origin, then one about y through (1, 0, 0): world = Ry·Rx.
		const both = /** @type {any} */ (rotateSolid(rotateSolid(b, { axis: "x", deg: 90 }), { axis: "y", deg: 90, about: { x: 1, y: 0, z: 0 } }));
		assert.deepEqual(m(both), [0, 1, 0, 0, 0, -1, -1, 0, 0]);
		assert.deepEqual([both.pose.t.x, both.pose.t.y, both.pose.t.z], [1, 0, 1]);
		assert.doesNotThrow(() => drawSolid(rotateSolid(b, { axis: "z", deg: 1e308 }), CAMERA_ISOMETRIC));
		assert.throws(() => rotateSolid(box({ x: 0, y: 0, w: 1, d: 1, h: 1 }), { axis: "z", deg: 180, about: { x: 1e308, y: 0 } }), /overflow/);
	});
	it("refuses a bad axis, angle or point, and a solid with content on its top", () => {
		const b = box({ x: 0, y: 0, w: 1, d: 1, h: 1 });
		assert.throws(() => rotateSolid(b, { axis: /** @type {any} */ ("w"), deg: 10 }), /axis/);
		assert.throws(() => rotateSolid(b, { axis: { x: 0, y: 0, z: 0 }, deg: 10 }), /no direction/);
		assert.throws(() => rotateSolid(b, { axis: "x", deg: NaN }), /deg/);
		assert.throws(() => rotateSolid(b, { axis: "x", deg: 10, about: { x: 0, y: Infinity, z: 0 } }), /about/);
		const withTop = box({ x: 0, y: 0, w: 1, d: 1, h: 1, top: { markup: "", view: { width: 1, height: 1 } } });
		assert.throws(() => rotateSolid(withTop, { axis: "x", deg: 10 }), /top/);
	});
});

describe("depth order of oriented solids", () => {
	/** The direction from the world to the camera. */
	const toCam = (/** @type {import("../runtime/iso.mjs").Camera} */ cam) => {
		const [az, el] = [(cam.azimuth * Math.PI) / 180, (cam.elevation * Math.PI) / 180];
		return { x: Math.sin(az) * Math.cos(el), y: -Math.cos(az) * Math.cos(el), z: Math.sin(el) };
	};
	/** The camera `p` of the way along a swivel from the plan view to isometric, and one from behind. */
	const CAMERAS = [
		...[0, 0.25, 0.5, 0.75, 1].map((p) => lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, p)),
		camera({ azimuth: 225, elevation: ISO_ELEVATION }),
		camera({ azimuth: 100, elevation: 20 }),
	];
	/**
	 * `behind` and `front` are separated by a plane with unit normal `n`, `front` on its positive side: from a camera
	 * that looks at that plane edge on there is nothing to order; from any other, the solid on the camera's side is drawn last,
	 * wherever the two cover a common area of the screen (where they do not, either order draws the same picture).
	 */
	const expectFront = (/** @type {import("../runtime/iso.mjs").Solid & { id?: string }} */ behind, /** @type {import("../runtime/iso.mjs").Solid & { id?: string }} */ front, /** @type {{ x: number, y: number, z: number }} */ n, what = "") => {
		let checked = 0;
		for (const cam of CAMERAS) {
			const facing = n.x * toCam(cam).x + n.y * toCam(cam).y + n.z * toCam(cam).z;
			if (Math.abs(facing) < 1e-6 || !coverCommonArea(behind, front, cam)) continue;
			const [first, last] = facing > 0 ? [behind, front] : [front, behind];
			checked++;
			const label = `${what} at azimuth ${cam.azimuth}, elevation ${cam.elevation}`;
			assert.deepEqual(orderSolids([behind, front], cam).map((s) => s.id), [first.id, last.id], label);
			assert.deepEqual(orderSolids([front, behind], cam).map((s) => s.id), [first.id, last.id], `${label}, input reversed`);
		}
		assert.ok(checked > 0, `${what}: no camera orders this pair, so nothing was checked`);
	};
	const X = { x: 1, y: 0, z: 0 };
	const Z = { x: 0, y: 0, z: 1 };

	it("orders a tilted link against an upright box, and two tilted links, by the plane between them", () => {
		const upright = box({ x: -2, y: 0, w: 2, d: 2, h: 6, id: "box" });
		const link = (/** @type {number} */ x, /** @type {number} */ deg, /** @type {string} */ id) => rotateSolid(box({ x, y: 0, w: 0.6, d: 0.6, h: 3, id }), { axis: "y", deg, about: { x, y: 0, z: 0 } });
		// The box is at x ≤ −1, the link leans east from x = 2: the plane x = 0 separates them.
		expectFront(upright, link(2, 30, "link"), X, "link against box");
		// The two lean toward each other, from −1.5 and 1.5, and stay on their own sides of x = 0.
		expectFront(link(-1.5, 15, "west"), link(1.5, -15, "east"), X, "two links");
	});
	it("orders links that meet at a pivot, at every angle of the joint, with nothing to flicker", () => {
		// A post up to z = 2, and a lever turned about the edge of its base that rests on the post's top: they touch along that edge.
		const post = box({ x: 0, y: 0, w: 0.6, d: 0.6, h: 2, id: "post" });
		for (let deg = 0; deg <= 90; deg += 10) {
			const lever = rotateSolid(box({ x: 0, y: 0, w: 0.6, d: 0.6, h: 2, z: 2, id: "lever" }), { axis: "y", deg, about: { x: 0.3, y: 0, z: 2 } });
			expectFront(post, lever, Z, `lever at ${deg}°`);
		}
	});
	it("orders two bars that cross in plan and are apart in height, in plan and isometric", () => {
		const lie = (/** @type {number} */ z, /** @type {"x" | "y"} */ axis, /** @type {string} */ id) => rotateSolid(box({ x: 0, y: 0, w: 0.6, d: 0.6, h: 6, z, id }), { axis, deg: 90, about: { x: 0, y: 0, z: z + 3 } });
		// One lies along x at z ≈ 3, the other along y at z ≈ 7: they cross in plan.
		expectFront(lie(0, "y", "low"), lie(4, "x", "high"), Z, "crossing bars");
		assert.deepEqual(orderSolids([lie(4, "x", "high"), lie(0, "y", "low")], CAMERA_PLAN).map((s) => s.id), ["low", "high"]);
	});
	it("orders an oriented solid against the slab it stands over, and puts unrelated solids by how near their centres are", () => {
		const floor = slab({ x: 0, y: 0, w: 10, d: 10, id: "floor" });
		const arm = rotateSolid(box({ x: 0, y: 0, w: 1, d: 1, h: 3, z: 0.25, id: "arm" }), { axis: "x", deg: 45, about: { x: 0, y: -0.5, z: 0.25 } });
		expectFront(floor, arm, Z, "arm over floor");
		const far = box({ x: 20, y: 20, w: 1, d: 1, h: 1, id: "far" });
		const ids = (/** @type {{ id?: string }[]} */ list) => list.map((x) => x.id);
		// Not separated on the screen: the nearer centre comes last (north-east is away from an isometric camera), whatever the input order.
		assert.deepEqual(ids(orderSolids([far, arm], CAMERA_ISOMETRIC)), ["far", "arm"]);
		assert.deepEqual(ids(orderSolids([arm, far], CAMERA_ISOMETRIC)), ["far", "arm"]);
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
			assert.throws(() => labelProblems(outside, { ...view, limit: 0.5 }), RangeError);
			assert.throws(() => labelProblems(outside, { ...view, limit: /** @type {any} */ (Symbol("x")) }), RangeError);
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
		const r = checkScene(sceneWithLabels([{ x: -4, y: 0 }, { x: 4, y: 0 }]));
		assert.deepEqual([r.ok, r.problems, r.warnings], [true, [], []]);
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
	it("does not ask labelBoxes() once the problem cap is spent, and caps fixed ids", () => {
		let calls = 0;
		const many = sceneWithLabels([], { labelBoxes: () => { calls++; return []; } });
		const frame = /** @type {(t: number, o?: any) => string} */ (many.frame);
		many.frame = /** @type {any} */ ((/** @type {number} */ t, /** @type {any} */ o) => frame(t, o) + Array.from({ length: 30 }, (_, i) => `<g id="fixed${i}"/>`).join(""));
		const r = checkScene(many);
		assert.ok(r.problems.length <= 13, `${r.problems.length} problems`);
		assert.equal(calls, 0, "labelBoxes() must not be called after the cap");
	});
	it("does a linear amount of work for thousands of identical label boxes", () => {
		let reads = 0;
		const make = () => ({ id: "same", get x() { reads++; return 10; }, y: 10, width: 50, height: 20 });
		const boxes = Array.from({ length: 20000 }, make);
		const problems = labelProblems(boxes, { width: 400, height: 400, limit: 13 });
		assert.ok(problems.length > 0 && problems.length <= 13);
		// Collapsing copies keeps this near one read per box; a quadratic scan would read ~10^8 times.
		assert.ok(reads < boxes.length * 10, `${reads} reads of x`);
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
		for (const name of ["camera", "lerpCamera", "fitCamera", "projector", "project", "box", "slab", "prism", "orderSolids", "drawSolids", "labelAnchor", "labelProblems", "path3", "tokensAlong", "tokenPoints", "roundedBox", "roundedSlab", "drawGrid", "planeMatrix", "drawOnPlane", "labelPill"]) {
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

describe("rounded slabs", () => {
	const count = (/** @type {string} */ s, /** @type {string} */ what) => s.split(what).length - 1;
	const round = (/** @type {number} */ segments, extra = {}) => roundedBox({ x: 0, y: 0, w: 6, d: 4, h: 1, radius: 1, segments, ...extra });

	it("draws the side as a bounded number of paths, whatever the arc's sampling", () => {
		const sides = (/** @type {number} */ segments, /** @type {import("../runtime/iso.mjs").Camera} */ cam) => count(drawSolid(round(segments), cam), "<path") - 1; // less the top
		for (const cam of [CAMERA_ISOMETRIC, camera({ azimuth: 0, elevation: 30 }), camera({ azimuth: 200, elevation: 50 })]) {
			const some = sides(8, cam);
			assert.equal(sides(32, cam), some);
			assert.equal(sides(64, cam), some);
			assert.ok(some <= 1 + 7, `one wall and a shade layer per arc and side, got ${some}`);
		}
		// The same sampled footprint as a plain prism draws a face (and a shade) per sample.
		const plain = prism({ points: round(32).points, h: 1 });
		assert.ok(count(drawSolid(plain, CAMERA_ISOMETRIC), "<path") > 40);
		assert.ok(count(drawSolid(round(32), CAMERA_ISOMETRIC), "<path") < 10);
	});
	it("outlines the wall once: the only stroked side is the whole wall, none per sample or per arc", () => {
		const svg = drawSolid(round(16), CAMERA_ISOMETRIC);
		const stroked = [...svg.matchAll(/<path[^>]*stroke="var\(--mk-line\)"[^>]*>/g)];
		assert.equal(stroked.length, 2, "the wall and the top");
		assert.equal(count(svg, "fill=\"var(--mk-ink)\""), count(svg, "opacity=\""), "every other path is a shade layer without a stroke");
	});
	it("takes the same tokens and shades as a prism, and a flat wall without shade", () => {
		const svg = drawSolid(round(8, { fill: "accent", sides: "surface", stroke: "ink" }), CAMERA_ISOMETRIC);
		assert.match(svg, /fill="var\(--mk-accent\)"/);
		assert.match(svg, /fill="var\(--mk-surface\)"/);
		assert.match(svg, /fill="var\(--mk-ink\)" opacity="0\./);
		assert.equal(findColourLiteral(svg), null);
		assert.equal(count(drawSolid(round(8, { shade: null }), CAMERA_ISOMETRIC), "<path"), 2, "the wall and the top");
		assert.throws(() => round(8, { fill: "#fff" }), /unknown style token/);
	});
	it("shows the top only in plan, and the wall's shade turns with the face", () => {
		assert.equal(count(drawSolid(round(8), CAMERA_PLAN), "<path"), 1);
		const shades = [...drawSolid(round(8), CAMERA_ISOMETRIC).matchAll(/fill="var\(--mk-ink\)" opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
		assert.ok(new Set(shades).size > 1, "the sides take different shades");
		assert.ok(shades.every((o) => o >= 0.1 && o <= 0.26));
	});
	it("is a convex prism for the depth order, drawn after the solid it stands behind", () => {
		const floor = roundedSlab({ x: 0, y: 0, w: 12, d: 8, radius: 1.5, id: "floor" });
		const on = roundedBox({ x: 0, y: 0, w: 3, d: 3, h: 1, radius: 0.8, z: 0.25, id: "on" });
		assert.deepEqual(orderSolids([on, floor], CAMERA_ISOMETRIC).map((s) => s.id), ["floor", "on"]);
		const far = roundedBox({ x: -3, y: 3, w: 2, d: 2, h: 1, radius: 0.5, id: "far" });
		const near = roundedBox({ x: 3, y: -3, w: 2, d: 2, h: 1, radius: 0.5, id: "near" });
		assert.deepEqual(orderSolids([near, far], CAMERA_ISOMETRIC).map((s) => s.id), ["far", "near"]);
		assert.equal(roundedSlab({ x: 0, y: 0, w: 4, d: 4, radius: 1 }).z1, 0.25);
	});
	it("is a plain box at radius 0, and a stadium or a circle at the largest radius", () => {
		assert.equal(roundedBox({ x: 0, y: 0, w: 2, d: 2, h: 1, radius: 0 }).points.length, 4);
		for (const [w, d] of [[4, 2], [2, 2], [2, 4]]) {
			const s = roundedBox({ x: 0, y: 0, w, d, h: 1, radius: Math.min(w, d) / 2, segments: 6 });
			assert.ok(s.points.length >= 12);
			for (const cam of [CAMERA_ISOMETRIC, camera({ azimuth: 0, elevation: 30 }), camera({ azimuth: 100, elevation: 20 })]) {
				const svg = drawSolid(s, cam);
				assert.equal(count(svg, "var(--mk-line)") >= 2, true);
				assert.equal([...svg.matchAll(/<path[^>]*stroke="var\(--mk-line\)"/g)].length, 2, `${w}×${d}: one wall and the top`);
			}
		}
	});
	it("keeps each arc's own shading group when the radius takes whole sides", () => {
		const s = roundedBox({ x: 0, y: 0, w: 2, d: 2, h: 1, radius: 1, segments: 6 });
		assert.equal(new Set(s.groups).size, 4, "four arcs, four groups");
	});
	it("keeps the footprint on the box's outline: corners cut round, sides straight", () => {
		const s = round(8);
		const xs = s.points.map((p) => p.x);
		const ys = s.points.map((p) => p.y);
		near(Math.min(...xs), -3);
		near(Math.max(...xs), 3);
		near(Math.min(...ys), -2);
		near(Math.max(...ys), 2);
		assert.ok(!s.points.some((p) => Math.abs(p.x) > 3 - 1e-9 && Math.abs(p.y) > 2 - 1e-9), "no point at a square corner");
	});
	it("lets a prism sampled from a curve ask for one wall without groups", () => {
		const twelve = prism({ points: regularPolygon(0, 0, 2, 12), h: 1, smooth: true, shade: null });
		assert.equal(count(drawSolid(twelve, CAMERA_ISOMETRIC), "<path"), 2, "the wall and the top");
	});
	it("rejects a radius or a segment count that does not make a rounded box", () => {
		assert.throws(() => roundedBox({ x: 0, y: 0, w: 4, d: 2, h: 1, radius: 1.5 }), /radius/);
		assert.throws(() => roundedBox({ x: 0, y: 0, w: 4, d: 2, h: 1, radius: -1 }), /radius/);
		assert.throws(() => roundedBox({ x: 0, y: 0, w: 4, d: 2, h: 1, radius: NaN }), /radius/);
		assert.throws(() => roundedBox({ x: 0, y: 0, w: 4, d: 2, h: 1, radius: 1, segments: 0 }), /segment/);
		assert.throws(() => roundedBox({ x: 0, y: 0, w: 0, d: 2, h: 1, radius: 0 }), /positive/);
		assert.throws(() => roundedBox({ x: 0, y: 0, w: 4, d: 2, h: -1, radius: 1 }), /height/);
	});
	it("takes edge groups on a prism in the footprint's winding, even when it is wound clockwise", () => {
		const ccw = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
		// Edges 0 and 1 are the two southern/eastern sides: one group; the rest are their own.
		const a = prism({ points: ccw, h: 1, groups: [7, 7, 8, 9], shade: null });
		const b = prism({ points: [...ccw].reverse(), h: 1, groups: [8, 7, 7, 9], shade: null });
		assert.deepEqual([...(a.groups ?? [])], [7, 7, 8, 9]);
		assert.deepEqual([...(b.groups ?? [])], [7, 7, 8, 9]);
		assert.throws(() => prism({ points: ccw, h: 1, groups: [1, 2] }), /one number per footprint edge/);
		// Without `smooth` each group is a face outlined by itself: a camera from the south-east sees groups 7 and 7 as one face.
		const cam = camera({ azimuth: 45, elevation: 35 });
		assert.equal(count(drawSolid(a, cam), "<path"), 2, "the merged face and the top");
		assert.equal(count(drawSolid(prism({ points: ccw, h: 1, shade: null }), cam), "<path"), 3, "two faces and the top");
	});
});

describe("content on a horizontal plane", () => {
	const view = { width: 24, height: 24 };
	const plane = { x: 1, y: -2, z: 1.5, w: 4, d: 4, view };
	const apply = (/** @type {number[]} */ m, /** @type {number} */ a, /** @type {number} */ b) => ({ x: m[0] * a + m[2] * b + m[4], y: m[1] * a + m[3] * b + m[5] });

	it("puts the view's corners where the plane's world corners project, at two cameras and between them", () => {
		const cams = [CAMERA_ISOMETRIC, camera({ azimuth: 20, elevation: 50, zoom: 31, pan: { x: 40, y: 60 } }), lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.4), CAMERA_PLAN];
		for (const cam of cams) {
			const m = planeMatrix(cam, plane);
			// The view's top left is the north-west corner, its x runs east, its y south.
			const corners = [[0, 0, -2, 2], [24, 0, 2, 2], [24, 24, 2, -2], [0, 24, -2, -2]];
			for (const [a, b, dx, dy] of corners) {
				const got = apply(m, a, b);
				const want = project(cam, { x: plane.x + dx, y: plane.y + dy, z: plane.z });
				near(got.x, want.x, 1e-9);
				near(got.y, want.y, 1e-9);
			}
		}
	});
	it("moves with the camera: another swivel, another matrix, the same world corners", () => {
		const a = planeMatrix(CAMERA_PLAN, plane);
		const b = planeMatrix(CAMERA_ISOMETRIC, plane);
		assert.notDeepEqual(a, b);
		const mid = planeMatrix(lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.5), plane);
		assert.ok(mid.every((v) => Number.isFinite(v)));
	});
	it("fits the view into the rectangle, centred and with its aspect kept", () => {
		const m = planeMatrix(CAMERA_PLAN, { x: 0, y: 0, w: 10, d: 4, view: { width: 20, height: 20 } });
		// 4 world units for 20 view units, in the middle: x from −2 to 2.
		near(apply(m, 0, 0).x, -2);
		near(apply(m, 20, 20).x, 2);
		near(apply(m, 0, 0).y, -2);
		near(apply(m, 20, 20).y, 2);
	});
	it("draws markup in the plane's transform, and nothing for a plane seen edge on or faded out", () => {
		const svg = drawOnPlane(CAMERA_ISOMETRIC, plane, '<rect width="24" height="24"/>');
		assert.match(svg, /^<g transform="matrix\(/);
		assert.match(svg, /<rect width="24" height="24"\/>/);
		assert.equal(drawOnPlane(camera({ azimuth: 45, elevation: 0 }), plane, "<rect/>"), "");
		assert.equal(drawOnPlane(CAMERA_ISOMETRIC, plane, "<rect/>", 0), "");
		assert.match(drawOnPlane(CAMERA_ISOMETRIC, plane, "<rect/>", 0.5), /opacity="0\.5"/);
		assert.equal(drawOnPlane(CAMERA_ISOMETRIC, plane, "<rect/>"), drawOnPlane(CAMERA_ISOMETRIC, plane, "<rect/>"));
	});
	it("tells an edge-on plane from a large view", () => {
		const big = { x: 0, y: 0, w: 100, d: 100, view: { width: 1e5, height: 1e5 } };
		const drawn = drawOnPlane(CAMERA_PLAN, big, "<g/>");
		assert.ok(drawn.startsWith("<g "));
		const m = drawn.match(/matrix\(([^)]+)\)/)?.[1].split(" ").map(Number);
		assert.ok(m && m[0] * m[3] - m[1] * m[2] !== 0, "a drawn matrix is invertible once rounded");
		assert.equal(drawOnPlane(camera({ azimuth: 45, elevation: 0 }), big, "<g/>"), "");
	});
	it("draws nothing when the rounded matrix would collapse to a point", () => {
		const tiny = { x: 0, y: 0, w: 1, d: 1, view: { width: 1e5, height: 1e5 } };
		assert.equal(drawOnPlane(CAMERA_PLAN, tiny, "<g/>"), "");
	});
	it("rejects a plane that has no area or no view", () => {
		assert.throws(() => planeMatrix(CAMERA_PLAN, { ...plane, w: 0 }), /positive/);
		assert.throws(() => planeMatrix(CAMERA_PLAN, { ...plane, view: { width: 0, height: 1 } }), /view/);
		assert.throws(() => planeMatrix(CAMERA_PLAN, { ...plane, x: NaN }), /finite/);
	});

	describe("on a solid's top face", () => {
		const top = { markup: '<circle cx="12" cy="12" r="8"/>', view, inset: 0.5 };
		const count = (/** @type {string} */ s, /** @type {string} */ what) => s.split(what).length - 1;
		const matrixOf = (/** @type {string} */ svg) => (svg.match(/transform="matrix\(([^)]+)\)"/)?.[1] ?? "").split(" ").map(Number);

		it("moves with the face across a camera swivel: its projected corners match the face's", () => {
			const slab = roundedBox({ x: 2, y: -1, w: 6, d: 4, h: 1, z: 0.5, radius: 1, top });
			for (const cam of [CAMERA_ISOMETRIC, camera({ azimuth: 120, elevation: 40, zoom: 20, pan: { x: 300, y: 200 } }), lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.3)]) {
				const m = matrixOf(drawSolid(slab, cam));
				assert.equal(m.length, 6, "the content is drawn in a matrix");
				// The face is 6 × 4 less the 0.5 inset: a 5 × 3 rectangle; the 24 × 24 view fits at 3/24 per unit, centred.
				const k = 3 / 24;
				for (const [a, b] of [[0, 0], [24, 0], [24, 24], [0, 24]]) {
					const got = apply(m, a, b);
					const want = project(cam, { x: 2 - 12 * k + a * k, y: -1 + 12 * k - b * k, z: 1.5 });
					near(got.x, want.x, 0.01); // the matrix is rounded to 4 decimals
					near(got.y, want.y, 0.01);
				}
			}
		});
		it("is drawn inside the solid, so it is ordered with it, and fades with it", () => {
			const a = roundedBox({ x: 0, y: 0, w: 4, d: 4, h: 1, radius: 1, top, opacity: 0.5, id: "s" });
			const svg = drawSolid(a, CAMERA_ISOMETRIC);
			assert.match(svg, /^<g data-solid="s" opacity="0\.5">/);
			assert.ok(svg.indexOf("<circle") > svg.lastIndexOf("<path"), "over the faces");
			assert.equal(count(svg, "<g "), 2, "the solid's group and the content's");
		});
		it("is not drawn when the top is edge on, and takes its own opacity", () => {
			const a = box({ x: 0, y: 0, w: 4, d: 4, h: 1, top });
			assert.equal(drawSolid(a, camera({ azimuth: 45, elevation: 0 })).includes("<circle"), false);
			assert.equal(drawSolid(box({ x: 0, y: 0, w: 4, d: 4, h: 1, top: { ...top, opacity: 0 } }), CAMERA_ISOMETRIC).includes("<circle"), false);
			assert.ok(drawSolid(box({ x: 0, y: 0, w: 4, d: 4, h: 1, top: { ...top, opacity: 0.4 } }), CAMERA_ISOMETRIC).includes('opacity="0.4"'));
		});
		it("works on any prism, and rejects bad content", () => {
			const hex = prism({ points: regularPolygon(0, 0, 2, 6), h: 1, top });
			assert.ok(drawSolid(hex, CAMERA_ISOMETRIC).includes("<circle"));
			assert.throws(() => box({ x: 0, y: 0, w: 2, d: 2, h: 1, top: { markup: /** @type {any} */ (5), view } }), /markup/);
			assert.throws(() => box({ x: 0, y: 0, w: 2, d: 2, h: 1, top: { markup: "", view: { width: 0, height: 1 } } }), /view/);
			assert.throws(() => box({ x: 0, y: 0, w: 2, d: 2, h: 1, top: { ...top, inset: -1 } }), /inset/);
			assert.throws(() => drawSolid(box({ x: 0, y: 0, w: 2, d: 2, h: 1, top: { ...top, inset: 1 } }), CAMERA_ISOMETRIC), /no room/);
		});
	});
});

describe("the grid backdrop", () => {
	const grid = (/** @type {Record<string, unknown>} */ extra = {}, cam = CAMERA_ISOMETRIC) => drawGrid(cam, { radius: 6, ...extra });
	const opacities = (/** @type {string} */ svg) => [...svg.matchAll(/<path[^>]*opacity="([\d.]+)"/g)].map((m) => Number(m[1]));

	it("draws lines in a token at low opacity, in a bounded number of paths", () => {
		const svg = grid({ opacity: 0.4 });
		assert.match(svg, /stroke="var\(--mk-line\)"/);
		assert.equal(findColourLiteral(svg), null);
		assert.ok(opacities(svg).length <= 6 && opacities(svg).length >= 2);
		assert.ok(opacities(svg).every((o) => o > 0 && o <= 0.4));
		assert.equal(grid({ stroke: "accent" }).includes("var(--mk-accent)"), true);
		assert.throws(() => grid({ stroke: "#ccc" }), /unknown style token/);
	});
	it("fades out toward the edges: the farther the ring, the fainter", () => {
		const svg = grid({ opacity: 0.6, bands: 6 });
		// Rings are drawn faintest first, so the opacities rise.
		const o = opacities(svg);
		assert.deepEqual(o, [...o].sort((a, b) => a - b));
		assert.ok(o[0] < o[o.length - 1]);
		// Nothing is drawn beyond the radius: the extent of the projected points stays inside it.
		const cam = camera({ azimuth: 0, elevation: 90, zoom: 10 });
		const pts = [...drawGrid(cam, { radius: 5 }).matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])) / 10);
		assert.ok(Math.max(...pts) <= 5 + 0.5 + 1e-6, "within the radius plus half a step");
		assert.ok(Math.max(...pts) > 5 - 0.5, "and reaching out to it");
	});
	it("bounds the bands before allocating them", () => {
		assert.throws(() => drawGrid(CAMERA_PLAN, { radius: 1, bands: 1e9 }), /bands/);
		assert.ok(drawGrid(CAMERA_PLAN, { radius: 1, bands: 64 }).length > 0);
	});
	it("draws diamonds in isometric and squares in plan, in the floor plane at its height", () => {
		const plan = drawGrid(camera({ azimuth: 0, elevation: 90, zoom: 10 }), { radius: 3, bands: 1 });
		const segs = [...plan.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));
		assert.ok(segs.length > 0 && segs.every(([x1, y1, x2, y2]) => x1 === x2 || y1 === y2), "axis-aligned in plan");
		const iso = drawGrid(CAMERA_ISOMETRIC, { radius: 3, bands: 1 });
		const isoSegs = [...iso.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));
		assert.ok(isoSegs.every(([x1, y1, x2, y2]) => x1 !== x2 && y1 !== y2), "slanted in isometric");
		const raised = drawGrid(CAMERA_ISOMETRIC, { radius: 3, bands: 1, z: 2 });
		assert.notEqual(raised, iso);
	});
	it("follows the camera and is static: the same camera gives the same bytes, another camera another grid", () => {
		assert.equal(grid(), grid());
		assert.notEqual(grid({}, CAMERA_PLAN), grid({}, CAMERA_ISOMETRIC));
		assert.notEqual(grid({}, lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.3)), grid({}, lerpCamera(CAMERA_PLAN, CAMERA_ISOMETRIC, 0.4)));
	});
	it("is a backdrop: drawn before the solids in the example, so it is never over one", async () => {
		const { scene } = await loadScene(PLATFORM, { format: "16:9" });
		const svg = scene.frame(scene.duration, { idPrefix: "x" });
		assert.ok(svg.startsWith('<path d="M'), "the grid's lines come first");
		const lastRing = svg.lastIndexOf('fill="none" stroke="var(--mk-line)" stroke-width="1" opacity');
		assert.ok(lastRing > 0 && lastRing < svg.indexOf('data-solid="floor"'), "every ring is before the first solid");
	});
	it("rejects a grid that cannot be drawn", () => {
		assert.throws(() => drawGrid(CAMERA_ISOMETRIC, { radius: 0 }), /radius/);
		assert.throws(() => drawGrid(CAMERA_ISOMETRIC, { radius: 5, step: 0 }), /step/);
		assert.throws(() => drawGrid(CAMERA_ISOMETRIC, { radius: 5, bands: 0 }), /band/);
		assert.throws(() => drawGrid(CAMERA_ISOMETRIC, { radius: 5000, step: 1 }), /too many/);
	});
});

describe("pill tags", () => {
	const view = { width: 400, height: 400 };
	it("returns a stemless box for the label gate, drawn as a rounded rect with text", () => {
		const { markup, box: b } = labelPill({ id: "tag", x: 200, y: 300, lines: ["Shader"] });
		assert.equal(b.stem, undefined);
		near(b.x + b.width / 2, 200);
		near(b.y + b.height / 2, 300);
		assert.match(markup, /<rect [^>]*rx="/);
		assert.match(markup, /<text /);
		assert.doesNotMatch(markup, /<line |<circle /);
		assert.equal(findColourLiteral(markup), null);
		assert.deepEqual(labelProblems([b], view), []);
	});
	it("fails a scene whose pill overlaps another label", () => {
		const cam = camera({ azimuth: 0, elevation: 90, zoom: 20, pan: { x: 200, y: 200 } });
		const anchor = labelAnchor(cam, { id: "anchor", at: { x: -4, y: 0 }, lines: ["Label"] });
		const pill = labelPill({ id: "pill", x: anchor.box.x + anchor.box.width / 2 + 10, y: anchor.box.y + anchor.box.height / 2, lines: ["Tag"] });
		const scene = {
			id: "pilled", width: 400, height: 400, duration: 2, title: "Pilled", description: "A pill over a label",
			stepLabelsInFrame: false, steps: [{ at: 1, label: "Shown" }],
			frame: () => `<rect width="10" height="10" fill="var(--mk-accent)"/>${anchor.markup}${pill.markup}`,
			labelBoxes: () => [anchor.box, pill.box],
		};
		const r = checkScene(scene);
		assert.equal(r.ok, false);
		assert.ok(r.problems.some((p) => /^labels "anchor" and "pill" overlap at t=/.test(p)), r.problems.join("\n"));
	});
	it("fails a pill that leaves the picture, and passes two that are apart", () => {
		const a = labelPill({ id: "a", x: 20, y: 380, lines: ["A long tag that runs off the edge"] });
		assert.deepEqual(labelProblems([a.box], view), ['label "a" is outside the picture']);
		assert.deepEqual(labelProblems([labelPill({ id: "a", x: 100, y: 200, lines: ["One"] }).box, labelPill({ id: "b", x: 300, y: 200, lines: ["Two"] }).box], view), []);
	});
	it("takes tokens for its fill, outline and text, sizes to its lines, and fades out", () => {
		const accent = labelPill({ id: "a", x: 100, y: 100, lines: ["Live"], fill: "accent", stroke: "accent", ink: "onAccent" }).markup;
		assert.match(accent, /fill="var\(--mk-accent\)"/);
		assert.match(accent, /fill="var\(--mk-onAccent\)"/);
		const one = labelPill({ id: "a", x: 0, y: 0, lines: ["Live"] }).box;
		const two = labelPill({ id: "a", x: 0, y: 0, lines: ["Live", "now and then"] }).box;
		assert.ok(two.width > one.width && two.height > one.height);
		assert.equal(labelPill({ id: "a", x: 0, y: 0, lines: ["Live"], opacity: 0 }).markup, "");
		assert.throws(() => labelPill({ id: "a", x: 0, y: 0, lines: [] }), /no text/);
		assert.throws(() => labelPill({ id: "a", x: 0, y: 0, lines: ["x"], fill: "#fff" }), /unknown style token/);
		assert.throws(() => labelPill({ id: "a", x: NaN, y: 0, lines: ["x"] }), /position/);
	});
});

describe("examples/isometric-platform.scene.mjs", () => {
	it("passes the gate in every format and in two locales", async () => {
		for (const format of Object.keys(FORMATS)) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(PLATFORM, { format, locale });
				assert.deepEqual(checkScene(scene).problems, [], `${format} ${locale}`);
			}
		}
	});
	it("uses every new part: a rounded slab, the grid, a mark on a top face and pill tags", async () => {
		const { scene } = await loadScene(PLATFORM, { format: "16:9" });
		const [plan, iso, tagged] = scene.steps.map((s) => scene.frame(s.at, { idPrefix: "x" }));
		assert.ok(plan.includes('data-solid="floor"') && plan.includes('data-solid="platform"'));
		assert.ok(plan.includes('fill="none" stroke="var(--mk-line)"'), "the grid");
		assert.ok(/<g transform="matrix\(/.test(iso), "the mark on the top face");
		assert.notEqual(plan.match(/matrix\([^)]+\)/)?.[0], iso.match(/matrix\([^)]+\)/)?.[0], "the mark turned with the camera");
		assert.equal(plan.includes("data-label"), false);
		assert.equal((tagged.match(/data-label=/g) ?? []).length, 2, "two pill tags");
		assert.deepEqual(scene.labelBoxes?.(scene.duration)?.map((b) => b.id), ["tag-slab", "tag-mark"]);
	});
	it("lasts under the 8 s target and holds its last frame: nothing loops", async () => {
		const { scene } = await loadScene(PLATFORM, { format: "16:9" });
		assert.ok(scene.duration <= 8);
		const last = scene.frame(scene.duration, { idPrefix: "x" });
		for (const dt of [0, 0.5, 30, 3600]) assert.equal(scene.frame(scene.duration + dt, { idPrefix: "x" }), last);
	});
	it("keeps the backdrop still while a step rests", async () => {
		const { scene } = await loadScene(PLATFORM, { format: "16:9" });
		const grid = (/** @type {number} */ t) => (scene.frame(t, { idPrefix: "x" }).match(/<path d="[^"]*" fill="none" stroke="var\(--mk-line\)"[^>]*>/g) ?? []).join("");
		for (const step of scene.steps) assert.equal(grid(step.at), grid(step.at + 0.05), `step at ${step.at}`);
		assert.equal(grid(scene.duration), grid(scene.duration + 10));
	});
	it("keeps its tags apart and in the picture at every sampled time, in every format", async () => {
		for (const format of Object.keys(FORMATS)) {
			const { scene } = await loadScene(PLATFORM, { format });
			for (let i = 0; i <= 120; i++) {
				const t = (scene.duration * i) / 120;
				assert.deepEqual(labelProblems(scene.labelBoxes?.(t) ?? [], scene), [], `${format} at t=${t.toFixed(3)}`);
			}
		}
	});
});
