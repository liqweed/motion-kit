/**
 * motion-kit · time helpers.
 *
 * A scene is a pure function of time. Everything in this module maps numbers to
 * numbers with no state, so any frame can be computed without its predecessors.
 * None of the curves overshoot: no bounce, no elastic.
 */

/** Longest single entrance, in seconds. A whole scene may be longer. */
export const ENTRANCE_MAX = 0.6;

export function clamp01(x) {
	return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

export function lerp(from, to, p) {
	return from + (to - from) * p;
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of linear progress 0..1.
 * Solves x(s) = p for the curve parameter s (Newton, then bisection), returns y(s).
 */
export function cubicBezier(x1, y1, x2, y2) {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const x = (s) => ((ax * s + bx) * s + cx) * s;
	const y = (s) => ((ay * s + by) * s + cy) * s;
	const dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
	return (p) => {
		if (p <= 0) return 0;
		if (p >= 1) return 1;
		let s = p;
		for (let i = 0; i < 8; i++) {
			const err = x(s) - p;
			if (Math.abs(err) < 1e-7) return y(s);
			const d = dx(s);
			if (Math.abs(d) < 1e-7) break;
			s -= err / d;
		}
		let lo = 0;
		let hi = 1;
		s = p;
		for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
			if (x(s) < p) lo = s;
			else hi = s;
			s = (lo + hi) / 2;
		}
		return y(s);
	};
}

export const linear = (p) => clamp01(p);
/** Entrances: fast start, gentle landing. */
export const easeOut = cubicBezier(0, 0, 0.2, 1);
/** Movement between two visible states. */
export const easeStandard = cubicBezier(0.4, 0, 0.2, 1);
/** Exits. */
export const easeIn = cubicBezier(0.4, 0, 1, 1);

/**
 * Eased progress 0..1 of an event that starts at `start` and lasts `duration`
 * seconds. Holds 0 before, 1 after.
 */
export function progress(t, start, duration, ease = easeOut) {
	if (duration <= 0) return t >= start ? 1 : 0;
	return ease(clamp01((t - start) / duration));
}

/** Linear 0..1 progress between two times (no easing). */
export function window01(t, start, end) {
	return end <= start ? (t >= start ? 1 : 0) : clamp01((t - start) / (end - start));
}

/* ------------------------------------------------------------------ springs */

/**
 * ωτ at which a critically damped step response is within 0.1 % of its target.
 * Solves (1 + x)·e^(−x) = 0.001, so the final snap moves a 100 px travel by
 * at most 0.1 px.
 */
export const SPRING_SETTLE_X = 9.24;

/**
 * Unit step response of a critically damped spring, closed form:
 *   s(τ) = 1 − (1 + ωτ)·e^(−ωτ)     for τ > 0, else 0.
 * Monotonic, never overshoots. Snaps to exactly 1 once ωτ ≥ SPRING_SETTLE_X so
 * that "settled" frames are byte-identical.
 *
 * @param {number} tau seconds since the target changed
 * @param {number} omega natural angular frequency (rad/s); higher = snappier
 */
export function springStep(tau, omega = 12) {
	if (tau <= 0) return 0;
	const x = omega * tau;
	if (x >= SPRING_SETTLE_X) return 1;
	return 1 - (1 + x) * Math.exp(-x);
}

/** Seconds until a spring with this ω counts as settled. */
export function springSettleTime(omega = 12) {
	return SPRING_SETTLE_X / omega;
}

/**
 * Retargetable spring value at time t, by superposition. The spring is a linear
 * time-invariant system, so the response to a piecewise-constant target is the
 * exact sum of step responses. No frame depends on the previous one.
 *
 *   value(t) = from + Σ (to_i − to_{i−1}) · s(t − at_i)
 *
 * @param {number} t
 * @param {number} from initial value
 * @param {{at:number,to:number}[]} changes target changes in time order
 * @param {number} omega
 */
export function springTo(t, from, changes, omega = 12) {
	let value = from;
	let prev = from;
	for (const c of changes) {
		value += (c.to - prev) * springStep(t - c.at, omega);
		prev = c.to;
	}
	return value;
}

/**
 * Split-edge motion for a moving shape: the leading edge moves first, the
 * trailing edge follows `lag` seconds later with the same curve. The shape
 * stretches during the move and settles to its original length, without
 * overshoot.
 *
 * @returns {{lead:number, trail:number}} two eased progress values 0..1
 */
export function splitEdge(t, start, duration, lag = 0.07, ease = easeStandard) {
	return {
		lead: progress(t, start, duration, ease),
		trail: progress(t, start + lag, duration, ease),
	};
}

/**
 * Staggered start times for `count` siblings in reading order.
 * @returns {number[]}
 */
export function stagger(count, start, gap) {
	return Array.from({ length: count }, (_, i) => start + i * gap);
}
