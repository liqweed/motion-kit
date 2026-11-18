#!/usr/bin/env node
// Regenerate the PNG snapshots under test/snapshots/ (npm run snapshots:update):
// render every frame of the snapshot set (test/png-snapshots.mjs), write the
// ones whose pixels changed, and delete snapshots no frame produces any more.
// Review the changed PNGs in the diff before committing them.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { decodePng, loadResvg, readSnapshot, renderFrame, SNAPSHOT_DIR, snapshotFrames } from "../test/png-snapshots.mjs";

const Resvg = await loadResvg();
if (!Resvg) {
	console.error("snapshots:update needs @resvg/resvg-js (an optional dependency): run npm install");
	process.exit(1);
}

const keep = new Set();
let written = 0;
let unchanged = 0;
for (const { frame, scene } of await snapshotFrames()) {
	const path = join(SNAPSHOT_DIR, `${frame.name}.png`);
	keep.add(path);
	const png = renderFrame(Resvg, scene, frame);
	const old = readSnapshot(path);
	// Same pixels: keep the committed file, so a PNG encoder change alone
	// leaves no diff.
	const before = old && decodePng(old);
	const after = before && decodePng(png);
	if (before && after && before.width === after.width && before.height === after.height && before.data.equals(after.data)) {
		unchanged++;
		continue;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, png);
	console.log(`${old ? "updated" : "added  "} ${relative(process.cwd(), path)}`);
	written++;
}

let removed = 0;
/** @param {string} dir */
const prune = (dir) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			prune(path);
			if (!readdirSync(path).length) rmSync(path, { recursive: true });
		} else if (entry.name.endsWith(".png") && !keep.has(path)) {
			rmSync(path);
			console.log(`removed ${relative(process.cwd(), path)}`);
			removed++;
		}
	}
};
mkdirSync(SNAPSHOT_DIR, { recursive: true });
prune(SNAPSHOT_DIR);
console.log(`snapshots: ${written} written, ${unchanged} unchanged, ${removed} removed (${keep.size} frames)`);
