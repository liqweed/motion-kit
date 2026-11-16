// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · gallery. Filter by what you are explaining and by build
 * status, preview as a web, slide or reel format, and pin two to compare.
 */
import { GROUPS, LIVE, PLANNED } from "./catalog.mjs";
import { liveCard, plannedCard } from "./cards.mjs";
import { $, chipGroup, initPage, failNote, h, loadScene, mount, styleFor, themeOpt } from "./site.mjs";

initPage();
const phone = matchMedia("(max-width: 640px)").matches;
/** @type {{ q: string, status: string, fmt: string, pins: string[] }} */
const state = { q: "all", status: "all", fmt: "auto", pins: [] };
const webFmt = () => (phone ? "tall" : "wide");
const fmt = () => (state.fmt === "auto" ? webFmt() : state.fmt);

const all = [...LIVE.map((e) => ({ ...e, built: true })), ...PLANNED.map((e) => ({ ...e, built: false }))];
const count = (key) => (key === "all" ? all.length : all.filter((e) => e.group === key).length);

function filters() {
	$("#filters").replaceChildren(
		chipGroup({
			label: "What are you explaining?",
			value: state.q,
			options: [{ value: "all", label: "Anything", hint: String(count("all")) }, ...GROUPS.map((g) => ({ value: g.key, label: g.label, hint: String(count(g.key)) }))],
			onChange: (v) => { state.q = v; render(); },
		}),
		h("div", { class: "group", style: "gap:12px 24px" },
			chipGroup({ label: "Status", className: "chip sm", value: state.status, options: [{ value: "all", label: "All" }, { value: "built", label: "Built today" }, { value: "needs", label: "Storyboards (needs)" }], onChange: (v) => { state.status = v; render(); } }),
			chipGroup({ label: "Preview as", className: "chip sm", value: state.fmt, options: [{ value: "auto", label: "Web (wide/tall)" }, { value: "16:9", label: "Slide 16:9" }, { value: "9:16", label: "Reel 9:16" }], onChange: (v) => { state.fmt = v; render(); } })),
	);
}

function togglePin(id) {
	const i = state.pins.indexOf(id);
	if (i >= 0) state.pins.splice(i, 1);
	else {
		state.pins.push(id);
		if (state.pins.length > 2) state.pins.shift();
	}
	render();
}

function renderCompare() {
	const box = $("#compare");
	box.hidden = state.pins.length === 0;
	if (box.hidden) return;
	const grid = h("div", { class: "compare-grid" });
	for (const id of state.pins) {
		const entry = LIVE.find((e) => e.id === id);
		if (!entry) continue;
		const stage = h("div", { class: "player-box" });
		grid.append(h("div", { style: "display:flex;flex-direction:column;gap:8px;min-width:0" }, h("p", { style: "font-weight:600" }, entry.title, " ", h("span", { class: "mono", style: "font-weight:400;color:var(--muted);font-size:13px" }, entry.type)), stage));
		loadScene(entry, { format: fmt() })
			.then((sc) => mount(stage, sc, { style: styleFor("studio"), theme: themeOpt(), autoplay: "none" }))
			.catch((err) => failNote(stage, err));
	}
	box.replaceChildren(
		h("div", { style: "display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between" }, h("h2", { style: "font-size:18px;font-weight:650" }, "Compare"), h("button", { type: "button", class: "btn-sm", onClick: () => { state.pins = []; render(); } }, "Clear")),
		grid,
	);
}

function render() {
	renderCompare();
	const root = $("#groups");
	const sections = GROUPS.filter((g) => state.q === "all" || state.q === g.key)
		.map((g) => {
			const items = all.filter((e) => e.group === g.key && (state.status === "all" || (state.status === "built" ? e.built : !e.built)));
			if (!items.length) return null;
			const cards = items.map((e) =>
				e.built
					? liveCard(/** @type {any} */ (e), { format: fmt(), pin: { pressed: () => state.pins.includes(e.id), toggle: () => togglePin(e.id) } })
					: plannedCard(/** @type {any} */ (e)),
			);
			return h("section", { "aria-label": g.label, style: "display:flex;flex-direction:column;gap:14px" },
				h("div", { class: "group-head" }, h("h2", null, h("i", { "aria-hidden": "true" }), g.label), h("p", null, g.hint)),
				h("div", { class: "cards", style: state.fmt === "9:16" ? "grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))" : "" }, cards));
		})
		.filter(Boolean);
	root.replaceChildren(...sections);
	$("#empty").hidden = sections.length > 0;
}
filters();
render();
