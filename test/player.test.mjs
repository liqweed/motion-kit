import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { bundle } from "../lib/bundle.mjs";
import { loadScene } from "../lib/load.mjs";
import { PLAYER_CSS, playerMarkup, themeCss } from "../runtime/player.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { esc } from "../runtime/svg.mjs";

const source = bundle([fileURLToPath(new URL("../runtime/player.mjs", import.meta.url))]);
const scene = {
	id: "test-player", title: "Test player", description: "Three steps", width: 100, height: 100,
	duration: 3, steps: [{ at: 0, label: "One" }, { at: 1, label: "Two", id: "two" }, { at: 2, label: "Three", detail: "The end." }],
	frame: (t) => `<text>${t}</text>`,
};

/** Text node of the small DOM. */
class Txt {
	constructor(data) { this.data = data; this.parentNode = null; }
	get textContent() { return this.data; }
	get outerHTML() { return esc(this.data); }
	*walk() {}
}

/** A small DOM: enough of Element and Document for the player and runtime/patch.mjs, plus an HTML serializer. */
class El {
	constructor(tag, doc, ns = "http://www.w3.org/1999/xhtml") {
		this.tag = tag;
		this.namespaceURI = ns;
		this.ownerDocument = doc;
		this.children = [];
		this.parentNode = null;
		this.attributes = new Map();
		this.listeners = new Map();
		this.props = new Map();
		this._text = "";
		this.value = "";
		this._html = "";
		this.classList = { add: () => {} };
		this.style = { setProperty: (k, v) => this.props.set(k, v), getPropertyValue: (k) => this.props.get(k) ?? "" };
	}
	get className() { return this.attributes.get("class") ?? ""; }
	get childNodes() { return this.children; }
	set textContent(v) { this.children = []; this._html = ""; this._text = String(v); }
	get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
	set innerHTML(v) { this._html = v; this._text = ""; this.children = []; }
	get innerHTML() { return this.children.length ? this.children.map((c) => c.outerHTML).join("") : this._html; }
	appendChild(child) { child.parentNode?.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
	removeChild(child) { const i = this.children.indexOf(child); if (i < 0) throw new Error("not a child"); this.children.splice(i, 1); child.parentNode = null; return child; }
	replaceChild(next, prev) { const i = this.children.indexOf(prev); if (i < 0) throw new Error("not a child"); this.children[i] = next; next.parentNode = this; prev.parentNode = null; return prev; }
	remove() { this.parentNode?.removeChild(this); }
	setAttribute(k, v) { this.attributes.set(k, String(v)); }
	setAttributeNS(_ns, k, v) { this.attributes.set(k, String(v)); }
	getAttribute(k) { return this.attributes.get(k) ?? null; }
	removeAttribute(k) { this.attributes.delete(k); }
	addEventListener(name, callback) { this.listeners.set(name, callback); }
	fire(name, event = {}) { this.listeners.get(name)?.(event); }
	*walk() { yield this; for (const c of this.children) yield* c.walk(); }
	get outerHTML() {
		const attrs = [...this.attributes].map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
		if (this.tag === "input") return `<input${attrs}>`;
		const inner = this.children.length ? this.children.map((c) => c.outerHTML).join("") : this._html || esc(this._text);
		// Empty SVG elements serialize the way el() writes them.
		if (!inner && this.namespaceURI === "http://www.w3.org/2000/svg") return `<${this.tag}${attrs}/>`;
		return `<${this.tag}${attrs}>${inner}</${this.tag}>`;
	}
}

function makeDocument() {
	const doc = {
		createElement: (tag) => new El(tag, doc),
		createElementNS: (ns, tag) => new El(tag, doc, ns),
		createTextNode: (data) => new Txt(data),
		querySelector(selector) {
			const m = selector.match(/^style\[([\w-]+)\]$/);
			for (const root of [doc.head, doc.body]) for (const el of root.walk()) if (m && el.tag === "style" && el.attributes.has(m[1])) return el;
			return null;
		},
	};
	doc.head = new El("head", doc);
	doc.body = new El("body", doc);
	return doc;
}

const entry = (visible, { ratio = visible ? 1 : 0, height = visible ? 100 : 0, viewport = 800 } = {}) => ({
	isIntersecting: visible, intersectionRatio: ratio, intersectionRect: { height }, rootBounds: { height: viewport },
});

function setup({ reduced = false, animateSteps = false, autoplay = "none", options = {}, sceneOverride = scene } = {}) {
	const frames = new Map();
	let now = 0;
	let nextId = 0;
	const themeListeners = new Set();
	const observers = [];
	const reported = [];
	const doc = makeDocument();
	const context = vm.createContext({
		performance: { now: () => now },
		reportError: (e) => reported.push(e),
		requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
		cancelAnimationFrame(id) { frames.delete(id); },
		matchMedia: (query) => ({
			matches: query.includes("reduced-motion") && reduced,
			addEventListener: (_name, callback) => themeListeners.add(callback),
			removeEventListener: (_name, callback) => themeListeners.delete(callback),
		}),
		IntersectionObserver: class {
			constructor(callback, init) { this.callback = callback; this.init = init; this.disconnected = false; observers.push(this); }
			observe() {}
			disconnect() { this.disconnected = true; }
		},
	});
	vm.runInContext(source, context);
	const container = doc.createElement("div");
	doc.body.appendChild(container);
	const player = context.MotionKit.mountPlayer(container, sceneOverride, { animateSteps, autoplay, ...options });
	return {
		player, container, frames, context, themeListeners, doc, observers, reported,
		get disconnected() { return observers[0].disconnected; },
		show(e = entry(true)) { observers[0].callback([e]); },
		mount(target, s = scene, o = {}) { return context.MotionKit.mountPlayer(target, s, { autoplay: "none", ...o }); },
		advance(ms) {
			now += ms;
			const callbacks = [...frames.values()];
			frames.clear();
			for (const callback of callbacks) callback(now);
		},
	};
}

/** Markup with each tag's attributes sorted: the patch may add an attribute after the others. */
const canonical = (markup) =>
	markup.replace(/<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g, (_m, tag, attrs, self) => {
		const list = [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => ` ${a[1]}="${a[2]}"`).sort();
		return `<${tag}${list.join("")}${self ? "/" : ""}>`;
	});

it("draws every sampled time in place, equal to a fresh render, whatever the order of seeks", async () => {
	const files = ["bench/fleet.scene.mjs", "examples/smart-home.json", "examples/order-flow.json", "examples/integrations.json", "examples/custom-pulse.scene.mjs", "examples/isometric-swivel.scene.mjs", "examples/text-reveal.scene.mjs", "brand/logo.scene.mjs"];
	for (const file of files) {
		for (const format of ["16:9", "9:16"]) {
			const { scene: s } = await loadScene(fileURLToPath(new URL(`../${file}`, import.meta.url)), { format });
			const { player, container } = setup({ sceneOverride: s, options: { id: "p" } });
			const stage = container.children[0];
			const svg = stage.children[0];
			assert.equal(svg?.tag, "svg", `${file} ${format}: drawn as nodes, not through innerHTML`);
			const n = 48;
			// Forward through the timeline, then a scrambled order: backward jumps and repeats.
			const forward = Array.from({ length: n + 1 }, (_, i) => (s.duration * i) / n);
			const scrambled = Array.from({ length: n }, (_, i) => (s.duration * ((i * 29) % n)) / n);
			for (const t of [...forward, ...scrambled]) {
				player.seek(t);
				assert.equal(canonical(stage.innerHTML), canonical(renderSvg(s, t, { idPrefix: "p", live: true })), `${file} ${format} at t=${t}`);
				for (const el of stage.walk()) if (el !== stage) assert.equal(el.namespaceURI, "http://www.w3.org/2000/svg");
			}
			assert.equal(stage.children[0], svg, `${file} ${format}: the <svg> is kept`);
		}
	}
});

it("plays forward and holds the exact target frame even when a tick overshoots", () => {
	const { player, container, advance, frames } = setup({ options: { id: "p" } });
	player.seekStep(1);
	player.playToStep(2);
	advance(400);
	assert.equal(player.time, 1.4);
	advance(900);
	assert.equal(player.time, 2);
	assert.equal(container.children[0].innerHTML, renderSvg(scene, 2, { idPrefix: "p", live: true }));
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

it("under reduced motion the isometric example shows its final frame, and does not play", async () => {
	const { scene: s } = await loadScene(fileURLToPath(new URL("../examples/isometric-swivel.scene.mjs", import.meta.url)), { format: "16:9" });
	const { player, container, frames, observers } = setup({ reduced: true, sceneOverride: s, options: { id: "p", autoplay: "visible" } });
	const stage = container.children[0];
	const final = renderSvg(s, s.duration, { idPrefix: "p", live: true });
	assert.equal(canonical(stage.innerHTML), canonical(final));
	assert.equal(player.time, s.duration);
	assert.equal(frames.size, 0, "nothing is scheduled");
	assert.equal(observers.length, 0, "no autoplay is waiting for the page to scroll into view");
	player.seekStep(0);
	player.playToStep(1);
	assert.equal(player.time, s.steps[1].at, "a step is reached by a jump");
	assert.equal(frames.size, 0);
});

it("under reduced motion the text reveal shows the settled text: no filter, no group, no rise", async () => {
	const { scene: s } = await loadScene(fileURLToPath(new URL("../examples/text-reveal.scene.mjs", import.meta.url)), { format: "16:9" });
	const { player, container, frames } = setup({ reduced: true, sceneOverride: s, options: { id: "p", autoplay: "visible" } });
	const stage = container.children[0];
	assert.equal(canonical(stage.innerHTML), canonical(renderSvg(s, s.duration, { idPrefix: "p", live: true })));
	assert.doesNotMatch(stage.innerHTML, /filter|<defs|<g[ >]|transform=/);
	assert.match(stage.innerHTML, />Faster startup</);
	assert.equal(frames.size, 0, "nothing is scheduled");
	player.seekStep(0);
	assert.doesNotMatch(stage.innerHTML, /filter|<defs|<g[ >]|transform=/);
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

it("addresses steps by id as well as by index", () => {
	const { player, advance } = setup();
	player.seekStep("two");
	assert.equal(player.time, 1);
	player.seekStep(0);
	player.playToStep("two");
	advance(2000);
	assert.equal(player.time, 1);
	assert.throws(() => player.seekStep("unknown"), { name: "RangeError", message: "Unknown step id: unknown" });
	assert.throws(() => player.playToStep("unknown"), /Unknown step id/);
	assert.equal(player.time, 1);
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

it("explicit step navigation cancels pending autoplay and destroy cleans external resources", () => {
	const env = setup({ autoplay: "visible" });
	env.player.seekStep(0);
	env.show();
	assert.equal(env.player.time, 0);
	assert.equal(env.frames.size, 0);
	env.player.playToStep(2);
	assert.equal(env.themeListeners.size, 1);
	assert.equal(env.disconnected, false);
	env.player.destroy();
	env.player.destroy();
	assert.equal(env.disconnected, true);
	env.show();
	assert.equal(env.frames.size, 0);
	assert.equal(env.themeListeners.size, 0);
	assert.equal(env.context.__motionKit[scene.id], undefined);
});

it("autoplays once 40 % of the diagram or 40 % of the viewport shows", () => {
	const env = setup({ autoplay: "visible" });
	assert.ok(env.observers[0].init.threshold.includes(0.4));
	assert.ok(Math.min(...env.observers[0].init.threshold.filter((x) => x > 0)) <= 0.01);
	// A diagram three viewports tall: at most a third of it is ever visible.
	env.show(entry(true, { ratio: 0.1, height: 240 }));
	assert.equal(env.frames.size, 0);
	env.show(entry(true, { ratio: 0.2, height: 480 }));
	assert.equal(env.player.time, 0);
	assert.equal(env.frames.size, 1);
	// A short diagram with 40 % of itself in view starts too.
	const small = setup({ autoplay: "visible" });
	small.show(entry(true, { ratio: 0.4, height: 40 }));
	assert.equal(small.frames.size, 1);
});

it("stops the frame loop while hidden and resumes without a jump", () => {
	const env = setup({ autoplay: "visible" });
	env.show();
	env.advance(500);
	assert.equal(env.player.time, 0.5);
	const stage = env.container.children[0];
	env.show(entry(false));
	assert.equal(env.frames.size, 0);
	const frozen = stage.innerHTML;
	env.advance(1000);
	assert.equal(env.player.time, 0.5);
	assert.equal(stage.innerHTML, frozen);
	env.show(entry(true));
	assert.equal(env.frames.size, 1);
	env.advance(250);
	assert.equal(env.player.time, 0.75);
	// Out of view, playing waits; it starts once the diagram shows.
	env.show(entry(false));
	env.player.pause();
	env.player.play();
	assert.equal(env.frames.size, 0);
	env.show(entry(true, { ratio: 0.1, height: 10 }));
	assert.equal(env.frames.size, 1);
});

it("announces keyboard step changes in a polite live region, and nothing else", () => {
	const { player, container } = setup();
	const live = container.children.find((c) => c.className === "mk-sr mk-live");
	assert.ok(live);
	player.seekStep(0);
	assert.equal(live.textContent, "");
	container.children[0].fire("keydown", { key: "ArrowRight", preventDefault() {} });
	assert.equal(live.textContent, "2. Two");
	container.children[0].fire("keydown", { key: "End", preventDefault() {} });
	assert.equal(live.textContent, "3. Three: The end.");
});

it("re-announces a repeated step by clearing the live region first, and cancels on destroy", () => {
	const { player, container, frames } = setup();
	const live = container.children.find((c) => c.className === "mk-sr mk-live");
	const keydown = (key) => container.children[0].fire("keydown", { key, preventDefault() {} });
	keydown("End");
	assert.equal(live.textContent, "3. Three: The end.");
	keydown("End");
	assert.equal(live.textContent, "");
	assert.equal(frames.size, 1);
	for (const cb of [...frames.values()]) cb(0);
	frames.clear();
	assert.equal(live.textContent, "3. Three: The end.");
	keydown("End");
	keydown("Home");
	assert.equal(live.textContent, "1. One");
	assert.equal(frames.size, 0);
	keydown("Home");
	player.destroy();
	assert.equal(frames.size, 0);
});

it("resolves flat and per-locale label dictionaries", async () => {
	const { resolveLabels } = await import("../runtime/player.mjs");
	assert.deepEqual(resolveLabels(undefined), {});
	assert.deepEqual(resolveLabels({ play: "Speel" }, "nl"), { play: "Speel" });
	const dict = { en: { play: "Play" }, nl: { play: "Speel" } };
	assert.equal(resolveLabels(dict, "nl").play, "Speel");
	assert.equal(resolveLabels(dict, "nl-BE").play, "Speel");
	assert.equal(resolveLabels(dict, "de").play, "Play");
	assert.equal(resolveLabels({ nl: { play: "Speel" } }, "de").play, "Speel");
});

it("mounting twice on one container destroys the first player", () => {
	const { player, container, context, frames, mount } = setup();
	const second = mount(container, scene, { id: "second" });
	assert.equal(context.__motionKit["test-player"], undefined);
	assert.equal(context.__motionKit.second, second);
	player.seek(1);
	assert.equal(player.time, 3);
	assert.equal(frames.size, 0);
});

it("the stage is a named, described group, and every focusable element has a role", () => {
	const { container } = setup({ options: { id: "p", labels: { nl: { keys: "Pijltjestoetsen: vorige of volgende stap." } }, locale: "nl" } });
	const stage = container.children[0];
	assert.equal(stage.getAttribute("role"), "group");
	assert.equal(stage.getAttribute("aria-label"), scene.title);
	const hint = [...container.walk()].find((el) => el.getAttribute("id") === stage.getAttribute("aria-describedby"));
	assert.equal(hint?.textContent, "Pijltjestoetsen: vorige of volgende stap.");
	for (const el of container.walk()) if (el.getAttribute("tabindex") === "0") assert.ok(el.getAttribute("role"), el.tag);
	assert.match(PLAYER_CSS, /\.mk-btn\{[^}]*min-width:44px;min-height:44px/);
	assert.match(PLAYER_CSS, /\.mk-scrub\{[^}]*min-height:44px/);
});

it("adds the player stylesheet again after a page swap removed it, and only once", () => {
	const env = setup();
	const styles = () => [...env.doc.head.walk(), ...env.doc.body.walk()].filter((el) => el.tag === "style" && el.attributes.has("data-mk-player-css"));
	assert.equal(styles().length, 1);
	env.mount(env.doc.body.appendChild(env.doc.createElement("div")));
	assert.equal(styles().length, 1);
	styles()[0].remove();
	env.mount(env.doc.body.appendChild(env.doc.createElement("div")));
	assert.equal(styles().length, 1);
	styles()[0].remove();
	env.mount(env.doc.body.appendChild(env.doc.createElement("div")), scene, { injectCss: false });
	assert.equal(styles().length, 0);
});

it("sets tokens as properties, keeping the container's own CSS", () => {
	const env = setup();
	const host = env.doc.createElement("div");
	host.setAttribute("style", "max-width:360px");
	env.mount(host, scene, { theme: "dark", style: { dark: { accent: "#00ff00" } } });
	assert.equal(host.getAttribute("style"), "max-width:360px");
	assert.equal(host.style.getPropertyValue("--mk-accent"), "#00ff00");
	assert.ok(host.style.getPropertyValue("--mk-font"));
});

it("gives every instance its own id prefix, so two players share no ids", () => {
	const clipped = { ...scene, frame: (t, { idPrefix }) => `<defs><clipPath id="${idPrefix}-clip"><rect width="${t}"/></clipPath></defs><g clip-path="url(#${idPrefix}-clip)"/>` };
	const env = setup({ sceneOverride: clipped });
	const other = env.doc.body.appendChild(env.doc.createElement("div"));
	env.mount(other, clipped);
	const ids = (root) => [...root.outerHTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
	const a = ids(env.container);
	const b = ids(other);
	assert.ok(a.some((id) => id.endsWith("-clip")));
	assert.deepEqual(a.filter((id) => b.includes(id)), []);
	assert.equal(new Set([...a, ...b]).size, a.length + b.length);
});

it("server markup is the mounted player's markup, with inert controls and no keyboard promise", () => {
	for (const options of [{ id: "srv" }, { id: "srv", scrubber: true, captions: false, labels: { play: "Speel", replay: "Opnieuw" } }]) {
		const { container } = setup({ options });
		const ssr = playerMarkup(scene, options);
		assert.match(ssr, /<div class="mk-controls" role="group" aria-label="Steps" inert>/);
		assert.ok(!ssr.includes("tabindex") && !ssr.includes("srv-keys"));
		// Mounting makes the controls live, and the stage focusable with its keyboard hint.
		const live = ssr
			.replace(" inert>", ">")
			.replace('<div class="mk-stage" role="group" aria-label="Test player">', '<div class="mk-stage" tabindex="0" role="group" aria-label="Test player" aria-describedby="srv-keys">')
			.replace('<div class="mk-sr mk-live"', '<p id="srv-keys" class="mk-sr">Use the arrow keys to move between steps.</p><div class="mk-sr mk-live"');
		assert.equal(container.children.map((c) => c.outerHTML).join(""), live);
		assert.match(ssr, /<ol class="mk-sr"><li>One<\/li><li>Two<\/li><li>Three: The end.<\/li><\/ol>/);
	}
});

it("themeCss follows the system unless a theme is fixed", () => {
	const both = themeCss("#d", { light: { accent: "#123456" } });
	assert.match(both, /^#d\{[^}]*--mk-accent:#123456[^}]*--mk-font:/);
	assert.match(both, /@media \(prefers-color-scheme:dark\)\{#d\{/);
	const dark = themeCss("#d", "neutral", "dark");
	assert.ok(!dark.includes("@media"));
	assert.match(dark, /--mk-bg:#0f1115/);
	assert.throws(() => themeCss("#d", { font: "x}</style><script>" }), /font must be/);
});

it("onStep follows seeking, playback and controls once per index and releases subscriptions", () => {
	const { player, container, advance, frames } = setup();
	const seen = [];
	const unsubscribe = player.onStep((i) => seen.push(i));
	assert.deepEqual(seen, [2]);
	assert.equal(frames.size, 0, "subscribing does not start a polling loop");
	player.seek(0);
	player.seek(0.5);
	player.playToStep(2);
	advance(600);
	advance(1000);
	assert.deepEqual(seen, [2, 0, 1, 2]);
	unsubscribe();
	player.seekStep(1);
	assert.deepEqual(seen, [2, 0, 1, 2]);
	player.onStep((i) => seen.push(i));
	player.destroy();
	player.seekStep(0);
	assert.deepEqual(seen, [2, 0, 1, 2, 1]);
	assert.throws(() => setup().player.seek(NaN), /finite/);
});

it("a throwing step listener is reported, the others still run and playback keeps going", () => {
	const { player, advance, frames, reported } = setup();
	const seen = [];
	const boom = new Error("listener failed");
	let armed = false;
	player.onStep(() => { if (armed) throw boom; });
	player.onStep((i) => seen.push(i));
	armed = true;
	assert.deepEqual(seen, [2]);
	player.seek(0);
	player.playToStep(1);
	advance(100);
	assert.equal(frames.size, 1, "the next frame is still scheduled");
	advance(1000);
	assert.ok(reported.length === 2 && reported.every((e) => e === boom));
	assert.equal(seen.at(-1), 1);
});

it("a listener that destroys the player stops the dispatch to later listeners", () => {
	const { player } = setup();
	const seen = [];
	let armed = false;
	player.onStep(() => { if (armed) player.destroy(); });
	player.onStep((i) => seen.push(i));
	armed = true;
	player.seek(0);
	assert.deepEqual(seen, [2]);
});

it("a listener that seeks supersedes the outer dispatch: later listeners never see the stale step", () => {
	const { player } = setup();
	const seen = [];
	let armed = false;
	player.onStep((i) => { if (armed && i === 0) { armed = false; player.seekStep(1); } });
	player.onStep((i) => seen.push(i));
	armed = true;
	player.seek(0);
	assert.deepEqual(seen, [2, 1]);
});

it("nested seeks that return to the original step still supersede the outer dispatch", () => {
	const { player } = setup();
	const seen = [];
	let armed = false;
	player.onStep((i) => { if (armed && i === 0) { armed = false; player.seekStep(1); player.seekStep(0); } });
	player.onStep((i) => seen.push(i));
	armed = true;
	player.seek(0);
	assert.deepEqual(seen, [2, 1, 0]);
});

it("a destroyed controller reports no pending autoplay", () => {
	const env = setup({ autoplay: "visible" });
	assert.equal(env.player.autoplayPending, true);
	env.player.destroy();
	assert.equal(env.player.autoplayPending, false);
});
