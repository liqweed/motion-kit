/**
 * motion-kit · scene type "hub-spoke".
 *
 * Helps the viewer understand: one central thing connects to several others
 * (integrations, data sources, stakeholders, outputs). Storyboard: the hub and
 * every spoke appear (skeleton first), the hub activates, then one link at a
 * time draws from the hub to a spoke (direction "out") or from a spoke to the
 * hub ("in"), carrying an emphasis dot; the spoke turns accent when reached.
 *
 * Spec:
 *   { type: "hub-spoke", id, title, description,
 *     hub: { label, detail? },
 *     spokes: [{ label, detail? }],          // 2–10
 *     direction?: "out" | "in",              // default "out"
 *     fontSize?: number }
 */
import { easeOut, easeStandard, progress, window01 } from "../motion.mjs";
import { boxNode, FONT_MIN, rectEdge } from "../parts.mjs";
import { FORMATS, localize } from "../scene.mjs";
import { tok } from "../style.mjs";
import { drawOn, el, pointOnLine } from "../svg.mjs";
import { wrapLabel } from "../wrap.mjs";

const ENTER = 0.4;
const ENTER_GAP = 0.08;
const FILL = 0.25;
const LINK = 0.45;
const PERIOD = LINK + FILL + 0.05;
const TAIL = 0.4;
const PAD = 24;
const CHAR = 0.56;

function overlaps(a, b, gap = 6) {
	return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function layout(f, n, fs) {
	const W = f.width;
	const fixed = f.height > 0;
	const narrow = f.name === "tall" || (fixed && W / f.height < 0.8);
	const lineH = fs * 1.25;
	const boxH = 2 * lineH + 20;
	if (narrow) {
		// Tree: hub on top (left-aligned), a trunk down the left edge, one
		// branch into each spoke. The trunk never crosses a box.
		const trunkX = PAD + 14;
		const hubW = Math.min(W - 2 * PAD, Math.max(200, W * 0.6));
		const boxX = trunkX + 26;
		const boxW = W - PAD - boxX;
		const minGap = 14;
		const gap = fixed ? Math.max(minGap, Math.min(48, (f.height - 2 * PAD - (n + 1) * boxH - 40) / n)) : minGap;
		const used = boxH + 40 + n * (boxH + gap);
		const H = fixed ? f.height : used + 2 * PAD - gap;
		const top = (H - used + gap) / 2;
		const hub = { x: PAD, y: top, w: hubW, h: boxH };
		const spokes = Array.from({ length: n }, (_, i) => ({ x: boxX, y: top + boxH + 40 + i * (boxH + gap), w: boxW, h: boxH }));
		return { W, H, hub, spokes, boxH, lineH, trunkX, hubChars: Math.floor((hubW - 20) / (fs * CHAR)), spokeChars: Math.floor((boxW - 20) / (fs * CHAR)), narrow };
	}
	const H = fixed ? f.height : Math.round(W * 0.5625);
	const boxW = Math.min(fs * 12, (W - 2 * PAD) / 4.2);
	const hubW = Math.min(fs * 15, boxW * 1.25);
	const cx = W / 2;
	const cy = H / 2;
	const rx = W / 2 - PAD - boxW / 2;
	const ry = H / 2 - PAD - boxH / 2;
	const hub = { x: cx - hubW / 2, y: cy - boxH / 2, w: hubW, h: boxH };
	const spokes = Array.from({ length: n }, (_, i) => {
		const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
		const x = cx + rx * Math.cos(a);
		const y = cy + ry * Math.sin(a);
		return { x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH };
	});
	return { W, H, hub, spokes, boxH, lineH, hubChars: Math.floor((hubW - 20) / (fs * CHAR)), spokeChars: Math.floor((boxW - 20) / (fs * CHAR)), narrow };
}

function layoutProblem(L) {
	const all = [L.hub, ...L.spokes];
	for (let i = 0; i < all.length; i++) {
		const b = all[i];
		if (b.x < 0 || b.y < 0 || b.x + b.w > L.W + 0.01 || b.y + b.h > L.H + 0.01) return "a node falls outside the canvas";
		for (let j = i + 1; j < all.length; j++) if (overlaps(all[i], all[j])) return "nodes overlap";
	}
	return null;
}

export function hubSpoke(spec, { format = "16:9", locale = "en" } = {}) {
	const spokesSpec = spec.spokes ?? [];
	const n = spokesSpec.length;
	if (!spec.hub) throw new Error(`hub-spoke "${spec.id}": needs a hub`);
	if (n < 2 || n > 10) throw new Error(`hub-spoke "${spec.id}": needs 2–10 spokes, got ${n}`);
	const f = typeof format === "string" ? { name: format, ...FORMATS[format] } : format;
	if (!f.width) throw new Error(`unknown format "${format}"`);
	const dirIn = spec.direction === "in";
	const hubLabel = localize(spec.hub.label, locale);
	const labels = spokesSpec.map((s) => localize(s.label, locale));
	// Largest font (≤ max) at which the layout fits and every label wraps.
	const maxFs = spec.fontSize ?? (f.height > 0 ? 20 : 16);
	let L;
	let fs;
	let hubLines;
	let spokeLines;
	let why = "";
	for (fs = maxFs; fs >= FONT_MIN; fs--) {
		const cand = layout(f, n, fs);
		const problem = layoutProblem(cand);
		if (problem) {
			why = problem;
			continue;
		}
		try {
			hubLines = wrapLabel(hubLabel, cand.hubChars, 2);
			spokeLines = labels.map((l) => wrapLabel(l, cand.spokeChars, 2));
			L = cand;
			break;
		} catch (e) {
			why = e.message;
		}
	}
	if (!L) throw new Error(`hub-spoke "${spec.id}": ${n} spokes do not fit format ${f.name} (${why}); use fewer spokes, shorter labels or a larger format`);
	const spokes = spokesSpec.map((s, i) => ({ label: labels[i], detail: localize(s.detail, locale), lines: spokeLines[i] }));

	// Link geometry: hub edge ↔ spoke edge (narrow: from hub bottom to spoke left).
	const hc = { x: L.hub.x + L.hub.w / 2, y: L.hub.y + L.hub.h / 2 };
	const links = L.spokes.map((b) => {
		const sc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
		let a;
		let z;
		if (L.narrow) {
			a = { x: L.trunkX, y: L.hub.y + L.hub.h + 4 };
			z = { x: b.x - 6, y: sc.y };
		} else {
			a = rectEdge(hc.x, hc.y, L.hub.w / 2, L.hub.h / 2, sc, 6);
			z = rectEdge(sc.x, sc.y, b.w / 2, b.h / 2, hc, 6);
		}
		const pts = L.narrow ? (dirIn ? [z, { x: a.x, y: z.y }, a] : [a, { x: a.x, y: z.y }, z]) : dirIn ? [z, a] : [a, z];
		let len = 0;
		for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
		return { pts, len };
	});

	const hubEnter = 0;
	const spokeEnter = (i) => 0.2 + i * ENTER_GAP;
	const HUB_ON = spokeEnter(n - 1) + ENTER + 0.1;
	const linkStart = (i) => HUB_ON + FILL + 0.2 + i * PERIOD;
	const spokeFill = (i) => (dirIn ? linkStart(i) - 0.0 : linkStart(i) + LINK);
	// "in": the spoke lights first, then its link travels to the hub.
	const fillStartIn = (i) => linkStart(i);
	const linkStartIn = (i) => linkStart(i) + FILL;
	const stepAt = (i) => (dirIn ? linkStartIn(i) + LINK : spokeFill(i) + FILL);
	const duration = stepAt(n - 1) + TAIL;

	function pointAlong(link, p) {
		const target = p * link.len;
		let acc = 0;
		for (let i = 1; i < link.pts.length; i++) {
			const seg = Math.hypot(link.pts[i].x - link.pts[i - 1].x, link.pts[i].y - link.pts[i - 1].y);
			if (acc + seg >= target || i === link.pts.length - 1) return pointOnLine(link.pts[i - 1], link.pts[i], seg === 0 ? 0 : (target - acc) / seg);
			acc += seg;
		}
		return link.pts[0];
	}
	const pathD = (link) => link.pts.map((p, i) => `${i === 0 ? "M" : "L"}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`).join(" ");

	function frame(t) {
		const out = [];
		const sEnter = (i) => progress(t, spokeEnter(i), ENTER, easeOut);
		links.forEach((link, i) => {
			const shown = sEnter(i);
			if (shown > 0) {
				out.push(el("path", { d: pathD(link), fill: "none", stroke: tok("line"), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: shown }));
			}
			const ls = dirIn ? linkStartIn(i) : linkStart(i);
			const p = progress(t, ls, LINK, easeStandard);
			const dash = drawOn(link.len, p);
			if (dash) {
				out.push(el("path", { d: pathD(link), fill: "none", stroke: tok("accent"), "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", ...dash }));
			}
		});
		out.push(boxNode({ ...L.hub, lines: hubLines, fontSize: fs + 1, enter: progress(t, hubEnter, ENTER, easeOut), active: progress(t, HUB_ON, FILL, easeStandard), weight: 600 }));
		spokes.forEach((s, i) => {
			const fill = dirIn ? fillStartIn(i) : spokeFill(i);
			out.push(boxNode({ ...L.spokes[i], lines: s.lines, fontSize: fs, enter: sEnter(i), active: progress(t, fill, FILL, easeStandard) }));
		});
		// Emphasis dot riding the active link; gone by the step's time.
		links.forEach((link, i) => {
			const ls = dirIn ? linkStartIn(i) : linkStart(i);
			const p = progress(t, ls, LINK, easeStandard);
			if (p <= 0) return;
			const fadeOut = dirIn ? 1 - window01(t, ls + LINK - 0.12, ls + LINK) : 1 - progress(t, spokeFill(i), FILL, easeOut);
			if (fadeOut <= 0) return;
			const pos = pointAlong(link, p);
			out.push(el("circle", { cx: pos.x, cy: pos.y, r: 6, fill: tok("emphasis"), opacity: fadeOut }));
		});
		return out.join("");
	}

	return {
		id: `${spec.id}-${f.name.replace(":", "x")}`,
		type: "hub-spoke",
		format: f.name,
		locale,
		width: L.W,
		height: L.H,
		duration,
		title: localize(spec.title, locale),
		description: localize(spec.description, locale),
		steps: [
			{ at: HUB_ON + FILL, label: hubLabel, detail: localize(spec.hub.detail, locale) },
			...spokes.map((s, i) => ({ at: stepAt(i), label: s.label, detail: s.detail })),
		],
		frame,
	};
}
