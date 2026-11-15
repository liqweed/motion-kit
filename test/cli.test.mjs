import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { hasFfmpeg, probe } from "../lib/video.mjs";

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
