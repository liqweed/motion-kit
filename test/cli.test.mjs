import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { rasterizer } from "../lib/raster.mjs";
import { hasFfmpeg, probe } from "../lib/video.mjs";

const hasRaster = Boolean(await rasterizer());

const CLI = new URL("../cli/motion-kit.mjs", import.meta.url).pathname;
const EX = new URL("../examples/", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "mk-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
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
		writeFileSync(join(dir, "brand.json"), JSON.stringify({ name: "brand", light: { accent: "#7c2d12" }, dark: { accent: "#2563eb" } }));
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
		assert.match(r.out, /✗ style: low light: onAccent on accent/);

		writeFileSync(join(dir, "scenes/broken.json"), "{ not json");
		r = node(gate, join(dir, "scenes/missing.scene.mjs"), join(dir, "scenes/broken.json"), join(dir, "scenes/order-flow.json"), "--format", "16:9");
		assert.equal(r.status, 1);
		assert.match(r.out, /✗ .*missing\.scene\.mjs · 16:9 · en/);
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
	it("check passes every example in every format and locale", () => {
		const out = run("check", `${EX}order-flow.json`, `${EX}smart-home.json`);
		assert.equal((out.match(/✓/g) ?? []).length, 2 * 6 * 2);
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
		assert.ok(html.includes("MotionKit.mountPlayer"));
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
