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
	const r = ((deg % 360) + 360) % 360;
	if (r % 90 === 0) return /** @type {[number, number]} */ ([[0, 1], [1, 0], [0, -1], [-1, 0]][r / 90]);
	const rad = (deg * Math.PI) / 180;
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
 * null` leaves them flat. `stroke` outlines every face.
 * @typedef {Readonly<{ points: { x: number, y: number }[], z0: number, z1: number, fill: string, sides: string, shade: string | null, stroke: string, strokeWidth: number, opacity: number, id?: string }>} Solid
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
 * convex polygon.
 * @param {{ x: number, y: number }[]} points
 * @returns {{ x: number, y: number }[]}
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
	const ccw = area > 0 ? points.map((p) => ({ x: p.x, y: p.y })) : points.map((p) => ({ x: p.x, y: p.y })).reverse();
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
	return ccw;
}

/**
 * A prism: `points` extruded by `h` from the base height `z`.
 * @param {{ points: { x: number, y: number }[], h: number, z?: number, fill?: string, sides?: string, shade?: string | null, stroke?: string, strokeWidth?: number, opacity?: number, id?: string }} o
 * @returns {Solid}
 */
export function prism({ points, h, z = 0, fill = "surface", sides, shade = "ink", stroke = "line", strokeWidth = 1.5, opacity = 1, id }) {
	if (!finite(h) || h < 0) throw new Error(`a solid's height must be a number from 0 up, got ${h}`);
	if (!finite(z)) throw new Error(`a solid's base height must be finite, got ${z}`);
	return Object.freeze({
		points: convexCcw(points),
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

/** @typedef {Omit<Parameters<typeof prism>[0], "points" | "h">} SolidStyle */

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

/**
 * The faces of `solid` that face the camera, as screen polygons. Sides first,
 * then the top: they never overlap, since the solid is convex.
 * @param {Solid} solid
 * @param {Camera} cam
 * @returns {{ kind: "side" | "top", points: { x: number, y: number }[], shade: number }[]}
 */
function visibleFaces(solid, cam) {
	const to = projector(cam);
	const [sa, ca] = sincos(cam.azimuth);
	const [se, ce] = sincos(cam.elevation);
	const faces = /** @type {{ kind: "side" | "top", points: { x: number, y: number }[], shade: number }[]} */ ([]);
	const pts = solid.points;
	if (solid.z1 - solid.z0 > EPS) {
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % pts.length];
			const len = Math.hypot(b.x - a.x, b.y - a.y);
			const nx = (b.y - a.y) / len;
			const ny = -(b.x - a.x) / len;
			// Toward the camera, horizontally, is (sin az, −cos az).
			if ((nx * sa - ny * ca) * ce <= EPS) continue;
			const turn = nx * ca + ny * sa; // −1 faces screen left (lit), 1 faces screen right
			faces.push({
				kind: "side",
				points: [to({ ...a, z: solid.z0 }), to({ ...b, z: solid.z0 }), to({ ...b, z: solid.z1 }), to({ ...a, z: solid.z1 })],
				shade: Math.round((0.1 + 0.16 * ((turn + 1) / 2)) * 100) / 100,
			});
		}
	}
	if (se > EPS) faces.push({ kind: "top", points: pts.map((p) => to({ ...p, z: solid.z1 })), shade: 0 });
	return faces;
}

/** @param {{ x: number, y: number }[]} points */
const pathD = (points) => `${points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join(" ")} Z`;

/**
 * Markup of one solid under a camera: only the faces that face the camera,
 * each a path in its token, the sides with a shade layer. Nothing is drawn for
 * a solid with zero opacity.
 * @param {Solid} solid
 * @param {Camera} cam
 * @returns {string}
 */
export function drawSolid(solid, cam) {
	const paths = visibleFaces(solid, cam).map((face) => {
		const d = pathD(face.points);
		const base = el("path", { d, fill: tok(face.kind === "top" ? solid.fill : solid.sides), stroke: tok(solid.stroke), "stroke-width": solid.strokeWidth, "stroke-linejoin": "round" });
		return face.kind === "side" && solid.shade ? base + el("path", { d, fill: tok(solid.shade), opacity: face.shade }) : base;
	});
	return fade(solid.opacity, solid.id ? { "data-solid": solid.id } : {}, ...paths);
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
 * The solids in drawing order, farthest first, for `cam`. Two solids are
 * ordered by the axes that separate them (footprint edges and height), only
 * when they overlap on the screen; the rest is a topological sort, ties and
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
	const [se] = sincos(cam.elevation);
	const info = solids.map((s) => {
		const corners = s.points.flatMap((p) => [to({ ...p, z: s.z0 }), to({ ...p, z: s.z1 })]);
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const cx = s.points.reduce((n, p) => n + p.x, 0) / s.points.length;
		const cy = s.points.reduce((n, p) => n + p.y, 0) / s.points.length;
		return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) }, near: to({ x: cx, y: cy, z: (s.z0 + s.z1) / 2 }).depth };
	});
	const after = solids.map(() => /** @type {number[]} */ ([])); // after[i]: drawn after i
	const waiting = solids.map(() => 0);
	for (let i = 0; i < solids.length; i++) {
		for (let j = i + 1; j < solids.length; j++) {
			if (!screenOverlap(info[i], info[j])) continue;
			const order = behind(solids[i], solids[j], sa, ca, se);
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

/* ----------------------------------------------------------- label anchors */

/**
 * What the gate checks of a label: its box in the picture (top left, size), its
 * stem, and whether it is drawn (`opacity` above 0).
 * @typedef {{ id: string, x: number, y: number, width: number, height: number, stem?: { x1: number, y1: number, x2: number, y2: number }, opacity?: number }} LabelBox
 */

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
	if (!lines.length) throw new Error(`label "${id}" has no text`);
	const p = project(cam, at);
	const padX = 8;
	const padY = 5;
	const lineHeight = 1.25;
	const width = Math.max(...lines.map((l) => estimateWidth(l, fontSize * 1.08))) + 2 * padX;
	const height = lines.length * lineHeight * fontSize + 2 * padY;
	const tipX = p.x;
	const tipY = p.y - lift;
	const x = side === "up" ? tipX - width / 2 : side === "right" ? tipX : tipX - width;
	const y = side === "up" ? tipY - height : tipY - height / 2;
	const stem = { x1: p.x, y1: p.y, x2: tipX, y2: tipY };
	// The gate checks what the SVG draws, and the attributes round to two decimals.
	const r = (/** @type {number} */ n) => Number(num(n));
	const labelBox = { id, x: r(x), y: r(y), width: r(width), height: r(height), stem: { x1: r(stem.x1), y1: r(stem.y1), x2: r(stem.x2), y2: r(stem.y2) }, opacity };
	const markup = fade(
		opacity,
		{ "data-label": id },
		el("line", { x1: stem.x1, y1: stem.y1, x2: stem.x2, y2: stem.y2, stroke: tok("line"), "stroke-width": 1.5 }),
		el("circle", { cx: p.x, cy: p.y, r: 3.5, fill: tok("ink"), stroke: tok("bg"), "stroke-width": 1.5 }),
		el("rect", { x, y, width, height, rx: 6, fill: tok("surface"), stroke: tok("line"), "stroke-width": 1.5 }),
		text({ x: x + width / 2, y: y + height / 2, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fontSize, "font-weight": 600, fill: tok("ink") }, lines, lineHeight),
	);
	return { markup, box: labelBox };
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
 * problem is one sentence; none for a clean set. It stops at `limit` problems
 * (default: all), so a scene with thousands of colliding labels costs no more
 * than the first few.
 * @param {LabelBox[]} boxes
 * @param {{ width: number, height: number, gap?: number, limit?: number }} view the picture's size
 * @returns {string[]}
 */
export function labelProblems(boxes, { width, height, gap = 4, limit = Infinity }) {
	const eps = 1e-9; // rounded box edges that meet exactly must not fail on float noise
	// Drawn unless it fades out: `fade` drops an element whose opacity rounds to 0.
	const drawn = boxes.filter((b) => b.opacity === undefined || Math.round(b.opacity * 1000) > 0);
	/** @type {string[]} */
	const problems = [];
	/** @param {string} message @returns {boolean} whether the limit is reached */
	const add = (message) => problems.push(message) >= limit;
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
