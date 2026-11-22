// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * Carrying a live player across the layout breakpoint: the figure is rendered
 * wide and tall, CSS shows one, and a window that crosses the breakpoint swaps
 * the player while keeping the reader's place.
 */

/**
 * What a player was doing when the window crossed the breakpoint.
 * @typedef {{ time: number, playing: boolean, pending: boolean }} Handoff
 */

/**
 * What a mount is told about the window it lives in.
 * @typedef {{ live: () => boolean, resume: Handoff | null }} MountContext
 *   `live` turns false once the window crosses the breakpoint (check it after any await, before mounting or publishing);
 *   `resume` is the outgoing player's state when this mount replaces one, else null.
 */

/**
 * The autoplay option for a mount: a reader's place, a spent autoplay or a pause is kept; a pending autoplay stays pending.
 * @param {MountContext} ctx
 */
export const autoplayFor = (ctx) => (ctx.resume && !ctx.resume.pending ? "none" : "visible");

/**
 * Put a fresh player where the outgoing one was.
 * @param {any} controller
 * @param {{ duration: number }} sc
 * @param {MountContext} ctx
 */
export function resumeFrom(controller, sc, ctx) {
	const r = ctx.resume;
	if (!r || r.pending) return;
	controller.seek(Math.min(r.time, sc.duration));
	if (r.playing && r.time < sc.duration) controller.play();
}

/**
 * Read a controller's state, then release it.
 * @param {any} controller
 * @returns {Handoff}
 */
export const release = (controller) => {
	const state = { time: controller.time, playing: controller.playing, pending: controller.autoplayPending };
	controller.destroy();
	return state;
};

/**
 * A figure is server-rendered twice, wide and tall; CSS shows one. Mount the
 * live player over whichever shows, and the other if the window crosses the
 * breakpoint later, carrying the outgoing player's state across (its time, a
 * playback in flight, an autoplay not yet spent).
 * @param {string} base id prefix of the two containers ("hero" for hero-wide and hero-tall)
 * @param {(el: HTMLElement, format: "wide" | "tall", ctx: MountContext) => Promise<(() => Handoff) | void>} mountOne resolves to its teardown, which returns the player's state
 * @param {{ doc: { getElementById: (id: string) => any }, query: { addEventListener: (type: "change", fn: () => void) => void } }} [env] the document and the breakpoint query (injectable for tests)
 */
export function responsive(base, mountOne, env = { doc: document, query: matchMedia("(max-width: 720px)") }) {
	/** @type {Map<string, { stop: (() => Handoff) | null, cancel: () => void }>} */
	const mounted = new Map();
	/** @type {Handoff | null} */
	let resume = null;
	const go = () => {
		for (const format of /** @type {const} */ (["wide", "tall"])) {
			const el = env.doc.getElementById(`${base}-${format}`);
			if (el && el.offsetParent !== null && !mounted.has(format)) {
				// Only one format shows: release the hidden one's player and listeners first, synchronously, so its state is read before the new mount starts.
				for (const [other, m] of mounted) {
					mounted.delete(other);
					m.cancel();
					if (m.stop) resume = m.stop();
				}
				let alive = true;
				const entry = { stop: /** @type {(() => Handoff) | null} */ (null), cancel: () => (alive = false) };
				mounted.set(format, entry);
				mountOne(el, format, { live: () => alive, resume }).then((stop) => {
					if (stop) entry.stop = stop;
				});
			}
		}
	};
	go();
	env.query.addEventListener("change", go);
	return go;
}
