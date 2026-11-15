/**
 * motion-kit · scene type "sequence".
 *
 * Helps the viewer understand: one thing passes through ordered stages.
 * Storyboard: every node appears in reading order (skeleton first, so the whole
 * structure is visible), then an emphasis ring — the thing itself — travels
 * node to node; each node it reaches fills with the accent colour and the path
 * behind it turns accent. Every step frame reads as "you are here".
 *
 * Spec:
 *   { type: "sequence", id, title, description,
 *     nodes: [{ label, detail?, glyph?, icon? }],     // 2–12 nodes
 *     glyphs?: "numbers" | "none"                      // default "numbers"
 *     fontSize?: number }
 * Strings may be localized objects: { en: "...", nl: "..." }.
 */
import { easeOut, easeStandard, progress } from "../motion.mjs";
import { circleNode, FONT_MIN, stateLabel } from "../parts.mjs";
import { FORMATS, localize } from "../scene.mjs";
import { tok } from "../style.mjs";
import { drawOn, el, polyline, trimSegment } from "../svg.mjs";
import { wrapLabel } from "../wrap.mjs";

// Timeline (seconds). Steps are settled because PERIOD ≥ HOP + FILL.
const ENTER_GAP = 0.1;
const ENTER = 0.4;
const FILL = 0.25;
const HOP = 0.4;
const PERIOD = HOP + FILL + 0.05;
const TAIL = 0.4;

const PAD = 24;
const CHAR = 0.56; // average glyph width / font size

function pickArrangement(format, n) {
	const { width: W, height: H } = format;
	if (format.name === "tall" || (H > 0 && W / H < 0.8)) return { rows: n, cols: 1, labels: "right" };
	const aspect = H > 0 ? W / H : 4;
	if (aspect >= 1.5) {
		const cellW = (W - 2 * PAD) / n;
		if (cellW >= 96) return { rows: 1, cols: n, labels: "below" };
		return { rows: 2, cols: Math.ceil(n / 2), labels: "below" };
	}
	const rows = n <= 3 ? 1 : n <= 8 ? 2 : 3;
	return { rows, cols: Math.ceil(n / rows), labels: "below" };
}

function layout(format, n, fs) {
	const arr = pickArrangement(format, n);
	const W = format.width;
	const fixed = format.height > 0;
	const lineH = fs * 1.25;
	if (arr.labels === "right") {
		const r = fixed ? Math.round(fs * 1.4) : 20;
		const cellH = fixed ? Math.min(fs * 9, (format.height - 2 * PAD) / n) : 76;
		const H = fixed ? format.height : cellH * (n - 1) + 2 * r + 2 * PAD + 8;
		const top = (H - cellH * (n - 1)) / 2;
		const cx = PAD + r + 4;
		const labelX = cx + r + 14;
		const maxChars = Math.floor((W - labelX - PAD) / (fs * CHAR));
		const centers = Array.from({ length: n }, (_, i) => ({ x: cx, y: top + i * cellH }));
		return { W, H, r, fs, lineH, maxChars, maxLines: 2, centers, cols: 1, label: (c) => ({ x: labelX, y: c.y, anchor: "start", baseline: "central" }) };
	}
	const { rows, cols } = arr;
	const cellW = (W - 2 * PAD) / cols;
	const r = Math.max(16, Math.min(fs * 1.9, cellW * 0.2));
	const maxLines = 2;
	const blockH = 2 * r + 12 + maxLines * lineH;
	const gapY = fixed ? Math.max(28, Math.min(fs * 4, (format.height - 2 * PAD - rows * blockH) / Math.max(1, rows - 1) / 2)) : 28;
	const H = fixed ? format.height : rows * blockH + (rows - 1) * gapY + 2 * PAD + 8;
	const usedH = rows * blockH + (rows - 1) * gapY;
	const top = (H - usedH) / 2 + r;
	// Leave room on both sides for the elbow connectors of a snake grid.
	const maxChars = Math.floor((cellW - 10) / (fs * CHAR));
	const centers = [];
	for (let k = 0; k < n; k++) {
		const row = Math.floor(k / cols);
		const inRow = k % cols;
		const col = row % 2 === 0 ? inRow : cols - 1 - inRow; // snake
		centers.push({ x: PAD + cellW * (col + 0.5), y: top + row * (blockH + gapY) });
	}
	return { W, H, r, fs, lineH, maxChars, maxLines, centers, cols, cellW, label: (c) => ({ x: c.x, y: c.y + r + 12, anchor: "middle", baseline: "hanging" }) };
}

/** Largest font (≤ max) at which every label fits its budget. */
function fit(f, nodes, locale, maxFs) {
	let lastErr;
	for (let fs = maxFs; fs >= FONT_MIN; fs--) {
		const L = layout(f, nodes.length, fs);
		if (L.maxChars < 6) continue;
		try {
			const lines = nodes.map((node) => wrapLabel(localize(node.label, locale), L.maxChars, L.maxLines));
			return { L, lines };
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr ?? new Error("does not fit");
}

/**
 * Connector between consecutive nodes. Same row/column: a straight segment.
 * A snake-grid row turn: an elbow routed outside the column, clear of labels.
 */
function connector(a, b, r, W, grid, cellW) {
	if (grid && Math.abs(a.x - b.x) < 1) {
		const side = a.x > W / 2 ? 1 : -1;
		// Beyond the widest possible label (cellW − 10), inside the canvas padding.
		const out = a.x + side * (cellW / 2 + PAD / 2);
		const p = { x: a.x + side * (r + 6), y: a.y };
		const q = { x: b.x + side * (r + 6), y: b.y };
		return {
			path: polyline([p, { x: out, y: a.y }, { x: out, y: b.y }, q]),
			ring: polyline([a, { x: out, y: a.y }, { x: out, y: b.y }, b]),
		};
	}
	const [p, q] = trimSegment(a, b, r + 6);
	return { path: polyline([p, q]), ring: polyline([a, b]) };
}

export function sequence(spec, { format = "16:9", locale = "en" } = {}) {
	const nodes = spec.nodes ?? [];
	if (nodes.length < 2 || nodes.length > 12) throw new Error(`sequence "${spec.id}": needs 2–12 nodes, got ${nodes.length}`);
	const f = typeof format === "string" ? { name: format, ...FORMATS[format] } : format;
	if (!f.width) throw new Error(`unknown format "${format}"`);
	const n = nodes.length;
	const maxFs = spec.fontSize ?? (f.height > 0 ? 22 : 16);
	let fitted;
	try {
		fitted = fit(f, nodes, locale, maxFs);
	} catch (e) {
		throw new Error(`sequence "${spec.id}": labels do not fit format ${f.name} at ≥ ${FONT_MIN}px: ${e instanceof Error ? e.message : e}`);
	}
	const { L } = fitted;

	const items = nodes.map((node, i) => ({
		label: localize(node.label, locale),
		detail: localize(node.detail, locale),
		lines: fitted.lines[i],
		node: { ...node, glyph: node.icon ? undefined : (node.glyph ?? (spec.glyphs === "none" ? "" : String(i + 1))) },
	}));

	const START = ENTER_GAP * (n - 1) + ENTER + 0.1;
	const FIRST_HOP = START + FILL + 0.25;
	const hopStart = (k) => FIRST_HOP + k * PERIOD;
	const fillStart = (k) => (k === 0 ? START : hopStart(k - 1) + HOP);
	const stepAt = (k) => fillStart(k) + FILL;
	const duration = stepAt(n - 1) + TAIL;
	const ringR = L.r + 6;

	// Elbows run on the canvas edge side, so the vertical turn of a snake grid
	// never crosses a label.
	const segs = L.centers.slice(1).map((c, i) => connector(L.centers[i], c, L.r, L.W, L.cols > 1, L.cellW));

	function frame(t) {
		const enter = (k) => progress(t, k * ENTER_GAP, ENTER, easeOut);
		const active = (k) => progress(t, fillStart(k), FILL, easeStandard);
		const out = [];
		// Connectors: pending line once both ends are in, accent draw-on during the hop.
		segs.forEach((s, k) => {
			const shown = Math.min(enter(k), enter(k + 1));
			const common = { d: s.path.d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
			if (shown > 0) out.push(el("path", { ...common, stroke: tok("line"), "stroke-width": 2, opacity: shown }));
			const dash = drawOn(s.path.length, progress(t, hopStart(k), HOP, easeStandard));
			if (dash) out.push(el("path", { ...common, stroke: tok("accent"), "stroke-width": 3, ...dash }));
		});
		items.forEach((it, k) => {
			const c = L.centers[k];
			out.push(circleNode({ cx: c.x, cy: c.y, r: L.r, enter: enter(k), active: active(k), node: it.node }));
			out.push(stateLabel({ ...L.label(c), lines: it.lines, fontSize: L.fs, enter: enter(k), active: active(k) }));
		});
		// Emphasis ring: appears on node 1, then hops.
		const appear = progress(t, START, FILL, easeOut);
		if (appear > 0) {
			let pos = L.centers[0];
			for (let k = 0; k < n - 1; k++) {
				const p = progress(t, hopStart(k), HOP, easeStandard);
				if (p <= 0) break;
				pos = segs[k].ring.at(p);
			}
			out.push(el("circle", { cx: pos.x, cy: pos.y, r: ringR * (0.85 + 0.15 * appear), fill: "none", stroke: tok("emphasis"), "stroke-width": 3, opacity: appear }));
		}
		return out.join("");
	}

	return {
		id: `${spec.id}-${f.name.replace(":", "x")}`,
		type: "sequence",
		format: f.name,
		locale,
		width: L.W,
		height: L.H,
		duration,
		title: localize(spec.title, locale),
		description: localize(spec.description, locale),
		steps: items.map((it, k) => ({ at: stepAt(k), label: it.label, detail: it.detail })),
		frame,
	};
}
