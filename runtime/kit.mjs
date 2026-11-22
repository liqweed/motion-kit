// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · custom scene modules.
 *
 * A custom scene module's default export is a factory, `(opts) => scene`, for
 * diagrams no scene type draws. It is called with
 *
 *   opts = { ...options, format, locale, kit }
 *
 * - `options`: the caller's serializable scene options, unchanged (text from a
 *   site's dictionary, a view to draw). Keys `format`, `locale` and `kit` are
 *   reserved.
 * - `format`, `locale`: what to build (see FORMATS).
 * - `kit`: the whole runtime in one flat namespace, so a scene kept in another
 *   repository needs no imports: `const { tok, el, num } = kit`.
 *
 * The CLI and the vendored gate (lib/load.mjs) and the Astro adapter, on the
 * server and in the browser, go through sceneFromModule, so one module, given
 * the same options, format and locale, draws the same scene everywhere. A page
 * from `motion-kit build` calls the factory the same way, with the bundled
 * runtime as `kit`, after the CLI built it here once.
 */
import { DEFAULT_MOTION, ENTRANCE_MAX, SPRING_SETTLE_X, clamp01, cubicBezier, easeIn, easeOut, easeStandard, easings, lerp, linear, progress, splitEdge, springSettleTime, springStep, springTo, stagger, window01 } from "./motion.mjs";
import { FORMATS, localize, renderSvg, safeId, stepIndex, stepIndexAt, stepTimes, validateScene, withId } from "./scene.mjs";
import { CONTRAST_EXEMPT, CONTRAST_PAIRS, NEUTRAL, OPTIONAL_TOKENS, TOKENS, checkContrast, contrast, contrastReport, cssVars, normalizeStyle, paintSource, resolveTokens, setsOptionalToken, sharedPairs, tok } from "./style.mjs";
import { CAMERA_ISOMETRIC, CAMERA_PLAN, ISO_ELEVATION, box, camera, drawSolid, drawSolids, fitCamera, labelAnchor, labelProblems, lerpCamera, orderSolids, path3, prism, project, projector, regularPolygon, slab } from "./iso.mjs";
import { attrString, cubic, dist, drawOn, el, esc, fade, num, pointOnLine, polyline, scaleAbout, text, tokenPoints, tokensAlong, translate, trimSegment } from "./svg.mjs";
import { PULSE_LAG, connectorPath, drawConnector, drawJunction, drawPulse, pulseEnd, pulseHead } from "./connectors.mjs";
import { estimateWidth, wrapLabel } from "./wrap.mjs";

/**
 * The runtime, flat, handed to custom scene modules as `opts.kit`: the exports
 * of motion, scene, style, svg, iso, connectors and wrap (not the scene types or the player).
 * Named imports, because lib/bundle.mjs inlines only that form; a new export
 * in one of those modules is added here (test/runtime.test.mjs checks).
 */
export const KIT = Object.freeze({
	...{ DEFAULT_MOTION, ENTRANCE_MAX, SPRING_SETTLE_X, clamp01, cubicBezier, easeIn, easeOut, easeStandard, easings, lerp, linear, progress, splitEdge, springSettleTime, springStep, springTo, stagger, window01 },
	...{ FORMATS, localize, renderSvg, safeId, stepIndex, stepIndexAt, stepTimes, validateScene, withId },
	...{ CONTRAST_EXEMPT, CONTRAST_PAIRS, NEUTRAL, OPTIONAL_TOKENS, TOKENS, checkContrast, contrast, contrastReport, cssVars, normalizeStyle, paintSource, resolveTokens, setsOptionalToken, sharedPairs, tok },
	...{ attrString, cubic, dist, drawOn, el, esc, fade, num, pointOnLine, polyline, scaleAbout, text, tokenPoints, tokensAlong, translate, trimSegment },
	...{ CAMERA_ISOMETRIC, CAMERA_PLAN, ISO_ELEVATION, box, camera, drawSolid, drawSolids, fitCamera, labelAnchor, labelProblems, lerpCamera, orderSolids, path3, prism, project, projector, regularPolygon, slab },
	...{ PULSE_LAG, connectorPath, drawConnector, drawJunction, drawPulse, pulseEnd, pulseHead },
	...{ estimateWidth, wrapLabel },
});

const RESERVED = ["format", "locale", "kit"];

/** @import { Scene } from "./scene.mjs" */

/**
 * Build and validate a scene from a module's default export.
 * @param {unknown} make the module's default export
 * @param {{ format?: string, locale?: string, options?: Record<string, unknown> | null }} [opts]
 * @returns {Scene}
 */
export function sceneFromModule(make, { format = "16:9", locale = "en", options } = {}) {
	if (typeof make !== "function") throw new TypeError("a scene module's default export must be (opts) => scene");
	if (options != null && (typeof options !== "object" || Array.isArray(options))) throw new TypeError("scene options must be a plain object");
	for (const key of RESERVED) {
		if (options && Object.hasOwn(options, key)) throw new Error(`scene options must not set "${key}": it is passed separately`);
	}
	return validateScene(make({ ...options, format, locale, kit: KIT }));
}
