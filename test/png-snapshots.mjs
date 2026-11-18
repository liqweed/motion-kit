/**
 * PNG snapshots of the bundled scenes' step frames: what `motion-kit export
 * --png` gives a slide deck, rasterised the way lib/raster.mjs does it, and
 * compared with the PNGs committed under test/snapshots/.
 *
 * Platform-independent: resvg renders in software, and here it sees one font
 * only (test/fonts/Inter-Regular.ttf, no system fonts), so macOS and Linux
 * give the same pixels. The comparison still tolerates a little noise
 * (anti-aliasing rounding between CPU architectures; see TOLERANCE).
 *
 * Used by test/snapshots.test.mjs (compare) and scripts/update-snapshots.mjs
 * (`npm run snapshots:update`, regenerate). PNGs are decoded and encoded here
 * with node:zlib, so the comparison needs no image library.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import { slug } from "../lib/export.mjs";
import { loadScene, loadStyle } from "../lib/load.mjs";
import { renderSvg } from "../runtime/scene.mjs";

/** @param {string} rel path from the repository root */
const repo = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

/** Committed snapshots. */
export const SNAPSHOT_DIR = repo("test/snapshots");
/** Where a failing comparison writes expected/actual/diff PNGs (git-ignored; CI uploads it). */
export const DIFF_DIR = repo("out/snapshots");
const FONT = repo("test/fonts/Inter-Regular.ttf");
const FONT_FAMILY = "Inter";
/** styles/neutral.json, the style motion-kit ships (test/snapshots.test.mjs checks it matches the runtime's default). */
export const STYLE = loadStyle(repo("styles/neutral.json"));

/**
 * The scenes snapshotted: every scene the gate checks (`npm run check` in
 * package.json), so a new example is snapshotted too. Every step frame in the
 * light theme, and the final step in the dark theme. 16:9, English, scale 1,
 * with the background.
 */
const SCENES = JSON.parse(readFileSync(repo("package.json"), "utf8"))
	.scripts.check.split(/\s+/)
	.filter((/** @type {string} */ w) => /^(examples|brand)\/.*\.(json|mjs)$/.test(w));

/**
 * How far a frame may drift before it fails: a pixel differs when any RGBA
 * channel moves by more than `channel` (of 255), and a frame fails when more
 * than `pixels` of its pixels differ, as a fraction (0.0001 = 0.01 %, about 50
 * pixels of a 960×540 frame). A colour token change moves whole shapes and
 * fails; edge rounding between platforms does not.
 */
export const TOLERANCE = Object.freeze({ channel: 3, pixels: 0.0001 });

/**
 * @typedef {{ name: string, file: string, theme: "light" | "dark", t: number, label: string }} SnapshotFrame
 * @typedef {{ width: number, height: number, data: Buffer }} Image RGBA, 8 bits per channel, not premultiplied
 */

/** @returns {Promise<any>} the Resvg class, or null when @resvg/resvg-js is not installed */
export async function loadResvg() {
	try {
		return (await import("@resvg/resvg-js")).Resvg;
	} catch {
		return null;
	}
}

/**
 * Every frame in the snapshot set, with the scene it comes from.
 * @returns {Promise<{ frame: SnapshotFrame, scene: any }[]>}
 */
export async function snapshotFrames() {
	const out = [];
	for (const file of SCENES) {
		const { scene } = await loadScene(repo(file), { format: "16:9", locale: "en" });
		const base = file.slice(file.lastIndexOf("/") + 1).replace(/(\.scene)?\.(json|mjs)$/, "");
		const step = (theme, i) => {
			const s = scene.steps[i];
			const n = String(i + 1).padStart(2, "0");
			return { frame: { name: `${base}/${theme}-${n}-${slug(s.label)}`, file, theme, t: s.at, label: s.label }, scene };
		};
		scene.steps.forEach((_, i) => out.push(step("light", i)));
		out.push(step("dark", scene.steps.length - 1));
	}
	return out;
}

/**
 * Render one frame to PNG with the committed font only.
 * @param {any} Resvg the class from loadResvg()
 * @param {any} scene
 * @param {SnapshotFrame} frame
 * @returns {Buffer}
 */
export function renderFrame(Resvg, scene, frame) {
	const svg = renderSvg(scene, frame.t, { standalone: true, style: STYLE, theme: frame.theme, background: true });
	// The render options of lib/raster.mjs svgToPng, except the fonts.
	const r = new Resvg(svg, {
		fitTo: { mode: "zoom", value: 1 },
		font: { loadSystemFonts: false, fontFiles: [FONT], defaultFontFamily: FONT_FAMILY, sansSerifFamily: FONT_FAMILY },
		shapeRendering: 2,
		textRendering: 1,
	});
	return r.render().asPng();
}

/**
 * Compare two images with TOLERANCE.
 * @param {Image} a
 * @param {Image} b
 * @returns {{ sameSize: boolean, differing: number, ratio: number, maxDelta: number, ok: boolean }}
 */
export function compareImages(a, b) {
	if (a.width !== b.width || a.height !== b.height) return { sameSize: false, differing: Infinity, ratio: 1, maxDelta: 255, ok: false };
	let differing = 0;
	let maxDelta = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		let d = 0;
		for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
		if (d > maxDelta) maxDelta = d;
		if (d > TOLERANCE.channel) differing++;
	}
	const ratio = differing / (a.width * a.height);
	return { sameSize: true, differing, ratio, maxDelta, ok: ratio <= TOLERANCE.pixels };
}

/**
 * A diff image: the expected frame washed out, with every differing pixel in red.
 * @param {Image} expected
 * @param {Image} actual same size
 * @returns {Image}
 */
export function diffImage(expected, actual) {
	const data = Buffer.alloc(expected.data.length);
	for (let i = 0; i < data.length; i += 4) {
		let d = 0;
		for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(expected.data[i + c] - actual.data[i + c]));
		if (d > TOLERANCE.channel) {
			data.set([255, 0, 64, 255], i);
		} else {
			const luma = (expected.data[i] * 0.299 + expected.data[i + 1] * 0.587 + expected.data[i + 2] * 0.114) * (expected.data[i + 3] / 255);
			const v = Math.round(200 + luma * (55 / 255));
			data.set([v, v, v, 255], i);
		}
	}
	return { width: expected.width, height: expected.height, data };
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32 table (node:zlib.crc32 needs Node 22.2; the floor is 22.0). */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

/**
 * @param {Uint8Array} bytes
 * @param {number} [start] the CRC of the bytes before these
 * @returns {number}
 */
function crc32(bytes, start = 0) {
	let c = ~start >>> 0;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return ~c >>> 0;
}

/**
 * Decode an 8-bit RGBA or RGB, non-interlaced PNG (what resvg writes).
 * @param {Buffer} png
 * @returns {Image}
 */
export function decodePng(png) {
	if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
	let width = 0;
	let height = 0;
	let channels = 0;
	const idat = [];
	for (let at = 8; at < png.length; ) {
		const len = png.readUInt32BE(at);
		const type = png.toString("latin1", at + 4, at + 8);
		const body = png.subarray(at + 8, at + 8 + len);
		if (type === "IHDR") {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const [depth, color, , , interlace] = body.subarray(8, 13);
			if (depth !== 8 || (color !== 6 && color !== 2) || interlace !== 0) {
				throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${color}, interlace ${interlace}): expected 8-bit RGB(A), not interlaced`);
			}
			channels = color === 6 ? 4 : 3;
		} else if (type === "IDAT") idat.push(body);
		else if (type === "IEND") break;
		at += 12 + len;
	}
	if (!channels) throw new Error("PNG has no IHDR");
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	if (raw.length !== height * (stride + 1)) throw new Error("PNG data has the wrong length");
	const rows = Buffer.alloc(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const out = y * stride;
		for (let x = 0; x < stride; x++) {
			const left = x >= channels ? rows[out + x - channels] : 0;
			const up = y > 0 ? rows[out - stride + x] : 0;
			const upLeft = y > 0 && x >= channels ? rows[out - stride + x - channels] : 0;
			let pred = 0;
			if (filter === 1) pred = left;
			else if (filter === 2) pred = up;
			else if (filter === 3) pred = (left + up) >> 1;
			else if (filter === 4) {
				const p = left + up - upLeft;
				const pa = Math.abs(p - left);
				const pb = Math.abs(p - up);
				const pc = Math.abs(p - upLeft);
				pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
			} else if (filter !== 0) throw new Error(`PNG row ${y} has unknown filter ${filter}`);
			rows[out + x] = (line[x] + pred) & 0xff;
		}
	}
	if (channels === 4) return { width, height, data: rows };
	const data = Buffer.alloc(width * height * 4, 255);
	for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) rows.copy(data, j, i, i + 3);
	return { width, height, data };
}

/**
 * Encode an RGBA image as PNG (no filtering; for the diff images).
 * @param {Image} img
 * @returns {Buffer}
 */
export function encodePng({ width, height, data }) {
	const stride = width * 4;
	const raw = Buffer.alloc(height * (stride + 1));
	for (let y = 0; y < height; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** @param {string} type @param {Buffer} body */
function chunk(type, body) {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(body.length, 0);
	head.write(type, 4, "latin1");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body, crc32(head.subarray(4))), 0);
	return Buffer.concat([head, body, crc]);
}

/**
 * Read a committed snapshot, or null when there is none.
 * @param {string} path
 * @returns {Buffer | null}
 */
export function readSnapshot(path) {
	try {
		return readFileSync(path);
	} catch (e) {
		if (e instanceof Error && "code" in e && e.code === "ENOENT") return null;
		throw e;
	}
}
