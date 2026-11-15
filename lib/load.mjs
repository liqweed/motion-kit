/**
 * motion-kit · load a scene from a spec (.json) or a custom module (.mjs).
 *
 * Custom modules: `export default (opts) => scene` with
 * opts = { format, locale, kit }. `kit` is the whole runtime in one flat
 * namespace (motion, svg, style, scene, wrap), so a scene that lives in
 * another repository (a project logo) needs no imports at all:
 *
 *   export default ({ kit }) => { const { tok, el, num } = kit; … }
 *
 * Scenes inside this repo (or a vendored copy) may import the runtime with
 * relative paths instead; `motion-kit build` (browser bundle) requires that.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateScene } from "../runtime/scene.mjs";
import { normalizeStyle } from "../runtime/style.mjs";
import { createScene } from "../runtime/types/index.mjs";
import * as motion from "../runtime/motion.mjs";
import * as scene from "../runtime/scene.mjs";
import * as style from "../runtime/style.mjs";
import * as svg from "../runtime/svg.mjs";
import * as wrap from "../runtime/wrap.mjs";

/** The runtime, flat, handed to custom scene modules as `opts.kit`. */
export const KIT = Object.freeze({ ...motion, ...svg, ...style, ...scene, ...wrap });

/**
 * @typedef {{scene: any, spec?: any, kind: "spec" | "module", file: string}} LoadedScene
 */

/**
 * @param {string} file path to a .json spec or an .mjs module
 * @param {{format?: string, locale?: string}} [opts]
 * @returns {Promise<LoadedScene>}
 */
export async function loadScene(file, opts = {}) {
	const abs = resolve(file);
	if (abs.endsWith(".json")) {
		const spec = JSON.parse(readFileSync(abs, "utf8"));
		return { scene: createScene(spec, opts), spec, kind: "spec", file: abs };
	}
	const mod = await import(pathToFileURL(abs).href);
	const make = mod.default;
	if (typeof make !== "function") throw new Error(`${file}: default export must be (opts) => scene`);
	return { scene: validateScene(make({ ...opts, kit: KIT })), kind: "module", file: abs };
}

export function loadStyle(arg) {
	if (!arg || arg === "neutral") return normalizeStyle("neutral");
	return normalizeStyle(JSON.parse(readFileSync(resolve(arg), "utf8")));
}
