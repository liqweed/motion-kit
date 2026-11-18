import assert from "node:assert/strict";
import { it } from "node:test";
import { compareVersions, latestVersion } from "../lib/outdated.mjs";

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
	await assert.rejects(latestVersion({ registry: "https://mirror.test", fetch: async () => { throw new Error("offline"); } }), /cannot reach .*offline/);
});
