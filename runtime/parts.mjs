/**
 * motion-kit · shared drawing parts for scene types.
 *
 * Every part draws a two-state element (pending → active) as a cross-fade of
 * two overlapping layers with opacities 1 − p and p. Interpolating between two
 * colour tokens would need literal colours; cross-fading keeps scenes
 * token-only and works the same in every renderer.
 */
import { attrString, el, esc, fade, num, text, translate } from "./svg.mjs";
import { tok } from "./style.mjs";

export const FONT_MIN = 14; // smallest label size at 1× (viewBox units)

/**
 * Optional icon: SVG path data drawn on a 24×24 grid with round strokes
 * (Lucide/Feather style). `icon` is a string or string[] of path `d` values.
 * Supply the path data in the spec; motion-kit ships no icon set.
 */
export function iconPaths(icon, cx, cy, size, color, strokeWidth = 2) {
	const paths = Array.isArray(icon) ? icon : [icon];
	const s = size / 24;
	return el(
		"g",
		{
			transform: `translate(${num(cx - size / 2)} ${num(cy - size / 2)}) scale(${num(s, 4)})`,
			fill: "none",
			stroke: color,
			"stroke-width": num(strokeWidth / s),
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
		...paths.map((d) => el("path", { d })),
	);
}

/** Content inside a node: icon, short glyph (≤ 3 chars), or nothing. */
function glyph(node, cx, cy, size, color) {
	if (node.icon) return iconPaths(node.icon, cx, cy, size * 0.9, color);
	if (node.glyph) {
		return text(
			{ x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": size * 0.62, "font-weight": 600, fill: color },
			String(node.glyph).slice(0, 3),
		);
	}
	return "";
}

/**
 * Circular node with pending and active layers.
 * @param {object} o { cx, cy, r, enter, active, node, strokeWidth }
 */
export function circleNode({ cx, cy, r, enter, active, node, strokeWidth = 2 }) {
	if (enter <= 0) return "";
	const dy = (1 - enter) * 8;
	const g = r * 0.95;
	const pending = el(
		"g",
		{},
		el("circle", { cx, cy, r, fill: tok("surface"), stroke: tok("line"), "stroke-width": strokeWidth }),
		glyph(node, cx, cy, g, tok("muted")),
	);
	const on = el(
		"g",
		{},
		el("circle", { cx, cy, r, fill: tok("accent"), stroke: tok("accent"), "stroke-width": strokeWidth }),
		glyph(node, cx, cy, g, tok("onAccent")),
	);
	return fade(enter, { transform: dy > 0.004 ? translate(0, dy) : undefined }, fade(1 - active, {}, pending), fade(active, {}, on));
}

/**
 * Rounded box node with a wrapped label inside.
 * @param {object} o { x, y, w, h, lines, fontSize, enter, active, radius, strokeWidth, weight }
 */
export function boxNode({ x, y, w, h, lines, fontSize, enter, active, radius = 10, strokeWidth = 2, weight = 500 }) {
	if (enter <= 0) return "";
	const dy = (1 - enter) * 8;
	const cx = x + w / 2;
	const cy = y + h / 2;
	const label = (fill) =>
		text({ x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fontSize, "font-weight": weight, fill }, lines);
	const pending = el(
		"g",
		{},
		el("rect", { x, y, width: w, height: h, rx: radius, fill: tok("surface"), stroke: tok("line"), "stroke-width": strokeWidth }),
		label(tok("ink")),
	);
	const on = el(
		"g",
		{},
		el("rect", { x, y, width: w, height: h, rx: radius, fill: tok("accent"), stroke: tok("accent"), "stroke-width": strokeWidth }),
		label(tok("onAccent")),
	);
	return fade(enter, { transform: dy > 0.004 ? translate(0, dy) : undefined }, fade(1 - active, {}, pending), fade(active, {}, on));
}

/** Label text with a pending (muted) → active (ink) cross-fade. */
export function stateLabel({ x, y, lines, fontSize, anchor = "middle", baseline = "hanging", enter, active, weight = 500 }) {
	if (enter <= 0) return "";
	const attrs = (fill) => ({ x, y, "text-anchor": anchor, "dominant-baseline": baseline, "font-size": fontSize, "font-weight": weight, fill });
	const block = (fill) => {
		if (baseline === "central" || lines.length === 1) return text(attrs(fill), lines);
		// hanging: stack downward from y
		const spans = lines
			.map((line, i) => `<tspan x="${num(x)}" dy="${num(i === 0 ? 0 : fontSize * 1.25)}">${esc(line)}</tspan>`)
			.join("");
		return `<text${attrString(attrs(fill))}>${spans}</text>`;
	};
	return fade(enter, {}, fade(1 - active, {}, block(tok("muted"))), fade(active, {}, block(tok("ink"))));
}

/** Point where the ray from a rect's centre toward `to` leaves the rect (+gap). */
export function rectEdge(cx, cy, hw, hh, to, gap = 0) {
	const dx = to.x - cx;
	const dy = to.y - cy;
	if (dx === 0 && dy === 0) return { x: cx, y: cy };
	const sx = dx === 0 ? Infinity : (hw + gap) / Math.abs(dx);
	const sy = dy === 0 ? Infinity : (hh + gap) / Math.abs(dy);
	const s = Math.min(sx, sy);
	return { x: cx + dx * s, y: cy + dy * s };
}
