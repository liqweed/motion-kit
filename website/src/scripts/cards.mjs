// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit.dev · example cards, shared by the landing teaser and the gallery.
 * A live card mounts the runtime player when it scrolls near the viewport; a
 * planned card is a storyboard note, because nothing exists to run.
 */
import { REPO } from "./catalog.mjs";
import { failNote, h, loadScene, mount, styleFor, themeOpt } from "./site.mjs";

/** Mount lazily: a gallery of players should not build every scene up front. */
const lazy = new IntersectionObserver(
	(entries) => {
		for (const e of entries) {
			if (!e.isIntersecting) continue;
			lazy.unobserve(e.target);
			e.target.dispatchEvent(new Event("mk-visible"));
		}
	},
	{ rootMargin: "300px" },
);

/**
 * @param {import("./catalog.mjs").LiveExample} entry
 * @param {{ format: string, locale?: string, style?: string, surface?: boolean, pin?: { pressed: () => boolean, toggle: () => void } }} o
 */
export function liveCard(entry, { format, locale = "en", style = "studio", surface = false, pin }) {
	const box = h("div", { class: "player-box" });
	const pinBtn = pin
		? h("button", { type: "button", class: "btn-sm", "aria-pressed": String(pin.pressed()), onClick: () => {
				pin.toggle();
			} }, pin.pressed() ? "Pinned to compare" : "Compare")
		: null;
	const card = h(
		"article",
		{ class: `card${surface ? " surface-card" : ""}`, "data-id": entry.id },
		box,
		h("div", { class: "meta" }, h("h3", null, entry.title), h("span", { class: "type" }, entry.type), h("span", { class: "badge" }, "built")),
		h("div", { class: "actions" }, h("a", { class: "btn-sm", href: `/examples/${entry.id}/?format=${format}` }, "Open", h("span", { class: "sr" }, ` ${entry.title}`)), pinBtn),
	);
	box.addEventListener(
		"mk-visible",
		async () => {
			try {
				mount(box, await loadScene(entry, { format, locale }), { style: styleFor(style), theme: themeOpt(), autoplay: "none", mini: true });
			} catch (err) {
				failNote(box, err);
			}
		},
		{ once: true },
	);
	lazy.observe(box);
	return card;
}

/** @param {import("./catalog.mjs").PlannedExample} entry */
export function plannedCard(entry) {
	return h(
		"article",
		{ class: "card", "data-id": entry.id },
		h("div", { class: "storyboard" }, h("b", null, `type: ${entry.type}`), h("span", null, "Storyboard only: not built yet")),
		h("div", { class: "meta" }, h("h3", null, entry.title), h("span", { class: "type" }, entry.type), h("span", { class: "badge needs" }, `needs: ${entry.type}`)),
		h("p", { class: "story-line" }, entry.story),
		h("div", { class: "actions" }, h("a", { class: "btn-sm", href: `/examples/${entry.id}/` }, "Open", h("span", { class: "sr" }, ` ${entry.title}`)), h("a", { href: `${REPO}/issues/${entry.issue}`, style: "font-size:14px" }, `Issue #${entry.issue}`)),
	);
}
