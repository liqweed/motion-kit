// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · connectors, for custom scenes (`kit`).
 *
 * Parts that tie a diagram's pieces together, as pure functions of time:
 *
 * - a **connector**: a dashed line along a flat polyline or a path through the
 *   world (seen through an iso camera), with an optional open-V arrowhead. It
 *   draws on from its start, the dash pattern anchored there, and rests as a
 *   dashed line (`connectorPath`, `drawConnector`);
 * - a **junction**: a small diamond where connectors turn, split or join, flat
 *   on the picture or lying in the floor plane of an iso view, that lights when
 *   a pulse reaches it (`drawJunction`);
 * - a **pulse**: a light that travels a connector once, from its start to its
 *   end, with a glow and a short fading tail, and is gone (or held at the end)
 *   when it arrives (`drawPulse`, `pulseEnd`).
 *
 * Nothing here repeats. A pulse is one run inside a step's beat, as a token is;
 * the scene keeps the steps settled by having every pulse over (`pulseEnd`) at
 * least 50 ms before the step's time. Colours are token names, never literals.
 *
 * Imports stay single-line named imports: lib/bundle.mjs inlines only that form.
 */
import { clamp01, easeStandard, progress } from "./motion.mjs";
import { projector } from "./iso.mjs";
import { tok } from "./style.mjs";
import { el, fade, num } from "./svg.mjs";

/** @import { Camera } from "./iso.mjs" */
/** @typedef {{ x: number, y: number, z?: number }} Vertex a flat point (z ignored) or a world point */

/**
 * @typedef {{
 *   length: number,
 *   at: (f: number) => { x: number, y: number },
 *   cut: (f: number) => { x: number, y: number }[],
 *   span: (from: number, to: number) => { x: number, y: number }[],
 *   tip: (f: number) => { x: number, y: number, angle: number },
 * }} ConnectorPath
 * `length` is the length of the path in its own units (pixels when flat, world
 * units under a camera). `at(f)` is the picture position at fraction `f` of
 * that length, `cut(f)` the picture points of the path up to `f`, `span(from, to)` those
 * between two fractions (every route vertex between them, so a corner stays a
 * corner), and `tip(f)`
 * the position at `f` with the direction of travel there, in radians.
 */

/** @param {number} n */
const finite = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * A connector's route: through flat `points` (picture pixels), or, with a
 * `camera`, through world points `{ x, y, z }` projected by it. Positions go by
 * distance along the path (in the world under a camera), so a pulse on a linear
 * `ease` keeps a constant speed in the world whatever the camera does.
 * @param {Vertex[]} points
 * @param {{ camera?: Camera }} [opts]
 * @returns {ConnectorPath}
 */
export function connectorPath(points, { camera } = {}) {
	if (!Array.isArray(points) || points.length < 2) throw new Error("connectorPath: needs at least two points");
	for (const p of points) if (!p || !finite(p.x) || !finite(p.y) || (p.z !== undefined && !finite(p.z))) throw new Error("connectorPath: points must be finite { x, y, z? }");
	const world = camera ? points.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })) : points.map((p) => ({ x: p.x, y: p.y, z: 0 }));
	const to = camera ? projector(camera) : (/** @type {Vertex} */ p) => ({ x: p.x, y: p.y });
	const starts = [0];
	for (let i = 1; i < world.length; i++) starts.push(starts[i - 1] + Math.hypot(world[i].x - world[i - 1].x, world[i].y - world[i - 1].y, world[i].z - world[i - 1].z));
	const length = starts[starts.length - 1];
	if (!Number.isFinite(length)) throw new Error("connectorPath: the path needs a finite length");
	if (!(length > 0)) throw new Error("connectorPath: the path has no length");

	/** The segment holding distance `d`, skipping any of zero length, and where in it. */
	const locate = (/** @type {number} */ f) => {
		const d = clamp01(f) * length;
		let i = 1;
		while (i < world.length - 1 && (d > starts[i] || starts[i] === starts[i - 1])) i++;
		const span = starts[i] - starts[i - 1];
		return { i, k: span === 0 ? 0 : Math.min(1, Math.max(0, (d - starts[i - 1]) / span)) };
	};
	const worldAt = (/** @type {number} */ f) => {
		const { i, k } = locate(f);
		const a = world[i - 1];
		const b = world[i];
		return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
	};
	return {
		length,
		at: (f) => to(worldAt(f)),
		cut(f) {
			const { i } = locate(f);
			return [...world.slice(0, i), worldAt(f)].map((p) => {
				const s = to(p);
				return { x: s.x, y: s.y };
			});
		},
		span(from, to0) {
			const a = clamp01(from);
			const b = clamp01(to0);
			const inner = world.filter((_, j) => starts[j] / length > a && starts[j] / length < b);
			return [worldAt(a), ...inner, worldAt(b)].map((p) => {
				const s = to(p);
				return { x: s.x, y: s.y };
			});
		},
		tip(f) {
			const { i } = locate(f);
			const here = to(worldAt(f));
			// The direction of the segment at `f`; a segment that is a point on the picture
			// (straight up in plan view, say) takes the nearest one before it that is not.
			for (let j = i; j >= 1; j--) {
				const a = to(world[j - 1]);
				const b = to(world[j]);
				if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) return { x: here.x, y: here.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
			}
			return { x: here.x, y: here.y, angle: 0 };
		},
	};
}

/**
 * A connector drawn up to fraction `p` of its path (`p` as the eased progress of
 * a draw-on, 0..1): a dashed polyline in the token `stroke`, whose dash pattern
 * starts at the path's start, so the dashes stand still as the line grows and
 * the finished line is the dashed line it rests as. With `arrow` an open-V
 * arrowhead rides the leading end, fading in over the first tenth of the
 * draw-on. Nothing for `p` ≤ 0.
 * @param {ConnectorPath} path
 * @param {number} p
 * @param {{ stroke?: string, width?: number, dash?: [number, number], arrow?: boolean, arrowSize?: number, opacity?: number, id?: string }} [o]
 * @returns {string}
 */
export function drawConnector(path, p, { stroke = "line", width = 1.5, dash = [6, 5], arrow = true, arrowSize = 9, opacity = 1, id } = {}) {
	if (p <= 0) return "";
	const color = tok(stroke);
	const pts = path.cut(p);
	const d = pts.map((q, i) => `${i === 0 ? "M" : "L"}${num(q.x)} ${num(q.y)}`).join(" ");
	const line = el("path", { d, fill: "none", stroke: color, "stroke-width": width, "stroke-dasharray": `${num(dash[0])} ${num(dash[1])}`, "stroke-linejoin": "round" });
	let head = "";
	if (arrow) {
		const { x, y, angle } = path.tip(p);
		const spread = (28 * Math.PI) / 180;
		const wing = (/** @type {number} */ s) => `${num(x - arrowSize * Math.cos(angle + s))} ${num(y - arrowSize * Math.sin(angle + s))}`;
		head = fade(clamp01(p / 0.1), {}, el("path", { d: `M${wing(spread)} L${num(x)} ${num(y)} L${wing(-spread)}`, fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round" }));
	}
	return fade(opacity, id ? { "data-connector": id } : {}, line, head);
}

/**
 * A diamond junction, centred where connectors turn, split or join: a small
 * square turned 45°, `size` pixels from its centre to a corner. `plane:
 * "screen"` (default) stands on the picture; `"floor"` lies in the floor plane
 * of an iso view, which is the same diamond flattened by `sin(elevation)`, so
 * it is a full diamond in plan view and a flat one in isometric. `lit` (0..1)
 * cross-fades a second layer (`litFill`, `litStroke`) over the resting one, for
 * the moment a pulse arrives.
 * @param {{ at: Vertex, camera?: Camera, plane?: "screen" | "floor", size?: number, lit?: number, fill?: string, stroke?: string, litFill?: string, litStroke?: string, strokeWidth?: number, opacity?: number, id?: string }} o
 * `at` is a flat point, or a world point when `camera` is given.
 * @returns {string}
 */
export function drawJunction({ at, camera, plane = "screen", size = 7, lit = 0, fill = "surface", stroke = "line", litFill = "accent", litStroke = "accent", strokeWidth = 1.5, opacity = 1, id }) {
	if (!finite(size) || size <= 0) throw new Error(`drawJunction: size must be a positive number, got ${size}`);
	if (plane !== "screen" && plane !== "floor") throw new Error(`drawJunction: plane must be "screen" or "floor", got "${plane}"`);
	const c = camera ? projector(camera)({ x: at.x, y: at.y, z: at.z ?? 0 }) : at;
	const ry = plane === "floor" && camera ? size * Math.sin((camera.elevation * Math.PI) / 180) : size;
	const d = `M${num(c.x)} ${num(c.y - ry)} L${num(c.x + size)} ${num(c.y)} L${num(c.x)} ${num(c.y + ry)} L${num(c.x - size)} ${num(c.y)} Z`;
	const layer = (/** @type {string} */ f, /** @type {string} */ s) => el("path", { d, fill: tok(f), stroke: tok(s), "stroke-width": strokeWidth, "stroke-linejoin": "round" });
	return fade(opacity, id ? { "data-junction": id } : {}, layer(fill, stroke), fade(lit, {}, layer(litFill, litStroke)));
}

/** Seconds the pulse's tail trails its head by, unless a run sets `lag`. */
export const PULSE_LAG = 0.12;

/**
 * One pulse's journey: it starts at `start` s, its head takes `duration` s along
 * the connector on `ease` (default `easeStandard`), and its tail follows `lag` s
 * later on the same curve (split edges), so the light stretches in flight and
 * gathers at the end. The pulse grows in over the first tenth of its life and,
 * unless it is held, fades over the last sixth; with `hold` the head stays lit
 * at the end of the connector once the tail has gathered.
 * @typedef {{ start: number, duration: number, lag?: number, ease?: (p: number) => number, hold?: boolean }} PulseRun
 */

/**
 * The time a pulse is over (or, held, at rest): `start + duration + lag`. A
 * scene's step comes at least 50 ms after this for every pulse of its beat.
 * @param {PulseRun} run
 * @returns {number}
 */
export function pulseEnd(run) {
	return run.start + run.duration + (run.lag ?? PULSE_LAG);
}

/**
 * Where a pulse's head is on its connector, as a fraction 0..1 of the path, at
 * time `t` (0 before it starts, 1 once it has arrived), for a scene that lights
 * a target as the pulse passes it.
 * @param {number} t
 * @param {PulseRun} run
 * @returns {number}
 */
export function pulseHead(t, run) {
	return progress(t, run.start, run.duration, run.ease ?? easeStandard);
}

const TAIL_SLICES = 6;

/**
 * A pulse at time `t`: a bright head with a soft glow (three halos in the same
 * token, fainter outward) and a tail of short slices that fade toward the
 * trailing end. Empty before the run starts and, unless it is held, after
 * `pulseEnd(run)`.
 * @param {ConnectorPath} path
 * @param {number} t
 * @param {PulseRun} run
 * @param {{ color?: string, radius?: number }} [o] `color` is a token (default `emphasis`), `radius` the head's, in pixels
 * @returns {string}
 */
export function drawPulse(path, t, run, { color = "emphasis", radius = 4 } = {}) {
	const lag = run.lag ?? PULSE_LAG;
	const ease = run.ease ?? easeStandard;
	const lead = progress(t, run.start, run.duration, ease);
	if (lead <= 0) return "";
	if (t >= pulseEnd(run) && !run.hold) return "";
	const total = run.duration + lag;
	const life = total > 0 ? (t - run.start) / total : 1; // an instantaneous run is already at its end
	const trail = progress(t, run.start + lag, run.duration, ease);
	const env = clamp01(Math.min(life / 0.1, run.hold ? 1 : (1 - life) / (1 / 6)));
	if (env < 0.001) return "";
	const fill = tok(color);
	const out = [];
	if (lead - trail > 1e-6) {
		for (let i = 0; i < TAIL_SLICES; i++) {
			// Each slice follows the route, so it turns at a corner between its ends.
			const pts = path.span(trail + ((lead - trail) * i) / TAIL_SLICES, trail + ((lead - trail) * (i + 1)) / TAIL_SLICES);
			const k = (i + 1) / TAIL_SLICES;
			out.push(el("path", { d: pts.map((q, j) => `${j === 0 ? "M" : "L"}${num(q.x)} ${num(q.y)}`).join(" "), fill: "none", stroke: fill, "stroke-width": radius * 2 * (0.3 + 0.7 * k) * env, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.5 * k * env }));
		}
	}
	const head = path.at(lead);
	for (const [grow, alpha] of [[3.2, 0.1], [2.2, 0.16], [1.5, 0.26]]) out.push(el("circle", { cx: head.x, cy: head.y, r: radius * grow * env, fill, opacity: alpha * env }));
	out.push(el("circle", { cx: head.x, cy: head.y, r: radius * env, fill }));
	return out.join("");
}
