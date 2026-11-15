#!/usr/bin/env node
// The version lives in three files; they must agree (see AGENTS.md).
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const found = {
	"package.json": read("package.json").version,
	".claude-plugin/plugin.json": read(".claude-plugin/plugin.json").version,
	".claude-plugin/marketplace.json": read(".claude-plugin/marketplace.json").plugins.find((p) => p.name === "motion-kit")?.version,
};
if (new Set(Object.values(found)).size !== 1) {
	console.error("version mismatch:\n" + Object.entries(found).map(([f, v]) => `  ${f}: ${v}`).join("\n"));
	process.exit(1);
}
console.log(`version ${found["package.json"]} consistent`);
