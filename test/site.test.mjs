import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { SCENE_TYPES, createScene } from "../runtime/types/index.mjs";
import { checkContrast, normalizeStyle } from "../runtime/style.mjs";
import { DEFECTS, DOCS_NAV, FORMAT_NAMES, GROUPS, LIVE, LOCALES, PLANNED, ISO_SHOWCASE, STORY, STYLES, TARGETS, TRANSCRIPT, TYPES, findExample } from "../website/src/scripts/catalog.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

describe("site catalog", () => {
	it("every live example exists and builds in every format and locale it claims", async () => {
		for (const e of LIVE) {
			assert.ok(existsSync(join(ROOT, e.file)), `${e.file} exists`);
			for (const format of FORMAT_NAMES) {
				for (const locale of LOCALES) {
					const scene = e.kind === "spec"
						? createScene(JSON.parse(readFileSync(join(ROOT, e.file), "utf8")), { format, locale })
						: null;
					if (scene) assert.equal(scene.steps.length, e.steps, `${e.id} ${format} ${locale} step count`);
				}
			}
		}
	});
	it("spec examples name a registered scene type", () => {
		for (const e of LIVE.filter((x) => x.kind === "spec")) assert.ok(e.type in SCENE_TYPES, `${e.id}: ${e.type}`);
	});
	it("the landing lists every registered scene type, each with a live example of it", () => {
		assert.deepEqual(TYPES.map((t) => t.type).sort(), Object.keys(SCENE_TYPES).sort());
		for (const t of TYPES) assert.equal(LIVE.find((e) => e.id === t.example)?.type, t.type, `${t.type}: example ${t.example}`);
		assert.ok(TARGETS.length > 0);
	});
	it("planned examples are scene types that are not built", () => {
		for (const p of PLANNED) assert.ok(!(p.type in SCENE_TYPES), `${p.id}: ${p.type} is built, move it to LIVE`);
		for (const p of PLANNED) assert.ok(p.issue === undefined || Number.isInteger(p.issue), `${p.id}: issue is a number or absent`);
	});
	it("ids are unique and every group is known", () => {
		const ids = [...LIVE, ...PLANNED].map((e) => e.id);
		assert.equal(new Set(ids).size, ids.length);
		for (const e of [...LIVE, ...PLANNED]) assert.ok(GROUPS.some((g) => g.key === e.group), `${e.id} group`);
		assert.equal(findExample("order-flow")?.built, true);
		assert.equal(findExample("checkout")?.built, true);
		assert.equal(findExample("nope"), null);
	});
	it("the isometric showcase plays the isometric kit's example, a live custom scene", () => {
		assert.equal(ISO_SHOWCASE.example, "isometric-swivel", "the showcase plays the swivel");
		assert.equal(ISO_SHOWCASE.also, "isometric-platform", "the platform is the other link");
		for (const id of [ISO_SHOWCASE.example, ISO_SHOWCASE.also]) {
			const e = LIVE.find((x) => x.id === id);
			assert.ok(e, id);
			assert.equal(e.kind, "module", id);
			assert.match(e.file, /^examples\/isometric-.*\.scene\.mjs$/, id);
		}
	});
	it("the story and the transcript line up with their scenes", () => {
		assert.equal(STORY.length, LIVE.find((e) => e.id === "release-pipeline")?.steps);
		assert.equal(TRANSCRIPT.length, LIVE.find((e) => e.id === "agent-loop")?.steps);
		assert.equal(DEFECTS.length, 5);
		assert.ok(DOCS_NAV.every((g) => g.items.every((i) => i.href)));
	});
	it("every site style passes the gate's contrast rule", () => {
		for (const s of Object.values(STYLES)) assert.deepEqual(checkContrast({ name: s.name, font: s.fontStack, light: s.light, dark: s.dark }), [], s.name);
	});
	it("every site style is a valid style, motion curves included", () => {
		for (const s of Object.values(STYLES)) normalizeStyle({ name: s.name, font: s.fontStack, motion: s.motion, light: s.light, dark: s.dark });
	});
});
