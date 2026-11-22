// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · advice: the rules that are the library's taste, not the law.
 *
 * A *hard* rule protects correctness, a build or accessibility (WCAG AA): a
 * scene that breaks one fails the gate, and nothing acknowledges it away. An
 * *advisory* rule is canon: a house preference with a reason and a time when
 * breaking it is fine. The gate still runs it, and says what it found, why the
 * rule exists, when breaking it is fine and what to do instead. A scene that
 * breaks one on purpose acknowledges it, naming the rule and giving a reason:
 *
 *   acknowledge: [{ rule: "duration", reason: "Narration sets the pace: 16 s of voice-over." }]
 *
 * The check then reports it as acknowledged, with the reason, and the export
 * manifest records it. Unacknowledged advice fails only in strict mode
 * (`--strict`, or MOTION_KIT_STRICT=1); the spec's §11.1 records the decision.
 *
 * Dependency-free data and string helpers: this runs in the browser and Node.
 */

/**
 * @typedef {{ rule: string, reason: string }} Acknowledgement
 * One piece of advice a scene earned. `found` carries the numbers; the rest
 * is the rule's own text.
 * @typedef {{ rule: string, found: string, why: string, whenFine: string, alternative: string }} Advice
 * @typedef {Advice & { acknowledged: boolean, reason?: string }} AdviceReport
 */

/**
 * The advisory rules the gate checks, by id. Each says why it exists, when
 * breaking it is fine and what to do instead.
 */
export const ADVICE_RULES = Object.freeze({
	duration: Object.freeze({
		title: "Scene longer than 12 s",
		why: "A diagram is opened to be watched once. Past about 12 s the viewer waits for the picture instead of reading it (the motion canon: aim for 8 s, hold the rest).",
		whenFine: "The pace is set by something else: a narrated visual cued to a voice-over, a talk track, or a slow reveal the audience asked for.",
		alternative: "Split the scene at a settled step into scenes of 8 s or less and sequence them in the video tool, or put the waiting into step holds, which cost no motion.",
	}),
	"nothing-animates": Object.freeze({
		title: "First and last frame are identical",
		why: "The player has nothing to build up, and every step button shows the same picture.",
		whenFine: "A still mark (a logo, an icon) that is shown as one frame; or an ambient display whose page drives the loop itself, where first = last by design.",
		alternative: "Give the scene a build-up that matches what the picture means (draw-on, reveal), or export the still frame and skip the scene.",
	}),
	"step-labels-in-frame": Object.freeze({
		title: "Step label not drawn in the final frame",
		why: "Step buttons, slide titles and captions point at things the viewer can see in the finished picture; a label that is not drawn names nothing.",
		whenFine: "Narrative steps: the label is a caption or a sentence about what happens, not a word the diagram shows (the state-machine and request-journey walks).",
		alternative: "Draw the label in the frame, or shorten the step label to the word the diagram shows. For narrative steps, set `stepLabelsInFrame: false`.",
	}),
	"emphasis-on-accent": Object.freeze({
		title: "Emphasis colour too close to the accent",
		why: "The 'you are here' ring or dot sits on the reached (accent) colour. Below 3:1 it is hard to tell from the node it marks. The shape already differs from the node, so WCAG 1.4.1 is met; 3:1 is the library's own bar.",
		whenFine: "The style's accent is deliberately close to its emphasis colour and the ring or dot is told apart by its shape and size.",
		alternative: "In the style, darken the light accent or lighten the dark emphasis until the pair reaches 3:1.",
	}),
});

/** @param {string} rule */
export const isAdviceRule = (rule) => Object.hasOwn(ADVICE_RULES, rule);

/**
 * A piece of advice: the rule's text and what was found.
 * @param {string} rule an id of ADVICE_RULES
 * @param {string} found the value, and where
 * @returns {Advice}
 */
export function advice(rule, found) {
	if (!isAdviceRule(rule)) throw new Error(`unknown advice rule "${rule}"`);
	const { why, whenFine, alternative } = ADVICE_RULES[/** @type {keyof typeof ADVICE_RULES} */ (rule)];
	return { rule, found, why, whenFine, alternative };
}

/** Longest reason a scene may give: a line for a reviewer, not an essay. */
export const REASON_MAX = 240;

/**
 * Throw unless a scene's `acknowledge` is a list of { rule, reason } naming
 * advisory rules, each once, each with a one-line reason. A hard rule is no
 * advisory rule, so it cannot be named.
 * @param {string} sceneId for the message
 * @param {unknown} acknowledge
 */
export function validateAcknowledgements(sceneId, acknowledge) {
	if (acknowledge === undefined) return;
	const where = `scene ${sceneId}: acknowledge`;
	if (!Array.isArray(acknowledge)) throw new Error(`${where} must be a list of { rule, reason }`);
	const seen = new Set();
	for (const [i, a] of acknowledge.entries()) {
		if (!a || typeof a !== "object" || Array.isArray(a)) throw new Error(`${where}: entry ${i} must be { rule, reason }`);
		const { rule, reason } = /** @type {Record<string, unknown>} */ (a);
		if (typeof rule !== "string" || !isAdviceRule(rule)) {
			throw new Error(`${where}: ${JSON.stringify(rule)} is not an advice rule (known: ${Object.keys(ADVICE_RULES).join(", ")}); a hard rule (determinism, WCAG contrast of a drawn pair, settled steps, well-formed markup) cannot be acknowledged`);
		}
		if (typeof reason !== "string" || !reason.trim()) throw new Error(`${where}: "${rule}" needs a reason, one line saying why this scene breaks the rule`);
		if (/[\r\n]/.test(reason)) throw new Error(`${where}: the reason for "${rule}" must be one line`);
		if (reason.length > REASON_MAX) throw new Error(`${where}: the reason for "${rule}" is ${reason.length} characters; keep it to ${REASON_MAX}`);
		if (seen.has(rule)) throw new Error(`${where}: "${rule}" is acknowledged twice`);
		seen.add(rule);
	}
}

/**
 * Match the advice a scene earned against what it acknowledged.
 * @param {readonly Advice[]} items
 * @param {readonly Acknowledgement[] | undefined} acknowledge validated
 * @returns {{ advice: AdviceReport[], unused: string[] }} `unused`: acknowledged rules nothing broke
 */
export function applyAcknowledgements(items, acknowledge) {
	const reasons = new Map((acknowledge ?? []).map((a) => [a.rule, a.reason.trim()]));
	const report = items.map((item) => {
		const reason = reasons.get(item.rule);
		return reason === undefined ? { ...item, acknowledged: false } : { ...item, acknowledged: true, reason };
	});
	const hit = new Set(items.map((i) => i.rule));
	return { advice: report, unused: [...reasons.keys()].filter((r) => !hit.has(r)) };
}

/**
 * The lines that say one piece of advice, for a terminal.
 * @param {AdviceReport} a
 * @returns {string[]}
 */
export function adviceLines(a) {
	if (a.acknowledged) return [`acknowledged [${a.rule}]: ${a.reason}`];
	return [
		`advice [${a.rule}]: ${a.found}`,
		`  why: ${a.why}`,
		`  fine when: ${a.whenFine}`,
		`  instead: ${a.alternative}`,
		`  to break it on purpose: acknowledge: [{ rule: "${a.rule}", reason: "…" }]`,
	];
}
