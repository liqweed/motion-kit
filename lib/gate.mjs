// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · the gate over files: what `motion-kit check` and the vendored
 * `check.mjs` both run, so the two cannot drift apart.
 *
 *   checkFiles(files, { formats, locales, style, options, strict }) → number of failures
 *
 * - Every file × format (all of FORMATS unless given) × locale passes
 *   checkScene, which holds the style to the contrast pairs that scene draws
 *   (G12): the pairs its scene type draws, its own `contrastPairs`, or, if it
 *   declares none, all of CONTRAST_PAIRS. Locales: the given ones; else, for a
 *   spec, every locale its strings carry, and a module’s exported `locales`
 *   (default `en`).
 * - The style's other shared pairs are reported once, as warnings, with the
 *   scene types they would fail: a style author sees every shared pair's
 *   result, and no scene fails on a pair it does not draw.
 * - The canon's advisory rules (runtime/advice.mjs) are said once per file, with
 *   what was found, why the rule exists, when breaking it is fine and the
 *   alternative, and the formats and locales it applies to. A scene that
 *   acknowledges a rule (`acknowledge`) is reported as acknowledged, with its
 *   reason. Advice never fails a file, unless `strict` is set and the scene has
 *   not acknowledged it.
 * - A file that cannot be read, parsed or built is a failure for that file
 *   only; the remaining files are still checked.
 */
import { readFileSync } from "node:fs";
import { adviceLines } from "../runtime/advice.mjs";
import { FORMATS } from "../runtime/scene.mjs";
import { CONTRAST_PAIRS, checkContrast } from "../runtime/style.mjs";
import { SCENE_TYPE_PAIRS } from "../runtime/types/index.mjs";
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
 * Every shared contrast pair the style misses, each with who draws it: the
 * scene types that fail on it, and any custom scene that declares no pairs of
 * its own (it is held to all of them).
 * @param {any} style
 * @returns {string[]}
 */
export function styleWarnings(style) {
	return CONTRAST_PAIRS.flatMap((pair) => {
		const types = Object.entries(SCENE_TYPE_PAIRS).filter(([, pairs]) => pairs.some((p) => p.fg === pair.fg && p.bg === pair.bg)).map(([t]) => t);
		return checkContrast(style, [pair]).map((problem) => `${problem} (${pair.advice ? "advice for" : "held against"}: ${[...types, "custom scenes that declare no or empty contrastPairs, or name this pair"].join(", ")}; a warning for any other scene)`);
	});
}

/** Control characters in a scene's own text (labels, style names) must not reach the terminal raw. */
const clean = (/** @type {string} */ t) => t.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * What the commands that check one scene print about it: the contrast the scene
 * does not draw but the style misses, and the advice, each piece once. The same
 * text on every command (`check` prints it per file, through `checkFiles`).
 * @param {{ warnings?: string[], advice?: import("../runtime/advice.mjs").AdviceReport[], unusedAcknowledgements?: string[] }} result a `checkScene` result
 * @returns {string[]} lines, without a prefix
 */
export function gateNotes({ warnings = [], advice = [], unusedAcknowledgements = [] }) {
	return [...warnings.map((w) => `warning: contrast: ${w}`), ...advice.flatMap((a) => adviceLines(a).map(clean)), ...unusedAcknowledgements.map((r) => `acknowledges [${r}] but this variant never breaks it; other formats or locales may still need it`)];
}

/**
 * Where one piece of advice applies, for a line: "every checked variant", or the list.
 * @param {string[]} where `format · locale` of each combination it was found in
 * @param {number} total combinations checked
 */
const whereText = (where, total) => (where.length === total ? (total === 1 ? where[0] : "every checked variant") : where.join(", "));

/**
 * @param {string[]} files specs (.json) and custom modules (.mjs)
 * @param {{ formats?: string[], locales?: string[], style?: any, options?: import("./load.mjs").OptionsSource, strict?: boolean, log?: (line: string) => void, error?: (line: string) => void, warn?: (line: string) => void }} [o]
 *   strict: advice a scene has not acknowledged fails it.
 * @returns {Promise<number>} failures (0 = the gate passes)
 */
export async function checkFiles(files, { formats, locales, style, options, strict = false, log = console.log, error = console.error, warn = console.warn } = {}) {
	let bad = 0;
	for (const p of styleWarnings(style)) warn(`⚠ style: ${p}`);
	for (const file of files) {
		/** Advice per file, one entry per distinct finding: where it applies. @type {Map<string, { advice: import("../runtime/advice.mjs").AdviceReport, where: string[] }>} */
		const said = new Map();
		/** Rules acknowledged but not broken, by how many combinations said so. @type {Map<string, number>} */
		const unused = new Map();
		let combos = 0;
		/** Combinations tried, checked or not: a failure leaves the unused-acknowledgement call uncertain. */
		let attempted = 0;
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
				attempted++;
				try {
					const sceneOptions = module && options ? await options({ format, locale }) : undefined;
					const { scene } = await loadScene(file, { format, locale, options: sceneOptions });
					const r = checkScene(scene, { style, strict });
					combos++;
					for (const a of r.advice) {
						// An acknowledged rule reads the same in every locale; advice is told by what it found.
						const key = JSON.stringify([a.rule, a.acknowledged, a.acknowledged ? a.reason : a.found]);
						const entry = said.get(key) ?? { advice: a, where: [] };
						entry.where.push(`${format} · ${locale}`);
						said.set(key, entry);
					}
					for (const rule of r.unusedAcknowledgements) unused.set(rule, (unused.get(rule) ?? 0) + 1);
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
		for (const { advice, where } of said.values()) {
			const [first, ...rest] = adviceLines(advice);
			const line = `${file}: ${first} [${whereText(where, combos)}]`;
			if (advice.acknowledged) log(`ℹ ${line}`);
			else warn([`ℹ ${line}`, ...rest.map((l) => `  ${l}`)].join("\n"));
		}
		for (const [rule, n] of unused) if (n === combos && attempted === combos) warn(`ℹ ${file}: acknowledges [${rule}] but never breaks it in the ${combos} variant(s) checked; it can go only if no other format or locale needs it`);
	}
	return bad;
}
