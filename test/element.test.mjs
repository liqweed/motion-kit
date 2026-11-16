import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { bundle } from "../lib/bundle.mjs";

const tmp = mkdtempSync(join(tmpdir(), "mk-element-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
cpSync(new URL("../runtime", import.meta.url), join(tmp, "runtime"), { recursive: true });
cpSync(new URL("../adapters/element", import.meta.url), join(tmp, "adapter"), { recursive: true });
const code = bundle([join(tmp, "adapter/motion-diagram.mjs")]);
const spec = readFileSync(new URL("../examples/smart-home.json", import.meta.url), "utf8");
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };

// Each fixture runs the real, vendored adapter and runtime in an isolated
// browser-like context. No global DOM or clock mocks leak into other tests.
/** @param {(...args: any[]) => Promise<any>} fetch */
function fixture(fetch = async () => { throw new Error("unexpected request"); }) {
	let doc;
	class Element extends EventTarget {
		constructor(tagName = "motion-diagram") {
			super();
			this.tagName = tagName;
			this.ownerDocument = doc;
			this.baseURI = "https://example.test/docs/index.html";
			this.childNodes = [];
			this.parentNode = null;
			this.attributes = new Map();
			this.className = "";
			this.textContent = "";
			this.hidden = false;
			this.isConnected = true;
			this.classList = { add: (value) => { this.className += ` ${value}`; } };
		}
		set innerHTML(value) {
			this._html = value;
			this.childNodes = [];
		}
		get innerHTML() { return this._html ?? ""; }
		appendChild(child) {
			child.remove();
			child.parentNode = this;
			this.childNodes.push(child);
			return child;
		}
		remove() {
			if (this.parentNode) this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
			this.parentNode = null;
		}
		setAttribute(key, value) { this.attributes.set(key, value); }
		getAttribute(key) { return this.attributes.get(key) ?? null; }
		removeAttribute(key) { this.attributes.delete(key); }
		matches(selector) { return selector === 'script[type="application/json"]' && this.tagName === "script" && this.getAttribute("type") === "application/json"; }
		querySelector(selector) {
			for (const child of this.childNodes) {
				if (child.matches(selector)) return child;
				const nested = child.querySelector(selector);
				if (nested) return nested;
			}
			return null;
		}
	}
	doc = { createElement: (tag) => new Element(tag), head: new Element("head") };
	const registered = new Map();
	const observers = [];
	const frames = new Map();
	let frameId = 0;
	const context = {
		HTMLElement: Element, Element, URL, AbortController, CustomEvent, queueMicrotask,
		customElements: { get: (name) => registered.get(name), define: (name, element) => registered.set(name, element) },
		fetch,
		performance: { now: () => 0 },
		requestAnimationFrame: (fn) => { frames.set(++frameId, fn); return frameId; },
		cancelAnimationFrame: (id) => frames.delete(id),
		IntersectionObserver: class {
			constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
			observe() {}
			disconnect() { this.disconnected = true; }
		},
		matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
	};
	runInNewContext(code, context);
	const Diagram = registered.get("motion-diagram");
	const element = new Diagram();
	const fallback = new Element("img");
	element.appendChild(fallback);
	return { element, fallback, doc, context, observers, frames };
}

describe("custom element adapter", () => {
	it("mounts inline JSON with format, locale, theme and token style while preserving host CSS", async () => {
		const { element, fallback, doc } = fixture();
		const script = doc.createElement("script");
		script.setAttribute("type", "application/json");
		script.textContent = spec;
		element.appendChild(script);
		element.setAttribute("format", "tall");
		element.setAttribute("locale", "nl");
		element.setAttribute("theme", "dark");
		element.setAttribute("style", "max-width:360px");
		element.setAttribute("style-spec", '{"light":{"accent":"#ff0000"},"dark":{"accent":"#00ff00"}}');
		let ready;
		element.addEventListener("motion-ready", (event) => { ready = event.detail.controller; });
		element.connectedCallback();
		await flush();
		assert.ok(element.controller);
		assert.equal(ready, element.controller);
		assert.equal(element.controller.scene.format, "tall");
		assert.equal(element.controller.scene.locale, "nl");
		assert.equal(element.getAttribute("style"), "max-width:360px");
		assert.ok(element._player.getAttribute("style").includes("--mk-accent:#00ff00"));
		assert.equal(fallback.parentNode.hidden, true);
		assert.equal(script.parentNode, element);
	});

	it("loads and plays a URL spec without a build step", async () => {
		const { element, fallback, frames } = fixture(async () => ({ ok: true, json: async () => JSON.parse(spec) }));
		element.setAttribute("src", "./diagram.json");
		element.connectedCallback();
		await flush();
		assert.ok(element.controller);
		assert.equal(fallback.parentNode.hidden, true);
		element.controller.play();
		assert.equal(frames.size, 1);
	});

	it("keeps fallback visible during URL loading and reports HTTP or invalid JSON failures", async () => {
		let resolveResponse;
		let requested;
		const { element, fallback } = fixture((url) => {
			requested = String(url);
			return new Promise((resolve) => { resolveResponse = resolve; });
		});
		element.setAttribute("src", "../diagram.json");
		let failure;
		element.addEventListener("motion-error", (event) => { failure = event.detail.error; });
		element.connectedCallback();
		await flush();
		assert.equal(requested, "https://example.test/diagram.json");
		assert.equal(fallback.parentNode.hidden, false);
		assert.equal(element.controller, null);
		resolveResponse({ ok: false, status: 404 });
		await flush();
		assert.match(failure.message, /404/);
		assert.equal(fallback.parentNode.hidden, false);
		element.setAttribute("spec", "{");
		element.attributeChangedCallback();
		await flush();
		assert.ok(failure instanceof Error || failure.name === "SyntaxError");
		assert.equal(element.controller, null);
		assert.equal(fallback.parentNode.hidden, false);
	});

	it("aborts obsolete requests and ignores stale async results after an attribute change", async () => {
		let resolveOld;
		let signal;
		const { element } = fixture((_url, options) => {
			signal = options.signal;
			return new Promise((resolve) => { resolveOld = resolve; });
		});
		element.setAttribute("src", "./slow.json");
		element.connectedCallback();
		await flush();
		element.setAttribute("spec", spec);
		element.attributeChangedCallback();
		await flush();
		const current = element.controller;
		assert.equal(signal.aborted, true);
		resolveOld({ ok: true, json: async () => ({ ...JSON.parse(spec), id: "obsolete" }) });
		await flush();
		assert.equal(element.controller, current);
		assert.ok(!current.scene.id.includes("obsolete"));
	});

	it("destroys the player on disconnect, restores the fallback and remounts on reconnect", async () => {
		const { element, fallback, context, observers, frames } = fixture();
		element.setAttribute("spec", spec);
		element.connectedCallback();
		await flush();
		const old = element.controller;
		old.play();
		assert.equal(frames.size, 1);
		element.isConnected = false;
		element.disconnectedCallback();
		assert.equal(element.controller, null);
		assert.equal(fallback.parentNode.hidden, false);
		assert.equal(frames.size, 0);
		assert.equal(observers[0].disconnected, true);
		assert.equal(Object.keys(context.__motionKit).length, 0);
		element.isConnected = true;
		element.connectedCallback();
		await flush();
		assert.ok(element.controller);
		assert.notEqual(element.controller, old);
		assert.equal(fallback.parentNode.hidden, true);
	});

	it("invalidates a decoded response before the attribute remount microtask runs", async () => {
		let resolveJson;
		const { element, context } = fixture(async () => ({ ok: true, json: () => new ContextPromise((resolve) => { resolveJson = resolve; }) }));
		// Match response.json()'s browser realm: a foreign Promise adds an
		// assimilation microtask that can hide the stale-continuation race.
		const ContextPromise = runInNewContext("Promise", context);
		element.setAttribute("src", "./old.json");
		const ready = [];
		element.addEventListener("motion-ready", (event) => { ready.push(event.detail.controller.scene.id); });
		element.connectedCallback();
		await flush();
		resolveJson({ ...JSON.parse(spec), id: "obsolete" });
		element.setAttribute("spec", spec);
		element.attributeChangedCallback();
		await flush();
		assert.equal(ready.length, 1);
		assert.ok(!ready[0].includes("obsolete"));
	});

	it("does not mount a pending response after disconnect", async () => {
		let resolveResponse;
		const { element, fallback } = fixture(() => new Promise((resolve) => { resolveResponse = resolve; }));
		element.setAttribute("src", "./diagram.json");
		element.connectedCallback();
		await flush();
		element.isConnected = false;
		element.disconnectedCallback();
		resolveResponse({ ok: true, json: async () => JSON.parse(spec) });
		await flush();
		assert.equal(element.controller, null);
		assert.equal(fallback.parentNode.hidden, false);
	});
});
