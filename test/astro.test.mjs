// The Astro adapter, built by Astro: server output for specs and custom
// modules, options in two locales, theme and style, and ids per instance.
// Runs where the website workspace's Astro is installed; skips otherwise.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { sceneFromModule } from "../runtime/kit.mjs";
import { playerMarkup, themeCss } from "../runtime/player.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let astro;
try {
	process.env.ASTRO_TELEMETRY_DISABLED = "1";
	astro = await import("astro");
} catch {
	astro = null;
}

// Under the git-ignored out/, so the site resolves Astro from the repository.
mkdirSync(join(ROOT, "out"), { recursive: true });
const site = mkdtempSync(join(ROOT, "out", "astro-test-"));
after(() => rmSync(site, { recursive: true, force: true }));

const DICT = {
	en: { title: "Three steps", description: "A bar fills in three steps.", steps: [{ id: "one", label: "First" }, { id: "two", label: "Second" }, { id: "three", label: "Third" }] },
	nl: { title: "Drie stappen", description: "Een balk vult zich in drie stappen.", steps: [{ id: "one", label: "Eerste" }, { id: "two", label: "Tweede" }, { id: "three", label: "Derde" }] },
};
const BRAND = { name: "brand", light: { accent: "#7c2d12" }, dark: { accent: "#2563eb" } };
// Imports the vendored runtime relatively, as a site's own modules do.
const MODULE = `import { FORMATS } from "../motion-kit/runtime/scene.mjs";
import { tok } from "../motion-kit/runtime/style.mjs";
import { el, num, text } from "../motion-kit/runtime/svg.mjs";
export default function make({ format = "16:9", labels }) {
	const { width: W, height } = FORMATS[format];
	const H = height || 300;
	const steps = labels.steps.map((s, i) => ({ ...s, at: 0.6 + i * 0.6 }));
	return {
		id: \`labelled-\${format.replace(":", "x")}\`, width: W, height: H, duration: 2.2, title: labels.title, description: labels.description, steps,
		frame: (t, { idPrefix }) => el("defs", {}, el("clipPath", { id: \`\${idPrefix}-clip\` }, el("rect", { width: num(W * Math.min(t / 2, 1)), height: H }))) +
			el("rect", { width: W, height: 20, fill: tok("accent"), "clip-path": \`url(#\${idPrefix}-clip)\` }) + text({ x: 20, y: 60, fill: tok("ink") }, labels.title),
	};
}
`;
const page = (lang) => `---
import AnimatedDiagram from "../motion-kit/adapter/AnimatedDiagram.astro";
import spec from "../diagrams/order-flow.json";
const labels = ${JSON.stringify(DICT[lang])};
---
<html lang="${lang}"><head><meta charset="utf-8"><title>${lang}</title></head><body>
<AnimatedDiagram spec={spec} format="wide" locale="${lang}" />
<AnimatedDiagram spec={spec} format="tall" locale="${lang}" />
<AnimatedDiagram spec={spec} format="tall" locale="${lang}" />
<AnimatedDiagram module="/src/diagrams/labelled.scene.mjs" options={{ labels }} format="wide" locale="${lang}" theme="light" style={${JSON.stringify(BRAND)}} id="flow" />
<AnimatedDiagram module="/src/diagrams/labelled.scene.mjs" options={{ labels }} format="tall" locale="${lang}" theme="light" style={${JSON.stringify(BRAND)}} />
</body></html>
`;

describe("astro adapter", { skip: !astro && "astro is not installed" }, () => {
	/** @type {Record<string, string>} */
	const html = {};
	before(async () => {
		execFileSync(process.execPath, [join(ROOT, "cli/motion-kit.mjs"), "vendor", join(site, "src/motion-kit"), "--adapter", "astro"]);
		mkdirSync(join(site, "src/pages"), { recursive: true });
		mkdirSync(join(site, "src/diagrams"), { recursive: true });
		cpSync(join(ROOT, "examples/order-flow.json"), join(site, "src/diagrams/order-flow.json"));
		writeFileSync(join(site, "src/diagrams/labelled.scene.mjs"), MODULE);
		writeFileSync(join(site, "astro.config.mjs"), "export default {};\n");
		for (const lang of ["en", "nl"]) writeFileSync(join(site, `src/pages/${lang}.astro`), page(lang));
		await astro.build({ root: site, logLevel: "silent" });
		for (const lang of ["en", "nl"]) html[lang] = readFileSync(join(site, `dist/${lang}/index.html`), "utf8");
	});

	it("server-renders a custom module with the caller's options, as the live player draws it", async () => {
		const { default: make } = await import(join(site, "src/diagrams/labelled.scene.mjs"));
		for (const lang of ["en", "nl"]) {
			const scene = sceneFromModule(make, { format: "wide", locale: lang, options: { labels: DICT[lang] } });
			// The player mounts exactly this markup (test/player.test.mjs), minus `inert`.
			assert.ok(html[lang].includes(playerMarkup(scene, { id: "flow", style: BRAND, theme: "light", locale: lang })), lang);
			assert.ok(html[lang].includes(`<li>${DICT[lang].steps[1].label}</li>`));
		}
		assert.ok(readdirSync(join(site, "dist/_astro")).some((f) => f.startsWith("labelled.scene.")), "the module ships to the browser as its own chunk");
	});

	it("carries the style's colours for a fixed theme, and both schemes otherwise", () => {
		assert.ok(html.en.includes(`<style>${themeCss("#flow", BRAND, "light")}</style>`));
		assert.match(html.en, /<style>#mk-order-flow-wide-1\{[^}]*\}@media \(prefers-color-scheme:dark\)/);
		assert.equal(html.en.match(/<style data-mk-player-css>/g)?.length, 1);
	});

	it("gives every instance its own ids, and inert controls until mount", () => {
		for (const lang of ["en", "nl"]) {
			const ids = [...html[lang].matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
			assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], lang);
			assert.ok(ids.includes("mk-order-flow-tall-2") && ids.includes("mk-order-flow-tall-3"));
			assert.ok(ids.includes("flow-clip") && ids.includes("mk-labelled-tall-4-clip"));
		}
		assert.equal(html.en.match(/<div class="mk-controls" role="group" aria-label="Steps" inert>/g)?.length, 5);
	});

	it("refuses a module path it cannot find, and options for a spec", async () => {
		const bad = (props) => `---\nimport AnimatedDiagram from "../motion-kit/adapter/AnimatedDiagram.astro";\nimport spec from "../diagrams/order-flow.json";\n---\n<AnimatedDiagram ${props} />\n`;
		/** @type {[string, RegExp][]} */
		const cases = [
			['module="/src/diagrams/nope.scene.mjs"', /no scene module at "\/src\/diagrams\/nope\.scene\.mjs".*labelled\.scene\.mjs/],
			["spec={spec} options={{ a: 1 }}", /options apply to custom scene modules/],
			['spec={spec} theme="sepia"', /theme must be "light" or "dark"/],
			['spec={spec} id="1-flow"', /id "1-flow" must be letters/],
			['spec={spec} format="wide" id="flow" /><AnimatedDiagram spec={spec} format="tall" id="flow"', /id "flow" is already used on this page/],
		];
		for (const [props, message] of cases) {
			writeFileSync(join(site, "src/pages/bad.astro"), bad(props));
			await assert.rejects(astro.build({ root: site, logLevel: "silent" }), message);
		}
		rmSync(join(site, "src/pages/bad.astro"));
	});
});
