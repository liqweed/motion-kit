import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

describe("cli", () => {
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
