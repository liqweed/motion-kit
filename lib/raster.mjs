/**
 * motion-kit · rasterize standalone SVG to PNG.
 *
 * Prefers @resvg/resvg-js (in-process, deterministic, no browser). Falls back
 * to headless Chrome when resvg is not installed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let resvg;
async function getResvg() {
	if (resvg !== undefined) return resvg;
	try {
		resvg = (await import("@resvg/resvg-js")).Resvg;
	} catch {
		resvg = null;
	}
	return resvg;
}

const CHROME = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
];

export async function rasterizer() {
	return (await getResvg()) ? "resvg" : CHROME.find((p) => existsSync(p)) ? "chrome" : null;
}

/**
 * @param {string} svg standalone SVG (tokens resolved, width/height set)
 * @param {{scale?:number, font?:string}} o
 * @returns {Promise<Buffer>}
 */
export async function svgToPng(svg, { scale = 1, font = "Helvetica" } = {}) {
	const R = await getResvg();
	if (R) {
		const r = new R(svg, {
			fitTo: { mode: "zoom", value: scale },
			font: { loadSystemFonts: true, defaultFontFamily: font, sansSerifFamily: font },
			shapeRendering: 2,
			textRendering: 1,
		});
		return r.render().asPng();
	}
	const chrome = CHROME.find((p) => existsSync(p));
	if (!chrome) throw new Error("no rasterizer: npm install @resvg/resvg-js, or install Chrome");
	const size = (attr) => {
		const m = svg.match(new RegExp(`${attr}="([\\d.]+)"`));
		if (!m) throw new Error(`svg has no ${attr}: rasterize standalone output`);
		return Number(m[1]);
	};
	const w = size("width");
	const h = size("height");
	const dir = mkdtempSync(join(tmpdir(), "mk-"));
	try {
		const src = join(dir, "f.svg");
		const out = join(dir, "f.png");
		writeFileSync(src, svg);
		execFileSync(chrome, ["--headless", "--hide-scrollbars", "--default-background-color=00000000", `--force-device-scale-factor=${scale}`, `--window-size=${Math.ceil(w)},${Math.ceil(h)}`, `--screenshot=${out}`, `file://${src}`], { stdio: "ignore" });
		return readFileSync(out);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
