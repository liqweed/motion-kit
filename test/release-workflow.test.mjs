import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// npm trusted publishing checks the Trusted Publisher configured on npmjs.com
// against the workflow that publishes. npm does not validate the entry when it
// is saved, so a wrong value only shows at publish time (#32). The header of
// release.yml is where a maintainer finds the values; these tests keep it
// honest about the workflow and package.json it describes.

const WORKFLOW_FILE = "release.yml";
const source = readFileSync(new URL(`../.github/workflows/${WORKFLOW_FILE}`, import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// The comment block above `on:` is the header; the rest is the workflow proper.
// Steps are searched in the body only, so a header sentence never counts as one.
const split = source.search(/^on:/m);
assert.notEqual(split, -1, "release.yml has a top-level `on:`");
const header = source.slice(0, split);
const body = source.slice(split);

/**
 * The value of one `Label: value` line in the header.
 * @param {string} label
 * @returns {string | undefined}
 */
const field = (label) => header.match(new RegExp(`^#\\s+${label}:\\s+(.*?)\\s*$`, "m"))?.[1];

describe("release workflow header", () => {
	it("names the Trusted Publisher values npm checks, matching package.json and this file", () => {
		const repo = String(pkg.repository?.url ?? "").match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
		assert.ok(repo, `package.json repository.url is a GitHub URL: ${pkg.repository?.url}`);
		assert.equal(field("Organization or user"), repo[1]);
		assert.equal(field("Repository"), repo[2]);
		assert.equal(field("Workflow filename"), WORKFLOW_FILE);
	});
	it("says to leave the environment empty, as the job uses none", () => {
		assert.match(field("Environment name") ?? "", /^\(?empty\)?$/i);
		assert.doesNotMatch(body, /^\s+environment:/m, "the job sets an environment; name it in the header");
	});
	it("asks to allow `npm publish`, because the workflow runs it", () => {
		assert.match(field("Allowed actions") ?? "", /^npm publish \(allow it\b/);
		assert.match(body, /^\s+npm publish\s*$/m, "the publish step runs `npm publish`");
	});
	it("tells maintainers to re-run older tags first, which holds while the workflow passes no --tag", () => {
		assert.match(header, /Re-run older tags first/);
		assert.doesNotMatch(body, /npm publish\s+.*--tag/, "with --tag a newer version no longer blocks an older one; update the header");
	});
});

describe("release workflow publishing", () => {
	it("authenticates with OIDC and no npm token", () => {
		assert.match(body, /^\s+id-token:\s*write\s*$/m);
		assert.doesNotMatch(body, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./, "a token would bypass trusted publishing");
	});
	it("installs an npm that supports trusted publishing (11.5.1 or later) before publishing", () => {
		const install = body.match(/npm install -g npm@\^?(\d+)\.(\d+)\.(\d+)/);
		assert.ok(install, "the publish step installs npm");
		const [major, minor, patch] = install.slice(1).map(Number);
		assert.ok(major > 11 || (major === 11 && (minor > 5 || (minor === 5 && patch >= 1))), `npm ${install.slice(1).join(".")}`);
		assert.ok(body.indexOf(install[0]) < body.search(/^\s+npm publish\s*$/m), "npm is installed before it publishes");
	});
	it("publishes before it creates the GitHub release", () => {
		const publish = body.search(/^\s+npm publish\s*$/m);
		assert.notEqual(publish, -1, "the publish step runs `npm publish`");
		assert.ok(publish < body.indexOf("gh release create"));
	});
	it("publishes with provenance and public access", () => {
		assert.equal(pkg.publishConfig?.provenance, true);
		assert.equal(pkg.publishConfig?.access, "public");
	});
});
