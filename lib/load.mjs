// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · load a scene from a spec (.json) or a custom module (.mjs).
 *
 * Custom modules: `export default (opts) => scene` with
 * opts = { ...options, format, locale, kit } (runtime/kit.mjs). `options` are
 * the caller's scene options (`--options`), passed unchanged; `kit` is the
 * whole runtime in one flat namespace, so a scene that lives in another
 * repository (a project logo) needs no imports at all:
 *
 *   export default ({ kit, labels }) => { const { tok, el, num } = kit; … }
 *
 * Scenes inside this repo (or a vendored copy) may import the runtime with
 * relative paths instead.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KIT, sceneFromModule } from "../runtime/kit.mjs";
import { normalizeStyle } from "../runtime/style.mjs";
import { createScene } from "../runtime/types/index.mjs";

export { KIT };

/**
 * @typedef {{scene: any, spec?: any, kind: "spec" | "module", file: string}} LoadedScene
 */
/**
 * Scene options for one format and locale (see loadOptions).
 * @typedef {(ctx: { format: string, locale: string }) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>} OptionsSource
 */

/** True for a file the CLI treats as a custom scene module rather than a spec. */
export function isModule(file) {
	return !file.endsWith(".json");
}

/**
 * @param {string} file path to a .json spec or an .mjs module
 * @param {{format?: string, locale?: string, options?: Record<string, unknown>}} [opts]
 *   `options` reach a module's factory unchanged; a spec takes none.
 * @returns {Promise<LoadedScene>}
 */
export async function loadScene(file, opts = {}) {
	const abs = resolve(file);
	const { options, ...where } = opts;
	if (!isModule(abs)) {
		if (options != null) throw new Error(`${file}: scene options apply to custom scene modules, not to specs`);
		const spec = JSON.parse(readFileSync(abs, "utf8"));
		return { scene: createScene(spec, where), spec, kind: "spec", file: abs };
	}
	const mod = await import(pathToFileURL(abs).href);
	if (typeof mod.default !== "function") throw new Error(`${file}: default export must be (opts) => scene`);
	return { scene: sceneFromModule(mod.default, { ...where, options }), kind: "module", file: abs };
}

export function loadStyle(arg) {
	if (!arg || arg === "neutral") return normalizeStyle("neutral");
	return normalizeStyle(JSON.parse(readFileSync(resolve(arg), "utf8")));
}

/**
 * Scene options from `--options`: inline JSON (`{"view":"short"}`), a .json
 * file, or a module whose default export is the options or
 * `({ format, locale }) => options` (to pick a locale's dictionary).
 * @param {string | undefined} arg
 * @returns {Promise<OptionsSource | undefined>}
 */
export async function loadOptions(arg) {
	if (arg == null) return undefined;
	/** @param {unknown} v */
	const fixed = (v) => {
		if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`--options ${arg}: scene options must be a JSON object`);
		return () => /** @type {Record<string, unknown>} */ (v);
	};
	if (arg.trim().startsWith("{")) return fixed(JSON.parse(arg));
	const abs = resolve(arg);
	if (abs.endsWith(".json")) return fixed(JSON.parse(readFileSync(abs, "utf8")));
	const mod = await import(pathToFileURL(abs).href);
	if (typeof mod.default === "function") return (ctx) => mod.default(ctx);
	return fixed(mod.default);
}

/**
 * Locales a custom module promises to ship. Undeclared modules keep the
 * backwards-compatible English default; --locale explicitly overrides this.
 * @param {string} file
 * @returns {Promise<string[]>}
 */
export async function moduleLocales(file) {
	const mod = await import(pathToFileURL(resolve(file)).href);
	if (mod.locales === undefined) return ["en"];
	if (!Array.isArray(mod.locales) || !mod.locales.length || mod.locales.some((l) => typeof l !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(l)) || new Set(mod.locales).size !== mod.locales.length) {
		throw new Error(`${file}: locales must be a non-empty array of unique locale tags`);
	}
	return mod.locales;
}
