/**
 * motion-kit · build a self-contained interactive HTML file.
 *
 * One document, runtime inlined, no network requests: safe for Craft Pages
 * (connect-src 'none'), file:// and any static host. The final frame is
 * pre-rendered into the markup, so it reads correctly before (or without) JS.
 */
import { fileURLToPath } from "node:url";
import { bundle } from "./bundle.mjs";
import { escapeHtml } from "./export.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { cssVars } from "../runtime/style.mjs";

const RUNTIME = fileURLToPath(new URL("../runtime/", import.meta.url));

/**
 * @param {import("./load.mjs").LoadedScene} loaded
 * @param {{style:import("../runtime/style.mjs").Style, format:string, locale:string, scrubber?:boolean, heading?:boolean, theme?:string, labels?:Record<string,string>}} o
 */
export function buildHtml(loaded, o) {
	const entries = [`${RUNTIME}types/index.mjs`, `${RUNTIME}scene.mjs`, `${RUNTIME}player.mjs`];
	if (loaded.kind === "module") entries.push(loaded.file);
	const code = bundle(entries);
	const { scene } = loaded;
	const fallback = renderSvg(scene, scene.duration, { style: o.style, live: true, idPrefix: "mk-fallback" });
	const make =
		loaded.kind === "spec"
			? `MotionKit.createScene(${JSON.stringify(loaded.spec)}, ${JSON.stringify({ format: o.format, locale: o.locale })})`
			: `MotionKit.default(${JSON.stringify({ format: o.format, locale: o.locale })})`;
	const options = { style: o.style, scrubber: o.scrubber !== false, theme: o.theme, labels: o.labels };
	const lang = scene.locale ?? o.locale ?? "en";
	return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(scene.title)}</title>
<style>
:root{${cssVars(o.style, "light")}}
@media (prefers-color-scheme: dark){:root{${cssVars(o.style, "dark")}}}
body{margin:0;padding:24px;background:var(--mk-bg);color:var(--mk-ink);font-family:${o.style.font}}
main{max-width:${Math.max(scene.width, 360)}px;margin:0 auto}
h1{font-size:20px;line-height:1.3;margin:0 0 4px}
.lede{margin:0 0 16px;color:var(--mk-muted);font-size:15px;line-height:1.45}
</style>
</head>
<body>
<main>
${o.heading === false ? "" : `<h1>${escapeHtml(scene.title)}</h1>\n<p class="lede">${escapeHtml(scene.description)}</p>`}
<div id="mk">${fallback}</div>
</main>
<script>
${code}
(function () {
  var scene = ${make};
  MotionKit.mountPlayer(document.getElementById("mk"), scene, ${JSON.stringify(options)});
})();
</script>
</body>
</html>
`;
}
