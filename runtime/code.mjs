// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · code blocks, for custom scenes (`kit`).
 *
 * A panel of monospace code whose highlight band moves from one line range to
 * the next, once per step. Pure functions of time, like every part here:
 *
 * - `codeBlock` lays the lines out once, in the scene's factory, and throws when
 *   they do not fit, naming the line and the remedy. Lines wrap, clip or are
 *   refused, by a rule the caller chooses (`overflow`);
 * - `drawCode` draws the block at time `t`. A translucent band with a solid
 *   marker covers the active range; the lines under it are at full ink, the
 *   rest dimmed. The band appears over the first range, then moves from range to
 *   range on the style's movement curve, its leading edge first and the trailing
 *   edge a beat behind (split edges), and the brightness of each line follows
 *   the band's own edges, so a line lights as the band reaches it;
 * - `codeEnd` is the time the last move is over, so a scene keeps every step
 *   settled; `codePairs` is the token pairs the block draws, for
 *   `scene.contrastPairs`.
 *
 * The caller supplies the syntax roles: a line is a string, or runs of
 * `{ text, role }`. A role maps to a style token (`CODE_ROLES`), so a tint is a
 * token and never a colour literal. There is no grammar here (a build-time tool
 * can write the runs, as Mermaid's layout is computed outside the runtime).
 * Nothing repeats: the band moves once per step and rests there.
 *
 * Imports stay single-line named imports: lib/bundle.mjs inlines only that form.
 */
import { clamp01, easeStandard, progress, splitEdge } from "./motion.mjs";
import { TOKENS, tok } from "./style.mjs";
import { el, esc, fade, num } from "./svg.mjs";

/**
 * A monospace stack for code. A style's own monospace face, when it names one,
 * is passed as `font`.
 */
export const CODE_FONT = 'ui-monospace, SF Mono, Cascadia Mono, DejaVu Sans Mono, Menlo, Consolas, monospace';

/** Advance of one column, in ems: what the common monospace faces measure (0.6). */
const ADVANCE = 0.6;

/** Smallest code size, in px: the same floor as every other label. */
const FONT_MIN = 14;

/**
 * How each syntax role is drawn: a style token, and optionally a bolder weight
 * or italics. The defaults keep to the tokens that read as text on `surface` in
 * both themes of the neutral style (`ink`, `muted`), and separate the roles by
 * weight and slant as well as by tint, so they hold up in greyscale. A caller
 * may map a role to any token (`accent`, `emphasis`); the gate then holds the
 * style to that pair (`codePairs`).
 * @typedef {{ token: string, weight?: number, italic?: boolean }} CodeRole
 * @type {Readonly<Record<string, Readonly<CodeRole>>>}
 */
export const CODE_ROLES = Object.freeze({
	code: Object.freeze({ token: "ink" }),
	keyword: Object.freeze({ token: "ink", weight: 700 }),
	string: Object.freeze({ token: "muted" }),
	comment: Object.freeze({ token: "muted", italic: true }),
});

/** Seconds the band's trailing edge follows its leading edge by. */
export const CODE_BAND_LAG = 0.07;

/** Share of the surface the band's tint covers, under the lines. */
const BAND_TINT = 0.18;
/** Where the band's marker ends, from the panel's left edge: the least padding. */
const MIN_PADDING = 10;

/**
 * A run of code in one role.
 * @typedef {{ text: string, role?: string }} CodeRun
 * @typedef {string | (string | CodeRun)[]} CodeLine
 * One laid-out row: a source line, or a piece of one that wrapped.
 * @typedef {{ line: number, first: boolean, runs: { text: string, role: string, col: number }[] }} CodeRow
 * @typedef {{
 *   x: number, y: number, width: number, height: number, fontSize: number, rowHeight: number,
 *   charWidth: number, padding: number, radius: number, font: string, dim: number,
 *   lineNumbers: boolean, digits: number, columns: number,
 *   roles: Readonly<Record<string, Readonly<CodeRole>>>,
 *   lineCount: number, rows: readonly CodeRow[], source: readonly string[], text: string,
 *   rowSpan: (from: number, to: number) => [number, number],
 *   rangeText: (from: number, to: number) => string,
 * }} CodeBlock
 * One move of the band: the line range it lands on (1-based, inclusive; a
 * number is one line, a pair is `[from, to]`), when it starts and how long it takes.
 * @typedef {{ lines: number | readonly number[], start: number, duration?: number }} CodeMove
 * @typedef {{ from: number, to: number, start: number, duration: number }} NormalizedMove
 */

/** @param {unknown} n */
const finite = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * `source` with each tab moved on to the next multiple of `tabSize` columns.
 * @param {string} s
 * @param {number} tabSize
 * @param {number} col column the string starts at
 */
function expandTabs(s, tabSize, col) {
	let out = "";
	let n = 0;
	for (const ch of s) {
		if (ch === "\t") {
			const pad = tabSize - ((col + n) % tabSize);
			out += " ".repeat(pad);
			n += pad;
		} else {
			out += ch;
			n++;
		}
	}
	return out;
}

/**
 * The characters the grid accepts: ones known to take exactly one cell. Basic
 * Latin, Latin-1 to IPA and the spacing modifiers, Greek and Greek Extended,
 * Cyrillic and its supplement, Latin Extended Additional, currency signs,
 * general punctuation, arrows, mathematical operators, box drawing and block
 * elements. Everything else is refused, not listed: a list of the wide or
 * invisible characters needs every Unicode release, and one that is behind
 * puts the next run off its column.
 */
const NARROW_ONLY = /[^\t\u0020-\u007E\u00A0-\u02FF\u0370-\u03FF\u0400-\u052F\u1E00-\u1FFF\u2010-\u2027\u2030-\u205E\u20A0-\u20BF\u2190-\u21FF\u2200-\u22FF\u2500-\u259F\u{1D400}-\u{1D7FF}]/u;

/** Zero-advance characters (combining marks, joiners, bidi and other every Unicode format character such as soft hyphens, variation selectors): a cell grid cannot place them. */
const ZERO_WIDTH = /\p{M}|\p{Cf}|[\u200B-\u200F\u2060-\u2064]/u;

/** Code points no Unicode release has assigned: they have no glyph, so the cell is not known. */
const UNASSIGNED = /\p{Cn}/u;

/**
 * What `font` may be: a comma-separated list of family names, each a quoted
 * string (any text but `<>{};` and a backslash) or an unquoted run of letters,
 * digits, `_`, `.`, `-` and spaces. Nothing else is read as a family list, so a
 * function call (`var()`), a comment or any other CSS syntax outside quotes is
 * refused, and the browser and resvg cannot read the value differently.
 */
const FONT_NAME = `(?:"[^"<>{};\\\\]*"|'[^'<>{};\\\\]*'|[A-Za-z0-9_.][A-Za-z0-9_. -]*)`;
const FONT_LIST = new RegExp(`^\\s*${FONT_NAME}(?:\\s*,\\s*${FONT_NAME})*\\s*$`);
/** Characters XML 1.0 forbids, lone surrogates included: they would make the SVG invalid. */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * A line as a list of characters, each with its role.
 * @param {CodeLine} line
 * @param {number} n 1-based line number, for the error
 * @param {Record<string, CodeRole>} roles
 * @param {number} tabSize
 * @returns {{ chars: string[], roles: string[] }}
 */
function flatten(line, n, roles, tabSize) {
	const parts = typeof line === "string" ? [line] : line;
	if (!Array.isArray(parts)) throw new Error(`codeBlock: line ${n} must be a string or an array of runs`);
	/** @type {string[]} */ const chars = [];
	/** @type {string[]} */ const names = [];
	for (const part of parts) {
		const run = typeof part === "string" ? { text: part, role: "code" } : part;
		if (!run || typeof run.text !== "string") throw new Error(`codeBlock: line ${n} has a run without text`);
		const role = run.role ?? "code";
		if (!Object.hasOwn(roles, role)) throw new Error(`codeBlock: line ${n} uses the role "${role}", which is not defined (known: ${Object.keys(roles).join(", ")}); add it to the \`roles\` option`);
		if (/[\r\n]/.test(run.text)) throw new Error(`codeBlock: line ${n} contains a line break; give each line of code its own entry in \`lines\``);
		const bad = run.text.match(NOT_XML)?.[0];
		if (bad) throw new Error(`codeBlock: line ${n} has the character U+${bad.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}, which an SVG cannot hold; remove it`);
		const zero = run.text.match(ZERO_WIDTH)?.[0];
		if (zero) throw new Error(`codeBlock: line ${n} has U+${zero.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}, a combining or zero-width character; the block sets code on a grid of one-column characters, so use the precomposed character (or ASCII)`);
		const odd = run.text.match(NARROW_ONLY)?.[0] ?? run.text.match(UNASSIGNED)?.[0];
		if (odd) throw new Error(`codeBlock: line ${n} has "${odd}" (U+${odd.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}), which is not known to fit one column (wider than one column, or invisible); the block sets code on a grid of one-column characters and accepts assigned Latin (including Extended Additional), Greek (including Extended), Cyrillic and common symbols, so write that character in ASCII (or draw it outside the block)`);
		for (const ch of expandTabs(run.text, tabSize, chars.length)) {
			chars.push(ch);
			names.push(role);
		}
	}
	while (chars.length && chars[chars.length - 1] === " ") {
		chars.pop();
		names.pop();
	}
	return { chars, roles: names };
}

/**
 * Cut a character list into runs of one role each, positioned by column. Runs
 * of spaces only are dropped: nothing shows there, and every run carries its
 * own column.
 * @param {string[]} chars
 * @param {string[]} names
 * @param {number} col0 column of the first character
 */
function toRuns(chars, names, col0) {
	/** @type {{ text: string, role: string, col: number }[]} */
	const runs = [];
	let prev = -1;
	for (let i = 0; i < chars.length; i++) {
		const last = runs[runs.length - 1];
		if (last && last.role === names[i] && prev === i - 1) last.text += chars[i];
		else runs.push({ text: chars[i], role: names[i], col: col0 + i });
		prev = i;
	}
	return runs.filter((r) => r.text.trim() !== "");
}

/**
 * Break one source line into rows of at most `columns` columns: at the last
 * space that fits, or in the middle of a word that has none. Continuation rows
 * are indented two columns past the line's own indent (at most a quarter of the
 * width).
 * @param {{ chars: string[], roles: string[] }} flat
 * @param {number} columns
 * @returns {{ chars: string[], names: string[], col0: number }[]}
 */
function wrapRows(flat, columns) {
	const { chars, roles } = flat;
	const lead = chars.findIndex((c) => c !== " ");
	const cont = Math.min((lead < 0 ? 0 : lead) + 2, Math.floor(columns / 4));
	const rows = [];
	let start = 0;
	let first = true;
	while (start < chars.length) {
		const cap = first ? columns : columns - cont;
		if (chars.length - start <= cap) {
			rows.push({ chars: chars.slice(start), names: roles.slice(start), col0: first ? 0 : cont });
			break;
		}
		let br = start + cap;
		while (br > start + (first ? Math.max(lead, 0) : 0) && chars[br] !== " ") br--;
		const hard = br <= start + (first ? Math.max(lead, 0) : 0);
		const end = hard ? start + cap : br;
		const rowChars = chars.slice(start, end);
		const rowNames = roles.slice(start, end);
		while (rowChars.length && rowChars[rowChars.length - 1] === " ") {
			rowChars.pop();
			rowNames.pop();
		}
		rows.push({ chars: rowChars, names: rowNames, col0: first ? 0 : cont });
		start = end;
		while (!hard && chars[start] === " ") start++;
		first = false;
	}
	return rows.length ? rows : [{ chars: [], names: [], col0: 0 }];
}

/**
 * Lay a snippet out in a panel. Throws when it does not fit, naming the line
 * and the remedy, so a snippet too long for a format fails the scene's
 * construction and not its picture.
 *
 * `width` is the panel's width; its height is the code's (rows × `fontSize` ×
 * `lineHeight`, plus the padding), and `maxHeight`, when given, is the most the
 * picture can spare for it. `font` must be a monospace face whose advance is 0.6 em:
 * columns are fixed at 0.6 em, so a proportional face, or a fixed-pitch one with
 * another advance (Iosevka's is 0.5 em), can overflow the panel, overlap runs or
 * leave gaps between them.
 * @param {{
 *   lines: CodeLine[], x: number, y: number, width: number, maxHeight?: number,
 *   fontSize?: number, lineHeight?: number, padding?: number, radius?: number,
 *   overflow?: "error" | "wrap" | "clip", lineNumbers?: boolean, tabSize?: number,
 *   dim?: number, font?: string, roles?: Record<string, CodeRole>,
 * }} opts
 * @returns {CodeBlock}
 */
export function codeBlock(opts) {
	const { lines, x, y, width, maxHeight, fontSize = 14, lineHeight = 1.5, padding = 14, radius = 10, overflow = "error", lineNumbers = true, tabSize = 2, dim = 0.45, font = CODE_FONT } = opts ?? {};
	if (!Array.isArray(lines) || !lines.length) throw new Error("codeBlock: `lines` needs at least one line of code");
	for (const [name, value] of Object.entries({ x, y, width, fontSize, lineHeight, padding, radius, tabSize, dim })) {
		if (!finite(value)) throw new Error(`codeBlock: \`${name}\` must be a finite number`);
	}
	if (!(width > 0)) throw new Error("codeBlock: `width` must be positive");
	if (fontSize < FONT_MIN) throw new Error(`codeBlock: \`fontSize\` ${fontSize} is under ${FONT_MIN} px, the smallest text the kit draws; show fewer or shorter lines instead`);
	if (!(lineHeight >= 1)) throw new Error("codeBlock: `lineHeight` must be at least 1");
	if (!(radius >= 0)) throw new Error("codeBlock: `radius` must not be negative");
	if (!(padding >= MIN_PADDING)) throw new Error(`codeBlock: \`padding\` must be at least ${MIN_PADDING} px, so the band's marker (at the panel's left edge) does not paint over the code`);
	if (!Number.isInteger(tabSize) || tabSize < 1) throw new Error("codeBlock: `tabSize` must be a whole number from 1");
	if (!(dim >= 0 && dim < 1)) throw new Error("codeBlock: `dim` must be at least 0 and under 1 (the opacity of the lines outside the band)");
	if (maxHeight !== undefined && !finite(maxHeight)) throw new Error("codeBlock: `maxHeight` must be a finite number");
	if (!["error", "wrap", "clip"].includes(overflow)) throw new Error(`codeBlock: \`overflow\` must be "error", "wrap" or "clip", got ${JSON.stringify(overflow)}`);
	if (typeof font !== "string" || !FONT_LIST.test(font) || NOT_XML.test(font) || /var\(\s*--mk-/i.test(font)) throw new Error(`codeBlock: \`font\` must be a CSS font-family list, got ${JSON.stringify(font)}`);
	/** @type {Record<string, CodeRole>} */
	const given = { ...CODE_ROLES, ...(opts.roles ?? {}) };
	for (const [name, role] of Object.entries(given)) {
		if (!role || !TOKENS.includes(role.token)) throw new Error(`codeBlock: role "${name}" names the token "${role?.token}", which is not a style token (known: ${TOKENS.join(", ")})`);
		if (role.weight !== undefined && !(Number.isInteger(role.weight) && role.weight % 100 === 0 && role.weight >= 100 && role.weight <= 900)) throw new Error(`codeBlock: role "${name}" has a weight that is not a multiple of 100 from 100 to 900 (resvg ignores others)`);
	}

	/** Own, frozen copies: the caller's role objects can change after construction. */
	const roles = Object.fromEntries(Object.entries(given).map(([name, role]) => [name, Object.freeze({ token: role.token, ...(role.weight !== undefined && { weight: role.weight }), ...(role.italic !== undefined && { italic: role.italic }) })]));
	const lineCount = lines.length;
	const charWidth = fontSize * ADVANCE;
	const rowHeight = fontSize * lineHeight;
	const digits = String(lineCount).length;
	const gutter = lineNumbers ? (digits + 2) * charWidth : 0;
	const columns = Math.floor((width - 2 * padding - gutter) / charWidth);
	if (columns < 8) throw new Error(`codeBlock: a width of ${num(width)} px leaves ${Math.max(columns, 0)} columns for code at ${fontSize} px; give the block more width (a wider format) or turn the line numbers off`);

	/** @type {CodeRow[]} */ const rows = [];
	/** @type {string[]} */ const source = [];
	/** @type {[number, number][]} */ const spans = [];
	for (const [i, line] of lines.entries()) {
		const n = i + 1;
		const flat = flatten(line, n, roles, tabSize);
		source.push(flat.chars.join(""));
		let laid;
		if (flat.chars.length <= columns) laid = [{ chars: flat.chars, names: flat.roles, col0: 0 }];
		else if (overflow === "wrap") {
			const lead = flat.chars.findIndex((c) => c !== " ");
			if (lead >= Math.floor(columns / 2)) throw new Error(`codeBlock: line ${n} is indented ${lead} columns, at least half (rounded down) of the ${columns} the block fits, so it cannot wrap; dedent the snippet, or give the block more width (a wider format)`);
			laid = wrapRows(flat, columns);
		}
		else if (overflow === "clip") laid = [{ chars: [...flat.chars.slice(0, columns - 1), "…"], names: flat.roles.slice(0, columns), col0: 0 }];
		else {
			throw new Error(
				`codeBlock: line ${n} is ${flat.chars.length} columns wide, and the block fits ${columns} (${num(columns * charWidth)} px at ${fontSize} px). ` +
					`Shorten the line, set overflow to "wrap" or "clip", or give the block more width (a wider format).`,
			);
		}
		const from = rows.length;
		for (const [k, r] of laid.entries()) rows.push({ line: n, first: k === 0, runs: toRuns(r.chars, r.names, r.col0) });
		spans.push([from, rows.length]);
	}

	const height = 2 * padding + rows.length * rowHeight;
	if (maxHeight !== undefined && height > maxHeight + 1e-9) {
		const fit = Math.max(0, Math.floor((maxHeight - 2 * padding) / rowHeight));
		const over = spans.findIndex(([, end]) => end > fit);
		throw new Error(
			`codeBlock: line ${over + 1} does not fit: the block has room for ${fit} rows of code (${num(maxHeight)} px at ${fontSize} px), and the snippet needs ${rows.length}. ` +
				`Show fewer lines (one scene per snippet, or split a long walkthrough into several scenes), ${overflow === "wrap" ? "shorten the lines so they do not wrap, " : ""}or give the block more height (a taller format).`,
		);
	}

	/** @param {number} from @param {number} to */
	const check = (from, to) => {
		if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > lineCount) throw new RangeError(`code lines ${from}–${to} are not a range inside the snippet's ${lineCount} lines`);
	};
	return {
		x, y, width, height, fontSize, rowHeight, charWidth, padding, radius, font, dim, lineNumbers, digits, columns, roles, lineCount, rows, source,
		text: source.join("\n"),
		rowSpan(from, to) {
			check(from, to);
			return [spans[from - 1][0], spans[to - 1][1]];
		},
		rangeText(from, to) {
			check(from, to);
			return source.slice(from - 1, to).join("\n");
		},
	};
}

/**
 * The moves in a checked, normalized form. The first move is where the band
 * appears (it fades in over `duration`, default 0.3 s); each later one is a
 * move from the range before (default 0.5 s, plus the trailing edge's lag).
 * Moves must not overlap.
 * @param {CodeBlock} block
 * @param {readonly CodeMove[]} moves
 * @returns {NormalizedMove[]}
 */
function normalize(block, moves) {
	if (!Array.isArray(moves) || !moves.length) throw new Error("code moves: need at least one move, { lines, start }");
	/** @type {NormalizedMove[]} */ const out = [];
	let free = -Infinity;
	for (const [i, m] of moves.entries()) {
		if (Array.isArray(m?.lines) && m.lines.length !== 2) throw new RangeError(`code move ${i + 1}: lines must be a line number or a [from, to] pair, got ${JSON.stringify(m.lines)}`);
		const [from, to] = Array.isArray(m?.lines) ? m.lines : [m?.lines, m?.lines];
		if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > block.lineCount) throw new RangeError(`code move ${i + 1}: lines ${JSON.stringify(m?.lines)} are not a line or a [from, to] range inside the snippet's ${block.lineCount} lines`);
		const duration = m.duration ?? (i === 0 ? 0.3 : 0.5);
		if (!finite(m.start) || m.start < 0 || !finite(duration) || duration <= 0) throw new Error(`code move ${i + 1}: needs a start of 0 or more and a duration above 0`);
		if (m.start < free - 1e-9) throw new Error(`code move ${i + 1} starts at ${m.start}s, before the move before it is over (at ${num(free, 3)}s, its trailing edge included); start it later or shorten that one`);
		out.push({ from, to, start: m.start, duration });
		free = m.start + duration + (i === 0 ? 0 : CODE_BAND_LAG);
	}
	return out;
}

/**
 * The time the last move is over: the band is at rest, every line at its final
 * brightness. Put each step's `at` at least 50 ms after it, for the move that
 * leads to it. Throws on moves it cannot use, so call it when the scene is
 * built.
 * @param {CodeBlock} block
 * @param {readonly CodeMove[]} moves
 * @returns {number}
 */
export function codeEnd(block, moves) {
	const m = normalize(block, moves);
	const last = m[m.length - 1];
	return last.start + last.duration + (m.length === 1 ? 0 : CODE_BAND_LAG);
}

/**
 * Where the band is at time `t`, in rows from the top of the code, and how
 * strongly it shows (0..1): `null` before it appears.
 * @param {CodeBlock} block
 * @param {number} t
 * @param {readonly CodeMove[]} moves
 * @param {{ ease?: (p: number) => number }} [opts] the movement curve, `easings(style.motion).easeStandard`
 * @returns {{ top: number, bottom: number, opacity: number } | null}
 */
export function codeFocus(block, t, moves, { ease = easeStandard } = {}) {
	const m = normalize(block, moves);
	let k = -1;
	for (const [i, move] of m.entries()) if (t >= move.start) k = i;
	if (k < 0) return null;
	const [top, bottom] = block.rowSpan(m[k].from, m[k].to);
	if (k === 0) return { top, bottom, opacity: progress(t, m[0].start, m[0].duration, ease) };
	const [fromTop, fromBottom] = block.rowSpan(m[k - 1].from, m[k - 1].to);
	const { lead, trail } = splitEdge(t, m[k].start, m[k].duration, CODE_BAND_LAG, ease);
	const down = top + bottom >= fromTop + fromBottom;
	const eTop = down ? trail : lead;
	const eBottom = down ? lead : trail;
	return { top: fromTop + (top - fromTop) * eTop, bottom: fromBottom + (bottom - fromBottom) * eBottom, opacity: 1 };
}

/**
 * The block at time `t`: the panel, the band, and the lines, each at the
 * brightness the band gives it. Wrap the result in `fade` to bring the whole
 * block in.
 * @param {CodeBlock} block
 * @param {number} t
 * @param {readonly CodeMove[]} moves
 * @param {{ ease?: (p: number) => number }} [opts] the movement curve, `easings(style.motion).easeStandard`
 * @returns {string}
 */
export function drawCode(block, t, moves, opts = {}) {
	const focus = codeFocus(block, t, moves, opts);
	const { x, y, width, height, padding, rowHeight, charWidth, fontSize, dim, digits, lineNumbers } = block;
	const left = x + padding + (lineNumbers ? (digits + 2) * charWidth : 0);
	const top = y + padding;
	const out = [el("rect", { x, y, width, height, rx: block.radius, fill: tok("surface"), stroke: tok("line"), "stroke-width": 1.5 })];
	if (focus && focus.bottom > focus.top) {
		const bandY = top + focus.top * rowHeight;
		const bandH = (focus.bottom - focus.top) * rowHeight;
		out.push(
			el("rect", { x: x + 6, y: bandY, width: width - 12, height: bandH, rx: 6, fill: tok("accent"), opacity: BAND_TINT * focus.opacity }),
			el("rect", { x: x + 6, y: bandY, width: 3, height: bandH, rx: 1.5, fill: tok("accent"), opacity: focus.opacity }),
		);
	}
	for (const [r, row] of block.rows.entries()) {
		const cover = focus ? clamp01(Math.min(focus.bottom, r + 1) - Math.max(focus.top, r)) * focus.opacity : 0;
		const cy = top + (r + 0.5) * rowHeight;
		const parts = [];
		if (lineNumbers && row.first) {
			parts.push(el("text", { x: x + padding + digits * charWidth, y: cy, "text-anchor": "end", fill: tok("muted") }, esc(String(row.line))));
		}
		const spans = row.runs.map((run) => {
			const spec = block.roles[run.role];
			return el("tspan", { x: left + run.col * charWidth, fill: tok(spec.token), "font-weight": spec.weight, "font-style": spec.italic ? "italic" : undefined }, esc(run.text).replace(/var\(--mk-/g, "var(&#45;-mk-"));
		});
		if (spans.length) parts.push(el("text", { y: cy, "xml:space": "preserve" }, ...spans));
		if (parts.length) out.push(fade(dim + (1 - dim) * cover, {}, ...parts));
	}
	return el("g", { "font-family": block.font, "font-size": fontSize, "dominant-baseline": "central" }, ...out);
}

/**
 * The token pairs a block draws, for `scene.contrastPairs`: each token a role
 * that appears (and the line numbers) sets text in, against `surface` at 4.5
 * (WCAG 1.4.3); the band's marker, `accent` on `surface`, and the panel's
 * outline, `line` on `bg`, at 3 (WCAG 1.4.11). Two things the pairs do not
 * cover: the band's 18 % tint under the active lines lowers the ratio a little
 * (the neutral style keeps a wide margin; check a style near 4.5:1), and the
 * dimmed lines are the same pairs at `dim` opacity, below 4.5:1 by design: what
 * a step frame says is in the band. Add the pairs of whatever else the scene
 * draws.
 * @param {CodeBlock} block
 * @returns {readonly { fg: string, bg: string, min: number, use: string }[]}
 */
export function codePairs(block) {
	const used = new Set(block.rows.flatMap((r) => r.runs.map((run) => block.roles[run.role].token)));
	if (block.lineNumbers) used.add("muted");
	const text = TOKENS.filter((tkn) => used.has(tkn)).map((fg) => ({ fg, bg: "surface", min: 4.5, use: "code text and line numbers on the panel (drawCode)" }));
	return Object.freeze([
		...text,
		{ fg: "accent", bg: "surface", min: 3, use: "the highlight band's marker on the panel (drawCode)" },
		{ fg: "line", bg: "bg", min: 3, use: "the panel's outline on the canvas (drawCode)" },
	]);
}
