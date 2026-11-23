// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * A live example as a scene at build time, for the first state the pages render
 * without JavaScript. Specs and custom scene modules are imported eagerly, so
 * this is for Astro pages, not for browser scripts (they load scenes lazily, in site.mjs).
 */
import { sceneFromModule } from "../../../runtime/kit.mjs";
import { createScene } from "../../../runtime/types/index.mjs";

const specs = import.meta.glob("../../../examples/*.json", { eager: true, import: "default" });
const modules = import.meta.glob(["../../../examples/*.scene.mjs", "../../../brand/*.scene.mjs"], { eager: true, import: "default" });
const key = (/** @type {string} */ file) => `../../../${file}`;

/**
 * @param {import("./catalog.mjs").LiveExample} entry
 * @param {{ format?: string, locale?: string }} [o]
 */
export function buildScene(entry, { format = "wide", locale = "en" } = {}) {
	if (entry.kind === "spec") {
		const spec = specs[key(entry.file)];
		if (!spec) throw new Error(`${entry.file}: not bundled`);
		return createScene(spec, { format, locale });
	}
	const make = modules[key(entry.file)];
	if (!make) throw new Error(`${entry.file}: not bundled`);
	return sceneFromModule(make, { format, locale });
}
