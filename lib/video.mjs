/**
 * motion-kit · render a scene to MP4 / GIF / WebM.
 *
 *   frame f → t = f / fps → standalone SVG (opaque bg) → PNG (resvg) → ffmpeg stdin
 *
 * Frames stream through a pipe: nothing is written per frame. The final frame
 * is held for `hold` seconds so the end state can be read. Output is
 * deterministic for the same inputs (same frames, same encoder settings).
 */
import { spawn, spawnSync } from "node:child_process";
import { MAX_FRAMES } from "../runtime/bake.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { svgToPng } from "./raster.mjs";

export function hasFfmpeg() {
	return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

function codecArgs(out, fps) {
	if (out.endsWith(".gif")) {
		return ["-filter_complex", `fps=${Math.min(fps, 20)},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "-1"];
	}
	if (out.endsWith(".webm")) return ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-pix_fmt", "yuv420p"];
	return ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"];
}

/**
 * @param {any} scene
 * @param {{out:string, fps?:number, scale?:number, hold?:number, lead?:number, style?:import("../runtime/style.mjs").Style, theme?:string, onProgress?:(f:number,n:number)=>void}} o
 */
export async function renderVideo(scene, o) {
	if (!hasFfmpeg()) throw new Error("ffmpeg not found (brew install ffmpeg / apt install ffmpeg)");
	const fps = o.fps ?? 30;
	const scale = o.scale ?? 2;
	const hold = o.hold ?? 1.5;
	const lead = o.lead ?? 0.25;
	const total = Math.round((lead + scene.duration + hold) * fps);
	if (!Number.isFinite(total) || total > MAX_FRAMES) throw new Error(`video: ${scene.duration} s at ${fps} fps is ${total} frames; the limit is ${MAX_FRAMES} (lower the fps or shorten the scene)`);
	const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-", ...codecArgs(o.out, fps), o.out], { stdio: ["pipe", "inherit", "inherit"] });
	const done = /** @type {Promise<void>} */ (new Promise((res, rej) => {
		ff.on("error", rej);
		ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`))));
	}));
	/** @type {number | null} */
	let lastT = null;
	/** @type {Buffer | null} */
	let lastPng = null;
	for (let f = 0; f < total; f++) {
		const t = Math.min(Math.max(f / fps - lead, 0), scene.duration);
		if (t !== lastT) {
			const svg = renderSvg(scene, t, { standalone: true, background: true, style: o.style, theme: o.theme ?? "light" });
			lastPng = await svgToPng(svg, { scale });
			lastT = t;
		}
		if (!ff.stdin.write(lastPng)) await new Promise((r) => ff.stdin.once("drain", r));
		o.onProgress?.(f + 1, total);
	}
	ff.stdin.end();
	await done;
	return { frames: total, fps, seconds: total / fps, out: o.out };
}

/** Contact sheet of a rendered video: one thumbnail per second, 5 columns. */
export function videoContactSheet(video, out) {
	const n = Math.max(1, Math.ceil(probe(video).duration));
	const cols = Math.min(5, n);
	const rows = Math.ceil(n / cols);
	const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-vf", `fps=1,scale=270:-1,tile=${cols}x${rows}:padding=6:color=0x9ca3af`, "-frames:v", "1", out]);
	if (r.status !== 0) throw new Error(`ffmpeg contact sheet failed: ${r.stderr}`);
	return out;
}

/** Duration and size of a media file via ffprobe. */
export function probe(file) {
	const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
	if (r.status !== 0) throw new Error(r.stderr);
	const j = JSON.parse(r.stdout);
	return { width: j.streams[0].width, height: j.streams[0].height, fps: j.streams[0].r_frame_rate, duration: Number(j.format.duration) };
}
