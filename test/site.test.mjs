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

describe("site build", () => {
	// `npm run site` builds website/dist; the gate runs this suite afterwards with SITE_DIST_REQUIRED=1.
	// Ordinary `npm test` skips it, so a stale dist from an earlier build never fails the run.
	const required = !!process.env.SITE_DIST_REQUIRED;
	const dist = join(ROOT, "website", "dist");
	/**
	 * The prerendered player with this id: its final-frame SVG, step buttons and step list.
	 * @param {string} html
	 * @param {string} id
	 */
	const figure = (html, id) => {
		const start = html.indexOf(`<div id="${id}"`);
		assert.ok(start >= 0, `${id} is server-rendered`);
		const end = html.indexOf("</ol>", start);
		assert.ok(end > start, `${id} has its step list`);
		return html.slice(start, end);
	};
	it("prerenders a page for every catalog entry and the shell pages", { skip: !required && "set SITE_DIST_REQUIRED=1 after `npm run site`" }, () => {
		assert.ok(existsSync(dist), "website/dist is missing; run `npm run site` first");
		for (const f of ["index.html", "gallery/index.html", "docs/index.html", "playground/index.html", "404.html", "_headers"]) assert.ok(existsSync(join(dist, f)), f);
		for (const e of [...LIVE, ...PLANNED]) assert.ok(existsSync(join(dist, "examples", e.id, "index.html")), `examples/${e.id}`);
		const home = readFileSync(join(dist, "index.html"), "utf8");
		assert.ok(home.includes("Give your agent the skills") && home.includes("<svg"), "landing is server-rendered, logo included");
		// Without JavaScript the hero and the isometric showcase still show their final frame and step list, wide and tall.
		const iso = LIVE.find((e) => e.id === ISO_SHOWCASE.example);
		const hero = LIVE.find((e) => e.id === "order-flow");
		for (const { base, entry } of [{ base: "hero", entry: hero }, { base: "iso", entry: iso }]) {
			for (const fmt of ["wide", "tall"]) {
				const fig = figure(home, `${base}-${fmt}`);
				assert.ok(fig.includes("<svg") && fig.includes("</svg>"), `${base}-${fmt} carries its SVG`);
				const buttons = fig.match(/<button type="button" class="mk-btn"[ >]/g) ?? [];
				assert.equal(buttons.length, entry?.steps, `${base}-${fmt} has one button per step`);
				assert.equal((fig.match(/<li>/g) ?? []).length, entry?.steps, `${base}-${fmt} lists every step`);
			}
		}
		const dir = join(dist, "_astro");
		const files = readdirSync(dir);
		const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
		// The families must be the ones the site applies, not only declared.
		assert.match(css, /--sans:\s*["']?Instrument Sans/, "body text is set in Instrument Sans");
		assert.match(css, /--mono:\s*["']?DM Mono/, "labels and code are set in DM Mono");
		assert.ok(/@font-face\{[^}]*Instrument Sans/.test(css) && /@font-face\{[^}]*DM Mono/.test(css), "both faces are declared");
		assert.ok(!/Space Grotesk|Inter Variable|["']Inter["']/.test(css), "no Space Grotesk or Inter");
		assert.ok(files.some((f) => /instrument-sans.*\.woff2$/.test(f)) && files.some((f) => /dm-mono.*\.woff2$/.test(f)), "both typefaces are self-hosted");
	});
});
