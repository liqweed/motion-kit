import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkScene } from "../lib/check.mjs";
import { renderSvg } from "../runtime/scene.mjs";
import { createScene } from "../runtime/types/index.mjs";

const FORMATS = ["16:9", "4:3", "1:1", "9:16", "wide", "tall"];
const LOCALES = ["en", "nl"];
const example = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), "utf8"));

/** Every format passes the gate; returns the scenes. */
function gateAll(spec, locales = ["en"]) {
	const scenes = [];
	for (const format of FORMATS) {
		for (const locale of locales) {
			const scene = createScene(spec, { format, locale });
			assert.deepEqual(checkScene(scene).problems, [], `${spec.id} · ${format} · ${locale}`);
			scenes.push(scene);
		}
	}
	return scenes;
}

describe("timeline", () => {
	const incident = example("incident");
	const events = (n, planned = 0) =>
		Array.from({ length: n }, (_, i) => ({ when: `Q${(i % 4) + 1} ${2024 + Math.floor(i / 4)}`, label: `Milestone ${i + 1}`, planned: i >= n - planned }));
	const spec = (extra) => ({ type: "timeline", id: "t", title: "T", description: "D", ...extra });

	it("the incident example passes the gate in every format and locale", () => {
		gateAll(incident, LOCALES);
	});
	it("has one step per event, then the now marker, carrying the spec's ids", () => {
		const withIds = { ...incident, events: incident.events.map((e, i) => ({ ...e, id: `e${i}` })), now: { ...incident.now, id: "now" } };
		const scene = createScene(withIds, { format: "16:9", locale: "nl" });
		assert.deepEqual(scene.steps.map((s) => s.id), [...incident.events.map((_, i) => `e${i}`), "now"]);
		assert.deepEqual(scene.steps.map((s) => s.label), ["Alarm gaat af", "Dienstdoende reageert", "Oorzaak gevonden", "Herstel uitgerold", "Sein veilig", "Evaluatie", "Nu"]);
		assert.ok(scene.duration <= 8, `duration ${scene.duration}`);
	});
	it("fills past events with the accent and leaves planned ones pending", () => {
		const s = spec({ events: events(3, 1), now: { label: "Now" } });
		const svg = renderSvg(createScene(s, { format: "16:9" }), 99);
		const accentDots = svg.match(/<circle[^>]*fill="var\(--mk-accent\)"/g) ?? [];
		const pendingDots = svg.match(/<circle[^>]*fill="var\(--mk-surface\)"/g) ?? [];
		assert.equal(accentDots.length, 2);
		assert.equal(pendingDots.length, 1);
		assert.equal((svg.match(/var\(--mk-emphasis\)/g) ?? []).length, 1, "one emphasis element: the now marker");
	});
	it("lays out now at the start, at the end, or not at all, with 2 to 8 events", () => {
		gateAll(spec({ events: events(4, 4), now: { label: "Today" } }));
		gateAll(spec({ events: events(5), now: { label: "Today" } }));
		gateAll(spec({ events: events(3) }));
		gateAll(spec({ events: events(2, 1), now: { label: "Now" } }));
		gateAll(spec({ events: events(8, 3), now: { label: "Now" } }));
	});
	it("runs the axis horizontally on wide aspects and vertically on narrow ones", () => {
		const s = spec({ events: events(4) });
		const wide = createScene(s, { format: "wide" });
		assert.ok(wide.height < wide.width / 2, `wide strip ${wide.width}×${wide.height}`);
		const axis = (format) => renderSvg(createScene(s, { format }), 99).match(/<path d="M[\d.]+ [\d.]+ ([HV])/)?.[1];
		for (const format of ["16:9", "4:3", "1:1", "wide"]) assert.equal(axis(format), "H", format);
		for (const format of ["9:16", "tall"]) assert.equal(axis(format), "V", format);
	});
	it("rejects specs it cannot draw, naming the cause", () => {
		const bad = (extra, re) => assert.throws(() => createScene(spec(extra), { format: "16:9" }), re);
		bad({}, /needs "events"/);
		bad({ events: events(1) }, /needs 2–8 events, got 1/);
		bad({ events: events(9) }, /needs 2–8 events, got 9/);
		bad({ events: [{ when: "1", label: "A" }, { label: "B" }] }, /event 2 \("B"\) needs a "when"/);
		bad({ events: [{ when: "1", label: "A" }, { when: "2" }] }, /event 2 needs a "label"/);
		bad({ events: [{ when: "1", label: "A", planned: true }, { when: "2", label: "B" }], now: { label: "Now" } }, /event 2 \("B"\) has happened but comes after a planned event/);
		bad({ events: [{ when: "1", label: "A" }, { when: "2", label: "B", planned: "yes" }], now: { label: "Now" } }, /"planned" must be true or false/);
		bad({ events: events(3, 1) }, /planned events need a "now" marker/);
		bad({ events: events(3), now: {} }, /"now" needs a "label"/);
		assert.throws(() => createScene(spec({ events: events(3) }), { format: "5:4" }), /unknown format "5:4"/);
	});
	it("refuses labels that do not fit, with the remedy", () => {
		const long = spec({ events: [{ when: "1", label: "Supercalifragilisticexpialidocious-incident" }, { when: "2", label: "B" }] });
		assert.throws(() => createScene(long, { format: "tall" }), /2 events do not fit format tall at ≥ 14px .*use fewer events, shorter labels or a larger format/);
		const many = spec({ events: Array.from({ length: 8 }, (_, i) => ({ when: `Day ${i}`, label: "Three long words here and more words" })) });
		assert.throws(() => createScene(many, { format: "1:1" }), /do not fit format 1:1/);
	});
});
