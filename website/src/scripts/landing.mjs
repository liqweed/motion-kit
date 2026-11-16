// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · landing page. Every diagram is the real runtime; the only
 * invented thing is the agent session wording, and the page says so.
 */
import { stepIndexAt } from "../../../runtime/scene.mjs";
import { BRIEFS, DEFECTS, LIVE, PLANNED, STORY, STYLES, TRANSCRIPT } from "./catalog.mjs";
import { liveCard, plannedCard } from "./cards.mjs";
import {
	$, CONTRAST_PAIRS, chipGroup, initPage, contrastOf, contrastProblems, failNote, frameMarkup, h, loadScene, mount, onStep, reducedMotion, styleFor, themeOpt,
} from "./site.mjs";

initPage();
/** @param {string} id */
const find = (id) => {
	const e = LIVE.find((x) => x.id === id);
	if (!e) throw new Error(`site catalog has no live example "${id}"`);
	return e;
};
const phone = matchMedia("(max-width: 640px)").matches;
const wideFmt = phone ? "tall" : "wide";


/* ---------------------------------------------------------------- hero */

/** @type {(() => void)[]} */
let heroStops = [];
let heroToken = 0;

async function renderHero(briefId) {
	const token = ++heroToken;
	heroStops.forEach((s) => s());
	heroStops = [];
	const brief = BRIEFS.find((b) => b.id === briefId) ?? BRIEFS[0];
	const entry = find(brief.id);
	const st = styleFor("studio");

	$("#brief-prompt").textContent = brief.prompt;
	const ok = (text, cmd) => h("li", null, h("b", null, "✓"), h("span", null, text, cmd ? h("code", null, cmd) : null));
	$("#brief-lines").replaceChildren(
		ok(`Storyboard: ${brief.steps} steps, one sentence each. Approved by you.`),
		ok(`Wrote a ${brief.type} spec`, brief.file),
		ok("Gate passes: 6 formats × 2 locales.", `motion-kit check ${brief.file}`),
		ok("Rendered: live player, slide frames, README SVG, 9:16 reel."),
		h("li", { class: "wait" }, h("b", null, "◆"), h("span", null, "Waiting for your sign-off on the look.")),
	);

	try {
		const [web, slide, readme, reel] = await Promise.all([
			loadScene(entry, { format: wideFmt }),
			loadScene(entry, { format: "16:9" }),
			loadScene(entry, { format: "wide" }),
			loadScene(entry, { format: "9:16" }),
		]);
		if (token !== heroToken) return;
		const { controller } = mount($("#hero-stage"), web, { style: st, theme: "dark", autoplay: "visible" });
		const shots = [[$("#shot-slide"), slide], [$("#shot-readme"), readme], [$("#shot-reel"), reel]];
		let shownStep = -2;
		const paint = (i) => {
			const k = Math.max(i, 0);
			if (k === shownStep) return;
			shownStep = k;
			for (const [el, sc] of shots) el.innerHTML = frameMarkup(sc, sc.steps[Math.min(k, sc.steps.length - 1)].at, { style: st, theme: "dark" });
		};
		let raf = 0;
		let alive = true;
		const readout = $("#readout");
		const tick = () => {
			if (!alive) return;
			const t = controller.time;
			const i = stepIndexAt(web, t);
			paint(i);
			const text = `frame(t) at t = ${t.toFixed(2)} s · step ${i + 1} of ${web.steps.length} · one scene, four targets`;
			if (readout.textContent !== text) readout.textContent = text;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		heroStops.push(() => {
			alive = false;
			cancelAnimationFrame(raf);
		});
	} catch (err) {
		failNote($("#hero-stage"), err);
	}
}

$("#brief-chips").append(
	chipGroup({ label: "Brief", showLabel: false, value: BRIEFS[0].id, options: BRIEFS.map((b) => ({ value: b.id, label: b.label })), onChange: renderHero }),
);
renderHero(BRIEFS[0].id);

/* ---------------------------------------------------- 01 transcript ↔ player */

(async () => {
	const stage = $("#agent-stage");
	try {
		const sc = await loadScene(find("agent-loop"), { format: phone ? "tall" : "16:9" });
		const { controller } = mount(stage, sc, { style: styleFor("studio"), theme: themeOpt(), autoplay: "none" });
		const lines = TRANSCRIPT.map((l, i) => {
			const go = () => controller.seekStep(i);
			const b = h(
				"button",
				{ type: "button", class: "line", "aria-label": `${l.who}: ${l.text}${l.cmd ? ` ${l.cmd}` : ""}. Shows step ${i + 1}.` },
				h("span", { class: `who${l.who === "You" ? " you" : ""}` }, l.who),
				h("span", { class: "body" }, l.text, l.cmd ? h("code", null, l.cmd) : null),
				h("span", { class: "tag" }, `step ${i + 1}`),
			);
			b.addEventListener("click", go);
			b.addEventListener("focus", go);
			b.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && go());
			return b;
		});
		$("#transcript").replaceChildren(...lines);
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
		label: "A mistake to try", showLabel: false, className: "defect", value: "0",
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
	$("#style-json").textContent = `{\n  "name": "${s.name}",\n  "font": "${s.font}",\n  "radius": 10,\n  "stroke": 2,\n  "light": ${obj(s.light)},\n  "dark":  ${obj(s.dark)}\n}`;
	const rs = styleFor(name);
	const rows = CONTRAST_PAIRS.map(([label, fg, bg, min]) => {
		const cell = (theme) => {
			const r = contrastOf(rs[theme][fg], rs[theme][bg]);
			return h("td", { class: `n ${r >= min ? "v" : "fail"}` }, `${r.toFixed(2)} ${r >= min ? "pass" : "FAIL"}`);
		};
		return h("tr", null, h("td", null, label), h("td", { class: "n v" }, `${min}:1`), cell("light"), cell("dark"));
	});
	const problems = contrastProblems(rs);
	$("#contrast-rows").replaceChildren(...rows, h("tr", null, h("td", { colspan: "4", class: "v", style: "font-size:13px" }, problems.length ? problems.join(" · ") : "checkContrast(): no problems, light and dark")));
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
		label: "Style", showLabel: false, className: "style-tab", value: "tidewater",
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
		const paras = STORY.map((s, i) => h("section", { "data-i": String(i), "aria-current": "false" }, h("h3", null, h("small", null, String(i + 1).padStart(2, "0")), s.h), h("p", null, s.p)));
		$("#story-paras").replaceChildren(...paras);
		const rail = STORY.map((s, i) => h("button", { type: "button", "aria-label": `Step ${i + 1}: ${s.h}`, onClick: () => {
			paras[i].scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
			go(i);
		} }, h("i")));
		$("#story-rail").replaceChildren(...rail);
		let cur = -1;
		function go(i) {
			if (i === cur) return;
			cur = i;
			controller.seekStep(i);
			paras.forEach((p, j) => p.setAttribute("aria-current", String(j === i)));
			rail.forEach((b, j) => (j === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
		}
		go(0);
		const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && go(Number(/** @type {HTMLElement} */ (e.target).dataset.i))), { rootMargin: "-45% 0px -45% 0px" });
		paras.forEach((p) => io.observe(p));
	} catch (err) {
		failNote(stage, err);
	}
})();

/* ------------------------------------------------------- 05 gallery teaser */

{
	const live = ["order-flow", "smart-home", "release-pipeline"].map(find);
	const planned = PLANNED.filter((p) => ["checkout", "one-scene", "player-states"].includes(p.id));
	$("#teaser").append(...live.map((e) => liveCard(e, { format: wideFmt, surface: true })), ...planned.map(plannedCard));
	$("#gal-lede").textContent = `${LIVE.length} diagrams run live today. ${PLANNED.length} more are storyboarded and wait for their scene types; they are marked “needs” and have no player.`;
}
