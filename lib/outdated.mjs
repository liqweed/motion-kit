// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · is a vendored copy behind the latest release? (Node only.)
 *
 *   vendoredVersion(dir) → { version, adapter }   from <dir>/MOTION_KIT_VERSION
 *   latestVersion({ registry, fetch }) → "X.Y.Z"   the npm `latest` dist-tag
 *   compareVersions(a, b) → -1 | 0 | 1             semver precedence
 *
 * `motion-kit outdated <dir>` combines them. The registry is npm's unless
 * `npm_config_registry` names a mirror.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PACKAGE = "@liqweed/motion-kit";

/**
 * @param {string} dir a directory written by `motion-kit vendor`
 * @returns {{ version: string, adapter: string }}
 */
export function vendoredVersion(dir) {
	let text;
	try {
		text = readFileSync(join(dir, "MOTION_KIT_VERSION"), "utf8");
	} catch {
		throw new Error(`${dir} has no MOTION_KIT_VERSION: is it a directory written by motion-kit vendor?`);
	}
	const version = text.match(/^motion-kit (\S+)$/m)?.[1];
	if (!version || !parseVersion(version)) throw new Error(`${join(dir, "MOTION_KIT_VERSION")} names no version`);
	return { version, adapter: text.match(/^adapter (\S+)$/m)?.[1] ?? "page" };
}

/** @param {string} v */
function parseVersion(v) {
	const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
	return m ? { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] } : null;
}

/**
 * Semver precedence: -1 when a is older than b, 1 when newer, 0 when equal.
 * @param {string} a @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
	const x = parseVersion(a);
	const y = parseVersion(b);
	if (!x || !y) throw new Error(`not a version: ${x ? b : a}`);
	for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1;
	// A pre-release sorts before its release.
	if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		const p = x.pre[i];
		const q = y.pre[i];
		if (p === undefined) return -1;
		if (q === undefined) return 1;
		if (p === q) continue;
		const pn = /^\d+$/.test(p);
		const qn = /^\d+$/.test(q);
		if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
		if (pn !== qn) return pn ? -1 : 1;
		return p < q ? -1 : 1;
	}
	return 0;
}

/**
 * The version npm serves as `latest`.
 * @param {{ registry?: string, fetch?: typeof globalThis.fetch }} [o]
 * @returns {Promise<string>}
 */
export async function latestVersion({ registry = process.env.npm_config_registry || "https://registry.npmjs.org/", fetch = globalThis.fetch } = {}) {
	const url = `${registry.replace(/\/+$/, "")}/${PACKAGE.replace("/", "%2F")}/latest`;
	let res;
	try {
		res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
	} catch (e) {
		throw new Error(`cannot reach ${url}: ${e instanceof Error ? e.message : e}`);
	}
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	const body = await res.json();
	if (typeof body?.version !== "string" || !parseVersion(body.version)) throw new Error(`${url} names no version`);
	return body.version;
}
