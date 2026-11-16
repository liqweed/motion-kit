// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · docs page pattern: link the words to the steps, then make
 * the diagram explorable. Both demos use only the shipped player.
 */
import { createScene } from "../../../runtime/types/index.mjs";
import { stepIndexAt } from "../../../runtime/scene.mjs";
import { LIVE } from "./catalog.mjs";
import { $, initPage, prefersDark, failNote, fetchText, h, loadScene, mount, onStep, styleFor, themeOpt } from "./site.mjs";

initPage();
const phone = matchMedia("(max-width: 640px)").matches;
const fmt = phone ? "tall" : "wide";

/* -------------------------------------------------------- link the words */

(async () => {
	const stage = $("#demo-stage");
	try {
		const home = LIVE.find((e) => e.id === "smart-home");
		if (!home) return;
		const sc = await loadScene(home, { format: fmt });
		const { controller } = mount(stage, sc, { style: styleFor("studio"), theme: themeOpt(), autoplay: "none" });
		const term = (i, text) => {
			const b = h("button", { type: "button", class: "term-btn", "data-mk-step": String(i), "aria-pressed": "false" }, text);
			const go = () => controller.seekStep(i);
			b.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && go());
			b.addEventListener("focus", go);
			b.addEventListener("click", go);
			return b;
		};
		const terms = [term(0, "home hub"), term(1, "lights"), term(2, "door locks"), term(3, "heating"), term(4, "smoke alarms"), term(5, "phones")];
		$("#demo-text").replaceChildren("The ", terms[0], " talks to everything. It switches the ", terms[1], " by room, reports the battery of the ", terms[2], ", steers the ", terms[3], ", raises the ", terms[4], " and tells your ", terms[5], ".");
		onStep(controller, (i) => terms.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i))));
	} catch (err) {
		failNote(stage, err);
	}
})();

/* -------------------------------------------------------- explorable */

(async () => {
	const stage = $("#explore-stage");
	const slider = $("#spokes");
	try {
		const base = JSON.parse(await fetchText("examples/integrations.json"));
		/** @type {any} */
		let current = null;
		const build = (n, keepStep, rebuilding) => {
			const spec = { ...base, spokes: base.spokes.slice(0, n) };
			const sc = createScene(spec, { format: fmt });
			// Release the previous player: the player has no dispose, so drop its
			// capture-hook registration. An explicit theme means it adds no
			// media-query listener that would pin the detached DOM.
			current?.pause();
			for (const k of Object.keys(globalThis.__motionKit ?? {})) if (k.startsWith(`${sc.id}-`)) delete globalThis.__motionKit[k];
			const { controller } = mount(stage, sc, { style: styleFor("studio"), theme: themeOpt() ?? (prefersDark() ? "dark" : "light"), autoplay: "none" });
			if (rebuilding) {
				if (keepStep >= 0) controller.seekStep(Math.min(keepStep, sc.steps.length - 1));
				else controller.seek(0); // still before the first step
			}
			current = controller;
			$("#spokes-text").textContent = `${n} spokes`;
			slider.setAttribute("aria-valuetext", `${n} spokes`);
		};
		build(Number(slider.value), -1, false);
		slider.addEventListener("input", () => {
			const step = current ? stepIndexAt(current.scene, current.time) : -1; // keep the reader’s place
			build(Number(slider.value), step, true);
		});
	} catch (err) {
		failNote(stage, err);
	}
})();
