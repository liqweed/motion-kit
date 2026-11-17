// PNG snapshots: the bundled scenes' step frames, rasterised, against the PNGs
// committed under test/snapshots/ (see test/png-snapshots.mjs). A frame that
// drifts past the tolerance fails and leaves expected, actual and diff PNGs in
// out/snapshots/, which CI uploads. After an intended visual change:
//
//   npm run snapshots:update
//
// and commit the changed PNGs. Skips when @resvg/resvg-js is not installed.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { NEUTRAL } from "../runtime/style.mjs";
import { compareImages, decodePng, diffImage, DIFF_DIR, encodePng, loadResvg, readSnapshot, renderFrame, SNAPSHOT_DIR, snapshotFrames, STYLE, TOLERANCE } from "./png-snapshots.mjs";

const Resvg = await loadResvg();
const frames = await snapshotFrames();
const UPDATE = "run npm run snapshots:update, check the PNGs and commit them";

// Only this run's failures end up in the CI artifact.
rmSync(DIFF_DIR, { recursive: true, force: true });

describe("PNG snapshots", () => {
	it("render with the shipped style, which is the runtime's default", () => {
		assert.deepEqual(STYLE, NEUTRAL, "styles/neutral.json and NEUTRAL in runtime/style.mjs must agree");
	});

	describe("step frames", { skip: !Resvg && "@resvg/resvg-js is not installed (npm install adds it); PNG snapshots not compared" }, () => {
		for (const { frame, scene } of frames) {
			it(`${frame.name} (${frame.label})`, () => {
				const committed = readSnapshot(join(SNAPSHOT_DIR, `${frame.name}.png`));
				assert.ok(committed, `no snapshot test/snapshots/${frame.name}.png: ${UPDATE}`);
				const png = renderFrame(Resvg, scene, frame);
				const expected = decodePng(committed);
				const actual = decodePng(png);
				const r = compareImages(expected, actual);
				if (r.ok) return;
				const base = join(DIFF_DIR, frame.name);
				mkdirSync(dirname(base), { recursive: true });
				writeFileSync(`${base}.expected.png`, committed);
				writeFileSync(`${base}.actual.png`, png);
				if (r.sameSize) writeFileSync(`${base}.diff.png`, encodePng(diffImage(expected, actual)));
				const what = r.sameSize
					? `${r.differing} pixels (${(r.ratio * 100).toFixed(3)} %) differ by more than ${TOLERANCE.channel}/255, max ${r.maxDelta}; ${(TOLERANCE.pixels * 100).toFixed(3)} % allowed`
					: `size ${actual.width}×${actual.height}, snapshot ${expected.width}×${expected.height}`;
				assert.fail(`${frame.name}: ${what}. Images in ${relative(process.cwd(), dirname(base))}/. If the change is intended, ${UPDATE}.`);
			});
		}

		it("every committed snapshot belongs to a frame", () => {
			const want = new Set(frames.map(({ frame }) => `${frame.name}.png`));
			/** @param {string} dir @returns {string[]} */
			const list = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(dir, e.name)) : [relative(SNAPSHOT_DIR, join(dir, e.name))]));
			const stale = list(SNAPSHOT_DIR).filter((f) => !want.has(f.split("\\").join("/")));
			assert.deepEqual(stale, [], `stale snapshots: ${UPDATE}`);
		});
	});
});
