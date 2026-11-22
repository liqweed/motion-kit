/**
 * Example custom scene: a short snippet of code, with a highlight band that
 * moves to one line range per step.
 *
 * Shows the code parts (runtime/code.mjs): `codeBlock` lays the lines out in
 * the style's monospace face and refuses a snippet that does not fit the
 * format; `drawCode` draws the band over the active lines (full ink, the rest
 * dimmed) and moves it from range to range on the style's movement curve;
 * `codeEnd` says when the last move is over, so every step frame is settled;
 * `codePairs` is what the block draws, for the contrast gate. The syntax roles
 * come from the caller: `tint` below is the whole "grammar", a few patterns run
 * once when the scene is built. The code's text is in the scene's description
 * and in each step's detail. The band moves once per step and rests; nothing
 * loops. A deck advances it one range per click. Pure: frame(t) depends only on
 * t and constants.
 */
import { easings, progress } from "../runtime/motion.mjs";
import { codeBlock, codeEnd, codePairs, drawCode } from "../runtime/code.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { fade } from "../runtime/svg.mjs";

export const locales = ["en", "nl"];

const SNIPPET = [
	"// retry a flaky request",
	"async function load(url) {",
	"  for (let i = 0; i < 3; i++) {",
	"    try {",
	"      return await fetch(url);",
	"    } catch (err) {",
	"      await sleep(100 * 2 ** i);",
	"    }",
	"  }",
	'  throw new Error("gave up");',
	"}",
];

// The three ranges the band visits, one per step (1-based, inclusive).
const RANGES = [
	[3, 5],
	[6, 8],
	[10, 10],
];

const COPY = {
	title: { en: "A retry loop, read in three steps", nl: "Een herhaallus, in drie stappen gelezen" },
	intro: { en: "A snippet of eleven lines of JavaScript;", nl: "Een fragment van elf regels JavaScript;" },
	lines: { en: "lines", nl: "regels" },
	steps: [
		{ label: { en: "Try up to three times", nl: "Probeer maximaal drie keer" }, detail: { en: "The loop counts attempts and each one calls fetch inside a try block.", nl: "De lus telt pogingen en elke poging roept fetch aan binnen een try-blok." } },
		{ label: { en: "On failure, back off", nl: "Wacht langer na een fout" }, detail: { en: "A failed attempt waits twice as long as the one before it.", nl: "Een mislukte poging wacht dubbel zo lang als de vorige." } },
		{ label: { en: "Then give up", nl: "Geef dan op" }, detail: { en: "After the third failure the function throws.", nl: "Na de derde fout gooit de functie een fout." } },
	],
};

const KEYWORDS = /^(async|function|for|let|try|catch|return|await|throw|new)\b/;

/**
 * The line as runs of syntax roles. A few patterns, not a grammar: a comment
 * runs to the end of the line, a string to its closing quote, a keyword is one
 * of a fixed list; everything else is plain code.
 * @param {string} line
 * @returns {{ text: string, role: string }[]}
 */
function tint(line) {
	const runs = [];
	let plain = "";
	const flush = () => {
		if (plain) runs.push({ text: plain, role: "code" });
		plain = "";
	};
	for (let i = 0; i < line.length; ) {
		const rest = line.slice(i);
		const comment = rest.startsWith("//") ? rest : null;
		const string = rest.match(/^"[^"]*"/)?.[0];
		const keyword = /\w/.test(line[i - 1] ?? " ") ? null : rest.match(KEYWORDS)?.[0];
		const hit = comment ? { text: comment, role: "comment" } : string ? { text: string, role: "string" } : keyword ? { text: keyword, role: "keyword" } : null;
		if (hit) {
			flush();
			runs.push(hit);
			i += hit.text.length;
		} else plain += line[i++];
	}
	flush();
	return runs;
}

// Timeline, in seconds. The band appears over the first range, then moves to the
// next; each step waits for its move to be over (`codeEnd`) plus a beat.
const MOVES = [
	{ lines: RANGES[0], start: 0.5, duration: 0.35 },
	{ lines: RANGES[1], start: 1.6, duration: 0.5 },
	{ lines: RANGES[2], start: 2.9, duration: 0.6 },
];
const SETTLE = 0.1;
const ENTER = 0.4;

/** @param {{ format?: string, locale?: string, font?: string }} [opts] `font`: the style's monospace face, when the caller has one */
export default function make({ format = "16:9", locale = "en", font } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const margin = 16;
	const options = {
		lines: SNIPPET.map(tint),
		x: margin,
		width: W - 2 * margin,
		// The caller's monospace face, when it has one; the kit's own stack otherwise.
		...(font ? { font } : {}),
		// A phone column cannot hold the longest line at a legible size: wrap it, the one place a rule is needed.
		overflow: /** @type {"wrap" | "error"} */ (W < 400 ? "wrap" : "error"),
	};
	// The panel hugs its code. A format with a fixed height centres it; the strip and phone column take its height.
	const probe = codeBlock({ ...options, y: margin, ...(f.height ? { maxHeight: f.height - 2 * margin } : {}) });
	const H = f.height || Math.ceil(probe.height + 2 * margin);
	const block = codeBlock({ ...options, y: margin + Math.max(0, (H - 2 * margin - probe.height) / 2), maxHeight: H - 2 * margin });

	const ends = MOVES.map((_, i) => codeEnd(block, MOVES.slice(0, i + 1)));
	const detail = RANGES.map(([a, b], i) => `${localize(COPY.lines, locale)} ${a}–${b}: ${localize(COPY.steps[i].detail, locale)} ${block.rangeText(a, b).split("\n").map((s) => s.trim()).join(" ")}`);

	return {
		id: `code-steps-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: ends[ends.length - 1] + SETTLE + 0.25,
		title: localize(COPY.title, locale),
		description: `${localize(COPY.intro, locale)}\n${block.text}`,
		// Steps are beats of the story: their labels live in the player's controls, not in the drawing.
		stepLabelsInFrame: false,
		contrastPairs: codePairs(block),
		steps: ends.map((end, i) => ({ at: end + SETTLE, label: localize(COPY.steps[i].label, locale), detail: detail[i] })),
		frame(t, { style }) {
			const { easeStandard, easeOut } = easings(style?.motion);
			return fade(progress(t, 0, ENTER, easeOut), {}, drawCode(block, t, MOVES, { ease: easeStandard }));
		},
	};
}
