// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/** The site's styles as runtime style objects. DOM-free: the build and the browser share it. */
import { normalizeStyle } from "../../../runtime/style.mjs";
import { STYLES } from "./catalog.mjs";

/** A site style as a runtime style object. @param {string} name */
export function styleFor(name) {
	const s = STYLES[name] ?? STYLES.studio;
	return normalizeStyle({ name: s.name, font: s.fontStack, motion: s.motion, light: s.light, dark: s.dark });
}
