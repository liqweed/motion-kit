import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoplayFor, release, responsive, resumeFrom } from "../website/src/scripts/handoff.mjs";

/** A stand-in for a mounted player: records seeks, plays and destroys. */
function fakeController({ time = 0, playing = false, autoplayPending = false } = {}) {
	const log = [];
	return { log, time, playing, autoplayPending, seek(t) { log.push(["seek", t]); this.time = t; }, play() { log.push(["play"]); this.playing = true; }, destroy() { log.push(["destroy"]); } };
}

/** A window with two figure containers, one shown at a time, and a breakpoint query. */
function windowWith(shown) {
	const els = { "f-wide": { offsetParent: shown === "wide" ? {} : null }, "f-tall": { offsetParent: shown === "tall" ? {} : null } };
	let change = () => {};
	return {
		doc: { getElementById: (id) => els[id] },
		query: { addEventListener: (_t, fn) => { change = fn; } },
		cross(to) { els["f-wide"].offsetParent = to === "wide" ? {} : null; els["f-tall"].offsetParent = to === "tall" ? {} : null; change(); },
	};
}
/** Flush pending promise jobs; no clock. */
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const scene = { duration: 8 };

/** Mount stub: each mount makes a controller; `ctxs` and `made` record what each was told and built. */
function harness(start, states) {
	const w = windowWith(start);
	const ctxs = [];
	const made = [];
	responsive("f", async (_el, format, ctx) => {
		ctxs.push({ format, resume: ctx.resume });
		const c = fakeController(states[made.length]);
		made.push(c);
		return () => release(c);
	}, w);
	return { w, ctxs, made };
}

describe("breakpoint handoff", () => {
	it("a reader's step selection survives the first switch", async () => {
		const { w, ctxs, made } = harness("wide", [{ time: 3.2 }]);
		await tick();
		w.cross("tall");
		assert.deepEqual(ctxs[1].resume, { time: 3.2, playing: false, pending: false }, "the time is read before the new mount starts");
		assert.equal(made[0].log.at(-1)[0], "destroy");
		const next = fakeController();
		assert.equal(autoplayFor(ctxs[1]), "none");
		resumeFrom(next, scene, ctxs[1]);
		assert.deepEqual(next.log, [["seek", 3.2]], "it seeks and stays paused");
	});
	it("a later switch carries the latest player's time, not a stale one", async () => {
		const { w, ctxs } = harness("wide", [{ time: 3 }, { time: 5 }]);
		await tick();
		w.cross("tall");
		await tick();
		w.cross("wide");
		assert.equal(ctxs[2].resume.time, 5);
	});
	it("a playback in flight keeps playing", async () => {
		const { w, ctxs } = harness("wide", [{ time: 2, playing: true }]);
		await tick();
		w.cross("tall");
		const next = fakeController();
		resumeFrom(next, scene, ctxs[1]);
		assert.deepEqual(next.log, [["seek", 2], ["play"]]);
	});
	it("an autoplay still waiting for the figure to scroll into view stays pending", async () => {
		const { w, ctxs } = harness("wide", [{ time: 8, autoplayPending: true }]);
		await tick();
		w.cross("tall");
		assert.equal(ctxs[1].resume.pending, true);
		assert.equal(autoplayFor(ctxs[1]), "visible", "the new player waits for the view too");
		const next = fakeController();
		resumeFrom(next, scene, ctxs[1]);
		assert.deepEqual(next.log, [], "nothing is seeked, so the autoplay is not consumed");
	});
	it("a player that will not play settles an interrupted playback at the end", () => {
		const still = { ...fakeController(), play() { this.log.push(["play"]); }, seek(t) { this.log.push(["seek", t]); } };
		still.log = [];
		resumeFrom(still, scene, { live: () => true, resume: { time: 2, playing: true, pending: false } });
		assert.deepEqual(still.log, [["seek", 2], ["play"], ["seek", 8]]);
	});
	it("a cancelled mount's late teardown runs at once, and the released figure is inert until its next mount", async () => {
		const w = windowWith("wide");
		w.doc.getElementById("f-wide").inert = false;
		let stops = 0;
		let first = true;
		responsive("f", async () => { const late = first; first = false; if (late) await tick(); return () => { stops++; return { time: 0, playing: false, pending: false }; }; }, w);
		w.cross("tall");
		assert.equal(w.doc.getElementById("f-wide").inert, true, "the hidden figure is inert");
		await tick();
		await tick();
		assert.equal(stops, 1, "the cancelled mount's teardown ran");
		w.cross("wide");
		assert.equal(w.doc.getElementById("f-wide").inert, false, "a new mount makes it live again");
	});
	it("a mount that was still loading when the window crossed never goes live", async () => {
		const w = windowWith("wide");
		const lives = [];
		responsive("f", async (_el, _f, ctx) => { await tick(); lives.push(ctx.live()); }, w);
		w.cross("tall");
		await tick();
		await tick();
		assert.deepEqual(lives, [false, true]);
	});
});
