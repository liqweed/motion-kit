/**
 * motion-kit · write a project icon set from a square scene's final frame.
 *
 * Writes, under `root` (a repository root):
 *   assets/icon.svg            static mark, light theme (README, docs, favicon source)
 *   assets/icon.png            `size`×`size` PNG; Conductor picks up assets/icon.png
 *   assets/icon-animated.svg   zero-JS animated SVG that plays once and holds
 *   .idea/icon.svg             JetBrains IDEs' project icon (Welcome screen, project switcher)
 *   .idea/icon_dark.svg        the same in the dark theme
 *
 * Paths other tools look in are listed in skills/project-logo/references/discovery.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bake } from "../runtime/bake.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { svgToPng } from "./raster.mjs";

/**
 * @param {any} scene a square scene (width === height)
 * @param {{root: string, style?: object, size?: number, png?: boolean}} options
 * @returns {Promise<string[]>} files written, relative to root
 */
export async function writeIconSet(scene, { root, style, size = 512, png = true }) {
	if (scene.width !== scene.height) throw new Error(`icon: scene must be square, got ${scene.width}×${scene.height} (use --format 1:1)`);
	const final = (theme, scale = 1) => renderSvg(scene, scene.duration, { standalone: true, style, theme, scale });
	/** @type {[string, string | Buffer][]} */
	const files = [
		["assets/icon.svg", final("light")],
		["assets/icon-animated.svg", bake(scene, { style, theme: "light" })],
		[".idea/icon.svg", final("light")],
		[".idea/icon_dark.svg", final("dark")],
	];
	if (png) files.splice(1, 0, ["assets/icon.png", await svgToPng(final("light", size / scene.width))]);
	for (const [rel, body] of files) {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body);
	}
	return files.map(([rel]) => rel);
}
