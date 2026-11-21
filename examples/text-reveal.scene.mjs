/**
 * Example custom scene: text that sharpens into place, and a highlighter.
 *
 * Shows the two text helpers of `kit` (runtime/svg.mjs): `blurReveal`, which
 * fades a line in while it rises a few units and a blur goes to zero, and
 * `highlightSweep`, a token-coloured band that grows behind a line. Three
 * labels reveal in reading order, then a quoted line reveals and is marked,
 * one band per wrapped line, swept from the first line to the last. Each
 * reveal is one beat on the style's entrance curve and ends before its step,
 * so a step frame carries no filter at all. Nothing loops. Pure: frame(t)
 * depends only on t and constants.
 */
import { easings, progress } from "../runtime/motion.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { tok } from "../runtime/style.mjs";
import { blurReveal, el, highlightSweep, text } from "../runtime/svg.mjs";
import { estimateWidth, wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "Release notes, line by line", nl: "Releasenotes, regel voor regel" },
	description: {
		en: "Three labels sharpen into place one after another, then a quoted line appears and a highlighter sweeps behind it.",
		nl: "Drie labels worden één voor één scherp, daarna verschijnt een geciteerde regel en veegt een markeerstift erachter.",
	},
	heading: { en: "What's new", nl: "Wat is nieuw" },
	labels: [
		{ en: "Faster startup", nl: "Snellere start" },
		{ en: "Smaller bundles", nl: "Kleinere bundels" },
		{ en: "Clearer errors", nl: "Duidelijkere fouten" },
	],
	quote: {
		en: "Each change lands once, then it holds.",
		nl: "Elke wijziging landt één keer en blijft dan staan.",
	},
	steps: [
		{ label: { en: "Labels revealed", nl: "Labels onthuld" }, detail: { en: "Three labels sharpen into place, one after another.", nl: "Drie labels worden één voor één scherp." } },
		{ label: { en: "Quote highlighted", nl: "Citaat gemarkeerd" }, detail: { en: "A band sweeps behind the quoted line.", nl: "Een band veegt achter de geciteerde regel." } },
	],
};

const ENTER = 0.4; // one reveal (the entrance budget is 0.3–0.6 s)
const GAP = 0.12; // siblings, in reading order (80–150 ms)
const PAUSE = 0.05; // between a beat and its step
const QUOTE_AT = 1.3;
const SWEEP_AT = QUOTE_AT + 0.2;
const SWEEP = 0.6;

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	// Sizes follow the width, never below a readable 14.
	const u = W >= 900 ? 1 : W >= 700 ? 0.85 : W >= 500 ? 0.7 : 0.55;
	const fsHead = Math.max(14, Math.round(18 * u));
	const fsLabel = Math.max(16, Math.round(36 * u));
	const fsQuote = Math.max(14, Math.round(26 * u));
	const x0 = Math.round(W * 0.1);
	const pad = Math.round(fsQuote * 0.4); // the band's padding either side of the text
	const chars = (/** @type {number} */ fs, /** @type {number} */ room) => Math.floor(room / (fs * 0.56));
	const heading = localize(COPY.heading, locale);
	const labels = COPY.labels.map((l) => wrapLabel(localize(l, locale), chars(fsLabel, W - 2 * x0), 1));
	const quote = wrapLabel(localize(COPY.quote, locale), chars(fsQuote, W - 2 * x0 - 2 * pad), 3);

	// Vertical layout, top to bottom, centred in the picture.
	const rowLabel = Math.round(fsLabel * 1.5);
	const rowQuote = Math.round(fsQuote * 1.6);
	const headRow = Math.round(fsHead * 2.2);
	const block = headRow + labels.length * rowLabel + Math.round(fsQuote * 1.4) + quote.length * rowQuote;
	const H = f.height || block + 2 * Math.round(W * 0.1);
	const top = Math.round((H - block) / 2);
	const yHead = top + fsHead / 2;
	const yLabel = (/** @type {number} */ i) => top + headRow + i * rowLabel + rowLabel / 2;
	const quoteTop = top + headRow + labels.length * rowLabel + Math.round(fsQuote * 1.4);
	const yQuote = (/** @type {number} */ i) => quoteTop + i * rowQuote + rowQuote / 2;

	// Reveal times: the heading, then the labels in reading order.
	const labelAt = (/** @type {number} */ i) => (i + 1) * GAP;
	const labelsDone = labelAt(labels.length - 1) + ENTER;
	const sweepDone = SWEEP_AT + SWEEP;
	const steps = [
		{ at: labelsDone + PAUSE, ...COPY.steps[0] },
		{ at: Math.max(sweepDone, QUOTE_AT + ENTER) + PAUSE, ...COPY.steps[1] },
	];
	const duration = steps[1].at + 0.4;

	// One sweep over all the lines of the quote: line i fills while the sweep
	// is inside its share of the total width.
	// estimateWidth is a safe over-estimate; 0.9 of it hugs a typical sans-serif.
	const widths = quote.map((line) => estimateWidth(line, fsQuote) * 0.9 + 2 * pad);
	const total = widths.reduce((a, b) => a + b, 0);
	const before = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));

	/** @param {number} t @param {{ idPrefix: string, style?: any }} ctx */
	function frame(t, { idPrefix, style }) {
		const { easeOut } = easings(style?.motion);
		const id = (/** @type {string} */ name) => `${idPrefix}-reveal-${name}`;
		const out = [];
		out.push(
			blurReveal(
				progress(t, 0, ENTER, easeOut),
				{ id: id("heading") },
				text({ x: x0, y: yHead, "dominant-baseline": "central", "font-size": fsHead, "font-weight": 500, fill: tok("muted") }, heading),
			),
		);
		labels.forEach((lines, i) => {
			out.push(
				blurReveal(
					progress(t, labelAt(i), ENTER, easeOut),
					{ id: id(`label-${i}`) },
					text({ x: x0, y: yLabel(i), "dominant-baseline": "central", "font-size": fsLabel, "font-weight": 600, fill: tok("ink") }, lines),
				),
			);
		});
		// The bands first, so the quote sits on top of them.
		const swept = progress(t, SWEEP_AT, SWEEP, easeOut) * total;
		quote.forEach((_, i) => {
			out.push(
				highlightSweep((swept - before[i]) / widths[i], {
					x: x0 - pad,
					y: yQuote(i) - rowQuote / 2 + 3,
					width: widths[i],
					height: rowQuote - 6,
					radius: 6,
				}),
			);
		});
		out.push(
			blurReveal(
				progress(t, QUOTE_AT, ENTER, easeOut),
				{ id: id("quote") },
				quote.map((line, i) => text({ x: x0, y: yQuote(i), "dominant-baseline": "central", "font-size": fsQuote, "font-weight": 500, fill: tok("ink") }, line)),
			),
		);
		return out.join("");
	}

	return {
		id: `text-reveal-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// The steps are beats, not labels in the drawing: their text lives in the
		// player's step buttons and captions.
		stepLabelsInFrame: false,
		steps: steps.map((s) => ({ at: s.at, label: localize(s.label, locale), detail: localize(s.detail, locale) })),
		frame,
	};
}
