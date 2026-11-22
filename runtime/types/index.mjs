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
/** @import { ContrastPair } from "../style.mjs" */
import { validateScene } from "../scene.mjs";
import { contrastPairs as flowchartPairs, flowchart } from "./flowchart.mjs";
import { contrastPairs as hubSpokePairs, hubSpoke } from "./hub-spoke.mjs";
import { contrastPairs as sequencePairs, sequence } from "./sequence.mjs";
import { contrastPairs as stackPairs, stack } from "./stack.mjs";
import { contrastPairs as walkPairs, walk } from "./walk.mjs";
import { contrastPairs as timelinePairs, timeline } from "./timeline.mjs";

export const SCENE_TYPES = {
	sequence,
	"hub-spoke": hubSpoke,
	timeline,
	stack,
	"state-machine": walk,
	"request-journey": walk,
	flowchart,
};

/**
 * The shared contrast pairs (CONTRAST_PAIRS) each scene type draws: the pairs
 * the gate holds a scene of that type to, and the only ones for which a style
 * can fail it. Every scene a type builds carries the same list as
 * `scene.contrastPairs`.
 * @type {Readonly<Record<string, readonly ContrastPair[]>>}
 */
export const SCENE_TYPE_PAIRS = Object.freeze({
	sequence: sequencePairs,
	"hub-spoke": hubSpokePairs,
	timeline: timelinePairs,
	stack: stackPairs,
	"state-machine": walkPairs,
	"request-journey": walkPairs,
	flowchart: flowchartPairs,
});

export function createScene(spec, opts = {}) {
	const make = SCENE_TYPES[spec.type];
	if (!make) throw new Error(`unknown scene type "${spec.type}" (known: ${Object.keys(SCENE_TYPES).join(", ")})`);
	const scene = make(spec, opts);
	// Any spec may acknowledge advice (runtime/advice.mjs); validateScene checks it.
	return validateScene(spec.acknowledge === undefined ? scene : { ...scene, acknowledge: spec.acknowledge });
}
