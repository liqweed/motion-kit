import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { checkScene } from "../lib/check.mjs";
import { checkFiles } from "../lib/gate.mjs";
import { localize, renderSvg } from "../runtime/scene.mjs";
import { normalizeStyle } from "../runtime/style.mjs";
import { createScene } from "../runtime/types/index.mjs";
import { previewSpec, restoreSpec, shareSpec } from "../website/src/scripts/playground-data.mjs";

const spec = JSON.parse(readFileSync(new URL("../examples/player-states.json", import.meta.url), "utf8"));
it("missing translations fail explicitly; plain copy is shared", () => {
	assert.equal(localize("Shared", "nl"), "Shared");
	assert.throws(() => localize({ en: "English" }, "nl"), /missing translation.*nl/);
	assert.throws(() => createScene({ ...spec, title: { en: "Title" } }, { locale: "nl" }), /missing translation/);
});
it("module locale declarations drive the same file gate as specs", async () => {
	const dir = mkdtempSync(join(tmpdir(), "mk-locales-"));
	try {
		const file = join(dir, "scene.mjs");
		writeFileSync(file, 'export const locales = ["en", "nl"]; export default ({locale}) => { throw new Error("checked " + locale); };');
		const errors = [];
		assert.equal(await checkFiles([file], { formats: ["tall"], error: (s) => errors.push(s) }), 2);
		assert.match(errors.join("\n"), /checked en/);
		assert.match(errors.join("\n"), /checked nl/);
		errors.length = 0;
		assert.equal(await checkFiles([file], { formats: ["tall"], locales: ["fr"], error: (s) => errors.push(s) }), 1);
		assert.match(errors[0], /checked fr/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
it("shape styles affect built frames, including standalone exports, without changing neutral", () => {
	for (const name of ["smart-home", "order-flow", "incident", "web-stack", "checkout", "player-states"]) {
		const s = createScene(JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8")));
		const neutral = renderSvg(s, s.duration);
		const styled = renderSvg(s, s.duration, { style: { radius: 0, stroke: 4 } });
		assert.notEqual(styled, neutral, name);
		assert.match(styled, /stroke-width="(?:4|6)"/);
		assert.deepEqual(checkScene(s, { style: { radius: 0, stroke: 4 } }).problems, []);
		assert.match(renderSvg(s, s.duration, { standalone: true, style: { stroke: 4 } }), /stroke-width="(?:4|6)"/);
	}
	for (const s of [{ radius: -1 }, { radius: 25 }, { stroke: 0 }, { stroke: NaN }]) assert.throws(() => normalizeStyle(s), /must be a number/);
});
it("gate validates finite dimensions and time, raw end hold, duration and shared contrast", () => {
	const scene = createScene(spec);
	for (const extra of [{ duration: NaN }, { width: Infinity }, { steps: [{ at: -1, label: "Bad" }] }]) assert.equal(checkScene({ ...scene, ...extra }).ok, false);
	assert.equal(checkScene({ ...scene, duration: 12 }).ok, true);
	// Over 12 s is advice: the scene passes, and strict mode fails it.
	const long = checkScene({ ...scene, duration: 12.01 });
	assert.equal(long.ok, true);
	assert.ok(long.advice.some((a) => a.rule === "duration"));
	assert.match(long.advice.find((a) => a.rule === "duration")?.found ?? "", /duration 12\.01 s exceeds 12 s/);
	assert.match(checkScene({ ...scene, duration: 12.01 }, { strict: true }).problems.join("\n"), /advice \[duration\].*strict mode/);
	assert.match(checkScene({ ...scene, frame: (t, ctx) => scene.frame(t, ctx) + (t > scene.duration ? "<g/>" : "") }).problems.join("\n"), /after the end/);
	assert.match(checkScene(scene, { style: { light: { onAccent: "#1d36a8" } } }).problems.join("\n"), /contrast/);
});
it("playground shares Unicode, markup-like text and settings without executing code", () => {
	const source = JSON.stringify({ ...spec, title: "Café <script>& 😃" });
	const hash = shareSpec(source, "tall", "nl");
	assert.deepEqual(restoreSpec(hash), { source, format: "tall", locale: "nl" });
	assert.equal(previewSpec(source, { format: "tall", locale: "nl" }).title, "Café <script>& 😃");
	assert.throws(() => previewSpec("null"), /JSON object/);
	assert.throws(() => previewSpec("x".repeat(32001)), /too large/);
	assert.throws(() => previewSpec('{"type":"bad"}'), /unknown scene type/);
	assert.throws(() => restoreSpec("#spec={}&format=bad"), /unknown format/);
	assert.throws(() => restoreSpec("#spec={}&locale=../../bad"), /locale tag/);
	assert.equal(restoreSpec(""), null);
});
