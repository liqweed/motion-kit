// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * Unbuilt custom element adapter. Vendor this directory beside runtime/:
 *   <script type="module" src="./motion-kit/adapter/motion-diagram.mjs"></script>
 *   <motion-diagram src="./diagram.json"><img src="./final.svg" alt="…"></motion-diagram>
 *
 * The light-DOM fallback stays visible until a player mounts successfully.
 * `style-spec` is JSON token data; the standard HTML `style` attribute stays CSS.
 */
import { mountPlayer } from "../runtime/player.mjs";
import { createScene } from "../runtime/types/index.mjs";

let nextId = 0;

export class MotionDiagram extends HTMLElement {
	static get observedAttributes() {
		return ["spec", "src", "format", "locale", "theme", "style-spec", "labels"];
	}

	constructor() {
		super();
		/** @type {ReturnType<typeof mountPlayer> | null} */
		this.controller = null;
		this._id = `mk-element-${++nextId}`;
		this._revision = 0;
		this._queued = false;
		/** @type {AbortController | null} */
		this._request = null;
		/** @type {HTMLDivElement | null} */
		this._fallback = null;
		/** @type {HTMLDivElement | null} */
		this._player = null;
	}

	connectedCallback() {
		this._schedule();
	}

	disconnectedCallback() {
		this._revision++;
		this._reset();
	}

	attributeChangedCallback() {
		// Invalidate before the queued remount: a resolved fetch may already
		// have its continuation ahead of that microtask.
		this._revision++;
		this._request?.abort();
		this._schedule();
	}

	_schedule() {
		if (this._queued) return;
		this._queued = true;
		queueMicrotask(() => {
			this._queued = false;
			if (this.isConnected) void this._mount();
		});
	}

	_reset() {
		this._request?.abort();
		this._request = null;
		this.controller?.destroy();
		this.controller = null;
		this._player?.remove();
		this._player = null;
		if (this._fallback) this._fallback.hidden = false;
	}

	async _mount() {
		const revision = ++this._revision;
		this._reset();
		if (!this._fallback) {
			const fallback = this.ownerDocument.createElement("div");
			fallback.setAttribute("data-mk-fallback", "");
			for (const child of [...this.childNodes]) {
				// Keep inline JSON available for attribute-driven remounts.
				if (child instanceof Element && child.matches('script[type="application/json"]')) continue;
				fallback.appendChild(child);
			}
			this.appendChild(fallback);
			this._fallback = fallback;
		}
		const request = new AbortController();
		this._request = request;
		/** @type {HTMLDivElement | null} */
		let player = null;
		try {
			const inline = this.getAttribute("spec") ?? this.querySelector('script[type="application/json"]')?.textContent;
			const src = this.getAttribute("src");
			let spec;
			if (inline != null) spec = JSON.parse(inline);
			else if (src) {
				const response = await fetch(new URL(src, this.baseURI), { signal: request.signal });
				if (!response.ok) throw new Error(`motion-diagram: spec request failed (${response.status})`);
				spec = await response.json();
			} else throw new Error("motion-diagram: provide spec, inline application/json, or src");
			if (!this.isConnected || revision !== this._revision) return;
			const theme = this.getAttribute("theme");
			if (theme && theme !== "light" && theme !== "dark") throw new Error('motion-diagram: theme must be "light" or "dark"');
			const locale = this.getAttribute("locale") ?? "en";
			const scene = createScene(spec, { format: this.getAttribute("format") ?? "16:9", locale });
			const style = JSON.parse(this.getAttribute("style-spec") ?? "null");
			player = this.ownerDocument.createElement("div");
			// Mount inside a child so player CSS cannot overwrite the host's CSS.
			this.appendChild(player);
			this.controller = mountPlayer(player, scene, { id: this._id, style, theme: theme || undefined, locale, labels: JSON.parse(this.getAttribute("labels") ?? "null") ?? undefined });
			this._player = player;
			this._fallback.hidden = true;
			this.dispatchEvent(new CustomEvent("motion-ready", { detail: { controller: this.controller } }));
		} catch (error) {
			player?.remove();
			if (this.isConnected && revision === this._revision) {
				this.dispatchEvent(new CustomEvent("motion-error", { detail: { error } }));
			}
		} finally {
			if (this._request === request) this._request = null;
		}
	}
}

if (!customElements.get("motion-diagram")) customElements.define("motion-diagram", MotionDiagram);
