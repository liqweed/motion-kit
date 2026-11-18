// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/** Shareable specs are data only: no module URLs or executable source. */
import { createScene } from "../../../runtime/types/index.mjs";
import { FORMATS } from "../../../runtime/scene.mjs";
import { checkScene } from "../../../lib/check.mjs";

export const MAX_SPEC_LENGTH = 32000;

/** @param {string} source @param {{format?: string, locale?: string}} [options] @returns {import("../../../runtime/scene.mjs").Scene} */
export function previewSpec(source, options = {}) {
	if (source.length > MAX_SPEC_LENGTH) throw new Error(`Spec is too large (maximum ${MAX_SPEC_LENGTH} characters).`);
	const spec = JSON.parse(source);
	if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Spec must be a JSON object.");
	const scene = createScene(spec, options);
	const result = checkScene(scene);
	if (!result.ok) throw new Error(result.problems.join("\n"));
	return scene;
}

/** @param {string} source @param {string} format @param {string} locale @returns {string} */
export function shareSpec(source, format, locale) {
	previewSpec(source, { format, locale });
	return `#${new URLSearchParams({ spec: source, format, locale })}`;
}

/** @param {string} hash @returns {{source: string, format: string, locale: string} | null} */
export function restoreSpec(hash) {
	if (!hash || hash === "#") return null;
	if (hash.length > MAX_SPEC_LENGTH * 10) throw new Error("Shared spec URL is too large.");
	const params = new URLSearchParams(hash.replace(/^#/, ""));
	const source = params.get("spec");
	if (source === null) throw new Error("Shared URL has no spec.");
	if (source.length > MAX_SPEC_LENGTH) throw new Error("Shared spec is too large.");
	const format = params.get("format") ?? "16:9";
	const locale = params.get("locale") ?? "en";
	if (!Object.hasOwn(FORMATS, format)) throw new Error(`unknown format "${format}"`);
	if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) throw new Error("Invalid locale tag.");
	return { source, format, locale };
}
