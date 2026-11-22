// The prerendered site (`npm run site` builds website/dist). The gate runs this file after the
// build with SITE_DIST_REQUIRED=1; an ordinary `npm test` skips it, so a stale dist from an
// earlier build never fails the run.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sceneFromModule } from "../runtime/kit.mjs";
import { createScene } from "../runtime/types/index.mjs";
import { ISO_SHOWCASE, LIVE, PLANNED } from "../website/src/scripts/catalog.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const required = !!process.env.SITE_DIST_REQUIRED;
const skip = !required && "set SITE_DIST_REQUIRED=1 after `npm run site`";
const dist = join(ROOT, "website", "dist");
const read = (/** @type {string} */ f) => readFileSync(join(dist, f), "utf8");

/** The scene a catalog entry builds, in the page's formats. @param {any} entry @param {string} format */
async function sceneOf(entry, format) {
	if (entry.kind === "spec") return createScene(JSON.parse(readFileSync(join(ROOT, entry.file), "utf8")), { format });
	const mod = await import(pathToFileURL(join(ROOT, entry.file)).href);
	return sceneFromModule(mod.default, { format });
}

/**
 * The prerendered player with this id, cut at its own closing tag by counting <div> depth,
 * so a sibling list never stands in for the player's step list.
 * @param {string} html
 * @param {string} id
 */
function player(html, id) {
	const start = html.indexOf(`<div id="${id}"`);
	assert.ok(start >= 0, `${id} is server-rendered`);
	const tag = /<(\/?)div\b/g;
	tag.lastIndex = start;
	let depth = 0;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		depth += m[1] ? -1 : 1;
		if (depth === 0) return html.slice(start, html.indexOf(">", m.index) + 1);
	}
	throw new Error(`${id} is not closed`);
}

/**
 * Assert one prerendered player shows this scene: its id, its canvas, its final frame's step buttons and its own step list.
 * @param {string} html page markup
 * @param {string} id player container id
 * @param {any} scene the scene it must carry
 */
function assertPlayer(html, id, scene) {
	const fig = player(html, id);
	assert.ok(fig.includes(`data-diagram="${scene.id}"`), `${id} carries scene ${scene.id}`);
	const svg = fig.match(/<svg\b[^>]*>/)?.[0] ?? "";
	assert.ok(svg.includes(`viewBox="0 0 ${scene.width} ${scene.height}"`), `${id} is drawn on the ${scene.width}x${scene.height} canvas`);
	assert.equal((fig.match(/<button type="button" class="mk-btn"[ >]/g) ?? []).length, scene.steps.length, `${id} has one button per step`);
	const list = fig.match(/<ol class="mk-sr"[^>]*>([\s\S]*?)<\/ol>/);
	assert.ok(list, `${id} has its own step list`);
	const items = [...list[1].matchAll(/<li>([\s\S]*?)<\/li>/g)];
	assert.equal(items.length, scene.steps.length, `${id} lists every step`);
	scene.steps.forEach((s, i) => assert.ok(items[i][1].includes(String(s.label).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")), `${id} step ${i + 1} reads "${s.label}"`));
}

describe("site build", () => {
	it("prerenders a page for every catalog entry and the shell pages", { skip }, () => {
		assert.ok(existsSync(dist), "website/dist is missing; run `npm run site` first");
		for (const f of ["index.html", "gallery/index.html", "docs/index.html", "playground/index.html", "404.html", "_headers"]) assert.ok(existsSync(join(dist, f)), f);
		for (const e of [...LIVE, ...PLANNED]) assert.ok(existsSync(join(dist, "examples", e.id, "index.html")), `examples/${e.id}`);
		assert.ok(read("index.html").includes("Give your agent the skills") && read("index.html").includes("<svg"), "landing is server-rendered, logo included");
	});
	it("shows the hero and the isometric showcase without JavaScript, wide and tall", { skip }, async () => {
		const home = read("index.html");
		const hero = LIVE.find((e) => e.id === "order-flow");
		const iso = LIVE.find((e) => e.id === ISO_SHOWCASE.example);
		for (const { base, entry } of [{ base: "hero", entry: hero }, { base: "iso", entry: iso }]) {
			for (const [fmt, format] of [["wide", "16:9"], ["tall", "tall"]]) assertPlayer(home, `${base}-${fmt}`, await sceneOf(entry, format));
		}
	});
	it("shows each example route's diagram, or its storyboard, without JavaScript", { skip }, async () => {
		const spec = LIVE.find((e) => e.kind === "spec");
		const custom = LIVE.find((e) => e.kind === "module");
		for (const entry of [spec, custom]) {
			assert.ok(entry, "the catalog has a spec and a custom scene");
			const html = read(join("examples", entry.id, "index.html"));
			assertPlayer(html, "ex-wide", await sceneOf(entry, "wide"));
			assertPlayer(html, "ex-tall", await sceneOf(entry, "tall"));
		}
		const planned = PLANNED[0];
		assert.ok(planned, "the catalog plans something");
		const html = read(join("examples", planned.id, "index.html"));
		assert.ok(!html.includes('class="mk-player'), "a planned example is not shown as a player");
		assert.ok(html.includes(planned.title), "a planned example names itself");
	});
	it("sets the site in its two typefaces, self-hosted", { skip }, () => {
		const dir = join(dist, "_astro");
		const files = readdirSync(dir);
		const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
		assert.match(css, /--sans:\s*["']?Instrument Sans/, "body text is set in Instrument Sans");
		assert.match(css, /--mono:\s*["']?DM Mono/, "labels and code are set in DM Mono");
		assert.match(css, /body\s*\{[^}]*var\(--sans\)/, "body uses the sans variable");
		assert.match(css, /(?:code|pre)[^{]*\{[^}]*var\(--mono\)/, "code uses the mono variable");
		for (const face of ["Instrument Sans", "DM Mono"]) {
			const rule = css.match(new RegExp(`@font-face\\{[^}]*${face}[^}]*\\}`))?.[0] ?? "";
			const url = rule.match(/url\(["']?([^)"']+\.woff2)/)?.[1];
			assert.ok(url, `${face} is declared with a woff2 source`);
			assert.ok(existsSync(join(dist, url.replace(/^\//, ""))) || existsSync(join(dir, url.split("/").pop() ?? "")), `${face}'s file is served`);
		}
		assert.ok(!/Space Grotesk|Inter Variable|(^|[^\w-])["']?Inter["']?\s*[,;}]/m.test(css), "no Space Grotesk or Inter");
		assert.ok(files.some((f) => /instrument-sans.*\.woff2$/.test(f)) && files.some((f) => /dm-mono.*\.woff2$/.test(f)), "both typefaces are self-hosted");
	});
});
