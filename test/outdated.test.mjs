import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, isAdapterName, latestVersion, shellQuote, vendoredVersion } from "../lib/outdated.mjs";

it("compares versions by semver precedence", () => {
	assert.equal(compareVersions("0.5.0", "0.6.0"), -1);
	assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
	assert.equal(compareVersions("1.2.3", "v1.2.3"), 0);
	assert.equal(compareVersions("0.0.0-stage", "0.0.0"), -1);
	assert.equal(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.10"), -1);
	assert.equal(compareVersions("1.0.0-alpha", "1.0.0-alpha.1"), -1);
	assert.equal(compareVersions("1.0.0-beta", "1.0.0-alpha"), 1);
	assert.throws(() => compareVersions("one", "1.0.0"), /not a version: one/);
});

it("reads npm's latest dist-tag and reports failures", async () => {
	/** @param {any} body @param {number} [status] */
	const fake = (body, status = 200) => /** @type {typeof fetch} */ (async (url) => {
		assert.equal(String(url), "https://mirror.test/@liqweed%2Fmotion-kit/latest");
		return new Response(JSON.stringify(body), { status });
	});
	assert.equal(await latestVersion({ registry: "https://mirror.test/", fetch: fake({ version: "1.2.3" }) }), "1.2.3");
	await assert.rejects(latestVersion({ registry: "https://mirror.test", fetch: fake({}, 404) }), /answered 404/);
	await assert.rejects(latestVersion({ registry: "https://mirror.test", fetch: fake({ version: "x" }) }), /names no version/);
	await assert.rejects(latestVersion({ registry: "https://mirror.test", fetch: async () => { throw new Error("offline"); } }), /cannot reach the npm registry at https:\/\/mirror.test$/);
});

it("rejects registry credentials without echoing them", async () => {
	const err = await latestVersion({ registry: "https://user:secret@mirror.test/", fetch: async () => { throw new Error("never"); } }).catch((e) => e);
	assert.match(err.message, /carries credentials/);
	assert.doesNotMatch(err.message, /secret|user/);
	const unreachable = await latestVersion({ registry: "https://mirror.test/x?token=abc", fetch: async () => { throw new Error("boom https://mirror.test/x?token=abc"); } }).catch((e) => e);
	assert.doesNotMatch(unreachable.message, /token|abc|boom/);
});

it("validates the adapter and quotes the re-vendor command", () => {
	assert.ok(isAdapterName("page") && isAdapterName("my-adapter_2"));
	assert.ok(!isAdapterName("../x") && !isAdapterName("a;b") && !isAdapterName("$(x)"));
	assert.equal(shellQuote("/tmp/ok-dir"), "/tmp/ok-dir");
	assert.equal(shellQuote("/tmp/a b"), "'/tmp/a b'");
	assert.equal(shellQuote("it's"), `'it'\\''s'`);
	const dir = mkdtempSync(join(tmpdir(), "mk-outdated-"));
	writeFileSync(join(dir, "MOTION_KIT_VERSION"), "motion-kit 1.0.0\nadapter ../../etc\n");
	assert.throws(() => vendoredVersion(dir), /invalid adapter/);
	writeFileSync(join(dir, "MOTION_KIT_VERSION"), "motion-kit 1.0.0\nadapter slidev\n");
	assert.deepEqual(vendoredVersion(dir), { version: "1.0.0", adapter: "slidev" });
});
