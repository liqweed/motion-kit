/**
 * motion-kit · export step frames for slides and review.
 *
 * Writes, into `out`:
 *   NN-<step>.svg           standalone, tokens resolved (PowerPoint/Keynote take SVG)
 *   NN-<step>.png           with --png (Google Slides, Marp/Slidev, travelling decks)
 *   qc/…                    with --qc: frames 0.2 s before and after every step
 *   qc/phone.svg            the tall layout's final frame, for the phone row
 *   index.html              contact sheet (steps, QC row, phone-size row)
 *   manifest.json           reproducible: no timestamps; input hash + settings
 *
 * Re-exporting into the same folder replaces the previous export: the files
 * the previous manifest.json listed and the new one does not are removed, so
 * the folder holds what the new manifest lists. Files no manifest listed
 * (someone else put them there) are left in place and the export warns about
 * them, unless the new export writes a file of the same name: that one is
 * overwritten.
 */
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { renderSvg } from "../runtime/scene.mjs";
import { svgToPng } from "./raster.mjs";

export function slug(s) {
	return String(s)
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string | null} git's output; null outside a repository or without git
 */
function git(args, cwd) {
	// The repository is the one holding `cwd`, not one named by the caller's
	// environment: inside a git hook GIT_DIR and friends point at the hook's
	// repository, which would answer for a source file outside it.
	const env = { ...process.env };
	for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY"]) delete env[k];
	try {
		return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return null;
	}
}

/**
 * Where a source file stands in git: the short HEAD commit of the repository
 * holding it, and whether the file differs from that commit (modified,
 * staged, untracked or ignored: `git status --porcelain -- <file>` is not empty).
 * Both null outside a git repository. Only the source file counts: modules a
 * custom scene imports, the style file and the options file are not looked
 * at (the input hash covers the style and the options).
 * @param {string} file absolute path
 * @returns {{ commit: string | null, dirty: boolean | null }}
 */
export function sourceState(file) {
	const cwd = dirname(file);
	const commit = git(["rev-parse", "--short", "HEAD"], cwd)?.trim() || null;
	if (!commit) return { commit: null, dirty: null };
	const status = git(["status", "--porcelain", "--untracked-files=all", "--ignored", "--", basename(file)], cwd);
	return { commit, dirty: status == null ? null : status.trim() !== "" };
}

/**
 * The files the manifest.json already in `out` lists, relative to `out`:
 * what the previous export there wrote. Empty when there is none, or it is
 * not motion-kit's or cannot be read. Entries that would leave `out` are
 * ignored.
 * @param {string} out
 * @returns {string[]}
 */
function previousFiles(out) {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
	} catch {
		return [];
	}
	if (manifest?.tool !== "motion-kit" || !Array.isArray(manifest.files)) return [];
	/** @type {unknown[]} */
	const listed = manifest.files.flatMap((/** @type {any} */ f) => [f?.svg, f?.png]);
	return listed.filter((p) => typeof p === "string" && p !== "" && !isAbsolute(p) && !normalize(p).split(sep).includes("..")).map(String);
}

/**
 * @param {string} dir
 * @returns {string[]} every file under `dir`, relative to it, "/"-separated
 */
function listFiles(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((d) => d.isFile())
		.map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join("/"))
		.sort();
}

/**
 * @param {any} scene
 * @param {{out: string, style?: import("../runtime/style.mjs").Style, theme?: string, png?: boolean, scale?: number, qc?: boolean, background?: boolean, sourceFile?: string, version?: string, phone?: { scene?: any, error?: string }, format?: string, locale?: string, options?: Record<string, unknown>, warn?: (line: string) => void}} options
 *   phone: the same scene built for the `tall` format (what a phone shows), or
 *   why it could not be built; the contact sheet's phone row shows it.
 *   format, locale, options: what the scene was built with, for the manifest
 *   (a custom module's scene options change its frames, so they are hashed).
 *   warn: told about files in `out` that no export wrote (default console.warn).
 */
export async function exportSteps(scene, { out, style, theme = "light", png = false, scale = 2, qc = false, background = false, sourceFile, version, phone, format, locale, options, warn = (line) => console.warn(line) }) {
	mkdirSync(out, { recursive: true });
	const previous = previousFiles(out);
	const opts = { standalone: true, style, theme, background };
	const files = [];
	let phoneError = phone?.error;
	const write = async (name, t, kind, label, from = scene) => {
		const svg = renderSvg(from, t, opts);
		writeFileSync(join(out, `${name}.svg`), svg);
		const entry = { kind, t: Math.round(t * 1000) / 1000, label, svg: `${name}.svg` };
		if (png) {
			writeFileSync(join(out, `${name}.png`), await svgToPng(svg, { scale }));
			entry.png = `${name}.png`;
		}
		files.push(entry);
	};
	for (const [i, s] of scene.steps.entries()) {
		const n = String(i + 1).padStart(2, "0");
		await write(`${n}-${slug(s.label)}`, s.at, "step", s.label);
	}
	if (qc) {
		mkdirSync(join(out, "qc"), { recursive: true });
		for (const [i, s] of scene.steps.entries()) {
			const n = String(i + 1).padStart(2, "0");
			await write(`qc/${n}-before`, Math.max(0, s.at - 0.2), "before", s.label);
			if (i < scene.steps.length - 1) await write(`qc/${n}-after`, s.at + 0.2, "after", s.label);
		}
	}
	if (phone?.scene) {
		mkdirSync(join(out, "qc"), { recursive: true });
		const last = phone.scene.steps[phone.scene.steps.length - 1];
		// loadScene never calls frame(), so a custom scene can still fail here.
		try {
			await write("qc/phone", phone.scene.duration, "phone", last.label, phone.scene);
		} catch (e) {
			phoneError = e instanceof Error ? e.message : String(e);
		}
	}
	// Include the actual runtime bytes, not only its package version: local
	// runtime edits must invalidate an export even before a release is made.
	const runtimeDir = fileURLToPath(new URL("../runtime/", import.meta.url));
	const runtimeDigest = createHash("sha256");
	for (const file of listFiles(runtimeDir).filter((f) => f.endsWith(".mjs"))) {
		runtimeDigest.update(file).update("\0").update(readFileSync(join(runtimeDir, file))).update("\0");
	}
	const runtimeHash = runtimeDigest.digest("hex");
	const inputHash = createHash("sha256")
		.update(runtimeHash)
		.update(JSON.stringify({ format: scene.format ?? format, locale: scene.locale ?? locale, theme, png, scale, qc, background }))
		.update(sourceFile ? readFileSync(sourceFile) : scene.frame.toString())
		.update(JSON.stringify(style ?? "neutral"))
		.update(JSON.stringify(options ?? null))
		.digest("hex")
		.slice(0, 16);
	const source = sourceFile ? sourceState(sourceFile) : { commit: null, dirty: null };
	const manifest = {
		tool: "motion-kit",
		version,
		scene: scene.id,
		type: scene.type ?? "custom",
		format: scene.format ?? format ?? null,
		locale: scene.locale ?? locale ?? null,
		options: options ?? null,
		width: scene.width,
		height: scene.height,
		duration: Math.round(scene.duration * 1000) / 1000,
		style: style?.name ?? "neutral",
		theme,
		inputHash,
		runtimeHash,
		sourceCommit: source.commit,
		sourceDirty: source.dirty,
		render: { png, scale: png ? scale : null, background, qc },
		files,
	};

	// Replace the previous export: remove what it wrote that this one did not.
	// The new manifest is published only afterwards, so a removal that fails
	// leaves the old one listing the stale files for the retry.
	const written = new Set(["manifest.json", "index.html", ...files.flatMap((f) => (f.png ? [f.svg, f.png] : [f.svg]))]);
	const root = realpathSync(out);
	for (const p of previous) {
		if (written.has(p)) continue;
		const target = join(out, p);
		// A directory symlinked out of `out` must not lead the removal elsewhere.
		let parent;
		try {
			parent = realpathSync(dirname(target));
		} catch {
			continue; // its folder is gone, so is the file
		}
		if (parent !== root && !parent.startsWith(root + sep)) {
			warn(`motion-kit export: did not remove ${p}: it resolves outside ${out}`);
			continue;
		}
		rmSync(target, { force: true });
	}
	writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(join(out, "index.html"), contactSheet(scene, files, theme, style, phoneError));
	const qcDir = join(out, "qc");
	if (existsSync(qcDir) && readdirSync(qcDir).length === 0) rmdirSync(qcDir);
	const unknown = listFiles(out).filter((p) => !written.has(p));
	if (unknown.length) warn(`motion-kit export: left ${unknown.length} file(s) in ${out} that no export wrote: ${unknown.join(", ")}`);
	return manifest;
}

function contactSheet(scene, files, theme, style, phoneError) {
	const bg = style?.[theme]?.bg ?? (theme === "dark" ? "#0f1115" : "#ffffff");
	const card = (f) =>
		`<figure><img src="${f.svg}" alt=""><figcaption>${f.kind} · ${f.t}s · ${escapeHtml(f.label)}</figcaption></figure>`;
	const steps = files.filter((f) => f.kind === "step");
	const qcs = files.filter((f) => f.kind === "before" || f.kind === "after");
	const tall = files.find((f) => f.kind === "phone");
	const phoneRow = tall
		? `<div class="grid phone">${card(tall)}</div>`
		: `<p>The tall layout could not be built${phoneError ? ` (${escapeHtml(phoneError)})` : ""}; this is the ${escapeHtml(scene.format ?? "exported")} frame at 360 px.</p><div class="grid phone">${steps.slice(-1).map(card).join("")}</div>`;
	return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(scene.title)} · contact sheet</title>
<style>body{font:14px system-ui;margin:24px;background:#e5e7eb}h2{margin:24px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
figure{margin:0;background:${bg};padding:8px;border-radius:8px}img{width:100%;display:block}
figcaption{font-size:12px;color:#6b7280;margin-top:4px}.phone figure{width:fit-content}.phone img{width:360px}</style>
<h1>${escapeHtml(scene.title)}</h1><p>${escapeHtml(scene.id)} · ${scene.width}×${scene.height} · ${scene.duration.toFixed(2)} s · ${theme}</p>
<h2>Steps (what a slide shows)</h2><div class="grid">${steps.map(card).join("")}</div>
${qcs.length ? `<h2>QC: 0.2 s before / after each step</h2><div class="grid">${qcs.map(card).join("")}</div>` : ""}
<h2>Phone size (tall layout, 360 px wide)</h2>${phoneRow}
<h2>Review</h2><ol><li>Does the step sequence tell the story without narration?</li><li>Any overlapping text, half-drawn lines or stray dots?</li><li>Readable at phone size?</li><li>Only approved copy and claims? No invented numbers?</li><li>Human approval: ____________ (name, date)</li></ol>`;
}

export function escapeHtml(s) {
	return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
