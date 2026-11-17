// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · per-page bookkeeping for server-rendering adapters.
 *
 * DOM-free decisions an adapter shares: which id an instance gets, and whether
 * the player stylesheet is out yet. The adapter owns where the page state lives
 * (Astro: `Astro.locals`) and what it does with the answer.
 */
import { safeId } from "./scene.mjs";

/**
 * @typedef {{ count: number, ids: Set<string>, css: boolean }} PageState
 */

/** @returns {PageState} */
export function newPageState() {
	return { count: 0, ids: new Set(), css: false };
}

/**
 * Take an id for one instance on the page: the requested one, validated, or a
 * generated one from the scene id and the page's counter. Throws on a malformed
 * or already used id.
 * @param {PageState} page
 * @param {string | undefined | null} requested
 * @param {string} sceneId
 * @returns {string}
 */
export function claimId(page, requested, sceneId) {
	if (requested != null && safeId(requested) !== requested) throw new Error(`id "${requested}" must be letters, digits, "_" and "-", starting with a letter`);
	let id = requested;
	if (id == null) {
		// Skip ids an explicit request already took.
		do id = safeId(`mk-${sceneId}-${++page.count}`);
		while (page.ids.has(id));
	}
	if (page.ids.has(id)) throw new Error(`id "${id}" is already used on this page; give each instance (the wide and the tall one too) its own`);
	page.ids.add(id);
	return id;
}

/**
 * True once per page: the first caller emits the player stylesheet.
 * @param {PageState} page
 * @returns {boolean}
 */
export function claimStylesheet(page) {
	if (page.css) return false;
	page.css = true;
	return true;
}
