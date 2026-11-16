// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · custom scene modules.
 *
 * A custom scene module's default export is a factory, `(opts) => scene`, for
 * diagrams no scene type draws. It is called with
 *
 *   opts = { ...options, format, locale, kit }
 *
 * - `options`: the caller's serializable scene options, unchanged (text from a
 *   site's dictionary, a view to draw). Keys `format`, `locale` and `kit` are
 *   reserved.
 * - `format`, `locale`: what to build (see FORMATS).
 * - `kit`: the whole runtime in one flat namespace, so a scene kept in another
 *   repository needs no imports: `const { tok, el, num } = kit`.
 *
 * The CLI and the vendored gate (lib/load.mjs) and the Astro adapter, on the
 * server and in the browser, go through sceneFromModule, so one module, given
 * the same options, format and locale, draws the same scene everywhere. A page
 * from `motion-kit build` calls the factory the same way, with the bundled
 * runtime as `kit`, after the CLI built it here once.
 */
import * as motion from "./motion.mjs";
import * as scene from "./scene.mjs";
import * as style from "./style.mjs";
import * as svg from "./svg.mjs";
import * as wrap from "./wrap.mjs";

/** The runtime, flat, handed to custom scene modules as `opts.kit`. */
export const KIT = Object.freeze({ ...motion, ...svg, ...style, ...scene, ...wrap });

const RESERVED = ["format", "locale", "kit"];

/**
 * Build and validate a scene from a module's default export.
 * @param {unknown} make the module's default export
 * @param {{ format?: string, locale?: string, options?: Record<string, unknown> | null }} [opts]
 * @returns {import("./scene.mjs").Scene}
 */
export function sceneFromModule(make, { format = "16:9", locale = "en", options } = {}) {
	if (typeof make !== "function") throw new TypeError("a scene module's default export must be (opts) => scene");
	if (options != null && (typeof options !== "object" || Array.isArray(options))) throw new TypeError("scene options must be a plain object");
	for (const key of RESERVED) {
		if (options && Object.hasOwn(options, key)) throw new Error(`scene options must not set "${key}": it is passed separately`);
	}
	return scene.validateScene(make({ ...options, format, locale, kit: KIT }));
}
