// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · the isometric kit, for custom scenes (`kit`).
 *
 * A camera, solids, depth order and label anchors, as pure functions: the same
 * camera and solids give the same markup, so a scene that draws a 3D view
 * stays a function of time. Handed to custom scenes as part of `opts.kit`.
 *
 * World: x east, y north, z up, in any unit. The camera looks at it from
 * `azimuth` (degrees turned about z; 0 = from the south) and `elevation`
 * (degrees above the horizon). 90° elevation with azimuth 0 is the plan view, with north up;
 * `ISO_ELEVATION` with a 45° azimuth is true isometric. The projection is
 * orthographic, so it is linear and a swivel from one camera to another is an
 * interpolation of the camera (`lerpCamera`).
 *
 *   screen.x = pan.x + zoom · u
 *   screen.y = pan.y − zoom · (v·sin(elevation) + z·cos(elevation))
 *   with u = x·cos(az) + y·sin(az) and v = −x·sin(az) + y·cos(az)
 *
 * `pan` is where the world origin lands on the screen, in pixels, and `zoom`
 * is pixels per world unit. Colours are token names (`"surface"`), never
 * literals: faces take `tok(name)`, the sides shaded by a translucent layer of
 * a second token. Labels are boxes the gate checks (`labelProblems`).
 *
 * Imports stay single-line named imports: lib/bundle.mjs inlines only that form.
 */
import { estimateWidth } from "./wrap.mjs";
import { tok } from "./style.mjs";
import { el, fade, num, text } from "./svg.mjs";

/** The elevation, in degrees, of true isometric: atan(1/√2), about 35.264°. */
export const ISO_ELEVATION = (Math.atan(Math.SQRT1_2) * 180) / Math.PI;

/** @typedef {{ x: number, y: number, z?: number }} Point3 */
/**
 * A camera: where it looks from, and the pan and zoom of the picture.
 * @typedef {Readonly<{ azimuth: number, elevation: number, zoom: number, pan: { x: number, y: number } }>} Camera
 */
/**
 * A projected point: its screen position, and `depth`, how near it is to the
 * viewer (larger is nearer).
 * @typedef {{ x: number, y: number, depth: number }} Projected
 */

/**
 * Sine and cosine of an angle in degrees, exact at multiples of 90°, so the
 * plan view (90° elevation) projects without trigonometric noise.
 * @param {number} deg
 * @returns {[number, number]} [sin, cos]
 */
function sincos(deg) {
	const r = deg % 360; // signed: a tiny angle must not round to zero, and an in-range one keeps its old radians
	if (r % 90 === 0) return /** @type {[number, number]} */ ([[0, 1], [1, 0], [0, -1], [-1, 0]][(((r / 90) % 4) + 4) % 4]);
	const rad = (r * Math.PI) / 180; // the reduced angle: deg itself may overflow the product
	return [Math.sin(rad), Math.cos(rad)];
}

/** @param {number} n */
const finite = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * A camera. Defaults: true isometric (45° azimuth, `ISO_ELEVATION`), zoom 1,
 * the world origin at the screen origin.
 * @param {{ azimuth?: number, elevation?: number, zoom?: number, pan?: { x: number, y: number } }} [opts]
 * @returns {Camera}
 */
export function camera({ azimuth = 45, elevation = ISO_ELEVATION, zoom = 1, pan = { x: 0, y: 0 } } = {}) {
	if (!finite(azimuth)) throw new Error(`camera: azimuth must be a finite number of degrees, got ${azimuth}`);
	if (!finite(elevation) || elevation < 0 || elevation > 90) throw new Error(`camera: elevation must be from 0 to 90 degrees, got ${elevation}`);
	if (!finite(zoom) || zoom <= 0) throw new Error(`camera: zoom must be a positive number, got ${zoom}`);
	if (!pan || !finite(pan.x) || !finite(pan.y)) throw new Error("camera: pan must be { x, y } in finite pixels");
	return Object.freeze({ azimuth, elevation, zoom, pan: Object.freeze({ x: pan.x, y: pan.y }) });
}

/** The plan view: straight down, north up. */
export const CAMERA_PLAN = camera({ azimuth: 0, elevation: 90 });
/** True isometric. */
export const CAMERA_ISOMETRIC = camera({ azimuth: 45, elevation: ISO_ELEVATION });

/**
 * The camera `p` of the way from `a` to `b`: every field interpolated
 * linearly, so a swivel is `lerpCamera(plan, iso, progress(t, …))`. At 0 and
 * 1 it is `a` and `b` themselves.
 * @param {Camera} a
 * @param {Camera} b
 * @param {number} p 0..1
 * @returns {Camera}
 */
export function lerpCamera(a, b, p) {
	if (p <= 0) return a;
	if (p >= 1) return b;
	const mix = (/** @type {number} */ x, /** @type {number} */ y) => x + (y - x) * p;
	return camera({
		azimuth: mix(a.azimuth, b.azimuth),
		elevation: mix(a.elevation, b.elevation),
		zoom: mix(a.zoom, b.zoom),
		pan: { x: mix(a.pan.x, b.pan.x), y: mix(a.pan.y, b.pan.y) },
	});
}

/**
 * The projection of a camera as a function of a world point.
 * @param {Camera} cam
 * @returns {(p: Point3) => Projected}
 */
export function projector(cam) {
	const [sa, ca] = sincos(cam.azimuth);
	const [se, ce] = sincos(cam.elevation);
	const { zoom, pan } = cam;
	return ({ x, y, z = 0 }) => {
		const u = x * ca + y * sa;
		const v = -x * sa + y * ca;
		return { x: pan.x + zoom * u, y: pan.y - zoom * (v * se + z * ce), depth: -v * ce + z * se };
	};
}

/**
 * One world point on the screen.
 * @param {Camera} cam
 * @param {Point3} p
 * @returns {Projected}
 */
export function project(cam, p) {
	return projector(cam)(p);
}

/**
 * `cam` with the zoom and pan that fit `points` (world points: a scene's
 * floor corners and tallest heights) into a `width` × `height` picture, centred
 * in the area the margins leave. Fitting each frame's camera keeps the whole
 * scene in view through a swivel; `cam`'s own zoom and pan are replaced.
 * @param {Point3[]} points
 * @param {Camera} cam
 * @param {{ width: number, height: number, margin?: number | { top?: number, right?: number, bottom?: number, left?: number } }} area
 * @returns {Camera}
 */
export function fitCamera(points, cam, { width, height, margin = 0 }) {
	if (!points.length) throw new Error("fitCamera: needs at least one point");
	const m = typeof margin === "number" ? { top: margin, right: margin, bottom: margin, left: margin } : margin;
	const top = m.top ?? 0;
	const right = m.right ?? 0;
	const bottom = m.bottom ?? 0;
	const left = m.left ?? 0;
	const free = { w: width - left - right, h: height - top - bottom };
	if (!(free.w > 0 && free.h > 0)) throw new Error("fitCamera: the margins leave no room");
	const unit = projector(camera({ azimuth: cam.azimuth, elevation: cam.elevation }));
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		const s = unit(p);
		minX = Math.min(minX, s.x);
		maxX = Math.max(maxX, s.x);
		minY = Math.min(minY, s.y);
		maxY = Math.max(maxY, s.y);
	}
	const w = maxX - minX;
	const h = maxY - minY;
	const zoom = Math.min(w > 0 ? free.w / w : Infinity, h > 0 ? free.h / h : Infinity);
	if (!Number.isFinite(zoom)) throw new Error("fitCamera: the points have no extent");
	return camera({
		azimuth: cam.azimuth,
		elevation: cam.elevation,
		zoom,
		pan: { x: left + free.w / 2 - ((minX + maxX) / 2) * zoom, y: top + free.h / 2 - ((minY + maxY) / 2) * zoom },
	});
}

/**
 * A polyline through world points with its length, so a token travels it at a
 * constant speed in world units, whatever the camera does, when its progress is
 * linear (`ease: linear`).
 * @param {Point3[]} points
 * @returns {{ length: number, points: Point3[], at: (f: number) => { x: number, y: number, z: number } }}
 */
export function path3(points) {
	if (points.length < 2) throw new Error("path3: needs at least two points");
	const pts = points.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
	const starts = [0];
	for (let i = 1; i < pts.length; i++) starts.push(starts[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
	const length = starts[starts.length - 1];
	return {
		length,
		points: pts,
		at(f) {
			const target = Math.min(Math.max(f, 0), 1) * length;
			let i = 1;
			while (i < pts.length - 1 && target > starts[i]) i++;
			const a = pts[i - 1];
			const b = pts[i];
			const span = starts[i] - starts[i - 1];
			const k = span === 0 ? 0 : (target - starts[i - 1]) / span;
			return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
		},
	};
}

/* ------------------------------------------------------------------ solids */

/**
 * An extruded convex polygon: a footprint in the x-y plane, from `z0` up to
 * `z1`. `fill` is the token of the top face; `sides` (default: `fill`) the
 * token of the side faces, which a layer of `shade` at 10–26 % darkens or
 * lightens by the face's turn from the light (screen left is lit). `shade:
 * null` leaves them flat. `stroke` outlines every face. `groups` (one number
 * per footprint edge, edge i running from point i to point i + 1) names the
 * shading faces: consecutive visible edges with the same number are one face,
 * outlined once. With `smooth` the footprint's edges are samples of a curve
 * and its sides are one continuous wall: the visible sides are outlined once as
 * a whole, with no line where two faces meet, and only the shade changes from
 * group to group (`roundedBox` sets both; a `prism` without them draws one
 * outlined face per edge, as a polygon should). `top` is 2D content drawn on
 * the top face (`TopContent`). A solid with a `pose` is oriented: `points`,
 * `z0` and `z1` are in its own frame, and the pose places that frame in the
 * world (`rotateSolid`).
 * @typedef {Readonly<{ points: { x: number, y: number }[], z0: number, z1: number, fill: string, sides: string, shade: string | null, stroke: string, strokeWidth: number, opacity: number, id?: string, groups?: readonly number[], smooth?: boolean, top?: Readonly<TopContent>, pose?: Pose }>} Solid
 */
/**
 * Where an oriented solid's own frame lies in the world: a world point is
 * `m` (row-major, a rotation) times the solid's point, plus `t`.
 * @typedef {Readonly<{ m: readonly [number, number, number, number, number, number, number, number, number], t: Readonly<{ x: number, y: number, z: number }> }>} Pose
 */

/**
 * @param {string} name a token name
 * @returns {string}
 */
function token(name) {
	tok(name); // throws for an unknown token
	return name;
}

/**
 * Footprint points counter-clockwise, or a throw for a footprint that is not a
 * convex polygon. `flipped` says the input wound clockwise and was reversed.
 * @param {{ x: number, y: number }[]} points
 * @returns {{ points: { x: number, y: number }[], flipped: boolean }}
 */
function convexCcw(points) {
	if (!Array.isArray(points) || points.length < 3) throw new Error("a solid's footprint needs at least three points");
	for (const p of points) if (!p || !finite(p.x) || !finite(p.y)) throw new Error("a solid's footprint points must be finite { x, y }");
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		area += a.x * b.y - b.x * a.y;
	}
	if (Math.abs(area) < 1e-9) throw new Error("a solid's footprint has no area");
	// Any two vertices at one place, neighbours or not: a footprint that winds
	// round twice has every turn and half-plane right, and draws each face twice.
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			if (Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y) < 1e-9) throw new Error("a solid's footprint has a repeated point");
		}
	}
	const flipped = area < 0;
	const ccw = flipped ? points.map((p) => ({ x: p.x, y: p.y })).reverse() : points.map((p) => ({ x: p.x, y: p.y }));
	for (let i = 0; i < ccw.length; i++) {
		const a = ccw[i];
		const b = ccw[(i + 1) % ccw.length];
		const c = ccw[(i + 2) % ccw.length];
		if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-9) throw new Error("a solid's footprint must be convex");
	}
	// Consecutive turns alone pass a star that winds twice: every vertex must also
	// lie on the inner side of every edge.
	for (let i = 0; i < ccw.length; i++) {
		const a = ccw[i];
		const b = ccw[(i + 1) % ccw.length];
		for (const p of ccw) if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < -1e-9) throw new Error("a solid's footprint must be convex");
	}
	return { points: ccw, flipped };
}

/**
 * A prism: `points` extruded by `h` from the base height `z`. `groups`,
 * `smooth` and `top` are described at `Solid`; `groups` follows the winding of
 * `points`.
 * @param {{ points: { x: number, y: number }[], h: number, z?: number, fill?: string, sides?: string, shade?: string | null, stroke?: string, strokeWidth?: number, opacity?: number, id?: string, groups?: number[], smooth?: boolean, top?: TopContent }} o
 * @returns {Solid}
 */
export function prism({ points, h, z = 0, fill = "surface", sides, shade = "ink", stroke = "line", strokeWidth = 1.5, opacity = 1, id, groups, smooth = false, top }) {
	if (!finite(h) || h < 0) throw new Error(`a solid's height must be a number from 0 up, got ${h}`);
	if (!finite(z)) throw new Error(`a solid's base height must be finite, got ${z}`);
	const foot = convexCcw(points);
	const n = foot.points.length;
	if (groups !== undefined && (!Array.isArray(groups) || groups.length !== n || !groups.every(finite))) throw new Error("a solid's groups need one number per footprint edge");
	// Reversing the points turns edge i into edge n − 2 − i.
	const edgeGroups = groups && Object.freeze(foot.flipped ? groups.map((_, i) => groups[(2 * n - 2 - i) % n]) : [...groups]);
	return Object.freeze({
		points: foot.points,
		...(edgeGroups ? { groups: edgeGroups } : {}),
		...(smooth ? { smooth: true } : {}),
		...(top ? { top: Object.freeze(checkTop(top)) } : {}),
		z0: z,
		z1: z + h,
		fill: token(fill),
		sides: token(sides ?? fill),
		shade: shade === null ? null : token(shade),
		stroke: token(stroke),
		strokeWidth,
		opacity,
		id,
	});
}

/** @typedef {Omit<Parameters<typeof prism>[0], "points" | "h" | "groups" | "smooth">} SolidStyle */

/**
 * A box: `w` along x, `d` along y, `h` up, its footprint centred on (x, y).
 * @param {{ x: number, y: number, w: number, d: number, h: number } & SolidStyle} o
 * @returns {Solid}
 */
export function box({ x, y, w, d, h, ...style }) {
	if (!(finite(w) && w > 0 && finite(d) && d > 0)) throw new Error("a box needs a positive width and depth");
	const hw = w / 2;
	const hd = d / 2;
	return prism({ points: [{ x: x - hw, y: y - hd }, { x: x + hw, y: y - hd }, { x: x + hw, y: y + hd }, { x: x - hw, y: y + hd }], h, ...style });
}

/**
 * A slab: a box that is thin (`h` default 0.25), for a floor or a platform.
 * @param {{ x: number, y: number, w: number, d: number, h?: number } & SolidStyle} o
 * @returns {Solid}
 */
export function slab({ h = 0.25, ...rest }) {
	return box({ h, ...rest });
}

/**
 * A box with rounded vertical corners: `w` along x, `d` along y, `h` up, its
 * footprint centred on (x, y), each corner an arc of `radius` sampled in
 * `segments` straight pieces (default 8). The sampled footprint is an ordinary
 * convex prism, so `orderSolids` orders it like any solid, but it is `smooth`:
 * its visible sides draw as one wall, outlined once, with no line per sample or
 * where an arc meets a straight side, however many segments there are. The wall
 * is shaded per arc and per straight side (its `groups`). A `radius` of 0 is a `box`; at most half of the shorter side.
 * @param {{ x: number, y: number, w: number, d: number, h: number, radius: number, segments?: number } & SolidStyle} o
 * @returns {Solid}
 */
export function roundedBox({ x, y, w, d, h, radius, segments = 8, ...style }) {
	if (!(finite(w) && w > 0 && finite(d) && d > 0)) throw new Error("a rounded box needs a positive width and depth");
	if (!finite(radius) || radius < 0 || radius > Math.min(w, d) / 2 + EPS) throw new Error(`a rounded box's radius must be from 0 to half its shorter side, got ${radius}`);
	if (!Number.isInteger(segments) || segments < 1) throw new Error(`a rounded box needs at least 1 segment per corner, got ${segments}`);
	if (radius <= EPS) return box({ x, y, w, d, h, ...style });
	const hw = w / 2;
	const hd = d / 2;
	// Counter-clockwise from the south-east corner. A vertex remembers the arcs it
	// ends or starts; one that two arcs share (the radius took the whole side
	// between them) is one vertex, so no zero-length edge is made.
	const corners = [
		{ cx: x + hw - radius, cy: y - hd + radius, from: -90 },
		{ cx: x + hw - radius, cy: y + hd - radius, from: 0 },
		{ cx: x - hw + radius, cy: y + hd - radius, from: 90 },
		{ cx: x - hw + radius, cy: y - hd + radius, from: 180 },
	];
	const same = (/** @type {{ x: number, y: number }} */ a, /** @type {{ x: number, y: number }} */ b) => Math.hypot(a.x - b.x, a.y - b.y) < EPS;
	const verts = /** @type {{ x: number, y: number, arcs: number[] }[]} */ ([]);
	for (const [k, c] of corners.entries()) {
		for (let j = 0; j <= segments; j++) {
			const [s, co] = sincos(c.from + (90 * j) / segments);
			const p = { x: c.cx + radius * co, y: c.cy + radius * s };
			const last = verts[verts.length - 1];
			if (last && same(p, last)) last.arcs.push(k);
			else verts.push({ ...p, arcs: [k] });
		}
	}
	if (same(verts[0], verts[verts.length - 1])) {
		const tail = /** @type {{ arcs: number[] }} */ (verts.pop());
		verts[0].arcs.push(...tail.arcs);
	}
	const points = verts.map(({ x, y }) => ({ x, y }));
	// An edge between two vertices of one arc belongs to that arc (arcs sharing an endpoint keep their own shading); any other is a straight side, its own group.
	const groups = verts.map((v, i) => {
		const w = verts[(i + 1) % verts.length];
		const shared = v.arcs.find((k) => w.arcs.includes(k));
		return shared === undefined ? 4 + i : shared;
	});
	return prism({ points, h, groups, smooth: true, ...style });
}

/**
 * A rounded slab: a `roundedBox` that is thin (`h` default 0.25), for a floor
 * or a platform with rounded corners.
 * @param {{ x: number, y: number, w: number, d: number, h?: number, radius: number, segments?: number } & SolidStyle} o
 * @returns {Solid}
 */
export function roundedSlab({ h = 0.25, ...rest }) {
	return roundedBox({ h, ...rest });
}

/**
 * The corners of a regular polygon of `n` sides and circumradius `r` centred on
 * (x, y), the first at `rotation` degrees from east: a footprint for `prism`.
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} n
 * @param {number} [rotation]
 * @returns {{ x: number, y: number }[]}
 */
export function regularPolygon(x, y, r, n, rotation = 0) {
	if (!Number.isInteger(n) || n < 3) throw new Error(`a regular polygon needs at least 3 sides, got ${n}`);
	return Array.from({ length: n }, (_, i) => {
		const [s, c] = sincos(rotation + (360 * i) / n);
		return { x: x + r * c, y: y + r * s };
	});
}

const EPS = 1e-9;

/* ------------------------------------------------------------ oriented solids */

const IDENTITY = Object.freeze({ m: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: Object.freeze({ x: 0, y: 0, z: 0 }) });

/**
 * A point of the solid's own frame in the world.
 * @param {Solid} s
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ x: number, y: number, z: number }}
 */
function place(s, x, y, z) {
	if (!s.pose) return { x, y, z };
	const { m, t } = s.pose;
	return { x: m[0] * x + m[1] * y + m[2] * z + t.x, y: m[3] * x + m[4] * y + m[5] * z + t.y, z: m[6] * x + m[7] * y + m[8] * z + t.z };
}

/**
 * A direction of the solid's own frame in the world (no translation).
 * @param {Solid} s
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ x: number, y: number, z: number }}
 */
function turn(s, x, y, z) {
	if (!s.pose) return { x, y, z };
	const m = s.pose.m;
	return { x: m[0] * x + m[1] * y + m[2] * z, y: m[3] * x + m[4] * y + m[5] * z, z: m[6] * x + m[7] * y + m[8] * z };
}

/**
 * `solid` turned by `deg` degrees about an axis through `about` (default the
 * world origin), in the world's frame, right-handed: a positive angle about
 * `"z"` turns east toward north, about `"x"` north toward up, about `"y"` up
 * toward east. `axis` is `"x"`, `"y"`, `"z"` or a direction `{ x, y, z }`. The
 * result is an oriented solid drawn, shaded and depth ordered like any other;
 * turn it again to compose (each turn is about a world axis), and `0` returns
 * the same solid (a solid with `top` throws at `0` too). To put a tilted solid somewhere, build it where it should
 * pivot and turn it about that point. Sines and cosines are exact at multiples of 90°. A solid with
 * `top` cannot be turned: tilted top content is unsupported (content on a plane is horizontal).
 * @param {Solid} solid
 * @param {{ axis: "x" | "y" | "z" | { x: number, y: number, z: number }, deg: number, about?: Point3 }} o
 * @returns {Solid}
 */
export function rotateSolid(solid, { axis, deg, about = { x: 0, y: 0, z: 0 } }) {
	if (!finite(deg)) throw new Error(`rotateSolid: deg must be a finite number of degrees, got ${deg}`);
	if (!about || !finite(about.x) || !finite(about.y) || !finite(about.z ?? 0)) throw new Error("rotateSolid: about must be a finite point { x, y, z }");
	const unit = { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };
	let k;
	if (typeof axis === "string") {
		if (!Object.hasOwn(unit, axis)) throw new Error(`rotateSolid: axis must be "x", "y", "z" or a direction { x, y, z }, got "${axis}"`);
		k = unit[/** @type {"x" | "y" | "z"} */ (axis)];
	} else {
		if (!axis || !finite(axis.x) || !finite(axis.y) || !finite(axis.z)) throw new Error("rotateSolid: axis must be a finite direction { x, y, z }");
		// Scale by the largest component first: a tiny or a huge direction is still a direction.
		const big = Math.max(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z));
		if (big === 0) throw new Error("rotateSolid: the axis has no direction");
		const [ux, uy, uz] = [axis.x / big, axis.y / big, axis.z / big];
		const len = Math.hypot(ux, uy, uz);
		k = { x: ux / len, y: uy / len, z: uz / len };
	}
	if (solid.top) throw new Error("rotateSolid: tilted top content is unsupported");
	if (deg === 0) return solid;
	const [s, c] = sincos(deg);
	const r = 1 - c;
	// Rodrigues: R = c·I + s·[k]× + (1 − c)·k·kᵀ
	const R = [c + k.x * k.x * r, k.x * k.y * r - k.z * s, k.x * k.z * r + k.y * s, k.y * k.x * r + k.z * s, c + k.y * k.y * r, k.y * k.z * r - k.x * s, k.z * k.x * r - k.y * s, k.z * k.y * r + k.x * s, c + k.z * k.z * r];
	const pose = solid.pose ?? IDENTITY;
	const m = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => R[3 * i] * pose.m[j] + R[3 * i + 1] * pose.m[3 + j] + R[3 * i + 2] * pose.m[6 + j]));
	const o = { x: about.x, y: about.y, z: about.z ?? 0 };
	const d = { x: pose.t.x - o.x, y: pose.t.y - o.y, z: pose.t.z - o.z };
	const t = { x: R[0] * d.x + R[1] * d.y + R[2] * d.z + o.x, y: R[3] * d.x + R[4] * d.y + R[5] * d.z + o.y, z: R[6] * d.x + R[7] * d.y + R[8] * d.z + o.z };
	if (![...m, t.x, t.y, t.z].every(finite)) throw new Error("rotateSolid: the turn overflows (the pivot or the solid's position is too far from the origin)");
	return Object.freeze({ ...solid, pose: Object.freeze({ m: /** @type {Pose["m"]} */ (Object.freeze(m)), t: Object.freeze(t) }) });
}

/**
 * @typedef {{ kind: "side" | "top", points: { x: number, y: number }[], shade: number, layers?: { points: { x: number, y: number }[], shade: number }[] }} Face
 */

/**
 * The faces of `solid` that face the camera, as screen polygons. Sides first,
 * then the top: they never overlap, since the solid is convex. Consecutive
 * visible edges of one group (`Solid.groups`) are one side face; without
 * groups each edge is its own. A `smooth` solid's visible sides are one face
 * whose `layers` are the groups, to shade apart.
 * @param {Solid} solid
 * @param {Camera} cam
 * @returns {Face[]}
 */
function visibleFaces(solid, cam) {
	const to = projector(cam);
	const [sa, ca] = sincos(cam.azimuth);
	const [se, ce] = sincos(cam.elevation);
	const faces = /** @type {Face[]} */ ([]);
	const pts = solid.points;
	const n = pts.length;
	/** How far a face turns from the light: its world normal's share along screen right, −1 (lit) to 1. A face is toward the camera when the normal's dot with the direction to it, (sin az·cos el, −cos az·cos el, sin el), is above 0. */
	const toward = (/** @type {{ x: number, y: number, z: number }} */ w) => (w.x * sa - w.y * ca) * ce + w.z * se;
	const shadeOf = (/** @type {number} */ t) => Math.round((0.1 + 0.16 * ((t + 1) / 2)) * 100) / 100;
	if (solid.z1 - solid.z0 > EPS) {
		// turn: −1 faces screen left (lit), 1 faces screen right; null for an edge turned away.
		const turns = pts.map((a, i) => {
			const b = pts[(i + 1) % n];
			const len = Math.hypot(b.x - a.x, b.y - a.y);
			const w = turn(solid, (b.y - a.y) / len, -(b.x - a.x) / len, 0);
			return toward(w) <= EPS ? null : w.x * ca + w.y * sa;
		});
		const groups = solid.groups ?? pts.map((_, i) => i);
		const wall = (/** @type {number} */ i) => (solid.smooth ? 0 : groups[i]);
		// Start the walk where a run can begin (a change of wall, or after a turned-away edge), so a run never straddles the start.
		let start = 0;
		for (let i = 0; i < n; i++) {
			const prev = (i + n - 1) % n;
			if (wall(i) !== wall(prev) || turns[prev] === null) {
				start = i;
				break;
			}
		}
		/** The side polygon over a run of consecutive edges, and its shade. */
		const side = (/** @type {number[]} */ edges) => {
			const chain = [...edges.map((i) => pts[i]), pts[(edges[edges.length - 1] + 1) % n]];
			const t = edges.reduce((sum, i) => sum + /** @type {number} */ (turns[i]), 0) / edges.length;
			return {
				points: [...chain.map((p) => to(place(solid, p.x, p.y, solid.z0))), ...chain.map((p) => to(place(solid, p.x, p.y, solid.z1))).reverse()],
				shade: shadeOf(t),
			};
		};
		/** @type {number[]} */
		let run = [];
		const flush = () => {
			if (!run.length) return;
			if (solid.smooth) {
				/** @type {number[][]} */
				const parts = [];
				for (const i of run) {
					const last = parts[parts.length - 1];
					if (last && groups[last[0]] === groups[i]) last.push(i);
					else parts.push([i]);
				}
				const layers = parts.map(side);
				faces.push({ kind: "side", ...side(run), layers });
			} else faces.push({ kind: "side", ...side(run) });
			run = [];
		};
		for (let k = 0; k < n; k++) {
			const i = (start + k) % n;
			if (turns[i] === null) flush();
			else if (run.length && wall(run[0]) !== wall(i)) {
				flush();
				run = [i];
			} else run.push(i);
		}
		flush();
	}
	// The cap at the top (the solid's own +z), drawn as a top; a tilted solid can show the one at the bottom instead, drawn as a side.
	const up = turn(solid, 0, 0, 1);
	const facing = toward(up);
	if (facing > EPS) faces.push({ kind: "top", points: pts.map((p) => to(place(solid, p.x, p.y, solid.z1))), shade: 0 });
	else if (facing < -EPS) faces.push({ kind: "side", points: pts.map((p) => to(place(solid, p.x, p.y, solid.z0))), shade: shadeOf(-(up.x * ca + up.y * sa)) });
	return faces;
}

/** @param {{ x: number, y: number }[]} points */
const pathD = (points) => `${points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join(" ")} Z`;

/**
 * Markup of one solid under a camera: only the faces that face the camera,
 * each a path in its token, the sides with a shade layer. Nothing is drawn for
 * a solid with zero opacity. A solid's `top` content is drawn over its top face,
 * so it is ordered with the solid like any of its faces.
 * @param {Solid} solid
 * @param {Camera} cam
 * @returns {string}
 */
export function drawSolid(solid, cam) {
	const paths = visibleFaces(solid, cam).map((face) => {
		const d = pathD(face.points);
		const base = el("path", { d, fill: tok(face.kind === "top" ? solid.fill : solid.sides), stroke: tok(solid.stroke), "stroke-width": solid.strokeWidth, "stroke-linejoin": "round" });
		if (face.kind === "top" || !solid.shade) return base;
		// A smooth wall is shaded by its layers, unstroked, so no line shows where they meet.
		const layers = face.layers ?? [face];
		return base + layers.map((l) => el("path", { d: pathD(l.points), fill: tok(/** @type {string} */ (solid.shade)), opacity: l.shade })).join("");
	});
	const [se] = sincos(cam.elevation);
	const top = solid.top && se > EPS ? drawOnPlane(cam, topPlane(solid), solid.top.markup, solid.top.opacity ?? 1) : "";
	return fade(solid.opacity, solid.id ? { "data-solid": solid.id } : {}, ...paths, top);
}

/**
 * Whether the solids can be told apart in depth on the screen: the bounding
 * boxes of their projections overlap.
 * @param {{ min: { x: number, y: number }, max: { x: number, y: number } }} a
 * @param {{ min: { x: number, y: number }, max: { x: number, y: number } }} b
 */
const screenOverlap = (a, b) => a.min.x < b.max.x - EPS && b.min.x < a.max.x - EPS && a.min.y < b.max.y - EPS && b.min.y < a.max.y - EPS;

/**
 * Which of two solids is drawn first, by the axes that separate them: -1 when
 * `a` lies behind `b`, 1 when it lies in front, 0 when no axis, or two that
 * disagree, decide (the solids then cannot hide one another).
 * @param {Solid} a
 * @param {Solid} b
 * @param {number} sa sin of the azimuth
 * @param {number} ca cos of the azimuth
 * @param {number} se sin of the elevation
 * @returns {-1 | 0 | 1}
 */
function behind(a, b, sa, ca, se) {
	let vote = 0;
	let conflict = false;
	/** @param {-1 | 1} v */
	const cast = (v) => {
		if (vote !== 0 && vote !== v) conflict = true;
		vote = v;
	};
	// Footprints: a separating line between two convex polygons lies along an edge of one.
	for (const poly of [a.points, b.points]) {
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i];
			const q = poly[(i + 1) % poly.length];
			const len = Math.hypot(q.x - p.x, q.y - p.y);
			const nx = (q.y - p.y) / len;
			const ny = -(q.x - p.x) / len;
			const range = (/** @type {Solid} */ s) => {
				const d = s.points.map((pt) => pt.x * nx + pt.y * ny);
				return [Math.min(...d), Math.max(...d)];
			};
			const [a0, a1] = range(a);
			const [b0, b1] = range(b);
			const facing = nx * sa - ny * ca; // how much this axis points toward the camera
			if (Math.abs(facing) <= EPS) continue;
			if (a1 <= b0 + EPS) cast(facing > 0 ? -1 : 1); // b is on the positive side
			else if (b1 <= a0 + EPS) cast(facing > 0 ? 1 : -1);
		}
	}
	// Heights: from above, the higher solid is nearer.
	if (se > EPS) {
		if (a.z1 <= b.z0 + EPS) cast(-1);
		else if (b.z1 <= a.z0 + EPS) cast(1);
	}
	return conflict ? 0 : vote === 0 ? 0 : /** @type {-1 | 1} */ (vote);
}

/**
 * What a separating-axis test needs of an oriented solid, in the world: its
 * corners, its face normals and its edge directions (unit vectors).
 * @param {Solid} s
 * @returns {{ corners: { x: number, y: number, z: number }[], normals: { x: number, y: number, z: number }[], edges: { x: number, y: number, z: number }[] }}
 */
function hull(s) {
	const corners = s.points.flatMap((p) => [place(s, p.x, p.y, s.z0), place(s, p.x, p.y, s.z1)]);
	const up = turn(s, 0, 0, 1);
	const normals = [up];
	const edges = [up];
	for (const [i, a] of s.points.entries()) {
		const b = s.points[(i + 1) % s.points.length];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		edges.push(turn(s, (b.x - a.x) / len, (b.y - a.y) / len, 0));
		normals.push(turn(s, (b.y - a.y) / len, -(b.x - a.x) / len, 0));
	}
	return { corners, normals, edges };
}

/**
 * `behind` for solids of which one is oriented. If two convex solids can be
 * separated by a plane, one lies along a face of one of them or along an edge
 * of each (the separating-axis test), so those are the axes tried. The solid on
 * the camera's side of a separating plane is in front. Solids that touch along
 * a face or an edge are separated by that contact; `0` when no plane separates
 * them (they pass through each other) or two disagree.
 * @param {ReturnType<typeof hull>} a
 * @param {ReturnType<typeof hull>} b
 * @param {{ x: number, y: number, z: number }} toCam the direction to the camera
 * @returns {-1 | 0 | 1}
 */
function behindOriented(a, b, toCam) {
	let vote = 0;
	let conflict = false;
	/** @type {Set<string>} */
	const tried = new Set();
	/** @param {{ x: number, y: number, z: number }} v a direction, not necessarily a unit one */
	const axis = (v) => {
		const len = Math.hypot(v.x, v.y, v.z);
		if (len < 1e-12) return; // two parallel edges (a smaller cross product is still a direction)
		const [x, y, z] = [v.x / len, v.y / len, v.z / len];
		const flip = x < -1e-9 || (Math.abs(x) <= 1e-9 && (y < -1e-9 || (Math.abs(y) <= 1e-9 && z < 0))) ? -1 : 1;
		const key = [x, y, z].map((c) => Math.round(c * flip * 1e12) + 0).join(","); // only axes equal to rounding noise are one
		if (tried.has(key)) return;
		tried.add(key);
		const facing = (x * toCam.x + y * toCam.y + z * toCam.z) * flip;
		if (Math.abs(facing) <= EPS) return;
		const range = (/** @type {{ x: number, y: number, z: number }[]} */ pts) => {
			const d = pts.map((p) => (p.x * x + p.y * y + p.z * z) * flip);
			return [Math.min(...d), Math.max(...d)];
		};
		const [a0, a1] = range(a.corners);
		const [b0, b1] = range(b.corners);
		/** @type {-1 | 1 | 0} */
		let v2 = 0;
		// a contact that rounds across the plane (by a few ulps of the coordinates) is still a contact
		const tol = 1e-12 * Math.max(1, Math.abs(a0), Math.abs(a1), Math.abs(b0), Math.abs(b1));
		const aFirst = a1 <= b0 + tol; // b is on the positive side
		const bFirst = b1 <= a0 + tol;
		const ulp = 1e-14 * Math.max(1, Math.abs(a0), Math.abs(a1), Math.abs(b0), Math.abs(b1));
		let first = aFirst ? (bFirst ? 0 : 1) : bFirst ? 2 : 0;
		if (aFirst && bFirst) {
			// both fit (flat solids in one plane): no order unless one gap is reliably positive, and then that one decides
			const [ga, gb] = [b0 - a1, a0 - b1];
			first = ga > ulp && gb <= ulp ? 1 : gb > ulp && ga <= ulp ? 2 : 0;
		}
		if (first === 1) v2 = facing > 0 ? -1 : 1;
		else if (first === 2) v2 = facing > 0 ? 1 : -1;
		if (v2 === 0) return;
		if (vote !== 0 && vote !== v2) conflict = true;
		vote = v2;
	};
	for (const v of [...a.normals, ...b.normals]) axis(v);
	for (const u of a.edges) {
		for (const w of b.edges) axis({ x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x });
	}
	return conflict ? 0 : /** @type {-1 | 0 | 1} */ (vote);
}

/**
 * The solids in drawing order, farthest first, for `cam`. Two upright solids
 * are ordered by the axes that separate them (footprint edges and height); a
 * pair with a tilted solid by its face normals and the cross products of edge
 * directions. Either way only when they overlap on the screen; the rest is a topological sort, ties and
 * cycles broken by how near each solid's centre is, then by input order. The
 * same input always gives the same order.
 * @template {Solid} S
 * @param {S[]} solids
 * @param {Camera} cam
 * @returns {S[]}
 */
export function orderSolids(solids, cam) {
	const to = projector(cam);
	const [sa, ca] = sincos(cam.azimuth);
	const [se, ce] = sincos(cam.elevation);
	const toCam = { x: sa * ce, y: -ca * ce, z: se };
	const info = solids.map((s) => {
		const corners = s.points.flatMap((p) => [to(place(s, p.x, p.y, s.z0)), to(place(s, p.x, p.y, s.z1))]);
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const cx = s.points.reduce((n, p) => n + p.x, 0) / s.points.length;
		const cy = s.points.reduce((n, p) => n + p.y, 0) / s.points.length;
		return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) }, near: to(place(s, cx, cy, (s.z0 + s.z1) / 2)).depth };
	});
	/** @type {(ReturnType<typeof hull> | undefined)[]} */
	const hulls = [];
	const hullOf = (/** @type {number} */ i) => (hulls[i] ??= hull(solids[i]));
	const after = solids.map(() => /** @type {number[]} */ ([])); // after[i]: drawn after i
	const waiting = solids.map(() => 0);
	for (let i = 0; i < solids.length; i++) {
		for (let j = i + 1; j < solids.length; j++) {
			if (!screenOverlap(info[i], info[j])) continue;
			const order = solids[i].pose || solids[j].pose ? behindOriented(hullOf(i), hullOf(j), toCam) : behind(solids[i], solids[j], sa, ca, se);
			if (order === 0) continue;
			const [first, second] = order < 0 ? [i, j] : [j, i];
			after[first].push(second);
			waiting[second]++;
		}
	}
	const done = solids.map(() => false);
	const out = /** @type {S[]} */ ([]);
	/** @param {number} i @param {number} j */
	const nearer = (i, j) => info[i].near < info[j].near - EPS || (Math.abs(info[i].near - info[j].near) <= EPS && i < j);
	while (out.length < solids.length) {
		let pick = -1;
		for (let i = 0; i < solids.length; i++) if (!done[i] && waiting[i] === 0 && (pick < 0 || nearer(i, pick))) pick = i;
		if (pick < 0) for (let i = 0; i < solids.length; i++) if (!done[i] && (pick < 0 || nearer(i, pick))) pick = i; // a cycle
		done[pick] = true;
		out.push(solids[pick]);
		for (const next of after[pick]) waiting[next]--;
	}
	return out;
}

/**
 * Markup of several solids, depth ordered for `cam`.
 * @param {Solid[]} solids
 * @param {Camera} cam
 * @returns {string}
 */
export function drawSolids(solids, cam) {
	return orderSolids(solids, cam)
		.map((s) => drawSolid(s, cam))
		.join("");
}

/* ------------------------------------------------- content on a horizontal plane */

/**
 * 2D content for the top face of a solid. `markup` is ordinary SVG drawn in
 * its own `view` (`{ width, height }`: the content's own units, origin at its
 * top left, y down, so an icon on a 24 × 24 grid has the view 24 × 24); the view
 * is fitted into the footprint's bounding box, centred, its aspect kept, less
 * `inset` world units on every side. Stroke widths and font sizes are in the
 * content's own units too. Colours are tokens, as anywhere.
 * @typedef {{ markup: string, view: { width: number, height: number }, inset?: number, opacity?: number }} TopContent
 */

/**
 * A horizontal plane to draw 2D content on: a rectangle of `w` (east) by `d`
 * (north) world units centred on (`x`, `y`) at height `z`, and the `view` the
 * content is drawn in. The view is fitted into the rectangle, centred, its
 * aspect kept.
 * @typedef {{ x: number, y: number, z?: number, w: number, d: number, view: { width: number, height: number } }} Plane
 */

/**
 * @param {TopContent} top
 * @returns {TopContent}
 */
function checkTop(top) {
	if (typeof top.markup !== "string") throw new Error("a solid's top content needs markup, a string of SVG");
	if (!top.view || !(finite(top.view.width) && top.view.width > 0 && finite(top.view.height) && top.view.height > 0)) throw new Error("a solid's top content needs a view { width, height } above 0");
	if (top.inset !== undefined && (!finite(top.inset) || top.inset < 0)) throw new Error(`a solid's top content inset must be 0 or more, got ${top.inset}`);
	return { markup: top.markup, view: { width: top.view.width, height: top.view.height }, inset: top.inset ?? 0, opacity: top.opacity ?? 1 };
}

/**
 * The plane of a solid's top face: its footprint's bounding box, less the inset.
 * @param {Solid} solid
 * @returns {Plane}
 */
function topPlane(solid) {
	const top = /** @type {Required<TopContent>} */ (solid.top);
	const xs = solid.points.map((p) => p.x);
	const ys = solid.points.map((p) => p.y);
	const w = Math.max(...xs) - Math.min(...xs) - 2 * top.inset;
	const d = Math.max(...ys) - Math.min(...ys) - 2 * top.inset;
	if (!(w > 0 && d > 0)) throw new Error("a solid's top content inset leaves no room");
	return { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z: solid.z1, w, d, view: top.view };
}

/**
 * The affine transform `[a, b, c, d, e, f]` (SVG `matrix`) that takes a plane's
 * own coordinates to the screen under `cam`: (0, 0) is the view's top left
 * (the plane's north-west corner), x runs east, y runs south. It is linear in
 * the camera, so it follows a `lerpCamera` swivel. Content on a plane at 90°
 * elevation is the same picture, scaled and panned; seen edge on (0°
 * elevation) the plane has no area and the matrix is singular.
 * @param {Camera} cam
 * @param {Plane} plane
 * @returns {[number, number, number, number, number, number]}
 */
export function planeMatrix(cam, { x, y, z = 0, w, d, view }) {
	if (!(finite(x) && finite(y) && finite(z))) throw new Error("a plane needs a finite position");
	if (!(finite(w) && w > 0 && finite(d) && d > 0)) throw new Error("a plane needs a positive width and depth");
	if (!view || !(finite(view.width) && view.width > 0 && finite(view.height) && view.height > 0)) throw new Error("a plane needs a view { width, height } above 0");
	const k = Math.min(w / view.width, d / view.height); // world units per view unit
	const x0 = x - (view.width * k) / 2;
	const y0 = y + (view.height * k) / 2;
	const to = projector(cam);
	const o = to({ x: x0, y: y0, z });
	const ex = to({ x: x0 + k, y: y0, z });
	const ey = to({ x: x0, y: y0 - k, z });
	return [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y, o.x, o.y];
}

/**
 * 2D `markup` drawn on a horizontal plane: the markup wrapped in the plane's
 * transform (`planeMatrix`), so it follows the camera. Draw it right after the
 * solid it sits on (or give the solid a `top`, which does so inside the solid's
 * depth order); nothing is drawn when the plane is edge on or `opacity` is 0.
 * @param {Camera} cam
 * @param {Plane} plane
 * @param {string} markup
 * @param {number} [opacity]
 * @returns {string}
 */
export function drawOnPlane(cam, plane, markup, opacity = 1) {
	const m = planeMatrix(cam, plane);
	// Edge on: the two axes are parallel on the screen, whatever the scale of the view.
	if (Math.abs(m[0] * m[3] - m[1] * m[2]) <= 1e-9 * Math.hypot(m[0], m[1]) * Math.hypot(m[2], m[3])) return "";
	// What is serialised must not be singular either: a view so large that the scale rounds to 0 draws a point, so nothing.
	const r = m.map((v) => Number(num(v, 4)));
	if (r[0] * r[3] - r[1] * r[2] === 0) return "";
	return fade(opacity, { transform: `matrix(${r.map((v) => num(v, 4)).join(" ")})` }, markup);
}

/* ------------------------------------------------------------ grid backdrop */

/**
 * A backdrop of diamonds: grid lines every `step` world units along x and y in
 * the floor plane at height `z`, out to `radius` from (`x`, `y`) (a segment of
 * one `step` is kept when its middle is inside, so the edge is ragged: an end
 * can lie up to half a step beyond `radius`), fading out
 * radially, so it follows the camera (diamonds in isometric, squares in plan).
 * The fade is `bands` steps of opacity, one `<path>` each, so the markup stays
 * small and needs no gradient or id; the lines are `stroke` (a token) at up to
 * `opacity`. Static: nothing moves while a step rests. Draw it first, under the
 * solids; it has no depth and is never above one.
 * @param {Camera} cam
 * @param {{ radius: number, step?: number, x?: number, y?: number, z?: number, stroke?: string, strokeWidth?: number, opacity?: number, bands?: number }} o
 * @returns {string}
 */
export function drawGrid(cam, { radius, step = 1, x = 0, y = 0, z = 0, stroke = "line", strokeWidth = 1, opacity = 0.5, bands = 6 }) {
	if (!(finite(radius) && radius > 0)) throw new Error(`a grid's radius must be above 0, got ${radius}`);
	if (!(finite(step) && step > 0)) throw new Error(`a grid's step must be above 0, got ${step}`);
	if (!(Number.isInteger(bands) && bands >= 1 && bands <= 64)) throw new Error(`a grid needs from 1 to 64 bands, got ${bands}`);
	if (!(finite(x) && finite(y) && finite(z))) throw new Error("a grid needs a finite centre");
	const colour = tok(token(stroke));
	const to = projector(cam);
	const cells = Math.ceil(radius / step);
	if (cells > 200) throw new Error(`a grid of ${2 * cells} lines each way is too many: raise the step or lower the radius`);
	// The band of the segment centred (cx, cy): from the edge in to the centre, or -1 outside.
	const band = (/** @type {number} */ cx, /** @type {number} */ cy) => {
		const f = 1 - Math.hypot(cx, cy) / radius;
		return f <= 0 ? -1 : Math.min(bands - 1, Math.floor(f * bands));
	};
	const d = /** @type {string[]} */ (Array.from({ length: bands }, () => ""));
	/** Add the segments of one line, joining neighbours of one band into one stroke. */
	const line = (/** @type {number} */ fixed, /** @type {boolean} */ alongX) => {
		/** @type {{ b: number, from: number, to: number } | null} */
		let run = null;
		const emit = () => {
			if (!run) return;
			const a = alongX ? to({ x: x + run.from, y: y + fixed, z }) : to({ x: x + fixed, y: y + run.from, z });
			const b = alongX ? to({ x: x + run.to, y: y + fixed, z }) : to({ x: x + fixed, y: y + run.to, z });
			d[run.b] += `M${num(a.x)} ${num(a.y)}L${num(b.x)} ${num(b.y)}`;
			run = null;
		};
		for (let j = -cells; j < cells; j++) {
			const from = j * step;
			const b = alongX ? band(from + step / 2, fixed) : band(fixed, from + step / 2);
			if (b < 0) emit();
			else if (run && run.b === b) run.to = from + step;
			else {
				emit();
				run = { b, from, to: from + step };
			}
		}
		emit();
	};
	for (let i = -cells; i <= cells; i++) {
		line(i * step, true);
		line(i * step, false);
	}
	// The faintest ring first, so the brighter ones are over it where they meet.
	return d
		.map((path, b) => (path ? el("path", { d: path, fill: "none", stroke: colour, "stroke-width": strokeWidth, opacity: opacity * ((b + 1) / bands) }) : ""))
		.join("");
}

/* ----------------------------------------------------------- label anchors */

/**
 * What the gate checks of a label: its box in the picture (top left, size), its
 * stem, and whether it is drawn (`opacity` above 0).
 * @typedef {{ id: string, x: number, y: number, width: number, height: number, stem?: { x1: number, y1: number, x2: number, y2: number }, opacity?: number }} LabelBox
 */

/** The line height of a label, as a multiple of its font size. */
const LINE_HEIGHT = 1.25;

/**
 * The size of a label box: the longest line plus `padX` on each side, wide, and
 * the lines at `LINE_HEIGHT` plus 5 px above and below.
 * @param {string} id
 * @param {string[]} lines
 * @param {number} fontSize
 * @param {number} padX
 * @returns {{ width: number, height: number }}
 */
function labelSize(id, lines, fontSize, padX) {
	if (!lines.length) throw new Error(`label "${id}" has no text`);
	return { width: Math.max(...lines.map((l) => estimateWidth(l, fontSize * 1.08))) + 2 * padX, height: lines.length * LINE_HEIGHT * fontSize + 2 * 5 };
}

/**
 * A label on a point of the world, with a stem: a dot on the point, a vertical
 * stem `lift` pixels up, and the label's box at its top, placed in the
 * projected view, so it follows the camera. `side` puts the box above the
 * stem (`"up"`, centred), or beside its top (`"right"` or `"left"`).
 * `lines` are the label's (already wrapped, localized) lines. Returns the
 * markup and the box for the scene's `labelBoxes`.
 * @param {Camera} cam
 * @param {{ id: string, at: Point3, lines: string[], fontSize?: number, lift?: number, side?: "up" | "right" | "left", opacity?: number }} o
 * @returns {{ markup: string, box: LabelBox }}
 */
export function labelAnchor(cam, { id, at, lines, fontSize = 14, lift = 40, side = "up", opacity = 1 }) {
	const p = project(cam, at);
	const { width, height } = labelSize(id, lines, fontSize, 8);
	const tipX = p.x;
	const tipY = p.y - lift;
	const x = side === "up" ? tipX - width / 2 : side === "right" ? tipX : tipX - width;
	const y = side === "up" ? tipY - height : tipY - height / 2;
	const stem = { x1: p.x, y1: p.y, x2: tipX, y2: tipY };
	const r = drawn2;
	const labelBox = { id, x: r(x), y: r(y), width: r(width), height: r(height), stem: { x1: r(stem.x1), y1: r(stem.y1), x2: r(stem.x2), y2: r(stem.y2) }, opacity };
	const markup = fade(
		opacity,
		{ "data-label": id },
		el("line", { x1: stem.x1, y1: stem.y1, x2: stem.x2, y2: stem.y2, stroke: tok("line"), "stroke-width": 1.5 }),
		el("circle", { cx: p.x, cy: p.y, r: 3.5, fill: tok("ink"), stroke: tok("bg"), "stroke-width": 1.5 }),
		el("rect", { x, y, width, height, rx: 6, fill: tok("surface"), stroke: tok("line"), "stroke-width": 1.5 }),
		text({ x: x + width / 2, y: y + height / 2, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fontSize, "font-weight": 600, fill: tok("ink") }, lines, LINE_HEIGHT),
	);
	return { markup, box: labelBox };
}

/** A coordinate as the SVG attributes draw it: rounded to two decimals, which is what the gate checks. */
const drawn2 = (/** @type {number} */ n) => Number(num(n));

/**
 * A pill: a stemless tag, a rounded box of text centred on the screen point
 * (`x`, `y`), for the tags and badges that stand on their own. Its `box` goes
 * to the scene's `labelBoxes` with the other labels, so the gate checks that
 * it overlaps none and stays in the picture. To pin it to a point of the world,
 * pass the projected point (`project(cam, at)`) with an offset. `fill`,
 * `stroke` and `ink` are tokens (`ink` the text's: pick one that reads on
 * `fill`, e.g. `onAccent` on `accent`). `lines` are already wrapped and
 * localized, ≥ 14 px.
 * @param {{ id: string, x: number, y: number, lines: string[], fontSize?: number, fill?: string, stroke?: string, ink?: string, opacity?: number }} o
 * @returns {{ markup: string, box: LabelBox }}
 */
export function labelPill({ id, x, y, lines, fontSize = 14, fill = "surface", stroke = "line", ink = "ink", opacity = 1 }) {
	if (!(finite(x) && finite(y))) throw new Error(`pill "${id}" needs a finite position`);
	const { width, height } = labelSize(id, lines, fontSize, 12);
	const left = x - width / 2;
	const top = y - height / 2;
	const markup = fade(
		opacity,
		{ "data-label": id },
		el("rect", { x: left, y: top, width, height, rx: height / 2, fill: tok(token(fill)), stroke: tok(token(stroke)), "stroke-width": 1.5 }),
		text({ x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fontSize, "font-weight": 600, fill: tok(token(ink)) }, lines, LINE_HEIGHT),
	);
	return { markup, box: { id, x: drawn2(left), y: drawn2(top), width: drawn2(width), height: drawn2(height), opacity } };
}

/**
 * Whether the segment crosses the rectangle (Liang–Barsky).
 * @param {{ x1: number, y1: number, x2: number, y2: number }} s
 * @param {{ x: number, y: number, width: number, height: number }} r
 */
function segmentHits(s, r) {
	let t0 = 0;
	let t1 = 1;
	const dx = s.x2 - s.x1;
	const dy = s.y2 - s.y1;
	for (const [p, q] of [[-dx, s.x1 - r.x], [dx, r.x + r.width - s.x1], [-dy, s.y1 - r.y], [dy, r.y + r.height - s.y1]]) {
		if (p === 0) {
			if (q < 0) return false;
		} else {
			const k = q / p;
			if (p < 0) t0 = Math.max(t0, k);
			else t1 = Math.min(t1, k);
			if (t0 > t1) return false;
		}
	}
	return true;
}

/**
 * What is wrong with a set of drawn labels: two boxes closer than `gap`
 * pixels (overlapping), a stem running through another label, a box outside
 * the picture. Boxes with `opacity` 0 are not drawn and are skipped. Each
 * problem is one sentence, and a repeated sentence is reported once; none for
 * a clean set. It stops at `limit` problems (default: all; 0 returns none; a
 * `limit` that is not a whole number from 0 or Infinity throws `RangeError`), so collection ends once it has
 * that many; the collision scan can end early, after the boxes are filtered and indexed. Sentences in `ignore` are skipped
 * and do not count towards the limit.
 * @param {LabelBox[]} boxes
 * @param {{ width: number, height: number, gap?: number, limit?: number, ignore?: Set<string> }} view the picture's size
 * @returns {string[]}
 */
export function labelProblems(boxes, { width, height, gap = 4, limit = Infinity, ignore }) {
	if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) throw new RangeError(`labelProblems: limit must be a whole number from 0, or Infinity, got ${typeof limit === "number" ? limit : `a value of type ${typeof limit}`}`);
	if (limit === 0) return [];
	const eps = 1e-9; // rounded box edges that meet exactly must not fail on float noise
	// Drawn unless it fades out: `fade` drops an element whose opacity rounds to 0.
	// Exact copies (same id, geometry and stem coordinates) all say the same sentences, and two
	// of them already report an overlap with each other, so a third adds nothing:
	// keep two, which bounds the work on a scene that repeats one box thousands of times.
	/** @type {Map<string, number>} */
	const copies = new Map();
	const drawn = boxes.filter((b) => {
		if (b.opacity !== undefined && Math.round(b.opacity * 1000) <= 0) return false;
		const key = JSON.stringify([b.id, b.x, b.y, b.width, b.height, b.stem && [b.stem.x1, b.stem.y1, b.stem.x2, b.stem.y2]]);
		const n = (copies.get(key) ?? 0) + 1;
		copies.set(key, n);
		return n <= 2;
	});
	/** @type {string[]} */
	const problems = [];
	/** @type {Set<string>} */
	const found = new Set();
	/** @param {string} message @returns {boolean} whether the limit is reached */
	const add = (message) => {
		if (ignore?.has(message) || found.has(message)) return false;
		found.add(message);
		return problems.push(message) >= limit;
	};
	for (const [i, a] of drawn.entries()) {
		if ((a.x < -eps || a.y < -eps || a.x + a.width > width + eps || a.y + a.height > height + eps) && add(`label "${a.id}" is outside the picture`)) return problems;
		for (let j = i + 1; j < drawn.length; j++) {
			const b = drawn[j];
			if (a.x < b.x + b.width + gap - eps && b.x < a.x + a.width + gap - eps && a.y < b.y + b.height + gap - eps && b.y < a.y + a.height + gap - eps && add(`labels "${a.id}" and "${b.id}" overlap`)) return problems;
		}
		for (const b of drawn) {
			if (b !== a && b.stem && segmentHits(b.stem, a) && add(`the stem of label "${b.id}" crosses label "${a.id}"`)) return problems;
		}
	}
	return problems;
}
