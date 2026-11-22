// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · landing page. Every diagram is the real runtime; the only
 * invented thing is the agent session wording, and the page says so.
 */
import { linkSteps, scrollSteps } from "../../../runtime/links.mjs";
import { stepIndexAt } from "../../../runtime/scene.mjs";
import { DEFECTS, ISO_SHOWCASE, LIVE, PLANNED, STORY, STYLES, TRANSCRIPT } from "./catalog.mjs";
import { liveCard, plannedCard } from "./cards.mjs";
import {
	$, CONTRAST_PAIRS, chipGroup, contrastOf, contrastProblems, failNote, frameMarkup, h, initPage, keyControls, loadScene, mount, onStep, paintProgress, reducedMotion, siteTheme, styleFor, themeOpt,
} from "./site.mjs";

initPage();
/** @param {string} id */
const find = (id) => {
	const e = LIVE.find((x) => x.id === id);
	if (!e) throw new Error(`site catalog has no live example "${id}"`);
	return e;
};
const phone = matchMedia("(max-width: 720px)").matches;
const wideFmt = phone ? "tall" : "wide";

/**
 * A figure is server-rendered twice, wide and tall; CSS shows one. Mount the
 * live player over whichever shows, and the other if the window crosses the
 * breakpoint later.
 * @param {string} base id prefix of the two containers ("hero" for hero-wide and hero-tall)
 * @param {(el: HTMLElement, format: "wide" | "tall") => Promise<(() => void) | void>} mountOne resolves to its teardown
 */
function responsive(base, mountOne) {
	/** @type {Map<string, Promise<(() => void) | void>>} */
	const mounted = new Map();
	const go = () => {
		for (const format of /** @type {const} */ (["wide", "tall"])) {
			const el = document.getElementById(`${base}-${format}`);
			if (el && el.offsetParent !== null && !mounted.has(format)) {
				// Only one format shows: release the hidden one's player and listeners first.
				for (const [other, pending] of mounted) {
					mounted.delete(other);
					pending.then((stop) => stop?.());
				}
				mounted.set(format, mountOne(el, format));
			}
		}
	};
	go();
	matchMedia("(max-width: 720px)").addEventListener("change", go);
}

/* ---------------------------------------------------------------- hero */

const heroEntry = find("order-flow");
const heroStyle = styleFor("studio");
const heroPlate = $("#hero-fig .plate");

/* The frames of "where it runs" follow the hero player's step. */
/** @type {{ shots: any[][], shown: number, steps: number } | null} */
let heroFrames = null;
/** The hero controller's latest step, which can arrive before the preview scenes load. */
let heroStep = -2;
(async () => {
	try {
		const [slide, readme, reel] = await Promise.all([
			loadScene(heroEntry, { format: "16:9" }),
			loadScene(heroEntry, { format: "wide" }),
			loadScene(heroEntry, { format: "9:16" }),
		]);
		heroFrames = { shots: [[$("#shot-slide"), slide], [$("#shot-readme"), readme], [$("#shot-reel"), reel]], shown: -2, steps: slide.steps.length };
		paintFrames(heroStep === -2 ? heroFrames.steps - 1 : heroStep);
	} catch (err) {
		failNote($("#shot-slide"), err);
	}
})();
/** @param {number} i step index, -1 before the first */
function paintFrames(i, force = false) {
	if (!heroFrames) return;
	const k = Math.max(i, 0);
	if (k === heroFrames.shown && !force) return;
	heroFrames.shown = k;
	for (const [el, sc] of heroFrames.shots) el.innerHTML = frameMarkup(sc, sc.steps[Math.min(k, sc.steps.length - 1)].at, { style: heroStyle, theme: siteTheme() });
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => paintFrames(heroFrames?.shown ?? 0, true));

responsive("hero", async (el, format) => {
	try {
		const sc = await loadScene(heroEntry, { format: format === "wide" ? "16:9" : "tall" });
		const { controller } = mount(el, sc, { style: heroStyle, theme: themeOpt(), autoplay: "visible" });
		const unsub = onStep(controller, (i) => {
			heroStep = i;
			paintProgress($("[data-progress]", heroPlate), i, sc.steps.length);
			paintFrames(i);
			const readout = $("#readout");
			if (readout) readout.textContent = `frame(t) at step ${Math.max(i, 0) + 1} of ${sc.steps.length} · one scene, four targets`;
		});
		const stopKeys = keyControls(el, controller, { legend: $("#hero-legend"), callouts: $("#hero-callouts"), plate: heroPlate });
		return () => {
			unsub?.();
			stopKeys();
			controller.destroy();
		};
	} catch (err) {
		failNote(el, err);
	}
});

/* ---------------------------------------------------- 01 transcript ↔ player */

(async () => {
	const stage = $("#agent-stage");
	try {
		const sc = await loadScene(find("agent-loop"), { format: phone ? "tall" : "16:9" });
		const { controller } = mount(stage, sc, { style: styleFor("studio"), theme: themeOpt(), autoplay: "none" });
		const lines = TRANSCRIPT.map((l, i) =>
			h(
				"button",
				{ type: "button", class: "tline", "data-mk-step": String(i), "aria-label": `${l.who}: ${l.text}${l.cmd ? ` ${l.cmd}` : ""}. Shows step ${i + 1}.` },
				h("span", { class: `who${l.who === "You" ? " you" : ""}` }, l.who),
				h("span", { class: "body" }, l.text, l.cmd ? h("code", null, l.cmd) : null),
				h("span", { class: "tag" }, `step ${i + 1}`),
			),
		);
		$("#transcript").replaceChildren(...lines);
		// Hover, focus and click select a line's step; the player's own controls
		// move the step too, so the marks follow the diagram (onStep), not the helper.
		linkSteps(controller, lines, { mark: false });
		onStep(controller, (i) => lines.forEach((b, j) => b.setAttribute("aria-current", String(j === i))));
	} catch (err) {
		failNote(stage, err);
	}
})();

/* ------------------------------------------------------------ 02 the gate */

const defectList = $("#defect-list");
const term = $("#defect-term");
function showDefect(i) {
	const d = DEFECTS[i];
	term.replaceChildren(
		h("div", { class: "file" }, d.file),
		h("pre", { tabindex: "0" }, h("code", null, d.code)),
		h("div", { class: "report" },
			h("p", { class: "rule" }, `✕ ${d.rule} · ${d.ruleName}`),
			h("p", null, d.why),
			h("p", null, h("b", null, "Fix: "), d.fix),
			h("p", { class: "fine" }, "No frame is drawn. check exits 1; build and export refuse the scene.")),
	);
}
defectList.append(
	chipGroup({
		label: "A mistake to try", showLabel: false, className: "chip defect", value: "0",
		options: DEFECTS.map((d, i) => ({ value: String(i), label: d.title, hint: d.rule })),
		onChange: (v) => showDefect(Number(v)),
	}),
);
showDefect(0);

/* ------------------------------------------------------------ 03 styles */

const styleStage = $("#style-stage");
let styleToken = 0;
async function showStyle(name) {
	const token = ++styleToken;
	const s = STYLES[name];
	$("#style-file").textContent = s.file;
	const obj = (o) => `{ ${Object.entries(o).map(([k, v]) => `"${k}": "${v}"`).join(",\n    ")} }`;
	$("#style-json").textContent = `{\n  "name": "${s.name}",\n  "font": "${s.font}",\n  "radius": 10,\n  "stroke": 2,${s.motion ? `\n  "motion": { "enter": [${s.motion.enter.join(", ")}], "move": [${s.motion.move.join(", ")}] },` : ""}\n  "light": ${obj(s.light)},\n  "dark":  ${obj(s.dark)}\n}`;
	const rs = styleFor(name);
	const rows = CONTRAST_PAIRS.map(([label, fg, bg, min]) => {
		const cell = (theme) => {
			const r = contrastOf(rs[theme][fg], rs[theme][bg]);
			return h("td", { class: `n ${r >= min ? "v" : "fail"}` }, `${r.toFixed(2)} ${r >= min ? "pass" : "FAIL"}`);
		};
		return h("tr", null, h("td", null, label), h("td", { class: "n v" }, `${min}:1`), cell("light"), cell("dark"));
	});
	const problems = contrastProblems(rs);
	$("#contrast-rows").replaceChildren(...rows, h("tr", null, h("td", { colspan: "4", class: "v" }, problems.length ? problems.join(" · ") : "checkContrast(): no problems, light and dark")));
	try {
		const sc = await loadScene(find("smart-home"), { format: phone ? "tall" : "16:9" });
		if (token !== styleToken) return;
		mount(styleStage, sc, { style: rs, theme: themeOpt(), autoplay: "none" });
	} catch (err) {
		failNote(styleStage, err);
	}
}
const swatch = (s) => h("span", { class: "sw", "aria-hidden": "true" }, ...[s.light.accent, s.light.emphasis, s.light.surface].map((c) => h("i", { style: `background:${c}` })));
$("#style-tabs").append(
	chipGroup({
		label: "Style", showLabel: false, className: "chip style-tab", value: "tidewater",
		options: Object.values(STYLES).map((s) => ({ value: s.name, label: s.name, content: [swatch(s), h("span", null, h("b", null, s.name), h("small", null, s.note))] })),
		onChange: showStyle,
	}),
);
showStyle("tidewater");

/* ------------------------------------------------------- 04 scroll story */

(async () => {
	const stage = $("#story-stage");
	try {
		const sc = await loadScene(find("release-pipeline"), { format: "tall" });
		const { controller } = mount(stage, sc, { style: styleFor("studio"), theme: themeOpt(), autoplay: "none", controls: false, captions: false });
		const paras = STORY.map((s, i) => h("section", null, h("h3", null, h("small", null, String(i + 1).padStart(2, "0")), s.h), h("p", null, s.p)));
		$("#story-paras").replaceChildren(...paras);
		// The rail scrolls; scrollSteps moves the diagram as each section crosses the middle.
		const rail = STORY.map((s, i) => h("button", { type: "button", "aria-label": `Step ${i + 1}: ${s.h}`, onClick: () => {
			paras[i].scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
		} }, h("i")));
		$("#story-rail").replaceChildren(...rail);
		/** @param {number} i */
		const markRail = (i) => rail.forEach((b, j) => (j === Math.max(i, 0) ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
		controller.seekStep(0);
		markRail(0);
		scrollSteps(controller, paras, { onChange: markRail });
	} catch (err) {
		failNote(stage, err);
	}
})();

/* ------------------------------------------------------- 06 isometric showcase */

{
	const isoEntry = find(ISO_SHOWCASE.example);
	const plate = $("#isometric .plate");
	const items = [...document.querySelectorAll("#iso-steps li")];
	responsive("iso", async (el, format) => {
		try {
			const sc = await loadScene(isoEntry, { format: format === "wide" ? "16:9" : "tall" });
			const { controller } = mount(el, sc, { style: styleFor("studio"), theme: themeOpt(), autoplay: "visible" });
			const unsub = onStep(controller, (i) => {
				paintProgress($("[data-progress]", plate), i, sc.steps.length);
				items.forEach((li, j) => (j === i ? li.setAttribute("aria-current", "step") : li.removeAttribute("aria-current")));
			});
			return () => {
				unsub?.();
				controller.destroy();
			};
		} catch (err) {
			failNote(el, err);
		}
	});
}

/* ------------------------------------------------------- 07 gallery teaser */

{
	const live = ["order-flow", "pull-request", "smart-home", "incident", "web-stack", "checkout"].map(find);
	$("#teaser").append(...live.map((e) => liveCard(e, { format: wideFmt })));
	$("#teaser-needs").append(...PLANNED.map((e) => plannedCard(e)));
}
