// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
import { mountPlayer } from "../../../runtime/player.mjs";
import { previewSpec, restoreSpec, shareSpec } from "./playground-data.mjs";
import { initPage, themeOpt } from "./site.mjs";

initPage();
const source = /** @type {HTMLTextAreaElement} */ (document.getElementById("spec-source"));
const format = /** @type {HTMLSelectElement} */ (document.getElementById("spec-format"));
const locale = /** @type {HTMLInputElement} */ (document.getElementById("spec-locale"));
const preview = /** @type {HTMLElement} */ (document.getElementById("spec-preview"));
const error = /** @type {HTMLElement} */ (document.getElementById("spec-error"));
const status = /** @type {HTMLElement} */ (document.getElementById("spec-status"));
const link = /** @type {HTMLAnchorElement} */ (document.getElementById("spec-link"));
/** @type {ReturnType<typeof mountPlayer> | undefined} */
let controller;
function report(e) {
	error.textContent = e instanceof Error ? e.message : String(e);
	error.hidden = false;
	status.textContent = "Scene was not rendered.";
	controller?.destroy();
	controller = undefined;
	preview.replaceChildren();
	link.hidden = true;
}
function render() {
	try {
		const scene = previewSpec(source.value, { format: format.value, locale: locale.value });
		controller?.destroy();
		controller = mountPlayer(preview, scene, { autoplay: "none", scrubber: true, locale: locale.value, theme: themeOpt() });
		error.hidden = true;
		status.textContent = `Gate passed · ${scene.steps.length} steps · ${scene.duration.toFixed(2)} s. Press Play to animate.`;
		link.hidden = true;
	} catch (e) { report(e); }
}
function restore() {
	try {
		const saved = restoreSpec(location.hash);
		if (saved) { source.value = saved.source; format.value = saved.format; locale.value = saved.locale; }
		render();
	} catch (e) { report(e); }
}
document.getElementById("playground-form")?.addEventListener("submit", (e) => { e.preventDefault(); render(); });
document.getElementById("spec-share")?.addEventListener("click", async () => {
	try {
		const hash = shareSpec(source.value, format.value, locale.value);
		history.replaceState(null, "", hash);
		link.href = location.href;
		link.hidden = false;
		try {
			await navigator.clipboard.writeText(link.href);
			status.textContent = "Share link copied. The spec is stored in the URL.";
		} catch (e) {
			console.warn("Could not copy the share link", e);
			status.textContent = "Automatic copying failed. Copy the address or use Open shared scene.";
		}
	} catch (e) { report(e); }
});
window.addEventListener("hashchange", restore);
window.addEventListener("pagehide", () => controller?.destroy());
restore();
