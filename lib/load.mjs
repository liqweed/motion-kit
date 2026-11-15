/**
 * motion-kit · load a scene from a spec (.json) or a custom module (.mjs).
 *
 * Custom modules: `export default (opts) => scene` (opts = { format, locale }),
 * importing only from motion-kit's runtime with relative paths.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateScene } from "../runtime/scene.mjs";
import { normalizeStyle } from "../runtime/style.mjs";
import { createScene } from "../runtime/types/index.mjs";

export async function loadScene(file, opts = {}) {
	const abs = resolve(file);
	if (abs.endsWith(".json")) {
		const spec = JSON.parse(readFileSync(abs, "utf8"));
		return { scene: createScene(spec, opts), spec, kind: "spec", file: abs };
	}
	const mod = await import(pathToFileURL(abs).href);
	const make = mod.default;
	if (typeof make !== "function") throw new Error(`${file}: default export must be (opts) => scene`);
	return { scene: validateScene(make(opts)), kind: "module", file: abs };
}

export function loadStyle(arg) {
	if (!arg || arg === "neutral") return normalizeStyle("neutral");
	return normalizeStyle(JSON.parse(readFileSync(resolve(arg), "utf8")));
}
