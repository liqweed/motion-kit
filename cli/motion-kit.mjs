#!/usr/bin/env node
/**
 * motion-kit CLI.
 *
 *   motion-kit check  <scene...>             [--format F] [--locale L]   gate (all formats/locales by default)
 *   motion-kit build  <scene> --out x.html   [--format F] [--locale L] [--style S] [--no-scrubber] [--no-heading]
 *   motion-kit export <scene> --out dir      [--format F] [--locale L] [--style S] [--theme light|dark] [--png] [--scale 2] [--qc] [--background]
 *   motion-kit bake   <scene> --out x.svg    [--fps 15] [--theme ...] [--style S]
 *   motion-kit video  <scene> --out x.mp4|.gif|.webm [--fps 30] [--scale 2] [--hold 1.5] [--sheet sheet.png]
 *   motion-kit icon   <scene> --out <repo>  [--size 512] [--style S] [--no-png]   project icon set (assets/, .idea/)
 *   motion-kit vendor <dir> [--adapter page|slidev|astro]
 *   motion-kit formats | types
 *
 * <scene> is a spec (.json, any registered type) or a custom module (.mjs).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bake, bakeStats } from "../runtime/bake.mjs";
import { FORMATS } from "../runtime/scene.mjs";
import { checkContrast } from "../runtime/style.mjs";
import { SCENE_TYPES } from "../runtime/types/index.mjs";
import { checkScene } from "../lib/check.mjs";
import { buildHtml } from "../lib/build.mjs";
import { writeIconSet } from "../lib/icon.mjs";
import { exportSteps } from "../lib/export.mjs";
import { loadScene, loadStyle } from "../lib/load.mjs";
import { rasterizer } from "../lib/raster.mjs";
import { probe, renderVideo, videoContactSheet } from "../lib/video.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const { values: a, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		out: { type: "string", short: "o" },
		format: { type: "string", short: "f" },
		locale: { type: "string", short: "l" },
		style: { type: "string", short: "s" },
		theme: { type: "string", default: "light" },
		png: { type: "boolean", default: false },
		scale: { type: "string", default: "2" },
		qc: { type: "boolean", default: false },
		background: { type: "boolean", default: false },
		fps: { type: "string" },
		hold: { type: "string", default: "1.5" },
		sheet: { type: "string" },
		adapter: { type: "string", default: "page" },
		size: { type: "string", default: "512" },
		"no-png": { type: "boolean", default: false },
		"no-scrubber": { type: "boolean", default: false },
		"no-heading": { type: "boolean", default: false },
		help: { type: "boolean", short: "h" },
	},
});
const [cmd, ...args] = positionals;

function fail(msg) {
	console.error(`motion-kit: ${msg}`);
	process.exit(1);
}
function need(v, what) {
	if (!v) fail(`${cmd}: ${what} is required`);
	return v;
}

async function main() {
	if (!cmd || a.help) {
		const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
		console.log(src.slice(src.indexOf("/**") + 3, src.indexOf("*/")).replace(/^ \* ?/gm, ""));
		return;
	}
	const style = loadStyle(a.style);
	const opts = { format: a.format ?? "16:9", locale: a.locale ?? "en" };

	switch (cmd) {
		case "formats":
			for (const [k, v] of Object.entries(FORMATS)) console.log(`${k.padEnd(6)} ${v.width}×${v.height || "auto"}`);
			return;
		case "types":
			console.log(Object.keys(SCENE_TYPES).join("\n"));
			return;
		case "check": {
			if (!args.length) fail("check: give at least one scene file");
			const styleProblems = checkContrast(style);
			for (const p of styleProblems) console.error(`✗ style: ${p}`);
			let bad = styleProblems.length;
			for (const file of args) {
				const formats = a.format ? [a.format] : Object.keys(FORMATS);
				const raw = file.endsWith(".json") ? JSON.parse(readFileSync(file, "utf8")) : null;
				const locales = a.locale ? [a.locale] : raw ? detectLocales(raw) : ["en"];
				for (const format of formats) {
					for (const locale of locales) {
						try {
							const { scene } = await loadScene(file, { format, locale });
							const r = checkScene(scene);
							if (r.ok) console.log(`✓ ${file} · ${format} · ${locale} · ${scene.duration.toFixed(2)} s · ${scene.steps.length} steps`);
							else {
								bad++;
								console.error(`✗ ${file} · ${format} · ${locale}\n  - ${r.problems.join("\n  - ")}`);
							}
						} catch (e) {
							bad++;
							console.error(`✗ ${file} · ${format} · ${locale}: ${e instanceof Error ? e.message : e}`);
						}
					}
				}
			}
			if (bad) process.exit(1);
			return;
		}
		case "build": {
			const loaded = await loadScene(need(args[0], "<scene>"), opts);
			const r = checkScene(loaded.scene);
			if (!r.ok) fail(`scene fails the gate:\n  - ${r.problems.join("\n  - ")}`);
			const html = buildHtml(loaded, { style, ...opts, scrubber: !a["no-scrubber"], heading: !a["no-heading"] });
			if (/<\/script/i.test(html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>")))) fail("bundled code contains </script>");
			const out = need(a.out, "--out");
			mkdirSync(dirname(resolve(out)), { recursive: true });
			writeFileSync(out, html);
			console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB, self-contained)`);
			return;
		}
		case "export": {
			const file = need(args[0], "<scene>");
			const { scene } = await loadScene(file, opts);
			const r = checkScene(scene);
			if (!r.ok) fail(`scene fails the gate:\n  - ${r.problems.join("\n  - ")}`);
			if (a.png && !(await rasterizer())) fail("--png needs @resvg/resvg-js or Chrome");
			const m = await exportSteps(scene, { out: need(a.out, "--out"), style, theme: a.theme, png: a.png, scale: Number(a.scale), qc: a.qc, background: a.background, sourceFile: resolve(file), version: VERSION });
			console.log(`wrote ${m.files.length} frames + index.html + manifest.json to ${a.out}`);
			return;
		}
		case "bake": {
			const { scene } = await loadScene(need(args[0], "<scene>"), opts);
			const svg = bake(scene, { fps: Number(a.fps ?? 15), style, theme: a.theme, background: a.background });
			const out = need(a.out, "--out");
			writeFileSync(out, svg);
			const s = bakeStats(svg);
			console.log(`wrote ${out} (${s.frames} frames, ${(s.bytes / 1024).toFixed(0)} KB, zero JS)`);
			return;
		}
		case "video": {
			const { scene } = await loadScene(need(args[0], "<scene>"), opts);
			const out = need(a.out, "--out");
			const r = await renderVideo(scene, {
				out,
				fps: Number(a.fps ?? 30),
				scale: Number(a.scale),
				hold: Number(a.hold),
				style,
				theme: a.theme,
				onProgress: (f, n) => process.stderr.write(`\rframe ${f}/${n}`),
			});
			process.stderr.write("\n");
			const p = probe(out);
			console.log(`wrote ${out}: ${p.width}×${p.height}, ${p.duration.toFixed(2)} s, ${p.fps} fps (${r.frames} frames)`);
			if (a.sheet) console.log(`contact sheet: ${videoContactSheet(out, a.sheet)}`);
			return;
		}
		case "icon": {
			const { scene } = await loadScene(need(args[0], "<scene>"), { ...opts, format: a.format ?? "1:1" });
			const r = checkScene(scene);
			if (!r.ok) fail(`scene fails the gate:\n  - ${r.problems.join("\n  - ")}`);
			const png = !a["no-png"];
			if (png && !(await rasterizer())) fail("icon PNG needs @resvg/resvg-js or Chrome (or pass --no-png)");
			const root = resolve(need(a.out, "--out"));
			const files = await writeIconSet(scene, { root, style, size: Number(a.size), png });
			console.log(`wrote to ${root}:\n  ${files.join("\n  ")}`);
			if (files.includes(".idea/icon.svg")) console.log("note: if .idea/ is git-ignored, add  !.idea/icon*.svg  after it to commit the IDE icon");
			return;
		}
		case "vendor": {
			const dir = resolve(need(args[0], "<dir>"));
			mkdirSync(dir, { recursive: true });
			cpSync(join(ROOT, "runtime"), join(dir, "runtime"), { recursive: true });
			const adapter = join(ROOT, "adapters", a.adapter);
			cpSync(adapter, join(dir, "adapter"), { recursive: true });
			mkdirSync(join(dir, "lib"), { recursive: true });
			cpSync(join(ROOT, "lib", "check.mjs"), join(dir, "lib", "check.mjs"));
			writeFileSync(join(dir, "check.mjs"), VENDOR_CHECK);
			writeFileSync(join(dir, "MOTION_KIT_VERSION"), `motion-kit ${VERSION}\nadapter ${a.adapter}\nvendored from liqweed/motion-kit; do not edit here, re-vendor instead.\n`);
			console.log(`vendored runtime + ${a.adapter} adapter (motion-kit ${VERSION}) into ${dir}`);
			return;
		}
		default:
			fail(`unknown command "${cmd}" (try --help)`);
	}
}

const VENDOR_CHECK = `#!/usr/bin/env node
// motion-kit gate for vendored copies: node check.mjs <spec.json...> [--format F]
// Checks every listed spec in every format (or --format) and every locale it contains.
import { readFileSync } from "node:fs";
import { checkScene } from "./lib/check.mjs";
import { FORMATS } from "./runtime/scene.mjs";
import { createScene } from "./runtime/types/index.mjs";

const args = process.argv.slice(2);
const fi = args.indexOf("--format");
const formats = fi >= 0 ? [args.splice(fi, 2)[1]] : Object.keys(FORMATS);
let bad = 0;
for (const file of args) {
	const spec = JSON.parse(readFileSync(file, "utf8"));
	const locales = new Set();
	JSON.stringify(spec, (k, v) => {
		if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every((x) => /^[a-z]{2}$/.test(x))) Object.keys(v).forEach((l) => locales.add(l));
		return v;
	});
	for (const format of formats) {
		for (const locale of locales.size ? locales : ["en"]) {
			try {
				const r = checkScene(createScene(spec, { format, locale }));
				if (r.ok) console.log(\`✓ \${file} · \${format} · \${locale}\`);
				else { bad++; console.error(\`✗ \${file} · \${format} · \${locale}\\n  - \${r.problems.join("\\n  - ")}\`); }
			} catch (e) { bad++; console.error(\`✗ \${file} · \${format} · \${locale}: \${e.message}\`); }
		}
	}
}
process.exit(bad ? 1 : 0);
`;

function detectLocales(spec) {
	const found = new Set();
	const walk = (v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const keys = Object.keys(v);
			if (keys.length && keys.every((k) => /^[a-z]{2}(-[A-Z]{2})?$/.test(k) && typeof v[k] === "string")) keys.forEach((k) => found.add(k));
			else Object.values(v).forEach(walk);
		} else if (Array.isArray(v)) v.forEach(walk);
	};
	walk(spec);
	return found.size ? [...found] : ["en"];
}

main().catch((e) => fail(e.stack ?? e.message));
