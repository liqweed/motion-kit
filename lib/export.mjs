/**
 * motion-kit · export step frames for slides and review.
 *
 * Writes, into `out`:
 *   NN-<step>.svg           standalone, tokens resolved (PowerPoint/Keynote take SVG)
 *   NN-<step>.png           with --png (Google Slides, Marp/Slidev, travelling decks)
 *   qc/…                    with --qc: frames 0.2 s before and after every step
 *   index.html              contact sheet (steps, QC row, phone-size row)
 *   manifest.json           reproducible: no timestamps; input hash + settings
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function gitCommit(cwd) {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return null;
	}
}

export async function exportSteps(scene, { out, style, theme = "light", png = false, scale = 2, qc = false, background = false, sourceFile, version } = {}) {
	mkdirSync(out, { recursive: true });
	const opts = { standalone: true, style, theme, background };
	const files = [];
	const write = async (name, t, kind, label) => {
		const svg = renderSvg(scene, t, opts);
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
	const inputHash = createHash("sha256")
		.update(sourceFile ? readFileSync(sourceFile) : scene.frame.toString())
		.update(JSON.stringify(style ?? "neutral"))
		.digest("hex")
		.slice(0, 16);
	const manifest = {
		tool: "motion-kit",
		version,
		scene: scene.id,
		type: scene.type ?? "custom",
		format: scene.format ?? null,
		locale: scene.locale ?? null,
		width: scene.width,
		height: scene.height,
		duration: Math.round(scene.duration * 1000) / 1000,
		style: style?.name ?? "neutral",
		theme,
		inputHash,
		sourceCommit: sourceFile ? gitCommit(join(sourceFile, "..")) : null,
		render: { png, scale: png ? scale : null, background, qc },
		files,
	};
	writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	writeFileSync(join(out, "index.html"), contactSheet(scene, files, theme, style));
	return manifest;
}

function contactSheet(scene, files, theme, style) {
	const bg = style?.[theme]?.bg ?? (theme === "dark" ? "#0f1115" : "#ffffff");
	const card = (f) =>
		`<figure><img src="${f.svg}" alt=""><figcaption>${f.kind} · ${f.t}s · ${escapeHtml(f.label)}</figcaption></figure>`;
	const steps = files.filter((f) => f.kind === "step");
	const qcs = files.filter((f) => f.kind !== "step");
	return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(scene.title)} · contact sheet</title>
<style>body{font:14px system-ui;margin:24px;background:#e5e7eb}h2{margin:24px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
figure{margin:0;background:${bg};padding:8px;border-radius:8px}img{width:100%;display:block}
figcaption{font-size:12px;color:#6b7280;margin-top:4px}.phone figure{width:360px}</style>
<h1>${escapeHtml(scene.title)}</h1><p>${escapeHtml(scene.id)} · ${scene.width}×${scene.height} · ${scene.duration.toFixed(2)} s · ${theme}</p>
<h2>Steps (what a slide shows)</h2><div class="grid">${steps.map(card).join("")}</div>
${qcs.length ? `<h2>QC: 0.2 s before / after each step</h2><div class="grid">${qcs.map(card).join("")}</div>` : ""}
<h2>Phone size (360 px wide)</h2><div class="grid phone">${steps.slice(-1).map(card).join("")}</div>
<h2>Review</h2><ol><li>Does the step sequence tell the story without narration?</li><li>Any overlapping text, half-drawn lines or stray dots?</li><li>Readable at phone size?</li><li>Only approved copy and claims? No invented numbers?</li><li>Human approval: ____________ (name, date)</li></ol>`;
}

export function escapeHtml(s) {
	return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
