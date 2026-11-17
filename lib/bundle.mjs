/**
 * motion-kit · tiny module inliner (Node side).
 *
 * Turns runtime ES modules (plus an optional custom scene module) into one
 * classic <script> body with no imports, so the output works where only inline
 * scripts are allowed (Craft Pages: connect-src 'none'; plain file:// HTML).
 *
 * Supported subset (enforced, throws otherwise): single-line
 *   import { a, b as c } from "./relative.mjs";
 * and top-level `export function|const|let|class NAME`, `export { a, b }`,
 * `export default <expr|function>`. Each module gets its own scope.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["'];?\s*$/;

/**
 * @param {string[]} entries
 * @param {{ globalName?: string, runtimeName?: string, runtimeCount?: number }} [o]
 */
export function bundle(entries, { globalName = "MotionKit", runtimeName = "", runtimeCount = entries.length } = {}) {
	const order = [];
	const seen = new Map();
	function visit(file) {
		const abs = resolve(file);
		if (seen.has(abs)) return seen.get(abs);
		const id = `__m${seen.size}`;
		seen.set(abs, id);
		const src = readFileSync(abs, "utf8");
		const lines = src.split("\n");
		const body = [];
		const exported = [];
		for (const line of lines) {
			if (/^\s*import\s/.test(line)) {
				const m = line.match(IMPORT_RE);
				if (!m) throw new Error(`${abs}: unsupported import form: ${line.trim()}`);
				const dep = visit(resolve(dirname(abs), m[2]));
				const names = m[1]
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
					.map((s) => s.replace(/\s+as\s+/, ": "));
				body.push(`const { ${names.join(", ")} } = ${dep};`);
				continue;
			}
			let m = line.match(/^export\s+(async\s+function|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/);
			if (m) {
				exported.push(m[2]);
				body.push(line.replace(/^export\s+/, ""));
				continue;
			}
			m = line.match(/^export\s*\{([^}]*)\};?\s*$/);
			if (m) {
				exported.push(...m[1].split(",").map((s) => s.trim()).filter(Boolean));
				continue;
			}
			if (/^export\s+default\s+/.test(line)) {
				body.push(line.replace(/^export\s+default\s+/, "const __default = "));
				exported.push("default: __default");
				continue;
			}
			if (/^\s*export\s/.test(line)) throw new Error(`${abs}: unsupported export form: ${line.trim()}`);
			body.push(line);
		}
		order.push(`const ${id} = (() => {\n${body.join("\n")}\nreturn { ${exported.join(", ")} };\n})();`);
		return id;
	}
	const ids = entries.map((e) => visit(e));
	const merged = ids.map((id) => `...${id}`).join(", ");
	// runtimeName: a second global of the first `runtimeCount` entries only, so a
	// later entry's exports cannot shadow theirs.
	const runtime = runtimeName ? `\nglobalThis.${runtimeName} = Object.freeze({ ${ids.slice(0, runtimeCount).map((id) => `...${id}`).join(", ")} });` : "";
	return `(() => {\n"use strict";\n${order.join("\n")}\nglobalThis.${globalName} = Object.freeze({ ${merged} });${runtime}\n})();\n`;
}
