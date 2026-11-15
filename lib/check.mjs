/**
 * motion-kit · scene gate. Every scene, every format/locale it ships in, must
 * pass these before anything is exported or mounted.
 *
 *   checkScene(scene) → { ok, problems: string[] }
 */
import { renderSvg } from "../runtime/scene.mjs";

const SAMPLES = 120;

/** Minimal well-formedness check: balanced tags, no raw "<" in text, entities ok. */
export function wellFormed(svg) {
	const stack = [];
	const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|#39|#\d+);)/g;
	let m;
	let last = 0;
	while ((m = re.exec(svg))) {
		if (m[0] === "<") return `stray "<" at ${m.index}`;
		if (m[0].startsWith("&")) return `bare "&" at ${m.index}`;
		last = re.lastIndex;
		const [, close, tag, , self] = m;
		if (self) continue;
		if (close) {
			const open = stack.pop();
			if (open !== tag) return `</${tag}> closes <${open}>`;
		} else stack.push(tag);
	}
	if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
	if (last === 0) return "no markup";
	return null;
}

export function checkScene(scene, { samples = SAMPLES } = {}) {
	const problems = [];
	const render = (t) => renderSvg(scene, t);
	const at = (i) => (scene.duration * i) / samples;

	// 1. Deterministic + well-formed + rounded + token-only, across the timeline.
	for (let i = 0; i <= samples; i++) {
		const t = at(i);
		const a = render(t);
		if (a !== render(t)) problems.push(`not deterministic at t=${t.toFixed(3)}`);
		const wf = wellFormed(a);
		if (wf) problems.push(`malformed at t=${t.toFixed(3)}: ${wf}`);
		const long = a.match(/-?\d+\.\d{5,}/);
		if (long) problems.push(`unrounded number ${long[0]} at t=${t.toFixed(3)} (use num())`);
		const frame = scene.frame(Math.min(t, scene.duration));
		const lit = frame.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
		if (lit) problems.push(`colour literal "${lit[0]}" at t=${t.toFixed(3)} (use tok())`);
		if (/NaN|undefined|Infinity/.test(frame)) problems.push(`NaN/undefined/Infinity in frame at t=${t.toFixed(3)}`);
		if (problems.length > 12) break;
	}

	// 2. Settled steps: nothing moves at a step's time.
	for (const s of scene.steps) {
		const before = render(Math.max(0, s.at - 0.001));
		if (before !== render(s.at)) problems.push(`step "${s.label}" at ${s.at.toFixed(3)}s is not settled (something is still moving)`);
	}

	// 3. Builds up and finishes.
	const first = render(0);
	const lastFrame = render(scene.duration);
	if (first === lastFrame) problems.push("first and last frame are identical: nothing animates");
	if (scene.steps[scene.steps.length - 1].at > scene.duration) problems.push("last step is after duration");
	if (render(scene.duration + 5) !== lastFrame) problems.push("frames after the end differ from the final frame (must hold)");

	// 4. Budget: whole scene under ~10 s (design guidance: ≤ 8 s for explainers).
	if (scene.duration > 12) problems.push(`duration ${scene.duration.toFixed(1)}s is long for an explainer (≤ 8–10 s)`);

	// 5. Every step label is visible in the final frame (escaped form), unless
	//    the scene declares narrative steps (stepLabelsInFrame: false).
	const escd = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	const plain = lastFrame.replace(/<\/tspan><tspan[^>]*>/g, " ").replace(/<[^>]+>/g, "\u0000");
	for (const s of scene.stepLabelsInFrame === false ? [] : scene.steps) {
		const words = escd(s.label).split(/\s+/);
		if (!words.every((w) => plain.includes(w.replace(/\/$/, "")))) problems.push(`step label "${s.label}" not found in the final frame`);
	}

	// 6. No forbidden sources of time/randomness in the frame function.
	const src = scene.frame.toString();
	if (/Date\.now|new Date|Math\.random|performance\.now/.test(src)) problems.push("frame() reads the clock or randomness");

	return { ok: problems.length === 0, problems };
}
