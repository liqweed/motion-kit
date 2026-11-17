import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { bundle } from "../lib/bundle.mjs";
import { activeSection, scrollMove, sectionSteps, stepRef } from "../runtime/links.mjs";

const source = bundle([fileURLToPath(new URL("../runtime/links.mjs", import.meta.url))]);
const scene = {
	id: "test-links", title: "Links", description: "Four steps", width: 100, height: 100, duration: 4,
	steps: [{ at: 0, label: "One", id: "one" }, { at: 1, label: "Two", id: "two" }, { at: 2, label: "Three", id: "0" }, { at: 3, label: "Four" }],
	frame: (t) => `<text>${t}</text>`,
};

describe("step mapping", () => {
	it("stepRef takes a step id, else a whole-number index; an id made of digits wins", () => {
		assert.equal(stepRef(scene, "two"), 1);
		assert.equal(stepRef(scene, " two "), 1);
		assert.equal(stepRef(scene, "3"), 3);
		assert.equal(stepRef(scene, 3), 3);
		assert.equal(stepRef(scene, "0"), 2, "the step whose id is \"0\"");
		assert.throws(() => stepRef(scene, "nope"), { name: "RangeError", message: "Unknown step id: nope" });
		assert.throws(() => stepRef(scene, "4"), RangeError);
		assert.throws(() => stepRef(scene, 1.5), RangeError);
	});
	it("sectionSteps uses a section's own reference, else its position", () => {
		assert.deepEqual(sectionSteps(scene, [null, undefined, "", null]), [0, 1, 2, 3]);
		assert.deepEqual(sectionSteps(scene, ["two", null, "3", "two"]), [1, 1, 3, 1]);
		assert.throws(() => sectionSteps(scene, [null, null, null, null, null]), /Section 5 has no data-mk-step/);
		assert.throws(() => sectionSteps(scene, [null, "missing"]), /Unknown step id: missing/);
	});
	it("activeSection is the last section whose top reached the line", () => {
		const tops = [100, 300, 500];
		assert.equal(activeSection(tops, 50), -1, "before the first section");
		assert.equal(activeSection(tops, 100), 0, "a top exactly on the line counts");
		assert.equal(activeSection(tops, 299), 0, "through the section and the gap after it");
		assert.equal(activeSection(tops, 300), 1);
		assert.equal(activeSection(tops, 5000), 2, "the last section holds below it");
		assert.equal(activeSection([], 100), -1);
	});
	it("scrollMove plays one section forward and jumps for everything else", () => {
		const m = (from, to, o = {}) => scrollMove({ from, to, fromStep: from, toStep: to, ...o });
		assert.equal(m(0, 1), "play");
		assert.equal(m(1, 2), "play");
		assert.equal(m(-1, 0), "seek", "the first section jumps");
		assert.equal(m(0, 2), "seek", "skipping a section jumps");
		assert.equal(m(2, 1), "seek", "back jumps");
		assert.equal(m(0, 1, { reduced: true }), "seek");
		assert.equal(m(0, 1, { animate: false }), "seek");
		assert.equal(m(1, -1), null, "no section: keep the frame");
		assert.equal(scrollMove({ from: 0, to: 1, fromStep: 2, toStep: 2 }), null, "same step");
		assert.equal(scrollMove({ from: 0, to: 1, fromStep: 2, toStep: 1 }), "seek", "next section, earlier step");
	});
});

/* -------------------------------------------------------------- fake DOM */

class FakeEl {
	constructor(attrs = {}, top = 0) {
		this.attributes = new Map(Object.entries(attrs));
		this.listeners = new Map();
		this.top = top;
	}
	getAttribute(k) { return this.attributes.get(k) ?? null; }
	setAttribute(k, v) { this.attributes.set(k, String(v)); }
	removeAttribute(k) { this.attributes.delete(k); }
	addEventListener(name, fn) { this.listeners.set(name, fn); }
	removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
	fire(name, event = {}) { this.listeners.get(name)?.(event); }
	getBoundingClientRect() { return { top: this.top, height: 200 }; }
	get current() { return this.getAttribute("aria-current"); }
}

/** A controller that records calls and keeps time the way the player does. */
function fakeController() {
	const calls = [];
	const c = {
		scene, time: scene.duration, calls,
		seek(t) { calls.push(["seek", t]); c.time = t; },
		seekStep(ref) { const i = stepRef(scene, ref); calls.push(["seekStep", i]); c.time = scene.steps[i].at; },
		playToStep(ref) { const i = stepRef(scene, ref); calls.push(["playToStep", i]); c.time = scene.steps[i].at; },
	};
	return c;
}

function env({ reduced = false, io = true } = {}) {
	const observers = [];
	const context = vm.createContext({
		innerHeight: 800,
		matchMedia: (query) => ({ matches: query.includes("reduced-motion") && reduced }),
		...(io && {
			IntersectionObserver: class {
				constructor(callback, init) { this.callback = callback; this.init = init; this.targets = []; this.disconnected = false; observers.push(this); }
				observe(el) { this.targets.push(el); }
				disconnect() { this.disconnected = true; }
			},
		}),
	});
	vm.runInContext(source, context);
	return { links: context.MotionKit, observers };
}

/** Sections 400 px tall, back to back; `scrollTo(y)` moves them and notifies the observer. */
function story(observer, sections) {
	const start = sections.map((s) => s.top);
	return (y) => {
		sections.forEach((s, i) => (s.top = start[i] - y));
		observer.callback([]);
	};
}

describe("scrollSteps", () => {
	it("advances one settled step per section, scrolling down and up", () => {
		const { links, observers } = env();
		const c = fakeController();
		const sections = [0, 1, 2, 3].map((i) => new FakeEl({}, 800 + i * 400));
		const changes = [];
		links.scrollSteps(c, sections, { onChange: (i, el) => changes.push([i, el === null ? null : sections.indexOf(el)]) });
		const [io] = observers;
		assert.equal(io.init.rootMargin, "0px 0px -50% 0px");
		assert.equal(io.targets.length, 4);
		const scrollTo = story(io, sections);

		scrollTo(0);
		assert.deepEqual(c.calls, [], "nothing before the first section reaches the line");
		scrollTo(400);
		assert.deepEqual(c.calls, [["seekStep", 0]]);
		assert.deepEqual(sections.map((s) => s.current), ["step", null, null, null]);
		scrollTo(800);
		scrollTo(850); // inside the same section: no call
		scrollTo(1200);
		scrollTo(1600);
		assert.deepEqual(c.calls.slice(1), [["playToStep", 1], ["playToStep", 2], ["playToStep", 3]]);
		scrollTo(3000);
		assert.equal(c.calls.length, 4, "the last section holds");
		c.calls.length = 0;
		scrollTo(1200);
		scrollTo(800);
		scrollTo(400);
		assert.deepEqual(c.calls, [["seekStep", 2], ["seekStep", 1], ["seekStep", 0]], "up jumps back step by step");
		scrollTo(0);
		assert.equal(c.calls.length, 3, "above the first section the frame stays");
		assert.deepEqual(sections.map((s) => s.current), [null, null, null, null]);
		assert.deepEqual(changes, [[0, 0], [1, 1], [2, 2], [3, 3], [2, 2], [1, 1], [0, 0], [-1, null]]);
	});

	it("jumps when the reader skips sections or prefers reduced motion", () => {
		for (const reduced of [false, true]) {
			const { links, observers } = env({ reduced });
			const c = fakeController();
			const sections = [0, 1, 2].map((i) => new FakeEl({}, 400 + i * 400));
			links.scrollSteps(c, sections);
			const scrollTo = story(observers[0], sections);
			scrollTo(0);
			scrollTo(800);
			scrollTo(400);
			scrollTo(800);
			const forward = reduced ? "seekStep" : "playToStep";
			assert.deepEqual(c.calls, [["seekStep", 0], ["seekStep", 2], ["seekStep", 1], [forward, 2]], `reduced: ${reduced}`);
		}
	});

	it("takes each section's step from data-mk-step, by id or index", () => {
		const { links, observers } = env();
		const c = fakeController();
		const sections = [new FakeEl({ "data-mk-step": "two" }, 400), new FakeEl({}, 800), new FakeEl({ "data-mk-step": "3" }, 1200)];
		links.scrollSteps(c, sections, { line: 0.25, animate: false });
		assert.equal(observers[0].init.rootMargin, "0px 0px -75% 0px");
		const scrollTo = story(observers[0], sections);
		scrollTo(200); // line at 200 px
		scrollTo(600);
		scrollTo(1000);
		assert.deepEqual(c.calls, [["seekStep", 1], ["seekStep", 3]], "the second section shares step 1, so only the third moves");
		assert.throws(() => links.scrollSteps(c, [new FakeEl({ "data-mk-step": "nope" })]), /Unknown step id: nope/);
	});

	it("dispose stops observing and clears the marks", () => {
		const { links, observers } = env();
		const c = fakeController();
		const sections = [new FakeEl({}, 0), new FakeEl({}, 600)];
		const dispose = links.scrollSteps(c, sections);
		observers[0].callback([]);
		assert.equal(sections[0].current, "step");
		dispose();
		dispose();
		assert.equal(observers[0].disconnected, true);
		assert.equal(sections[0].current, null);
		sections[1].top = 0;
		observers[0].callback([]);
		assert.equal(c.calls.length, 1);
	});

	it("does nothing without IntersectionObserver", () => {
		const { links } = env({ io: false });
		const c = fakeController();
		const dispose = links.scrollSteps(c, [new FakeEl({}, 0)]);
		dispose();
		assert.deepEqual(c.calls, []);
		assert.throws(() => links.scrollSteps(null, []), { name: "TypeError" });
	});
});

describe("linkSteps", () => {
	const terms = () => [new FakeEl({ "data-mk-step": "two" }), new FakeEl({ "data-mk-step": "3" }), new FakeEl({ "data-mk-step": "1" })];
	const root = (els) => ({ querySelectorAll: (sel) => (sel === "[data-mk-step]" ? els : []) });

	it("keyboard focus selects the same step as hover; touch selects on click", () => {
		const { links } = env();
		const c = fakeController();
		const els = terms();
		const changes = [];
		links.linkSteps(c, root(els), { onChange: (step, el) => changes.push([step, els.indexOf(el)]) });
		els[0].fire("pointerenter", { pointerType: "mouse" });
		els[1].fire("focusin");
		els[0].fire("focusin");
		els[1].fire("pointerenter", { pointerType: "touch" });
		els[1].fire("click");
		assert.deepEqual(c.calls, [["seekStep", 1], ["seekStep", 3], ["seekStep", 1], ["seekStep", 3]]);
		assert.deepEqual(changes, [[1, 0], [3, 1], [1, 0], [3, 1]]);
		assert.deepEqual(els.map((e) => e.current), [null, "step", null]);
		els[0].fire("focusin");
		assert.deepEqual(els.map((e) => e.current), ["step", null, "step"], "every term of the step is marked");
	});

	it("restore: hover and focus preview, leaving restores the frame, a click keeps its step", () => {
		const { links } = env();
		const c = fakeController();
		c.time = 2.5;
		const els = terms();
		links.linkSteps(c, els, { restore: true });
		els[0].fire("pointerenter", { pointerType: "mouse" });
		els[0].fire("focusin");
		els[0].fire("pointerleave", { pointerType: "mouse" });
		assert.equal(c.time, 1, "focus still holds the preview");
		els[0].fire("focusout");
		assert.deepEqual(c.calls.at(-1), ["seek", 2.5]);
		assert.deepEqual(els.map((e) => e.current), [null, null, null]);
		els[1].fire("pointerenter", { pointerType: "pen" });
		els[1].fire("pointerleave", { pointerType: "pen" });
		els[2].fire("pointerenter", { pointerType: "mouse" });
		els[2].fire("pointerleave", { pointerType: "mouse" });
		assert.equal(c.time, 2.5, "moving between terms restores the frame from before the first one");
		els[1].fire("pointerenter", { pointerType: "mouse" });
		els[1].fire("click");
		els[1].fire("pointerleave", { pointerType: "mouse" });
		assert.equal(c.time, 3, "the clicked step stays");
		assert.equal(els[1].current, "step");
	});

	it("animate plays forward unless the reader prefers reduced motion", () => {
		for (const reduced of [false, true]) {
			const { links } = env({ reduced });
			const c = fakeController();
			const els = terms();
			links.linkSteps(c, els, { animate: true, mark: false });
			els[1].fire("focusin");
			assert.deepEqual(c.calls, [[reduced ? "seekStep" : "playToStep", 3]]);
			assert.equal(els[1].current, null, "mark: false leaves the terms alone");
		}
	});

	it("checks references when binding and dispose removes every listener", () => {
		const { links } = env();
		const c = fakeController();
		assert.throws(() => links.linkSteps(c, [new FakeEl({ "data-mk-step": "nope" })]), /Unknown step id: nope/);
		assert.throws(() => links.linkSteps(c, [new FakeEl({})]), /has no data-mk-step/);
		const els = terms();
		const dispose = links.linkSteps(c, els);
		els[0].fire("focusin");
		dispose();
		assert.equal(els[0].current, null);
		assert.equal(els[0].listeners.size, 0);
		els[1].fire("focusin");
		assert.equal(c.calls.length, 1);
	});
});
