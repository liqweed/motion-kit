// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · scene type registry.
 *
 *   createScene(spec, { format, locale }) → validated scene
 *
 * New scene types: add a module exporting (spec, opts) → scene and register it
 * here. A one-off diagram can skip the registry: write a module whose default
 * export is (opts) → scene (see examples/custom-*.scene.mjs).
 */
import { validateScene } from "../scene.mjs";
import { flowchart } from "./flowchart.mjs";
import { hubSpoke } from "./hub-spoke.mjs";
import { sequence } from "./sequence.mjs";
import { stack } from "./stack.mjs";
import { walk } from "./walk.mjs";
import { timeline } from "./timeline.mjs";

export const SCENE_TYPES = {
	sequence,
	"hub-spoke": hubSpoke,
	timeline,
	stack,
	"state-machine": walk,
	"request-journey": walk,
	flowchart,
};

export function createScene(spec, opts = {}) {
	const make = SCENE_TYPES[spec.type];
	if (!make) throw new Error(`unknown scene type "${spec.type}" (known: ${Object.keys(SCENE_TYPES).join(", ")})`);
	return validateScene(make(spec, opts));
}
