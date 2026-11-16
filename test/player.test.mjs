import assert from "node:assert/strict";
import { it } from "node:test";
import vm from "node:vm";
import { bundle } from "../lib/bundle.mjs";
import { renderSvg } from "../runtime/scene.mjs";

const source = bundle([new URL("../runtime/player.mjs", import.meta.url).pathname]);
const scene = {
	id: "test-player", title: "Test player", description: "Three steps", width: 100, height: 100,
	duration: 3, steps: [{ at: 0, label: "One" }, { at: 1, label: "Two" }, { at: 2, label: "Three" }],
	frame: (t) => `<text>${t}</text>`,
};

function setup({ reduced = false, animateSteps = false, autoplay = "none" } = {}) {
	const frames = new Map();
	let now = 0;
	let nextId = 0;
	let disconnected = false;
	const themeListeners = new Set();
	let visible;
	const doc = { head: { appendChild() {} }, createElement };
	function createElement(tag) {
		const attributes = new Map();
		const listeners = new Map();
		return {
			tag, ownerDocument: doc, children: /** @type {ReturnType<typeof createElement>[]} */ ([]), innerHTML: "", textContent: "", className: "",
			classList: { add() {} },
			appendChild(child) { this.children.push(child); },
			setAttribute(name, value) { attributes.set(name, value); },
			removeAttribute(name) { attributes.delete(name); },
			addEventListener(name, callback) { listeners.set(name, callback); },
			fire(name, event = {}) { listeners.get(name)?.(event); },
		};
	}
	const context = vm.createContext({
		performance: { now: () => now },
		requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
		cancelAnimationFrame(id) { frames.delete(id); },
		matchMedia: (query) => ({
			matches: query.includes("reduced-motion") && reduced,
			addEventListener: (_name, callback) => themeListeners.add(callback),
			removeEventListener: (_name, callback) => themeListeners.delete(callback),
		}),
		IntersectionObserver: class {
			constructor(callback) { visible = callback; }
			observe() {}
			disconnect() { disconnected = true; }
		},
	});
	vm.runInContext(source, context);
	const container = createElement("div");
	const player = context.MotionKit.mountPlayer(container, scene, { animateSteps, autoplay });
	return {
		player, container, frames, context, themeListeners,
		get disconnected() { return disconnected; },
		show() { visible([{ isIntersecting: true }]); },
		advance(ms) {
			now += ms;
			const callbacks = [...frames.values()];
			frames.clear();
			for (const callback of callbacks) callback(now);
		},
	};
}

it("plays forward and holds the exact target frame even when a tick overshoots", () => {
	const { player, container, advance, frames } = setup();
	player.seekStep(1);
	player.playToStep(2);
	advance(400);
	assert.equal(player.time, 1.4);
	advance(900);
	assert.equal(player.time, 2);
	assert.equal(container.children[0].innerHTML, renderSvg(scene, 2, { idPrefix: scene.id, live: true }));
	assert.equal(frames.size, 0);
	advance(1000);
	assert.equal(player.time, 2);
});

it("backward and same-step calls jump and cancel any pending animation", () => {
	const { player, advance, frames } = setup();
	player.playToStep(1);
	assert.equal(player.time, 1);
	assert.equal(frames.size, 0);
	player.playToStep(1);
	assert.equal(frames.size, 0);
	player.playToStep(2);
	advance(250);
	player.playToStep(0);
	assert.equal(player.time, 0);
	assert.equal(frames.size, 0);
	advance(2000);
	assert.equal(player.time, 0);
});

it("reduced motion always jumps to the requested step", () => {
	const { player, frames } = setup({ reduced: true });
	player.seekStep(0);
	player.playToStep(2);
	assert.equal(player.time, 2);
	assert.equal(frames.size, 0);
});

it("retargets from the current time and full play resumes past a step target", () => {
	const { player, advance } = setup();
	player.seekStep(0);
	player.playToStep(1);
	advance(400);
	player.playToStep(2);
	advance(300);
	assert.equal(player.time, 0.7);
	player.play();
	advance(5000);
	assert.equal(player.time, scene.duration);
});

it("seek interrupts animation and invalid step indices preserve the current time", () => {
	const { player, frames } = setup();
	player.seekStep(0);
	player.playToStep(2);
	player.seek(0.25);
	assert.equal(frames.size, 0);
	for (const index of [-1, 3, 0.5, NaN]) {
		assert.throws(() => player.playToStep(index), /Invalid step index/);
		assert.throws(() => player.seekStep(index), /Invalid step index/);
	}
	assert.equal(player.time, 0.25);
});

it("step buttons and keyboard opt into animated steps", () => {
	for (const animateSteps of [false, true]) {
		const { player, container, advance, frames } = setup({ animateSteps });
		player.seekStep(0);
		container.children[1].children[2].fire("click");
		assert.equal(player.time, animateSteps ? 0 : 1);
		if (animateSteps) advance(1500);
		container.children[0].fire("keydown", { key: "ArrowRight", preventDefault() {} });
		assert.equal(player.time, animateSteps ? 1 : 2);
		if (animateSteps) advance(1500);
		assert.equal(player.time, 2);
		assert.equal(frames.size, 0);
	}
});

it("explicit step navigation ignores an already queued autoplay notification", () => {
	const env = setup({ autoplay: "visible" });
	env.player.seekStep(1);
	env.show();
	assert.equal(env.player.time, 1);
	assert.equal(env.frames.size, 0);
});

it("explicit step navigation disables pending autoplay and destroy cleans external resources", () => {
	const env = setup({ autoplay: "visible" });
	env.player.seekStep(0);
	assert.equal(env.disconnected, true);
	env.player.playToStep(2);
	assert.equal(env.themeListeners.size, 1);
	env.player.destroy();
	env.player.destroy();
	env.show();
	assert.equal(env.frames.size, 0);
	assert.equal(env.themeListeners.size, 0);
	assert.equal(env.context.__motionKit[scene.id], undefined);
});
