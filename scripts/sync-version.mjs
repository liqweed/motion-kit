#!/usr/bin/env node
// Run by the jig release step (changelog.after_version) after package.json's
// version moves: copies it to the files that repeat it, changing only the
// version string so the release pull request stays a one-line-per-file diff.
// `npm run versions` checks they agree.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

/**
 * Replace the first `"version": "…"` that follows `anchor` in a file.
 * @param {string} path
 * @param {string} anchor text that precedes the version line (empty: first match)
 */
function setVersion(path, anchor = "") {
	const url = new URL(path, root);
	const text = readFileSync(url, "utf8");
	const from = anchor ? text.indexOf(anchor) : 0;
	if (from < 0) throw new Error(`${path}: anchor ${anchor} not found`);
	const re = /("version": ")[^"]*(")/g;
	re.lastIndex = from;
	const m = re.exec(text);
	if (!m) throw new Error(`${path}: no version key`);
	writeFileSync(url, text.slice(0, m.index) + m[1] + version + m[2] + text.slice(m.index + m[0].length));
}

setVersion(".claude-plugin/plugin.json");
setVersion(".claude-plugin/marketplace.json", '"name": "motion-kit",\n\t\t\t"source"');
setVersion("package-lock.json"); // top-level version
setVersion("package-lock.json", '"": {'); // root package entry
console.log(`synced version ${version}`);
