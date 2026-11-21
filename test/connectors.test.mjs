import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { PULSE_LAG, connectorPath, drawConnector, drawJunction, drawPulse, pulseEnd, pulseHead } from "../runtime/connectors.mjs";
import { CAMERA_ISOMETRIC, CAMERA_PLAN, project } from "../runtime/iso.mjs";
import { KIT } from "../runtime/kit.mjs";
import { linear } from "../runtime/motion.mjs";
import { FORMATS } from "../runtime/scene.mjs";

const EXAMPLE = fileURLToPath(new URL("../examples/connectors.scene.mjs", import.meta.url));
const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const L = connectorPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]);

describe("connectorPath", () => {
	it("goes by distance along a flat polyline", () => {
		near(L.length, 150);
		assert.deepEqual(L.at(0), { x: 0, y: 0 });
		near(L.at(0.5).x, 75);
		assert.deepEqual([L.at(1).x, L.at(1).y], [100, 50]);
		assert.deepEqual(L.cut(0.5), [{ x: 0, y: 0 }, { x: 75, y: 0 }]);
		assert.equal(L.cut(1).length, 3);
	});
	it("spans between two fractions through the corner between them", () => {
		assert.deepEqual(L.span(0.6, 0.9), [{ x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 35 }]);
		assert.deepEqual(L.span(0.1, 0.4), [{ x: 15, y: 0 }, { x: 60, y: 0 }]);
	});
	it("refuses a path whose length overflows", () => {
		assert.throws(() => connectorPath([{ x: -1e308, y: 0 }, { x: 1e308, y: 0 }]), /finite length/);
	});
	it("gives the direction of travel at the tip", () => {
		near(L.tip(0.25).angle, 0);
		near(L.tip(0.9).angle, Math.PI / 2);
	});
	it("goes by world distance under a camera, projecting each point", () => {
		const world = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 0 }];
		const p = connectorPath(world, { camera: CAMERA_ISOMETRIC });
		near(p.length, 8);
		const mid = project(CAMERA_ISOMETRIC, { x: 4, y: 0 });
		near(p.at(0.5).x, mid.x);
		near(p.at(0.5).y, mid.y);
		// A linear pulse keeps a constant world speed whatever the camera does.
		for (const cam of [CAMERA_PLAN, CAMERA_ISOMETRIC]) {
			const q = connectorPath(world, { camera: cam });
			const at = project(cam, { x: 4, y: 2 });
			near(q.at(0.75).x, at.x);
			near(q.at(0.75).y, at.y);
		}
	});
	it("takes the direction from the nearest segment that shows on the picture", () => {
		// In plan view a segment straight up in z is a point.
		const p = connectorPath([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 3 }], { camera: CAMERA_PLAN });
		near(p.tip(1).angle, 0);
	});
	it("refuses a path that cannot be drawn", () => {
		assert.throws(() => connectorPath([{ x: 0, y: 0 }]), /two points/);
		assert.throws(() => connectorPath([{ x: 0, y: 0 }, { x: NaN, y: 0 }]), /finite/);
		assert.throws(() => connectorPath([{ x: 1, y: 1 }, { x: 1, y: 1 }]), /no length/);
	});
});

describe("drawConnector", () => {
	it("draws nothing at the start and a dashed line once drawn", () => {
		assert.equal(drawConnector(L, 0), "");
		assert.equal(drawConnector(L, -1), "");
		const done = drawConnector(L, 1);
		assert.match(done, /stroke-dasharray="6 5"/);
		assert.match(done, /d="M0 0 L100 0 L100 50"/);
	});
	it("grows from its start with the dash pattern anchored there", () => {
		const half = drawConnector(L, 0.5);
		assert.match(half, /d="M0 0 L75 0"/);
		assert.match(half, /stroke-dasharray="6 5"/);
		assert.equal(drawConnector(L, 1), drawConnector(L, 1.5));
	});
	it("rides an open-V arrowhead on the leading end, or none", () => {
		const open = (/** @type {string} */ s) => (s.match(/<path /g) ?? []).length;
		assert.equal(open(drawConnector(L, 1)), 2);
		assert.equal(open(drawConnector(L, 1, { arrow: false })), 1);
		assert.match(drawConnector(L, 1), /stroke-linecap="round"/);
	});
	it("takes its colour from a token", () => {
		assert.match(drawConnector(L, 1, { stroke: "accent" }), /var\(--mk-accent\)/);
		assert.throws(() => drawConnector(L, 1, { stroke: "nope" }), /nope/);
	});
	it("is the same bytes for the same input", () => {
		assert.equal(drawConnector(L, 0.37), drawConnector(L, 0.37));
	});
});

describe("drawJunction", () => {
	const pathD = (/** @type {string} */ s) => /** @type {string} */ (s.match(/d="([^"]+)"/)?.[1]);
	it("is a diamond: a square turned 45°", () => {
		assert.equal(pathD(drawJunction({ at: { x: 10, y: 20 }, size: 7 })), "M10 13 L17 20 L10 27 L3 20 Z");
	});
	it("lies in the floor plane: full in plan view, flattened in isometric", () => {
		const plan = pathD(drawJunction({ at: { x: 0, y: 0 }, camera: CAMERA_PLAN, plane: "floor", size: 8 }));
		const iso = pathD(drawJunction({ at: { x: 0, y: 0 }, camera: CAMERA_ISOMETRIC, plane: "floor", size: 8 }));
		assert.equal(plan, "M0 -8 L8 0 L0 8 L-8 0 Z");
		assert.match(iso, /^M0 -4\.62 L8 0 L0 4\.62 L-8 0 Z$/); // 8 · sin(35.26°)
	});
	it("stands at a world point's projection under a camera", () => {
		const c = project(CAMERA_ISOMETRIC, { x: 2, y: 1, z: 0.5 });
		const d = pathD(drawJunction({ at: { x: 2, y: 1, z: 0.5 }, camera: CAMERA_ISOMETRIC, size: 5 }));
		assert.ok(d.startsWith(`M${Math.round(c.x * 100) / 100} `), d);
	});
	it("cross-fades a lit layer over the resting one", () => {
		const rest = drawJunction({ at: { x: 0, y: 0 } });
		assert.equal((rest.match(/<path/g) ?? []).length, 1);
		const lit = drawJunction({ at: { x: 0, y: 0 }, lit: 0.5 });
		assert.equal((lit.match(/<path/g) ?? []).length, 2);
		assert.match(lit, /opacity="0\.5"/);
		assert.match(drawJunction({ at: { x: 0, y: 0 }, lit: 1 }), /<g><path[^>]*accent/);
	});
	it("refuses a size or plane it cannot draw", () => {
		assert.throws(() => drawJunction({ at: { x: 0, y: 0 }, size: 0 }), /size/);
		// @ts-expect-error a plane that does not exist
		assert.throws(() => drawJunction({ at: { x: 0, y: 0 }, plane: "wall" }), /plane/);
	});
});

describe("drawPulse", () => {
	const run = { start: 1, duration: 0.8 };
	const end = pulseEnd(run);
	it("is over at start + duration + lag, which is the default lag when none is set", () => {
		near(end, 1 + 0.8 + PULSE_LAG);
		near(pulseEnd({ ...run, lag: 0.2 }), 2);
	});
	it("is absent before it starts and from the moment it is over, for good", () => {
		assert.equal(drawPulse(L, 0, run), "");
		assert.equal(drawPulse(L, run.start, run), "");
		assert.notEqual(drawPulse(L, 1.4, run), "");
		for (const dt of [0, 0.001, 0.05, 1, 30, 3600]) assert.equal(drawPulse(L, end + dt, run), "", `+${dt}`);
	});
	it("travels the connector once, head first, from its start to its end", () => {
		const head = (/** @type {number} */ t) => {
			const m = drawPulse(L, t, run).match(/<circle cx="([\d.-]+)" cy="([\d.-]+)"/);
			return Number(m?.[1]) + Number(m?.[2]); // the way along this path: east, then south
		};
		assert.ok(head(1.1) < head(1.4) && head(1.4) < head(1.7));
		assert.equal(pulseHead(run.start + run.duration, run), 1);
		assert.equal(pulseHead(0, run), 0);
	});
	it("has a glow (halos in the same token) and a tail that fades toward the trailing end", () => {
		const mid = drawPulse(L, 1.4, run);
		const circles = mid.match(/<circle[^>]*>/g) ?? [];
		assert.equal(circles.length, 4, "three halos and the core");
		assert.ok(circles.every((c) => c.includes("var(--mk-emphasis)")));
		const tail = (mid.match(/<path d="[^"]*" fill="none"[^>]*>/g) ?? []).map((l) => Number(l.match(/opacity="([\d.]+)"/)?.[1]));
		assert.ok(tail.length > 1 && tail.every((o, i) => i === 0 || o > tail[i - 1]), `tail opacities ${tail}`);
		assert.match(drawPulse(L, 1.4, run, { color: "accent" }), /var\(--mk-accent\)/);
	});
	it("grows in and fades out instead of popping", () => {
		const r = (/** @type {number} */ t) => Number(drawPulse(L, t, { ...run, ease: linear }).match(/<circle[^>]*r="([\d.]+)"[^>]*\/>$/)?.[1]);
		assert.ok(r(1.02) < r(1.3), "grows in");
		assert.ok(r(end - 0.02) < r(1.5), "fades out");
	});
	it("is held at the end of the connector when asked, and the frames after it are one frame", () => {
		const held = { ...run, hold: true };
		const after = drawPulse(L, end + 0.5, held);
		assert.notEqual(after, "");
		for (const dt of [0, 0.5, 30, 3600]) assert.equal(drawPulse(L, end + dt, held), after);
		assert.doesNotMatch(after, /<path[^>]*fill="none"/, "the tail has gathered into the head");
		assert.match(after, /cx="100" cy="50"/);
	});
	it("runs on the ease it is given", () => {
		near(pulseHead(1.4, { ...run, ease: linear }), 0.5);
	});
});

describe("KIT", () => {
	it("holds the connector parts", () => {
		for (const name of ["connectorPath", "drawConnector", "drawJunction", "drawPulse", "pulseEnd", "pulseHead", "PULSE_LAG"]) assert.ok(name in KIT, name);
	});
});

describe("examples/connectors.scene.mjs", () => {
	it("passes the gate in every format and in two locales", async () => {
		for (const format of Object.keys(FORMATS)) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				assert.deepEqual(checkScene(scene).problems, [], `${format} ${locale}`);
			}
		}
	});
	it("lasts under the 8 s target and holds its last frame: nothing loops", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		assert.ok(scene.duration <= 8, `${scene.duration} s`);
		const last = scene.frame(scene.duration, { idPrefix: "x" });
		for (const dt of [0, 0.5, 30, 3600]) assert.equal(scene.frame(scene.duration + dt, { idPrefix: "x" }), last);
	});
	it("settles every step: the frame 1 ms before and up to 45 ms after a step is the step frame", async () => {
		for (const format of ["16:9", "9:16"]) {
			const { scene } = await loadScene(EXAMPLE, { format });
			for (const step of scene.steps) {
				const settled = scene.frame(step.at, { idPrefix: "x" });
				for (const dt of [-0.001, 0.001, 0.015, 0.03, 0.045]) assert.equal(scene.frame(step.at + dt, { idPrefix: "x" }), settled, `${format} step ${step.at} ${dt > 0 ? "+" : ""}${dt}`);
				assert.doesNotMatch(settled, /fill="var\(--mk-emphasis\)"/, "no pulse is in flight at a step");
			}
		}
	});
	it("carries one pulse per connector in a beat, several at once", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const pulses = (/** @type {number} */ t) => (scene.frame(t, { idPrefix: "x" }).match(/<circle[^>]*fill="var\(--mk-emphasis\)"\/>/g) ?? []).length;
		assert.equal(pulses(2.3), 1, "one pulse into the splitter");
		assert.equal(pulses(3.55), 3, "three pulses out of it");
		assert.equal(pulses(5.2), 1, "one pulse along the feeder");
		assert.equal(pulses(0.5), 0);
	});
	it("lights the diamonds and the targets as the pulses reach them", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		const accent = (/** @type {number} */ t) => (scene.frame(t, { idPrefix: "x" }).match(/fill="var\(--mk-accent\)"/g) ?? []).length;
		// Arrival times from the example's timeline: IN 2 + 0.6, OUT 3.2 + 0.7, FEED 4.5 + 1.6 (all s).
		const arrivals = [2.6, 3.9, 6.1];
		const added = arrivals.map((ta) => {
			const before = accent(ta - 0.01);
			// The feeder's junctions light on the way; the others only on arrival.
			if (ta < 6) assert.equal(accent(ta - 0.3), before, `nothing lights before the pulse arrives at ${ta}`);
			return accent(ta + 0.4) - before;
		});
		assert.equal(added[0], 1, "the splitter diamond");
		assert.equal(added[1], 3, "the three services");
		// The feeder's junctions are all lit before the pulse arrives, so what lights after is the shelf alone: its three visible faces.
		assert.equal(accent(6.09), accent(5.9), "every feeder junction is lit before the pulse reaches the shelf");
		assert.equal(added[2], 3, `the shelf lights on arrival: ${added[2]}`);
	});
});

/**
 * The effective opacity (product of every open `<g opacity>`) of each lit
 * diamond (a four-vertex path filled with the accent token), in document order.
 * @param {string} svg
 * @param {(string | undefined)[]} only the `d` attributes of the diamonds to report
 * @returns {number[]}
 */
function litEffectiveOpacity(svg, only) {
	/** @type {number[]} */
	const stack = [];
	/** @type {number[]} */
	const out = [];
	for (const m of svg.matchAll(/<(\/?[a-z]+)([^>]*)>/g)) {
		if (m[1] === "g") stack.push(Number(/ opacity="([\d.]+)"/.exec(m[2])?.[1] ?? 1));
		else if (m[1] === "/g") stack.pop();
		else if (m[1] === "path" && only.includes(/d="([^"]*)"/.exec(m[2])?.[1]) && /d="M[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ Z"/.test(m[2]) && /fill="var\(--mk-accent\)"/.test(m[2])) out.push(stack.reduce((a, b) => a * b, 1) * Number(/ opacity="([\d.]+)"/.exec(m[2])?.[1] ?? 1));
	}
	return out;
}

describe("litEffectiveOpacity", () => {
	const d = "M0 0 L1 0 L1 1 L0 1 Z";
	it("counts the diamond's own opacity as well as its ancestors'", () => {
		assert.deepEqual(litEffectiveOpacity(`<g opacity="1"><path d="${d}" fill="var(--mk-accent)" opacity="0.5"/></g>`, [d]), [0.5]);
		assert.deepEqual(litEffectiveOpacity(`<g opacity="0.5"><path d="${d}" fill="var(--mk-accent)" opacity="0.5"/></g>`, [d]), [0.25]);
		assert.deepEqual(litEffectiveOpacity(`<g><path d="${d}" fill="var(--mk-accent)"/></g>`, [d]), [1]);
	});
});

describe("examples/connectors.scene.mjs feeder junctions", () => {
	it("lights each feeder junction as the pulse reaches it, one diamond at a time", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9" });
		// Lit junction layers: four-vertex diamonds stroked with the accent token.
		const diamonds = (/** @type {number} */ t) => (scene.frame(t, { idPrefix: "x" }).match(/<path d="M[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ Z"[^>]*stroke="var\(--mk-accent\)"/g) ?? []).length;
		// FEED starts at 4.5 s and lasts 1.6 s at constant speed; the feeder's legs are 2, 1.4, 2.4 and 1.3 world units, the turns after the first three.
		const legs = [2, 1.4, 2.4, 1.3];
		const total = legs.reduce((a, b) => a + b, 0);
		let d = 0;
		const reach = legs.slice(0, 3).map((leg) => (d += leg, 4.5 + (d / total) * 1.6));
		const base = diamonds(4.4);
		assert.equal(base, 1, "only the splitter diamond is lit before the feeder pulse");
		reach.forEach((ta, k) => {
			assert.equal(diamonds(ta - 0.02), base + k, `${k} feeder junctions are lit just before junction ${k + 1} is reached`);
			assert.equal(diamonds(ta + 0.3), base + k + 1, `junction ${k + 1} is lit once its fill has settled`);
		});
		// Identity, not just counts: each diamond is its own path, in draw order along the feeder. Swapping two junctions' reach times must fail.
		const litPaths = (/** @type {number} */ t) => scene.frame(t, { idPrefix: "x" }).match(/<path d="M[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ L[\d.\-]+ [\d.\-]+ Z"[^>]*stroke="var\(--mk-accent\)"/g) ?? [];
		const order = litPaths(scene.duration).map((m) => m.match(/d="([^"]*)"/)?.[1]);
		assert.equal(new Set(order).size, order.length, "each lit diamond is a distinct path");
		reach.forEach((ta, k) => {
			const lit = litPaths(ta + 0.3).map((m) => m.match(/d="([^"]*)"/)?.[1]);
			assert.deepEqual([...lit].sort(), order.slice(0, base + k + 1).sort(), `junction ${k + 1} itself is the one lit at ${ta.toFixed(2)} s`);
			// Settled means fully opaque through every ancestor: keep the product of the open <g> opacities, so a half-transparent outer group counts.
			const effective = litEffectiveOpacity(scene.frame(ta + 0.3, { idPrefix: "x" }), order);
			assert.equal(effective.length, base + k + 1, `junction ${k + 1}: every lit diamond is found`);
			assert.deepEqual(effective.filter((o) => o !== 1), [], `junction ${k + 1} and the ones before it are lit at full effective opacity once settled`);
		});
	});
});

describe("drawPulse corners and instantaneous runs", () => {
	it("bends a tail slice at the corner instead of cutting across it", () => {
		const out = drawPulse(L, 0.8, { start: 0, duration: 1, lag: 0.5, ease: linear });
		assert.match(out, /<path d="M[^"]* L100 0 L[^"]*"/);
	});
	it("holds an instantaneous run at its end without NaN", () => {
		const out = drawPulse(L, 1, { start: 1, duration: 0, lag: 0, hold: true });
		assert.doesNotMatch(out, /NaN/);
		assert.match(out, /<circle/);
	});
});
