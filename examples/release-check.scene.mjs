/**
 * Example custom scene: three release checks come back, one after the other,
 * as an ok, a caution and an alert.
 *
 * Shows the style's semantic accents beyond `accent` and `emphasis`: `caution`
 * (a shared concern, a regression) and `alert` (a failure), each with the
 * on-colour for text that sits on it, and the style's monospace face
 * (`style.mono`) for the metrics. A scene reaches both through the style, never
 * with a colour or a font family of its own. It says which pairs it draws
 * (`contrastPairs`), caution and alert included, and the gate holds the style to
 * exactly those. Each check settles once and nothing loops. Pure: frame(t)
 * depends only on t, the style and constants.
 */
import { easeOut, easeStandard, progress } from "../runtime/motion.mjs";
import { FORMATS, localize } from "../runtime/scene.mjs";
import { normalizeStyle, sharedPairs, tok } from "../runtime/style.mjs";
import { el, fade, text } from "../runtime/svg.mjs";
import { wrapLabel } from "../runtime/wrap.mjs";

export const locales = ["en", "nl"];

const COPY = {
	title: { en: "Three release checks come back", nl: "Drie releasecontroles komen terug" },
	description: {
		en: "The build passes, the latency check raises a caution and the error-rate check raises an alert.",
		nl: "De build slaagt, de latentiecontrole geeft een waarschuwing en de foutcontrole slaat alarm.",
	},
	pending: "--",
	checks: [
		{ tone: "accent", label: { en: "Build", nl: "Bouwen" }, status: { en: "OK", nl: "OK" }, value: "3m 12s" },
		{ tone: "caution", label: { en: "Latency", nl: "Latentie" }, status: { en: "WARN", nl: "LET OP" }, value: "p95 212 ms" },
		{ tone: "alert", label: { en: "Error rate", nl: "Foutpercentage" }, status: { en: "FAIL", nl: "FOUT" }, value: "5xx 4.1 %" },
	],
	steps: [
		{ label: { en: "Build passes", nl: "Build slaagt" }, detail: { en: "The first check is ok.", nl: "De eerste controle is in orde." } },
		{ label: { en: "Latency regresses", nl: "Latentie loopt op" }, detail: { en: "The second check raises a caution.", nl: "De tweede controle geeft een waarschuwing." } },
		{ label: { en: "Errors spike", nl: "Fouten pieken" }, detail: { en: "The third check raises an alert.", nl: "De derde controle slaat alarm." } },
	],
};

/** Which token fills a check's badge and stripe, and which draws the text on the badge. */
const TONES = {
	accent: { fill: "accent", on: "onAccent" },
	caution: { fill: "caution", on: "onCaution" },
	alert: { fill: "alert", on: "onAlert" },
};

// Timeline, in seconds. A check has settled before the step that names it, and
// the next one starts only after that step.
const ENTER = 0.4;
const STAGGER = 0.12;
const FILL = 0.3;
const BEAT = 0.9;
const FIRST = ENTER + 2 * STAGGER + 0.2;
const activeAt = (/** @type {number} */ i) => FIRST + i * BEAT;
const stepAt = (/** @type {number} */ i) => activeAt(i) + FILL + 0.1;
const DURATION = stepAt(2) + 0.4;

const ROW_H = 72;
const GAP = 16;
const PAD = 12;
const BADGE_W = 76;
const BADGE_H = 30;
const FS = 17;
const MONO_FS = 15;
const MONO_CHAR = 0.62; // average glyph width / font size, for the monospace stacks

export default function make({ format = "16:9", locale = "en" } = {}) {
	const f = FORMATS[format];
	if (!f) throw new Error(`unknown format "${format}"`);
	const W = f.width;
	const n = COPY.checks.length;
	const stack = n * ROW_H + (n - 1) * GAP;
	const H = f.height || stack + 2 * 36;
	const rowW = Math.min(W - 72, 560);
	const x0 = (W - rowW) / 2;
	const y0 = (H - stack) / 2;
	const textX = x0 + PAD + BADGE_W + 14;
	const textBudget = Math.floor((rowW - (textX - x0) - PAD) / (FS * 0.56));
	const monoBudget = Math.floor((rowW - (textX - x0) - PAD) / (MONO_FS * MONO_CHAR));
	const rows = COPY.checks.map((c, i) => {
		const label = wrapLabel(localize(c.label, locale), textBudget, 1);
		const status = localize(c.status, locale);
		if (c.value.length > monoBudget) throw new Error(`value "${c.value}" needs ${c.value.length} characters; the layout allows ${monoBudget}`);
		if (status.length * MONO_FS * MONO_CHAR > BADGE_W - 8) throw new Error(`status "${status}" does not fit its badge`);
		return { ...c, label, status, y: y0 + i * (ROW_H + GAP) };
	});

	// Steps are events: their labels live in the player's buttons and captions.
	const steps = COPY.steps.map((s, i) => ({ at: stepAt(i), label: localize(s.label, locale), detail: localize(s.detail, locale) }));

	/**
	 * @param {number} t
	 * @param {{ style?: any }} [ctx]
	 */
	function frame(t, ctx) {
		const style = normalizeStyle(ctx?.style);
		const mono = { "font-family": style.mono, "font-size": MONO_FS };
		const out = [];
		rows.forEach((r, i) => {
			const enter = progress(t, i * STAGGER, ENTER, easeOut);
			const on = progress(t, activeAt(i), FILL, easeStandard);
			const tone = TONES[r.tone];
			const cy = r.y + ROW_H / 2;
			const bx = x0 + PAD;
			const by = cy - BADGE_H / 2;
			out.push(
				fade(
					enter,
					{},
					// The status stripe on the canvas, then the card.
					fade(on, {}, el("rect", { x: x0 - 10, y: r.y, width: 4, height: ROW_H, rx: 2, fill: tok(tone.fill) })),
					el("rect", { x: x0, y: r.y, width: rowW, height: ROW_H, rx: style.radius, fill: tok("surface"), stroke: tok("line"), "stroke-width": style.stroke }),
					text({ x: textX, y: r.y + 26, "dominant-baseline": "central", "font-size": FS, "font-weight": 600, fill: tok("ink") }, r.label),
					// The badge: pending until its check comes back, then filled.
					fade(
						1 - on,
						{},
						el("rect", { x: bx, y: by, width: BADGE_W, height: BADGE_H, rx: 6, fill: "none", stroke: tok("line"), "stroke-width": 1.5 }),
						text({ ...mono, x: bx + BADGE_W / 2, y: cy, "text-anchor": "middle", "dominant-baseline": "central", fill: tok("muted") }, COPY.pending),
					),
					fade(
						on,
						{},
						el("rect", { x: bx, y: by, width: BADGE_W, height: BADGE_H, rx: 6, fill: tok(tone.fill) }),
						text({ ...mono, x: bx + BADGE_W / 2, y: cy, "text-anchor": "middle", "dominant-baseline": "central", "font-weight": 700, fill: tok(tone.on) }, r.status),
						text({ ...mono, x: textX, y: r.y + 51, "dominant-baseline": "central", fill: tok("ink") }, r.value),
					),
				),
			);
		});
		return out.join("");
	}

	return {
		id: `release-check-${format.replace(":", "x")}`,
		width: W,
		height: H,
		duration: DURATION,
		title: localize(COPY.title, locale),
		description: localize(COPY.description, locale),
		stepLabelsInFrame: false,
		// What the scene draws: the labels and values on the cards, the badge
		// text on each fill, the card outlines, and the stripe of each tone on
		// the canvas. The gate holds the style to these, caution and alert
		// included, and only warns about the shared pairs left out.
		contrastPairs: [
			...sharedPairs("ink/surface", "muted/surface", "onAccent/accent", "onCaution/caution", "onAlert/alert", "line/bg", "accent/bg", "caution/bg", "alert/bg"),
		],
		steps,
		frame,
	};
}
