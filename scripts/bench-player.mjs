#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * Live player frame cost: the old draw (innerHTML) against the in-place
 * patch (runtime/patch.mjs), in headless Chromium at a throttled CPU.
 *
 *   npm run bench:player [-- --rate 6] [--chrome <path>]
 *
 * Each frame's cost is building the frame's markup, putting it in the page and
 * a forced style and layout (no paint), as in issue #43. Frames are sampled at
 * 60 fps over the whole timeline, after one warm-up pass. Before timing, every
 * patched frame is compared with a fresh innerHTML parse of the same markup
 * (isEqualNode); a difference fails the run.
 *
 * Chromium comes from --chrome, $CHROME, Playwright's browser cache, or a
 * system install. Nothing is installed: the script talks to Chromium over the
 * DevTools protocol with Node's WebSocket.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundle } from "../lib/bundle.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const { values: args } = parseArgs({ options: { rate: { type: "string", default: "6" }, chrome: { type: "string" } } });
const RATE = Number(args.rate);

/** @returns {string | undefined} */
function findChromium() {
	if (args.chrome) return args.chrome;
	if (process.env.CHROME) return process.env.CHROME;
	const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")].filter((d) => d && existsSync(d));
	/** @type {string[]} */
	const found = [];
	for (const cache of /** @type {string[]} */ (caches)) {
		for (const dir of readdirSync(cache).sort().reverse()) {
			const base = join(cache, dir);
			if (dir.startsWith("chromium_headless_shell-")) for (const sub of readdirSync(base)) found.push(join(base, sub, "chrome-headless-shell"), join(base, sub, "headless_shell"));
			if (dir.startsWith("chromium-")) for (const sub of readdirSync(base)) found.push(join(base, sub, "Chromium.app/Contents/MacOS/Chromium"), join(base, sub, "chrome"));
		}
	}
	found.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/opt/homebrew/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome");
	return found.find((p) => existsSync(p));
}

/** A minimal DevTools protocol client over the browser's WebSocket. @param {string} url */
async function connect(url) {
	const ws = new WebSocket(url);
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve, { once: true });
		ws.addEventListener("error", reject, { once: true });
	});
	let next = 0;
	/** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
	const pending = new Map();
	ws.addEventListener("message", (e) => {
		const msg = JSON.parse(String(e.data));
		const p = msg.id !== undefined && pending.get(msg.id);
		if (!p) return;
		pending.delete(msg.id);
		if (msg.error) p.reject(new Error(msg.error.message));
		else p.resolve(msg.result);
	});
	/** @param {string} method @param {object} [params] @param {string} [sessionId] @returns {Promise<any>} */
	const send = (method, params = {}, sessionId) =>
		new Promise((resolve, reject) => {
			const id = ++next;
			pending.set(id, { resolve, reject });
			ws.send(JSON.stringify({ id, method, params, sessionId }));
		});
	return { send, close: () => ws.close() };
}

/** Runs in the page: time each draw path over a scene's timeline. */
const PAGE = String.raw`
globalThis.bench = (which, spec) => {
	// Each custom scene is bundled with its own copy of the runtime, under its own global.
	const { createScene, sceneFromModule, renderSvg, normalizeStyle, cssVars, patchMarkup } = MotionKit;
	const modules = { fleet: MotionKit.default, isometric: globalThis.MotionKitIso?.default, reveal: globalThis.MotionKitReveal?.default, cells: globalThis.MotionKitCells?.default };
	// "cells:RxC" is the cell-grid bench scene at R rows and C columns.
	const [name, size] = which.split(":");
	const options = size ? { rows: Number(size.split("x")[0]), cols: Number(size.split("x")[1]) } : undefined;
	const scene = name in modules ? sceneFromModule(modules[name], { format: "16:9", options }) : createScene(JSON.parse(spec), { format: "16:9" });
	const style = normalizeStyle();
	const render = (t) => renderSvg(scene, t, { style, idPrefix: "b", live: true });
	const times = [];
	for (let f = 0; f <= Math.round(scene.duration * 60); f++) times.push(f / 60);
	const host = document.createElement("div");
	host.setAttribute("style", cssVars(style, "light") + ";width:960px");
	document.body.appendChild(host);

	// Correctness: each patched frame equals the HTML parser's reading of it.
	const ref = document.createElement("div");
	let mismatches = 0;
	let peak = 0; // bytes of the largest frame, tracked while verifying
	const bytes = new TextEncoder();
	for (const t of [...times, ...times.slice().reverse()]) {
		const markup = render(t);
		peak = Math.max(peak, bytes.encode(markup).length);
		patchMarkup(host, markup);
		ref.innerHTML = markup;
		const same = host.childNodes.length === ref.childNodes.length && [...host.childNodes].every((n, i) => n.isEqualNode(ref.childNodes[i]));
		if (!same) mismatches++;
	}

	// render: building the markup alone, the floor under both paths.
	let sink = 0;
	const paths = {
		render: (t) => { sink += render(t).length; },
		innerHTML: (t) => { host.innerHTML = render(t); },
		patch: (t) => { patchMarkup(host, render(t)); },
	};
	const result = { frames: times.length, kb: bytes.encode(render(scene.duration / 2)).length / 1024, peak: peak / 1024, mismatches };
	for (const [name, draw] of Object.entries(paths)) {
		host.innerHTML = "";
		const cost = [];
		for (let pass = 0; pass < 2; pass++) {
			for (const t of times) {
				const t0 = performance.now();
				draw(t);
				host.getBoundingClientRect(); // forced style + layout; no paint while the loop runs
				if (pass) cost.push(performance.now() - t0);
			}
		}
		cost.sort((a, b) => a - b);
		const at = (q) => cost[Math.min(cost.length - 1, Math.floor(q * cost.length))];
		result[name] = { median: at(0.5), p90: at(0.9) };
	}
	host.remove();
	result.sink = sink;
	return result;
};
`;

const chrome = findChromium();
if (!chrome) {
	console.error("bench:player needs Chromium: pass --chrome <path> or set $CHROME (npx playwright install chromium-headless-shell also works).");
	process.exit(1);
}
const profile = mkdtempSync(join(tmpdir(), "mk-bench-"));
const proc = spawn(chrome, ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
try {
	const wsUrl = await new Promise((resolve, reject) => {
		let err = "";
		proc.stderr.on("data", (d) => {
			err += d;
			const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
			if (m) resolve(m[1]);
		});
		proc.on("exit", (code) => reject(new Error(`${chrome} exited (${code}):\n${err}`)));
	});
	const cdp = await connect(wsUrl);
	const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
	const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
	const evaluate = async (/** @type {string} */ expression) => {
		const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
		return r.result.value;
	};
	const runtime = ["scene", "style", "patch", "types/index", "kit"].map((m) => join(ROOT, "runtime", `${m}.mjs`));
	await evaluate(bundle([...runtime, join(ROOT, "bench/fleet.scene.mjs")]));
	await evaluate(bundle([...runtime, join(ROOT, "examples/isometric-swivel.scene.mjs")], { globalName: "MotionKitIso" }));
	await evaluate(bundle([...runtime, join(ROOT, "examples/text-reveal.scene.mjs")], { globalName: "MotionKitReveal" }));
	await evaluate(bundle([...runtime, join(ROOT, "bench/cells.scene.mjs")], { globalName: "MotionKitCells" }));
	await evaluate(PAGE);
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE }, sessionId);

	const spec = readFileSync(join(ROOT, "examples/smart-home.json"), "utf8");
	const ms = (/** @type {number} */ v) => v.toFixed(2).padStart(6);
	console.log(`live player frame cost, headless Chromium at ${RATE}x CPU slowdown (${chrome.split("/").pop()})`);
	console.log("scene                     KB/frame  peak KB  frames   render only     innerHTML median / p90   patch median / p90   median ratio");
	let failed = false;
	for (const [label, which] of [["bench/fleet.scene.mjs", "fleet"], ["smart-home 16:9", "smart-home"], ["isometric-swivel 16:9", "isometric"], ["text-reveal 16:9", "reveal"], ["cells 10x10 (100)", "cells:10x10"], ["cells 24x25 (600)", "cells:24x25"], ["cells 40x60 (2,400)", "cells:40x60"]]) {
		const r = await evaluate(`bench(${JSON.stringify(which)}, ${JSON.stringify(spec)})`);
		console.log(
			`${label.padEnd(26)}${r.kb.toFixed(1).padStart(8)}${r.peak.toFixed(1).padStart(9)}${String(r.frames).padStart(8)}   ${ms(r.render.median)} ms       ${ms(r.innerHTML.median)} / ${ms(r.innerHTML.p90)} ms     ${ms(r.patch.median)} / ${ms(r.patch.p90)} ms    ${(r.patch.median / r.innerHTML.median).toFixed(2)}`,
		);
		if (r.mismatches) {
			console.error(`${label}: ${r.mismatches} patched frames differ from a fresh innerHTML parse`);
			failed = true;
		}
	}
	cdp.close();
	process.exitCode = failed ? 1 : 0;
} finally {
	// Chromium writes to its profile until it has exited.
	const exited = proc.exitCode !== null || proc.signalCode !== null ? Promise.resolve() : new Promise((resolve) => proc.once("exit", resolve));
	proc.kill();
	await exited;
	rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
