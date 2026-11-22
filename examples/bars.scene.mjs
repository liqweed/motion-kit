/**
 * Example custom scene: three rows of a small benchmark, revealed top to bottom,
 * one step each.
 *
 * Shows the bar parts (runtime/bars.mjs): an empty track filled with diagonal
 * hatching, a rounded bar that grows over it on the style's movement curve, and
 * a number beside it that rolls up with the bar and shows exactly its end value
 * once the bar has settled. The hatch's id is built from the frame's `idPrefix`,
 * so two instances on a page never share one. Each bar grows once, inside its
 * step's beat, and is settled (`barEnd`) before the step's time, so every step
 * frame is settled. Nothing loops: the scene plays once and holds its last frame.
 * Pure: frame(t) depends only on t and constants.
 */
import { barEnd, barProgress, drawBar, drawTrack, drawValue, hatchPattern } from "../runtime/bars.mjs";
import { easings, progress } from "../runtime/motion.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { sharedPairs, tok } from "../runtime/style.mjs";
import { fade, text } from "../runtime/svg.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "Build time, three ways", nl: "Bouwtijd, op drie manieren" },
	description: {
		en: "Three bars over hatched tracks show how long a build takes: cached, incremental and clean. Each bar grows while its time counts up.",
		nl: "Drie balken over gearceerde banen tonen hoe lang een build duurt: uit cache, incrementeel en schoon. Elke balk groeit terwijl de tijd oploopt.",
	},
	unit: { en: "s", nl: "s" },
	rows: [
		{ label: { en: "Cached", nl: "Uit cache" }, value: 0.8, detail: { en: "Nothing changed, so the build is read back.", nl: "Er is niets veranderd, dus de build wordt teruggelezen." } },
		{ label: { en: "Incremental", nl: "Incrementeel" }, value: 2.4, detail: { en: "Only what changed is built again.", nl: "Alleen wat veranderd is wordt opnieuw gebouwd." } },
		{ label: { en: "Clean", nl: "Schoon" }, value: 6.5, detail: { en: "Everything is built from scratch.", nl: "Alles wordt vanaf nul gebouwd." } },
	],
};

// Timeline, in seconds. Row i starts at START + i·PERIOD: its track fades in,
// then its bar grows while the value rolls, and the step comes 100 ms after the
// bar has settled. The next row starts well after that.
const START = 0.2;
const PERIOD = 1.4;
const ENTER = 0.4;
const GROW = { delay: 0.25, duration: 0.7 };
const SETTLE = 0.1;
const SCALE = 8; // the track's full length is this many seconds
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** @param {number} i */
const rowStart = (i) => START + i * PERIOD;
/** @param {number} i */
const growRun = (i) => ({ start: rowStart(i) + GROW.delay, duration: GROW.duration });

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const fs = 17;
	const barH = 26;
	const gap = 8; // between a row's label and its track
	const rowGap = 26;
	const pad = 32;
	const valueW = 92;
	const rowH = fs * 1.25 + gap + barH;
	const total = COPY.rows.length * rowH + (COPY.rows.length - 1) * rowGap;
	const H = f.height || Math.round(total + 2 * pad);
	const top = (H - total) / 2;
	const trackX = pad;
	const trackW = W - 2 * pad - valueW - 12;
	const valueX = W - pad;
	const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const format1 = (/** @type {number} */ v) => `${number.format(v)} ${localize(COPY.unit, locale)}`;
	const labels = COPY.rows.map((r) => wrapLabel(localize(r.label, locale), Math.floor((W - 2 * pad) / (fs * 0.56)), 1));

	/** @param {number} t @param {{ idPrefix: string, style?: any }} ctx */
	function frame(t, { idPrefix, style }) {
		const hatch = hatchPattern({ idPrefix, stroke: "line" });
		const { easeOut } = easings(style?.motion);
		const out = [hatch.markup];
		COPY.rows.forEach((row, i) => {
			const enter = progress(t, rowStart(i), ENTER, easeOut);
			if (enter <= 0) return;
			const y = top + i * (rowH + rowGap);
			const ty = y + fs * 1.25 + gap;
			const p = barProgress(t, growRun(i), style);
			out.push(
				fade(enter, {}, text({ x: pad, y: y + (fs * 1.25) / 2, "dominant-baseline": "central", "font-size": fs, "font-weight": 600, fill: tok("ink") }, labels[i])),
				drawTrack({ x: trackX, y: ty, width: trackW, height: barH, hatch, opacity: enter, id: `row-${i}` }),
				drawBar({ x: trackX, y: ty, width: trackW * (row.value / SCALE), height: barH, p, id: `row-${i}` }),
				drawValue({ x: valueX, y: ty + barH / 2, to: row.value, p, format: format1, fontSize: 20, anchor: "end", family: MONO, opacity: enter, id: `row-${i}` }),
			);
		});
		return out.join("");
	}

	const steps = COPY.rows.map((row, i) => ({
		at: barEnd(growRun(i)) + SETTLE,
		label: localize(row.label, locale),
		detail: `${localize(row.detail, locale)} ${format1(row.value)}`,
	}));

	return {
		id: `bars-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: steps[steps.length - 1].at + 0.4,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		// The pairs this scene draws: the labels and values on the canvas, and the
		// bar's accent fill on its track.
		contrastPairs: [...sharedPairs("ink/bg"), { fg: "accent", bg: "surface", min: 3, use: "the bar's fill on its track" }, { fg: "line", bg: "surface", min: 2.5, use: "the hatching on the track: texture that marks the empty track, not data" }],
		steps,
		frame,
	};
}
