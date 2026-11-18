// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · the gate over files: what `motion-kit check` and the vendored
 * `check.mjs` both run, so the two cannot drift apart.
 *
 *   checkFiles(files, { formats, locales, style, options }) → number of failures
 *
 * - The style must pass the contrast check for the pairs every scene draws
 *   (G12, CONTRAST_PAIRS), once.
 * - Every file × format (all of FORMATS unless given) × locale passes
 *   checkScene, which also checks the style against the pairs that scene
 *   declares it draws besides (`scene.contrastPairs`). Locales: the given ones; else, for a spec, every locale its
 *   strings carry, and a module’s exported `locales` (default `en`).
 * - A file that cannot be read, parsed or built is a failure for that file
 *   only; the remaining files are still checked.
 */
import { readFileSync } from "node:fs";
import { FORMATS } from "../runtime/scene.mjs";
import { checkContrast } from "../runtime/style.mjs";
import { checkScene } from "./check.mjs";
import { isModule, loadScene, moduleLocales } from "./load.mjs";

/** @param {unknown} e */
const message = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Locales a spec's strings carry: every key of an object whose keys are all
 * locale tags (`en`, `nl`, `pt-BR`) with string values. `["en"]` if none.
 * @param {unknown} spec
 * @returns {string[]}
 */
export function detectLocales(spec) {
	const found = new Set();
	/** @param {unknown} v */
	const walk = (v) => {
		if (Array.isArray(v)) v.forEach(walk);
		else if (v && typeof v === "object") {
			const entries = Object.entries(v);
			if (entries.length && entries.every(([k, x]) => /^[a-z]{2}(-[A-Z]{2})?$/.test(k) && typeof x === "string")) entries.forEach(([k]) => found.add(k));
			else entries.forEach(([, x]) => walk(x));
		}
	};
	walk(spec);
	return found.size ? [...found] : ["en"];
}

/**
 * @param {string[]} files specs (.json) and custom modules (.mjs)
 * @param {{ formats?: string[], locales?: string[], style?: any, options?: import("./load.mjs").OptionsSource, log?: (line: string) => void, error?: (line: string) => void }} [o]
 * @returns {Promise<number>} failures (0 = the gate passes)
 */
export async function checkFiles(files, { formats, locales, style, options, log = console.log, error = console.error } = {}) {
	let bad = 0;
	for (const p of checkContrast(style)) {
		bad++;
		error(`✗ style: ${p}`);
	}
	for (const file of files) {
		const module = isModule(file);
		let fileLocales = locales?.length ? locales : ["en"];
		if (!locales?.length) {
			try {
				fileLocales = module ? await moduleLocales(file) : detectLocales(JSON.parse(readFileSync(file, "utf8")));
			} catch (e) {
				bad++;
				error(`✗ ${file}: ${message(e)}`);
				continue;
			}
		}
		for (const format of formats?.length ? formats : Object.keys(FORMATS)) {
			for (const locale of fileLocales) {
				try {
					const sceneOptions = module && options ? await options({ format, locale }) : undefined;
					const { scene } = await loadScene(file, { format, locale, options: sceneOptions });
					const r = checkScene(scene, { style });
					if (r.ok) log(`✓ ${file} · ${format} · ${locale} · ${scene.duration.toFixed(2)} s · ${scene.steps.length} steps`);
					else {
						bad++;
						error(`✗ ${file} · ${format} · ${locale}\n  - ${r.problems.join("\n  - ")}`);
					}
				} catch (e) {
					bad++;
					error(`✗ ${file} · ${format} · ${locale}: ${message(e)}`);
				}
			}
		}
	}
	return bad;
}
