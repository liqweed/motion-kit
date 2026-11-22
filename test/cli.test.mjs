import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { after, describe, it } from "node:test";
import { rasterizer } from "../lib/raster.mjs";
import { hasFfmpeg, probe } from "../lib/video.mjs";

const hasRaster = Boolean(await rasterizer());

const CLI = new URL("../cli/motion-kit.mjs", import.meta.url).pathname;
const EX = new URL("../examples/", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "mk-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, MOTION_KIT_STRICT: "" } });
/** Run a node script; never throws. @returns {{ status: number, out: string }} */
const node = (...args) => {
	try {
		return { status: 0, out: execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
	} catch (e) {
		const { status, stdout, stderr } = /** @type {{ status: number, stdout: string, stderr: string }} */ (e);
		return { status, out: `${stdout}${stderr}` };
	}
};

// A custom module that needs its text from the caller (options.labels), uses
// the runtime only through `kit` and defines a clip path from its id prefix.
const LABELLED = `export default function make({ format = "16:9", labels, kit }) {
	if (!labels) throw new Error("labels option missing");
	const { FORMATS, tok, el, text, num, progress } = kit;
	const f = FORMATS[format];
	const W = f.width;
	const H = f.height || 300;
	const steps = labels.steps.map((label, i) => ({ at: 0.6 + i * 0.6, label }));
	const shown = (t, i) => progress(t, steps[i].at - 0.4, 0.4);
	return {
		id: \`labelled-\${format.replace(":", "x")}\`, width: W, height: H, duration: steps[steps.length - 1].at + 0.3,
		title: labels.title, description: labels.title, steps,
		frame(t, { idPrefix }) {
			const w = num((W * steps.reduce((sum, _, i) => sum + shown(t, i), 0)) / steps.length);
			return el("defs", {}, el("clipPath", { id: \`\${idPrefix}-bar\` }, el("rect", { width: w, height: 20 }))) +
				el("rect", { width: W, height: 20, fill: tok("accent"), "clip-path": \`url(#\${idPrefix}-bar)\` }) +
				steps.map((s, i) => text({ x: 20, y: 60 + i * 30, "font-size": 16, fill: tok("ink"), opacity: num(shown(t, i), 3) }, s.label)).join("");
		},
	};
}
`;
const DICT = `const DICT = { en: { title: "Three steps", steps: ["First", "Second", "Third"] }, nl: { title: "Drie stappen", steps: ["Eerste", "Tweede", "Derde"] } };
export default ({ locale }) => ({ labels: DICT[locale] });
`;

describe("cli", () => {
	it("--version prints the package version", () => {
		const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		assert.equal(run("--version").trim(), version);
		assert.equal(run("-v").trim(), version);
	});
	it("vendor includes the full MIT licence with every adapter", () => {
		const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
		for (const adapter of ["page", "astro", "slidev", "element"]) {
			const dir = join(tmp, `vendor-${adapter}`);
			run("vendor", dir, "--adapter", adapter);
			assert.equal(readFileSync(join(dir, "LICENSE"), "utf8"), license, adapter);
		}
	});
	it("vendor element copies the unbuilt module and its runtime dependencies", () => {
		const dir = join(tmp, "element");
		run("vendor", dir, "--adapter", "element");
		assert.ok(existsSync(join(dir, "adapter/motion-diagram.mjs")));
		assert.ok(existsSync(join(dir, "runtime/player.mjs")));
		assert.ok(existsSync(join(dir, "runtime/links.mjs")));
		assert.ok(existsSync(join(dir, "runtime/types/index.mjs")));
		assert.match(readFileSync(join(dir, "MOTION_KIT_VERSION"), "utf8"), /adapter element/);
	});
	it("vendored gate checks specs and custom modules with locales, options and a style", () => {
		const dir = join(tmp, "vendor-gate");
		run("vendor", dir, "--adapter", "astro");
		for (const f of ["lib/check.mjs", "lib/gate.mjs", "lib/load.mjs", "runtime/kit.mjs"]) assert.ok(existsSync(join(dir, f)), f);
		mkdirSync(join(dir, "scenes"));
		cpSync(`${EX}order-flow.json`, join(dir, "scenes/order-flow.json"));
		// The example imports "../runtime/…", which resolves to the vendored runtime from scenes/.
		cpSync(`${EX}custom-pulse.scene.mjs`, join(dir, "scenes/pulse.scene.mjs"));
		writeFileSync(join(dir, "scenes/labelled.scene.mjs"), LABELLED);
		writeFileSync(join(dir, "scenes/labels.mjs"), DICT);
		writeFileSync(join(dir, "brand.json"), JSON.stringify({ name: "brand", light: { accent: "#6b2510" }, dark: { accent: "#2563eb" } }));
		writeFileSync(join(dir, "low.json"), JSON.stringify({ name: "low", light: { accent: "#9ca3af" } }));
		const gate = join(dir, "check.mjs");

		let r = node(gate, join(dir, "scenes/order-flow.json"));
		assert.equal(r.status, 0, r.out);
		assert.equal((r.out.match(/✓/g) ?? []).length, 6 * 2);

		r = node(gate, join(dir, "scenes/pulse.scene.mjs"), join(dir, "scenes/labelled.scene.mjs"), "--locale", "en", "--locale", "nl", "--style", join(dir, "brand.json"), "--options", join(dir, "scenes/labels.mjs"));
		assert.equal(r.status, 0, r.out);
		assert.equal((r.out.match(/✓ .*labelled\.scene\.mjs/g) ?? []).length, 6 * 2);
		assert.equal((r.out.match(/✓ .*pulse\.scene\.mjs/g) ?? []).length, 6 * 2);

		r = node(gate, join(dir, "scenes/labelled.scene.mjs"), "--format", "tall", "--style", join(dir, "low.json"), "--options", join(dir, "scenes/labels.mjs"));
		assert.equal(r.status, 1);
		assert.match(r.out, /⚠ style: low light: onAccent on accent is 2\.54:1, needs 4\.5:1 \(held against: .*custom scenes that declare no or empty contrastPairs, or name this pair/);
		assert.match(r.out, /✗ .*labelled\.scene\.mjs · tall · en\n {2}- contrast: low light: onAccent on accent/);

		writeFileSync(join(dir, "scenes/broken.json"), "{ not json");
		r = node(gate, join(dir, "scenes/missing.scene.mjs"), join(dir, "scenes/broken.json"), join(dir, "scenes/order-flow.json"), "--format", "16:9");
		assert.equal(r.status, 1);
		assert.match(r.out, /✗ .*missing\.scene\.mjs: Cannot find module/);
		assert.match(r.out, /✗ .*broken\.json: /);
		assert.equal((r.out.match(/✓ .*order-flow\.json/g) ?? []).length, 2);
	});
	it("check, build and export pass scene options to a custom module", () => {
		const dir = join(tmp, "options");
		mkdirSync(dir);
		writeFileSync(join(dir, "labelled.scene.mjs"), LABELLED);
		writeFileSync(join(dir, "labels.mjs"), DICT);
		const mod = join(dir, "labelled.scene.mjs");
		assert.equal(node(CLI, "check", mod, "-f", "16:9").status, 1);
		const out = run("check", mod, "-f", "16:9", "-f", "tall", "-l", "en", "-l", "nl", "--options", join(dir, "labels.mjs"));
		assert.equal((out.match(/✓/g) ?? []).length, 4);
		run("build", mod, "-o", join(dir, "p.html"), "-l", "nl", "--options", '{"labels":{"title":"Drie stappen","steps":["Eerste","Tweede"]}}');
		const html = readFileSync(join(dir, "p.html"), "utf8");
		assert.match(html, /<title>Drie stappen<\/title>/);
		assert.match(html, /<li>Tweede<\/li>/);
		assert.match(html, /kit: MotionKit/);
		run("export", mod, "-o", join(dir, "exp"), "-l", "nl", "--options", join(dir, "labels.mjs"));
		assert.match(readFileSync(join(dir, "exp", "03-derde.svg"), "utf8"), /Derde/);
		run("export", mod, "-o", join(dir, "exp-en"), "-l", "en", "--options", join(dir, "labels.mjs"));
		const [nl, en] = ["exp", "exp-en"].map((d) => JSON.parse(readFileSync(join(dir, d, "manifest.json"), "utf8")));
		assert.equal(nl.locale, "nl");
		assert.deepEqual(nl.options.labels.steps, ["Eerste", "Tweede", "Derde"]);
		assert.notEqual(nl.inputHash, en.inputHash);
		assert.match(node(CLI, "build", `${EX}order-flow.json`, "-o", join(dir, "x.html"), "--options", "{}").out, /--options apply to custom scene modules/);
	});
	it("every command gives the same advice on a scene over 12 s, and acknowledging it records the reason", () => {
		const dir = join(tmp, "advice");
		mkdirSync(dir);
		writeFileSync(join(dir, "labels.json"), JSON.stringify({ labels: { title: "Three steps", steps: ["First", "Second", "Third"] } }));
		const long = LABELLED.replace(/duration: [^,]+,/, "duration: 16,");
		const plain = join(dir, "long.scene.mjs");
		const said = join(dir, "said.scene.mjs");
		writeFileSync(plain, long);
		writeFileSync(said, long.replace("title: labels.title,", 'acknowledge: [{ rule: "duration", reason: "Voice-over sets the pace." }], title: labels.title,'));
		const both = (/** @type {string[]} */ ...args) => {
			const p = spawnSync(process.execPath, [CLI, ...args, "--options", join(dir, "labels.json")], { encoding: "utf8", env: { ...process.env, MOTION_KIT_STRICT: "" } });
			return { status: p.status, out: `${p.stdout}${p.stderr}` };
		};
		// check: the rule, the value, why, when it is fine, the alternative; exit 0.
		let r = both("check", plain, "-f", "16:9");
		assert.equal(r.status, 0, r.out);
		for (const part of [/advice \[duration\]: duration 16\.0 s exceeds 12 s/, /why: .*watched once/, /fine when: .*voice-over/, /instead: .*Split the scene/, /acknowledge: \[\{ rule: "duration"/]) assert.match(r.out, part);
		// The other commands print the same text; strict mode fails each before it writes anything.
		const out = (/** @type {string} */ f) => join(dir, f);
		const commands = [["build", "-o", out("p.html")], ["export", "-o", out("exp")], ["bake", "-o", out("b.svg")], ["icon", "-o", out("icons"), "--no-png"]];
		// video: strict rejection comes before any rendering, so it needs no ffmpeg; an ordinary render does.
		r = both("video", plain, "-f", "1:1", "--strict", "-o", out("v-strict.mp4"));
		assert.equal(r.status, 1, r.out);
		assert.match(r.out, /motion-kit: advice \[duration\]: duration 16\.0 s exceeds 12 s/);
		assert.match(r.out, /scene fails the gate:\n {2}- advice \[duration\]/);
		assert.equal(existsSync(out("v-strict.mp4")), false, "video wrote nothing");
		if (hasFfmpeg() && hasRaster) {
			r = both("video", plain, "-f", "1:1", "-o", out("v.mp4"), "--fps", "5", "--scale", "1", "--hold", "0");
			assert.equal(r.status, 0, r.out);
			assert.match(r.out, /motion-kit: advice \[duration\]: duration 16\.0 s exceeds 12 s/);
		}
		for (const [cmd, ...rest] of commands) {
			r = both(cmd, plain, "-f", "1:1", ...rest);
			assert.equal(r.status, 0, `${cmd}: ${r.out}`);
			assert.match(r.out, /motion-kit: advice \[duration\]: duration 16\.0 s exceeds 12 s/, cmd);
			assert.match(r.out, /motion-kit: {3}fine when: /, cmd);
		}
		assert.equal(JSON.parse(readFileSync(out("exp/manifest.json"), "utf8")).advice[0].acknowledged, false);
		for (const [cmd, ...rest] of commands) {
			r = both(cmd, plain, "-f", "1:1", "--strict", ...rest.map((x) => (x.startsWith(dir) ? `${x}-strict` : x)));
			assert.equal(r.status, 1, cmd);
			assert.match(r.out, /scene fails the gate:\n {2}- advice \[duration\]: duration 16\.0 s exceeds 12 s .*strict mode/, cmd);
			assert.match(r.out, /motion-kit: {3}why: /, `${cmd} explains the advice before refusing`);
			assert.equal(existsSync(`${rest[1]}-strict`), false, `${cmd} wrote nothing`);
		}
		assert.equal(both("check", plain, "-f", "16:9", "--strict").status, 1);
		assert.equal(spawnSync(process.execPath, [CLI, "check", plain, "-f", "16:9", "--options", join(dir, "labels.json")], { encoding: "utf8", env: { ...process.env, MOTION_KIT_STRICT: "1" } }).status, 1);
		// Acknowledged: reported with the reason, passes strict mode, and the manifest records it.
		r = both("check", said, "-f", "16:9", "--strict");
		assert.equal(r.status, 0, r.out);
		assert.match(r.out, /ℹ .*said\.scene\.mjs: acknowledged \[duration\]: Voice-over sets the pace\. \[16:9 · en\]/);
		assert.doesNotMatch(r.out, /fine when/);
		for (const [cmd, ...rest] of commands) assert.equal(both(cmd, said, "-f", "1:1", "--strict", ...rest.map((x) => (x.startsWith(dir) ? `${x}-said` : x))).status, 0, cmd);
		assert.deepEqual(both("export", said, "-f", "1:1", "-o", out("exp-said")).status, 0);
		const { advice } = JSON.parse(readFileSync(out("exp-said/manifest.json"), "utf8"));
		assert.deepEqual(advice.map((/** @type {any} */ a) => [a.rule, a.acknowledged, a.reason]), [["duration", true, "Voice-over sets the pace."]]);
		// The vendored gate says the same.
		const vendored = join(dir, "vendor");
		run("vendor", vendored, "--adapter", "astro");
		const v = spawnSync(process.execPath, [join(vendored, "check.mjs"), plain, "--format", "16:9", "--options", join(dir, "labels.json"), "--strict"], { encoding: "utf8" });
		assert.equal(v.status, 1, `${v.stdout}${v.stderr}`);
		assert.match(`${v.stdout}${v.stderr}`, /advice \[duration\]: duration 16\.0 s exceeds 12 s/);
	});
	it("refuses an acknowledgement without a reason, of an unknown rule or of a hard rule, and fails a hard rule whatever is acknowledged", () => {
		const dir = join(tmp, "refused");
		mkdirSync(dir);
		writeFileSync(join(dir, "labels.json"), JSON.stringify({ labels: { title: "Three steps", steps: ["First", "Second", "Third"] } }));
		const make = (/** @type {string} */ name, /** @type {string} */ ack, /** @type {string} */ body = "") => {
			const file = join(dir, name);
			writeFileSync(file, LABELLED.replace(/duration: [^,]+,/, "duration: 16,").replace("title: labels.title,", `acknowledge: ${ack}, title: labels.title,`).replace("\t\t\tconst w =", `\t\t\t${body}\n\t\t\tconst w =`));
			return file;
		};
		const check = (/** @type {string} */ file) => {
			const p = spawnSync(process.execPath, [CLI, "check", file, "-f", "16:9", "--options", join(dir, "labels.json")], { encoding: "utf8", env: { ...process.env, MOTION_KIT_STRICT: "" } });
			return { status: p.status, out: `${p.stdout}${p.stderr}` };
		};
		let r = check(make("noreason.scene.mjs", '[{ rule: "duration" }]'));
		assert.equal(r.status, 1);
		assert.match(r.out, /acknowledge: "duration" needs a reason, one line saying why/);
		r = check(make("blank.scene.mjs", '[{ rule: "duration", reason: "  " }]'));
		assert.match(r.out, /needs a reason/);
		r = check(make("hard.scene.mjs", '[{ rule: "contrast", reason: "we like it" }]'));
		assert.equal(r.status, 1);
		assert.match(r.out, /"contrast" is not an advice rule \(known: duration, .*\); a hard rule .* cannot be acknowledged/);
		// A hard rule fails, acknowledged or not: this frame reads the clock.
		r = check(make("clock.scene.mjs", '[{ rule: "duration", reason: "Voice-over sets the pace." }]', "const stamp = Date.now();"));
		assert.equal(r.status, 1);
		assert.match(r.out, /frame\(\) reads the clock/);
		// An acknowledgement of a rule the scene does not break is said, not failed.
		const calm = join(dir, "calm.scene.mjs");
		writeFileSync(calm, LABELLED.replace("title: labels.title,", 'acknowledge: [{ rule: "duration", reason: "Not needed." }], title: labels.title,'));
		r = check(calm);
		assert.equal(r.status, 0, r.out);
		assert.match(r.out, /acknowledges \[duration\] but never breaks it/);
		// The other commands say it too, and a control character in a reason is refused.
		const e = spawnSync(process.execPath, [CLI, "bake", calm, "-o", join(dir, "calm.svg"), "--options", join(dir, "labels.json")], { encoding: "utf8" });
		assert.equal(e.status, 0, e.stderr);
		assert.match(e.stderr, /acknowledges \[duration\] but this variant never breaks it/);
		r = check(make("escape.scene.mjs", '[{ rule: "duration", reason: "\\u001b[2JApproved" }]'));
		assert.equal(r.status, 1);
		assert.match(r.out, /one line of plain text/);
	});
	it("check passes every example in every format and locale", () => {
		const out = run("check", `${EX}order-flow.json`, `${EX}smart-home.json`);
		assert.equal((out.match(/✓/g) ?? []).length, 2 * 6 * 2);
	});
	it("check --style gives advice on emphasis on accent, and fails the pairs a scene declares", () => {
		const dir = join(tmp, "contrast");
		mkdirSync(dir);
		writeFileSync(join(dir, "blue.json"), JSON.stringify({ name: "blue", light: { accent: "#2563eb", emphasis: "#3b6cf0" }, dark: { accent: "#2563eb", emphasis: "#fbbf24" } }));
		const both = (/** @type {string[]} */ ...args) => {
			const p = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, MOTION_KIT_STRICT: "" } });
			return { status: p.status, out: `${p.stdout}${p.stderr}` };
		};
		let r = both("check", `${EX}order-flow.json`, "-f", "16:9", "--style", join(dir, "blue.json"));
		// Emphasis on accent is advice, not a WCAG failure: the style's result for the pair is
		// shown once, with who it is advice for; order-flow (a sequence) draws it, so it is told
		// there, and it fails only in strict mode.
		assert.equal(r.status, 0, r.out);
		assert.match(r.out, /⚠ style: blue light: emphasis on accent is 1\.13:1, needs 3:1 \(advice for: sequence, /);
		assert.match(r.out, /ℹ .*order-flow\.json: advice \[emphasis-on-accent\]: blue light: emphasis on accent is 1\.13:1, 3:1 recommended/);
		r = both("check", `${EX}order-flow.json`, "-f", "16:9", "--style", join(dir, "blue.json"), "--strict");
		assert.equal(r.status, 1);
		assert.match(r.out, /✗ .*order-flow\.json · 16:9 · en\n {2}- advice \[emphasis-on-accent\]: blue light: emphasis on accent is 1\.13:1/);
		// A lighter dark surface passes the shared pairs but not custom-pulse's bar on its track.
		writeFileSync(join(dir, "raised.json"), JSON.stringify({ name: "raised", dark: { surface: "#2b3242" } }));
		r = node(CLI, "check", `${EX}order-flow.json`, `${EX}custom-pulse.scene.mjs`, "-f", "16:9", "--style", join(dir, "raised.json"));
		assert.equal(r.status, 1);
		assert.match(r.out, /✓ .*order-flow\.json · 16:9/);
		assert.match(r.out, /✗ .*custom-pulse\.scene\.mjs · 16:9 · en\n {2}- contrast: raised dark: accent on surface is 2\.48:1, needs 3:1/);
		assert.doesNotMatch(r.out, /⚠ style:/);
	});
	it("fails only the pairs a scene draws: a custom scene that declares them passes with a warning, one that declares nothing fails", () => {
		const dir = join(tmp, "drawn");
		mkdirSync(dir);
		// Emphasis is 1.43:1 on the canvas, and neither scene draws it.
		writeFileSync(join(dir, "paper.json"), JSON.stringify({ name: "paper", light: { emphasis: "#d8d8d8" } }));
		writeFileSync(join(dir, "labels.json"), JSON.stringify({ labels: { title: "Three steps", steps: ["First", "Second", "Third"] } }));
		const declared = join(dir, "declared.scene.mjs");
		const undeclared = join(dir, "undeclared.scene.mjs");
		writeFileSync(declared, LABELLED.replace("title: labels.title,", 'contrastPairs: kit.sharedPairs("ink/bg", "accent/bg"), title: labels.title,'));
		writeFileSync(undeclared, LABELLED);
		const opts = ["--options", join(dir, "labels.json"), "--style", join(dir, "paper.json")];
		// Warnings go to stderr, which `node` drops from a run that succeeds.
		const both = (/** @type {string[]} */ ...args) => {
			const p = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
			return { status: p.status, out: `${p.stdout}${p.stderr}` };
		};
		let r = both("check", declared, "-f", "16:9", ...opts);
		assert.equal(r.status, 0, r.out);
		assert.match(r.out, /⚠ style: paper light: emphasis on bg is 1\.\d+:1, needs 3:1 \(held against: .*\)/);
		assert.match(r.out, /✓ .*declared\.scene\.mjs · 16:9/);
		assert.doesNotMatch(r.out, /✗/);
		// The page's player paints a focus outline in emphasis, so build refuses what check allows.
		r = both("build", declared, "-o", join(dir, "declared.html"), ...opts);
		assert.equal(r.status, 1, r.out);
		assert.match(r.out, /motion-kit: warning: contrast: paper light: emphasis on bg is 1\.\d+:1, 3:1 recommended \(this scene does not draw it\)/);
		assert.match(r.out, /the player in the page fails the gate[\s\S]*emphasis on bg/);
		r = both("check", undeclared, "-f", "16:9", ...opts);
		assert.equal(r.status, 1);
		assert.match(r.out, /✗ .*undeclared\.scene\.mjs · 16:9 · en\n {2}- contrast: paper light: emphasis on bg is /);
		r = both("build", undeclared, "-o", join(dir, "undeclared.html"), ...opts);
		assert.equal(r.status, 1);
		assert.match(r.out, /scene fails the gate/);
		// The page paints the player too: a scene that never draws onAccent on accent still fails build on it.
		writeFileSync(join(dir, "flat.json"), JSON.stringify({ name: "flat", light: { onAccent: "#2563eb", accent: "#2563eb" } }));
		r = both("build", declared, "-o", join(dir, "flat.html"), "--options", join(dir, "labels.json"), "--style", join(dir, "flat.json"));
		assert.equal(r.status, 1, r.out);
		assert.match(r.out, /the player in the page fails the gate[\s\S]*onAccent on accent/);
	});
	it("export writes standalone steps, QC frames and a reproducible manifest", () => {
		const dir = join(tmp, "exp");
		run("export", `${EX}order-flow.json`, "-o", dir, "--qc", "-l", "nl");
		const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
		assert.equal(m.files.filter((f) => f.kind === "step").length, 6);
		assert.ok(m.files.some((f) => f.kind === "before"));
		assert.ok(!readFileSync(join(dir, m.files[0].svg), "utf8").includes("var(--"));
		run("export", `${EX}order-flow.json`, "-o", join(tmp, "exp2"), "--qc", "-l", "nl");
		const m2 = JSON.parse(readFileSync(join(tmp, "exp2", "manifest.json"), "utf8"));
		assert.deepEqual(m2, m);
	});
	it("re-exporting into a folder replaces the previous export and leaves other files alone", () => {
		const dir = join(tmp, "re-export");
		run("export", `${EX}order-flow.json`, "-o", dir, "--qc", "-l", "nl");
		writeFileSync(join(dir, "notes.txt"), "mine");
		const r = spawnSync(process.execPath, [CLI, "export", `${EX}order-flow.json`, "-o", dir, "-l", "en"], { encoding: "utf8" });
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stderr, /left 1 file\(s\) in .* that no export wrote: notes\.txt/);
		const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
		assert.equal(m.locale, "en");
		const listed = new Set(["manifest.json", "index.html", ...m.files.flatMap((f) => [f.svg, f.png].filter(Boolean))]);
		const present = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join("/"));
		assert.deepEqual(present.filter((p) => !listed.has(p)), ["notes.txt"]);
		assert.equal(present.length, listed.size + 1);
		assert.equal(readFileSync(join(dir, "notes.txt"), "utf8"), "mine");
	});
	it("the manifest says whether the source differs from the commit it names", () => {
		const repo = join(tmp, "repo");
		mkdirSync(repo);
		// Inside a git hook (pre-push runs the gate) GIT_DIR and friends name
		// this repository; drop them so git works on the temporary one.
		const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
		const git = (...args) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, env, stdio: "pipe" });
		const spec = join(repo, "flow.json");
		const manifest = (name) => {
			run("export", spec, "-o", join(tmp, name), "-f", "16:9");
			const m = JSON.parse(readFileSync(join(tmp, name, "manifest.json"), "utf8"));
			return { commit: m.sourceCommit, dirty: m.sourceDirty };
		};
		cpSync(`${EX}order-flow.json`, spec);
		assert.deepEqual(manifest("git-none"), { commit: null, dirty: null }, "outside a repository");
		git("init", "-q");
		git("add", "flow.json");
		git("commit", "-q", "-m", "flow");
		const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, env, encoding: "utf8" }).trim();
		assert.deepEqual(manifest("git-clean"), { commit: head, dirty: false });
		writeFileSync(spec, readFileSync(spec, "utf8").replace("The customer places", "A customer places"));
		assert.deepEqual(manifest("git-dirty"), { commit: head, dirty: true }, "modified since the commit");
		writeFileSync(join(repo, "other.txt"), "unrelated");
		git("checkout", "--", "flow.json");
		assert.deepEqual(manifest("git-other"), { commit: head, dirty: false }, "other files do not count");
	});
	it("export's phone row shows the tall layout", () => {
		const dir = join(tmp, "exp-phone");
		run("export", `${EX}order-flow.json`, "-o", dir, "-f", "16:9");
		const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
		const phone = m.files.find((f) => f.kind === "phone");
		assert.equal(phone.svg, "qc/phone.svg");
		const svg = readFileSync(join(dir, phone.svg), "utf8");
		assert.match(svg, /viewBox="0 0 360 \d+" width="360"/);
		assert.match(readFileSync(join(dir, "index.html"), "utf8"), /Phone size \(tall layout, 360 px wide\)<\/h2><div class="grid phone"><figure><img src="qc\/phone\.svg"/);
	});
	it("build writes one self-contained HTML file", () => {
		const f = join(tmp, "p.html");
		run("build", `${EX}smart-home.json`, "-o", f);
		const html = readFileSync(f, "utf8");
		assert.ok(!/<script[^>]+src=|<link[^>]+href=|fetch\(|import\s*\(/.test(html));
		assert.ok(html.includes("MotionKitRuntime.mountPlayer"));
	});
	it("bake writes a zero-JS SVG", () => {
		const f = join(tmp, "b.svg");
		run("bake", `${EX}smart-home.json`, "-o", f, "--fps", "10");
		assert.ok(!readFileSync(f, "utf8").includes("<script"));
	});
	it("icon writes the project icon set from a square scene, reproducibly", { skip: !hasRaster && "no rasterizer" }, () => {
		const logo = new URL("../brand/logo.scene.mjs", import.meta.url).pathname;
		const a = join(tmp, "icon-a");
		const b = join(tmp, "icon-b");
		run("icon", logo, "-o", a, "--size", "128");
		run("icon", logo, "-o", b, "--size", "128");
		for (const f of ["assets/icon.svg", "assets/icon.png", "assets/icon-animated.svg", ".idea/icon.svg", ".idea/icon_dark.svg"]) {
			assert.ok(existsSync(join(a, f)), f);
			assert.deepEqual(readFileSync(join(a, f)), readFileSync(join(b, f)), `${f} is not deterministic`);
		}
		const png = readFileSync(join(a, "assets/icon.png"));
		assert.equal(png.readUInt32BE(16), 128); // IHDR width
		assert.ok(!readFileSync(join(a, ".idea/icon_dark.svg"), "utf8").includes("var(--"));
	});
	it("icon refuses a non-square scene", () => {
		assert.throws(() => execFileSync(process.execPath, [CLI, "icon", `${EX}order-flow.json`, "-f", "16:9", "-o", join(tmp, "nope")], { stdio: "pipe" }));
	});
	it("video renders an MP4 with the expected size and duration", { skip: !hasFfmpeg() && "ffmpeg not installed" }, () => {
		const f = join(tmp, "v.mp4");
		run("video", `${EX}order-flow.json`, "-f", "1:1", "-o", f, "--fps", "10", "--scale", "1", "--hold", "0.5");
		assert.ok(existsSync(f));
		const p = probe(f);
		assert.equal(p.width, 720);
		assert.equal(p.height, 720);
		assert.ok(p.duration > 5 && p.duration < 9, `duration ${p.duration}`);
	});
});

it("bake and video reject an invalid scene before writing any output", () => {
	const file = join(tmp, "invalid.scene.mjs");
	writeFileSync(file, `export default () => ({ id: "bad", title: "Bad", description: "Bad", width: 100, height: 100, duration: 13, steps: [{at: 13,label: "Bad"}], frame: () => '<text fill="red">Bad</text>' });`);
	for (const command of ["bake", "video"]) {
		const out = join(tmp, `refused.${command === "bake" ? "svg" : "mp4"}`);
		const result = node(CLI, command, file, "-o", out);
		assert.equal(result.status, 1);
		assert.match(result.out, /scene fails the gate/);
		assert.equal(existsSync(out), false);
	}
});

it("export hashes include the runtime and render settings", () => {
	const out = join(tmp, "hash-settings");
	run("export", join(EX, "order-flow.json"), "-o", out);
	const a = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
	assert.match(a.runtimeHash, /^[a-f0-9]{64}$/);
	run("export", join(EX, "order-flow.json"), "-o", out, "--theme", "dark");
	const b = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
	assert.equal(a.runtimeHash, b.runtimeHash);
	assert.notEqual(a.inputHash, b.inputHash);
});

describe("import", () => {
	it("writes a spec from a Mermaid flowchart and checks it in every format", () => {
		const out = join(tmp, "import", "pr.json");
		const r = node(CLI, "import", join(EX, "pull-request.mmd"), "--out", out, "--id", "pull-request");
		assert.equal(r.status, 0, r.out);
		assert.match(r.out, /flowchart "pull-request", 7 nodes, 8 links/);
		assert.match(r.out, /✓ .* · tall/);
		assert.deepEqual(readdirSync(dirname(out)), ["pr.json"], "no candidate file is left behind");
		assert.equal(readFileSync(out, "utf8"), readFileSync(join(EX, "pull-request.json"), "utf8"));
	});
	it("keeps an existing spec when the gate rejects the import", () => {
		const out = join(tmp, "import-keep", "keep.json");
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, "previous\n");
		const r = node(CLI, "import", join(EX, "pull-request.mmd"), "--out", out, "--format", "nope");
		assert.equal(r.status, 1, r.out);
		assert.match(r.out, /nope/);
		assert.equal(readFileSync(out, "utf8"), "previous\n");
		assert.equal(readdirSync(dirname(out)).filter((f) => f.includes("candidate")).length, 0);
	});
	it("refuses an output path the CLI could not load as a spec, and keeps a private spec private", () => {
		const dir = join(tmp, "import-out");
		mkdirSync(dir, { recursive: true });
		const mod = node(CLI, "import", join(EX, "pull-request.mmd"), "--out", join(dir, "flow.mjs"));
		assert.equal(mod.status, 1, mod.out);
		assert.match(mod.out, /scene module path/);
		assert.deepEqual(readdirSync(dir), []);
		const priv = join(dir, "priv.json");
		writeFileSync(priv, "previous\n", { mode: 0o600 });
		chmodSync(priv, 0o600);
		const r = node(CLI, "import", join(EX, "pull-request.mmd"), "--out", priv, "--id", "pull-request");
		assert.equal(r.status, 0, r.out);
		assert.equal(statSync(priv).mode & 0o777, 0o600);
	});
	it("prints to stdout without --out, reads stdin from -, and fails on unsupported syntax", () => {
		const mmd = join(tmp, "chain.mmd");
		writeFileSync(mmd, "graph LR\nA --> B --> C\n");
		assert.equal(JSON.parse(run("import", mmd)).type, "sequence");
		assert.equal(JSON.parse(run("import", mmd)).id, "chain");
		const piped = spawnSync(process.execPath, [CLI, "import", "-", "--id", "piped"], { input: "graph TD\nA --> B\nA --> C\n", encoding: "utf8" });
		assert.equal(piped.status, 0, piped.stderr);
		assert.equal(JSON.parse(piped.stdout).type, "flowchart");
		writeFileSync(mmd, "graph TD\nsubgraph s\nA --> B\nend\n");
		const bad = node(CLI, "import", mmd);
		assert.equal(bad.status, 1);
		assert.match(bad.out, /line 2: "subgraph" is not supported/);
	});
});

describe("outdated", () => {
	/** Serve `latest` from a local registry; run the CLI against it. @param {string} version @param {string} dir */
	const outdated = async (version, dir) => {
		const { createServer } = await import("node:http");
		const server = createServer((req, res) => {
			if (req.url !== "/@liqweed%2Fmotion-kit/latest") {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ version }));
		});
		await new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(undefined)));
		const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
		try {
			const r = await new Promise((ok) => {
				const child = spawn(process.execPath, [CLI, "outdated", dir], { env: { ...process.env, npm_config_registry: `http://127.0.0.1:${port}/` } });
				let out = "";
				child.stdout.on("data", (d) => (out += d));
				child.stderr.on("data", (d) => (out += d));
				child.on("close", (status) => ok({ status, out }));
			});
			return /** @type {{ status: number, out: string }} */ (r);
		} finally {
			server.close();
		}
	};
	it("exits 1 with the re-vendor command when npm has a newer version, 0 when current", async () => {
		const dir = join(tmp, "vendored-outdated");
		run("vendor", dir, "--adapter", "astro");
		const current = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
		const behind = await outdated("99.0.0", dir);
		assert.equal(behind.status, 1, behind.out);
		assert.match(behind.out, new RegExp(`${current.replace(/\./g, "\\.")} is vendored; 99\\.0\\.0 is the latest`));
		assert.match(behind.out, /npx @liqweed\/motion-kit@99\.0\.0 vendor .* --adapter astro/);
		const same = await outdated(current, dir);
		assert.equal(same.status, 0, same.out);
		assert.match(same.out, /is up to date/);
		const missing = await outdated(current, join(tmp, "nowhere"));
		assert.equal(missing.status, 2);
		assert.match(missing.out, /no MOTION_KIT_VERSION/);
	});
});
