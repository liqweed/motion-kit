#!/usr/bin/env node
/**
 * motion-kit CLI.
 *
 *   motion-kit check  <scene...>             [--format F]… [--locale L]… [--style S] [--strict]   gate (all formats/locales by default)
 *   motion-kit build  <scene> --out x.html   [--format F] [--locale L] [--style S] [--no-scrubber] [--no-heading]
 *   motion-kit export <scene> --out dir      [--format F] [--locale L] [--style S] [--theme light|dark] [--png] [--scale 2] [--qc] [--background]
 *   motion-kit bake   <scene> --out x.svg    [--fps 15] [--theme ...] [--style S]
 *   motion-kit video  <scene> --out x.mp4|.gif|.webm [--fps 30] [--scale 2] [--hold 1.5] [--sheet sheet.png]
 *   motion-kit icon   <scene> --out <repo>  [--size 512] [--style S] [--no-png]   project icon set (assets/, .idea/)
 *   motion-kit import <flow.mmd|-> [--out spec.json] [--id ID] [--title T] [--description D]   Mermaid flowchart → spec
 *   motion-kit vendor <dir> [--adapter page|slidev|astro|element]
 *   motion-kit outdated <dir>                 is a vendored copy behind npm's latest? (exit 1 when it is)
 *   motion-kit formats | types
 *   motion-kit --version                      print the version
 *
 * <scene> is a spec (.json, any registered type) or a custom module (.mjs).
 * Every command that checks a scene prints the canon's advice the same way (what
 * was found, why, when breaking it is fine, the alternative). A scene
 * acknowledges advice with `acknowledge: [{ rule, reason }]`; --strict (or
 * MOTION_KIT_STRICT=1) fails a scene that leaves advice unacknowledged.
 * --options O passes scene options to a custom module's factory, unchanged:
 * inline JSON ('{"view":"short"}'), a .json file, or an .mjs module whose
 * default export is the options or ({ format, locale }) => options.
 *
 * import: a chain becomes a `sequence` spec; a chart with branches, joins,
 * link labels or dotted links becomes a `flowchart` spec, laid out here once.
 * Without --out the spec goes to stdout; with it, the spec is also checked in
 * every format (or only the --format ones). Unsupported Mermaid syntax fails with its line.
 */
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { printable } from "../runtime/advice.mjs";
import { bake, bakeStats } from "../runtime/bake.mjs";
import { FORMATS } from "../runtime/scene.mjs";
import { checkContrast, sharedPairs } from "../runtime/style.mjs";
import { SCENE_TYPES } from "../runtime/types/index.mjs";
import { checkScene } from "../lib/check.mjs";
import { checkFiles, gateNotes } from "../lib/gate.mjs";
import { mermaidToSpec } from "../lib/mermaid.mjs";
import { compareVersions, isAdapterName, latestVersion, PACKAGE, shellQuote, vendoredVersion } from "../lib/outdated.mjs";
import { buildHtml } from "../lib/build.mjs";
import { writeIconSet } from "../lib/icon.mjs";
import { exportSteps } from "../lib/export.mjs";
import { isModule, isStrict, loadOptions, loadScene, loadStyle } from "../lib/load.mjs";
import { rasterizer } from "../lib/raster.mjs";
import { probe, renderVideo, videoContactSheet } from "../lib/video.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const { values: a, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		out: { type: "string", short: "o" },
		format: { type: "string", short: "f", multiple: true },
		locale: { type: "string", short: "l", multiple: true },
		style: { type: "string", short: "s" },
		options: { type: "string" },
		strict: { type: "boolean", default: false },
		theme: { type: "string", default: "light" },
		png: { type: "boolean", default: false },
		scale: { type: "string", default: "2" },
		qc: { type: "boolean", default: false },
		background: { type: "boolean", default: false },
		fps: { type: "string" },
		hold: { type: "string", default: "1.5" },
		sheet: { type: "string" },
		adapter: { type: "string", default: "page" },
		id: { type: "string" },
		title: { type: "string" },
		description: { type: "string" },
		size: { type: "string", default: "512" },
		"no-png": { type: "boolean", default: false },
		"no-scrubber": { type: "boolean", default: false },
		"no-heading": { type: "boolean", default: false },
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "v" },
	},
});
const [cmd, ...args] = positionals;

function fail(msg) {
	console.error(`motion-kit: ${msg}`);
	process.exit(1);
}
/** What the gate says about a scene that passed: contrast it does not draw but the style misses (G12) and the canon's advice, the same on every command. @param {Parameters<typeof gateNotes>[0]} result */
function reportGate(result) {
	for (const line of gateNotes(result)) console.error(`motion-kit: ${line}`);
}
function need(v, what) {
	if (!v) fail(`${cmd}: ${what} is required`);
	return v;
}

async function main() {
	if (a.version) {
		console.log(VERSION);
		return;
	}
	if (!cmd || a.help) {
		const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
		console.log(src.slice(src.indexOf("/**") + 3, src.indexOf("*/")).replace(/^ \* ?/gm, ""));
		return;
	}
	const style = loadStyle(a.style);
	const strict = isStrict(a.strict);
	// Commands other than check build one format and locale: the last one given.
	const format = a.format?.at(-1);
	const where = { format: format ?? "16:9", locale: a.locale?.at(-1) ?? "en" };
	const optionsFor = await loadOptions(a.options);
	/** Scene options for one scene file at `at`; specs take none. @param {string} file @param {{format: string, locale: string}} at */
	const sceneOpts = async (file, at = where) => {
		if (optionsFor && !isModule(file)) fail(`${cmd}: --options apply to custom scene modules, not to the spec ${file}`);
		return { ...at, options: optionsFor ? await optionsFor(at) : undefined };
	};

	switch (cmd) {
		case "formats":
			for (const [k, v] of Object.entries(FORMATS)) console.log(`${k.padEnd(6)} ${v.width}×${v.height || "auto"}`);
			return;
		case "types":
			console.log(Object.keys(SCENE_TYPES).join("\n"));
			return;
		case "check": {
			if (!args.length) fail("check: give at least one scene file");
			const bad = await checkFiles(args, { formats: a.format, locales: a.locale, style, options: optionsFor, strict });
			if (bad) process.exit(1);
			return;
		}
		case "build": {
			const file = need(args[0], "<scene>");
			const sopts = await sceneOpts(file);
			const loaded = await loadScene(file, sopts);
			const r = checkScene(loaded.scene, { style, strict });
			reportGate(r);
			if (!r.ok) fail(`scene fails the gate:\n  - ${r.problems.map(printable).join("\n  - ")}`);
			// The page also paints the player: button text and borders, the selected step,
			// captions, the focus outline, and (unless --no-heading) the heading on the canvas.
			const player = checkContrast(style, sharedPairs(...(a["no-heading"] ? [] : ["ink/bg"]), "ink/surface", "onAccent/accent", "muted/bg", "emphasis/bg", "line/bg", "accent/bg"));
			if (player.length) fail(`the player in the page fails the gate:\n  - ${player.map(printable).join("\n  - ")}`);
			const html = buildHtml(loaded, { style, ...where, options: sopts.options, scrubber: !a["no-scrubber"], heading: !a["no-heading"] });
			if (/<\/script/i.test(html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>")))) fail("bundled code contains </script>");
			const out = need(a.out, "--out");
			mkdirSync(dirname(resolve(out)), { recursive: true });
			writeFileSync(out, html);
			console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB, self-contained)`);
			return;
		}
		case "export": {
			const file = need(args[0], "<scene>");
			const sopts = await sceneOpts(file);
			const { scene } = await loadScene(file, sopts);
			const r = checkScene(scene, { style, strict });
			reportGate(r);
			if (!r.ok) fail(`scene fails the gate:\n  - ${r.problems.map(printable).join("\n  - ")}`);
			if (a.png && !(await rasterizer())) fail("--png needs @resvg/resvg-js or Chrome");
			// The contact sheet's phone row shows the tall layout, as a phone does.
			/** @type {{ scene?: any, error?: string }} */
			const phone = {};
			if (where.format === "tall") phone.scene = scene;
			else {
				let tall;
				try {
					tall = (await loadScene(file, await sceneOpts(file, { ...where, format: "tall" }))).scene;
				} catch (e) {
					phone.error = e instanceof Error ? e.message : String(e);
				}
				if (tall) {
					// The tall layout ships too, so it passes the same gate; its report is told apart from the primary's.
					// An optional preview: a tall layout that fails the gate, or whose check throws, is left out, as one that cannot be built is.
					try {
						const tr = checkScene(tall, { style, strict });
						for (const line of gateNotes({ ...tr, warnings: [] })) console.error(`motion-kit: tall layout: ${line}`);
						if (tr.ok) phone.scene = tall;
						else phone.error = `the tall layout fails the gate: ${tr.problems.map(printable).join("; ")}`;
					} catch (e) {
						phone.error = `the tall layout could not be checked: ${e instanceof Error ? e.message : String(e)}`;
					}
				}
				if (phone.error) console.error(`⚠ tall preview left out: ${printable(phone.error)}`);
			}
			const m = await exportSteps(scene, { out: need(a.out, "--out"), advice: r.advice, style, theme: a.theme, png: a.png, scale: Number(a.scale), qc: a.qc, background: a.background, sourceFile: resolve(file), version: VERSION, phone, ...sopts });
			console.log(`wrote ${m.files.length} frames + index.html + manifest.json to ${a.out}`);
			return;
		}
		case "bake": {
			const file = need(args[0], "<scene>");
			const { scene } = await loadScene(file, await sceneOpts(file));
			const gate = checkScene(scene, { style, strict });
			reportGate(gate);
			if (!gate.ok) fail(`scene fails the gate:\n  - ${gate.problems.map(printable).join("\n  - ")}`);
			const svg = bake(scene, { fps: Number(a.fps ?? 15), style, theme: a.theme, background: a.background });
			const out = need(a.out, "--out");
			writeFileSync(out, svg);
			const s = bakeStats(svg);
			console.log(`wrote ${out} (${s.frames} frames, ${(s.bytes / 1024).toFixed(0)} KB, zero JS)`);
			return;
		}
		case "video": {
			const file = need(args[0], "<scene>");
			const { scene } = await loadScene(file, await sceneOpts(file));
			const gate = checkScene(scene, { style, strict });
			reportGate(gate);
			if (!gate.ok) fail(`scene fails the gate:\n  - ${gate.problems.map(printable).join("\n  - ")}`);
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
			const file = need(args[0], "<scene>");
			const { scene } = await loadScene(file, await sceneOpts(file, { ...where, format: format ?? "1:1" }));
			const r = checkScene(scene, { style, strict });
			reportGate(r);
			if (!r.ok) fail(`scene fails the gate:\n  - ${r.problems.map(printable).join("\n  - ")}`);
			const png = !a["no-png"];
			if (png && !(await rasterizer())) fail("icon PNG needs @resvg/resvg-js or Chrome (or pass --no-png)");
			const root = resolve(need(a.out, "--out"));
			const files = await writeIconSet(scene, { root, style, size: Number(a.size), png });
			console.log(`wrote to ${root}:\n  ${files.join("\n  ")}`);
			if (files.includes(".idea/icon.svg")) console.log("note: if .idea/ is git-ignored, add  !.idea/icon*.svg  after it to commit the IDE icon");
			return;
		}
		case "import": {
			const file = need(args[0], "<flow.mmd> (or - for stdin)");
			const source = readFileSync(file === "-" ? 0 : file, "utf8");
			const id = a.id ?? (file === "-" ? "flowchart" : basename(file).replace(/\.[^.]*$/, "").replace(/[^\w-]+/g, "-").replace(/^[^A-Za-z]+/, "") || "flowchart");
			let result;
			try {
				result = mermaidToSpec(source, { id, title: a.title, description: a.description });
			} catch (e) {
				fail(`import ${file}: ${e instanceof Error ? e.message : e}`);
			}
			for (const w of result.warnings) console.error(`motion-kit: import ${file}: ${w}`);
			const json = `${JSON.stringify(result.spec, null, "\t")}\n`;
			if (!a.out) {
				process.stdout.write(json);
				return;
			}
			const dest = resolve(a.out);
			if (isModule(dest)) fail(`import: --out ${a.out} is a scene module path, so check and build would not load it as a spec; use a .json path`);
			mkdirSync(dirname(dest), { recursive: true });
			// Gate a candidate beside the destination; an existing spec is replaced only once it passes.
			// Created exclusively (a planted symlink cannot redirect the write) and never more readable than the file it replaces.
			// The name is short and fixed-length so a long destination basename cannot push it past the filesystem's limit.
			const candidate = join(dirname(dest), `.import-${process.pid}-${Date.now().toString(36)}.json`);
			let mode = 0o666;
			try {
				mode = statSync(dest).mode & 0o777;
			} catch {}
			let created = false;
			let bad;
			try {
				const fd = openSync(candidate, "wx", mode);
				created = true;
				try {
					writeFileSync(fd, json);
				} finally {
					closeSync(fd);
				}
				bad = await checkFiles([candidate], { formats: a.format, locales: a.locale, style, strict });
				if (!bad) renameSync(candidate, dest);
			} finally {
				if (created) rmSync(candidate, { force: true });
			}
			if (bad) {
				console.error(`motion-kit: the import does not pass the gate (every format, or only those named by --format), so ${a.out} was not written; shorten labels, split the chart, or ship only the formats that pass (--format)`);
				process.exit(1);
			}
			const { spec } = result;
			console.log(`wrote ${a.out}: ${spec.type} "${spec.id}", ${spec.nodes.length} nodes${spec.edges ? `, ${spec.edges.length} links` : ""}`);
			return;
		}
		case "vendor": {
			const dir = resolve(need(args[0], "<dir>"));
			if (!isAdapterName(a.adapter) || !existsSync(join(ROOT, "adapters", a.adapter))) fail(`unknown adapter "${a.adapter}" (page, slidev, astro or element)`);
			const adapter = join(ROOT, "adapters", a.adapter);
			mkdirSync(dir, { recursive: true });
			cpSync(join(ROOT, "LICENSE"), join(dir, "LICENSE"));
			cpSync(join(ROOT, "runtime"), join(dir, "runtime"), { recursive: true });
			cpSync(adapter, join(dir, "adapter"), { recursive: true });
			mkdirSync(join(dir, "lib"), { recursive: true });
			for (const f of ["check.mjs", "gate.mjs", "load.mjs"]) cpSync(join(ROOT, "lib", f), join(dir, "lib", f));
			writeFileSync(join(dir, "check.mjs"), VENDOR_CHECK);
			writeFileSync(join(dir, "MOTION_KIT_VERSION"), `motion-kit ${VERSION}\nadapter ${a.adapter}\nvendored from liqweed/motion-kit; do not edit here, re-vendor instead.\n`);
			console.log(`vendored runtime + ${a.adapter} adapter (motion-kit ${VERSION}) into ${dir}`);
			return;
		}
		case "outdated": {
			const dir = resolve(need(args[0], "<dir>"));
			let vendored;
			let latest;
			try {
				vendored = vendoredVersion(dir);
				latest = await latestVersion();
			} catch (e) {
				console.error(`motion-kit: outdated: ${e instanceof Error ? e.message : e}`);
				process.exit(2);
			}
			if (compareVersions(vendored.version, latest) < 0) {
				console.log(`${dir}: motion-kit ${vendored.version} is vendored; ${latest} is the latest release.`);
				console.log(`re-vendor: npx ${PACKAGE}@${latest} vendor ${shellQuote(dir)} --adapter ${vendored.adapter}`);
				console.log(`changes: https://github.com/liqweed/motion-kit/blob/main/CHANGELOG.md`);
				process.exit(1);
			}
			console.log(`${dir}: motion-kit ${vendored.version} is up to date (latest ${latest}).`);
			return;
		}
		default:
			fail(`unknown command "${cmd}" (try --help)`);
	}
}

const VENDOR_CHECK = `#!/usr/bin/env node
// motion-kit gate for vendored copies: the same checks as \`motion-kit check\` (lib/gate.mjs).
//
//   node check.mjs <scene.json|scene.mjs …> [--format F]… [--locale L]… [--style style.json] [--options O] [--strict]
//
// Every format unless --format; for a spec every locale its strings carry, for
// a custom module its exported locales (default "en"), unless --locale. The style (neutral by default) must
// pass the contrast of the pairs each scene draws (G12). --options passes scene options to custom modules:
// a .json file, inline JSON, or an .mjs module exporting ({ format, locale }) => options.
// The canon's advice (what was found, why, when breaking it is fine, the alternative) is printed
// per scene; a scene acknowledges it with \`acknowledge: [{ rule, reason }]\`. --strict (or
// MOTION_KIT_STRICT=1) fails a scene that leaves advice unacknowledged.
// Exits 1 if anything fails; a file that cannot be loaded fails on its own.
import { parseArgs } from "node:util";
import { checkFiles } from "./lib/gate.mjs";
import { printable } from "./runtime/advice.mjs";
import { isStrict, loadOptions, loadStyle } from "./lib/load.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		format: { type: "string", multiple: true },
		locale: { type: "string", multiple: true },
		style: { type: "string" },
		options: { type: "string" },
		strict: { type: "boolean" },
		help: { type: "boolean", short: "h" },
	},
});
if (values.help || !positionals.length) {
	console.log("usage: node check.mjs <scene.json|scene.mjs …> [--format F]… [--locale L]… [--style style.json] [--options O] [--strict]");
	process.exit(values.help ? 0 : 1);
}
try {
	const bad = await checkFiles(positionals, { formats: values.format, locales: values.locale, style: loadStyle(values.style), options: await loadOptions(values.options), strict: isStrict(values.strict) });
	process.exit(bad ? 1 : 0);
} catch (e) {
	// Control and bidirectional characters in a message never reach the terminal raw.
	console.error(\`✗ \${printable(String(e instanceof Error ? e.message : e))}\`);
	process.exit(1);
}
`;

main().catch((e) => fail(String(e?.stack ?? e?.message ?? e).split("\n").map(printable).join("\n")));
