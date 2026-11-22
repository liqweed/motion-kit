// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · one example, opened: the player in any format, locale,
 * theme and style, and four tabs (step frames, spec, export, gate). The
 * format × locale table runs the gate's construction rule (G13) live.
 */
import { FORMAT_NAMES, FORMAT_STAGE, LOCALES, RULES, STYLE_NAMES, findExample } from "./catalog.mjs";
import { $, chipGroup, initPage, commandBlock, failNote, fetchText, frameMarkup, h, loadScene, mount, onStep, paintProgress, siteTheme, styleFor } from "./site.mjs";

initPage();
const app = $("#ex-app");
const params = new URLSearchParams(location.search);
const entry = findExample(app.dataset.id ?? "");
if (!entry?.built) throw new Error("example.mjs runs on built examples only");

const phone = matchMedia("(max-width: 720px)").matches;
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
	format: pick("format", FORMAT_NAMES, phone ? "tall" : "wide"),
	locale: pick("locale", LOCALES, "en"),
	theme: pick("theme", ["light", "dark"], siteTheme()),
	style: pick("style", STYLE_NAMES, "studio"),
	tab: "frames",
};
const main = app;
{
	const live = /** @type {import("./catalog.mjs").LiveExample} */ (entry);
	// The page renders the figure's first state twice (wide, tall); keep the one that shows and mount over it.
	const stage = /** @type {HTMLElement} */ (document.getElementById(phone ? "ex-tall" : "ex-wide"));
	document.getElementById(phone ? "ex-wide" : "ex-tall")?.remove();
	const stageBox = /** @type {HTMLElement} */ (document.getElementById("ex-stagebox"));
	const figure = /** @type {HTMLElement} */ (stageBox.querySelector(".plate"));
	const sync = () => {
		const u = new URL(location.href);
		for (const k of ["format", "locale", "theme", "style"]) u.searchParams.set(k, state[k]);
		history.replaceState(null, "", u);
	};
	let token = 0;
	async function renderStage() {
		const mine = ++token;
		sync();
		stageBox.style.maxWidth = `${FORMAT_STAGE[state.format]}px`;
		try {
			const sc = await loadScene(live, { format: state.format, locale: state.locale });
			if (mine !== token) return;
			const { controller } = mount(stage, sc, { style: styleFor(state.style), theme: /** @type {any} */ (state.theme), autoplay: "visible", scrubber: true });
			onStep(controller, (i) => paintProgress(figure.querySelector("[data-progress]"), i, sc.steps.length));
		} catch (err) {
			failNote(stage, new Error(`Not built for ${state.format} × ${state.locale}: ${err instanceof Error ? err.message : err}`));
		}
		renderTab();
	}
	const group1 = (label, key, values) =>
		chipGroup({ label, className: "chip sm", value: state[key], options: values.map((v) => ({ value: v, label: v })), onChange: (v) => { state[key] = v; renderStage(); } });
	main.append(h("div", { class: "panel ex-toolbar" }, group1("Format", "format", FORMAT_NAMES), group1("Locale", "locale", LOCALES), group1("Theme", "theme", ["light", "dark"]), group1("Style", "style", STYLE_NAMES)));

	/* tabs */
	const TABS = [["frames", "Step frames"], ["spec", "Spec"], ["export", "Export"], ["gate", "Gate"]];
	const panel = h("div", { class: "tabpanel", role: "tabpanel", tabindex: "0" });
	const list = h("div", { class: "tablist", role: "tablist", "aria-label": "Example details" });
	const tabButtons = TABS.map(([key, label]) => {
		const b = h("button", { type: "button", role: "tab", id: `tab-${key}`, onClick: () => { state.tab = key; renderTab(); } }, label);
		list.append(b);
		return [key, b];
	});
	list.addEventListener("keydown", (e) => {
		const i = TABS.findIndex(([k]) => k === state.tab);
		const next = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
		if (!next) return;
		e.preventDefault();
		state.tab = TABS[(i + next + TABS.length) % TABS.length][0];
		renderTab();
		$(`#tab-${state.tab}`).focus();
	});
	main.append(h("div", { class: "tabs" }, list, panel));

	let tabToken = 0;
	async function renderTab() {
		const mine = ++tabToken;
		for (const [key, b] of tabButtons) {
			b.setAttribute("aria-selected", String(key === state.tab));
			b.tabIndex = key === state.tab ? 0 : -1;
		}
		panel.setAttribute("aria-labelledby", `tab-${state.tab}`);
		panel.replaceChildren(h("p", null, "Loading…"));
		let content;
		try {
			content = await ({ frames: framesTab, spec: specTab, export: exportTab, gate: gateTab }[state.tab])(live);
		} catch (err) {
			content = [h("p", null, err instanceof Error ? err.message : String(err))];
		}
		if (mine === tabToken) panel.replaceChildren(...content);
	}

	async function framesTab(e) {
		const frameFmt = state.format === "wide" || state.format === "tall" ? "16:9" : state.format;
		const sc = await loadScene(e, { format: frameFmt, locale: state.locale });
		const st = styleFor(state.style);
		return [
			h("p", null, "One settled frame per step, sharing one viewBox, so consecutive slides register exactly. Drop them into PowerPoint, Keynote or Google Slides with no transition or a dissolve."),
			h("div", { class: `frames${frameFmt === "9:16" ? " narrow" : ""}` }, sc.steps.map((s, i) =>
				h("figure", null, h("div", { class: "shot", html: frameMarkup(sc, s.at, { style: st, theme: /** @type {any} */ (state.theme) }) }), h("figcaption", null, `${e.id}-${frameFmt.replace(":", "x")}-${state.locale}-${String(i + 1).padStart(2, "0")}.svg`)))),
		];
	}
	async function specTab(e) {
		const src = await fetchText(e.file);
		return [
			h("p", null, e.kind === "spec" ? "The spec: data, not animation code. This is the file in the repository." : "A custom scene: a plain module whose frame(t) is a pure function of time. This is the file in the repository."),
			h("pre", { class: "codecard", style: "padding:16px;font-size:13px;line-height:1.6;overflow-x:auto", tabindex: "0" }, h("code", null, src)),
		];
	}
	async function exportTab(e) {
		const f = state.format;
		const rows = [
			["Web page (Astro island)", "JS", "node cli/motion-kit.mjs vendor <repo>/src/motion-kit --adapter astro"],
			["Self-contained HTML", "JS, inline", `node cli/motion-kit.mjs build ${e.file} -o out/${e.id}.html -f ${f} -l ${state.locale}`],
			["Slides (PowerPoint, Keynote, Google)", "no JS", `node cli/motion-kit.mjs export ${e.file} -o out/slides -f ${f} -l ${state.locale} --png --qc`],
			["README, docs, Obsidian", "no JS", `node cli/motion-kit.mjs bake ${e.file} -o out/${e.id}.svg -f ${f} -l ${state.locale}`],
			["Slidev deck", "JS", "node cli/motion-kit.mjs vendor <deck>/components/motion-kit --adapter slidev"],
			["Video", "ffmpeg", `node cli/motion-kit.mjs video ${e.file} -f 9:16 -o out/${e.id}.mp4 --sheet out/sheet.png`],
		];
		return [
			h("p", null, "Commands for this scene in ", h("b", null, f), " and ", h("b", null, state.locale), ", from a clone of the repository."),
			h("div", { class: "exports" }, rows.map(([t, js, cmd]) => h("div", { class: "export" }, h("header", null, h("h3", null, t), h("span", null, js)), commandBlock(cmd, { label: `Copy command for ${t}` })))),
		];
	}
	async function gateTab(e) {
		const cells = await Promise.all(LOCALES.map(async (l) => Promise.all(["16:9", "4:3", "1:1", "9:16", "wide", "tall"].map(async (f) => {
			try {
				await loadScene(e, { format: f, locale: l });
				return h("td", { class: "pass" }, "builds");
			} catch (err) {
				return h("td", { title: err instanceof Error ? err.message : String(err) }, "does not fit");
			}
		}))));
		return [
			h("p", null, "This table runs the gate’s construction rule (G13) in your browser: the scene is built in each format and locale, and a label that does not fit fails. The other rules run with ", h("code", null, `motion-kit check ${e.file}`), "."),
			h("div", { class: "matrix" }, h("table", null,
				h("thead", null, h("tr", null, h("th", null, "Locale"), ...["16:9", "4:3", "1:1", "9:16", "wide", "tall"].map((f) => h("th", null, f)))),
				h("tbody", null, LOCALES.map((l, i) => h("tr", null, h("td", null, l), ...cells[i]))))),
			h("ul", { class: "rules" }, RULES.map(([id, text]) => h("li", null, h("span", null, id), h("span", null, text)))),
		];
	}

	renderStage();
}
