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

describe("stack", () => {
	const webStack = example("web-stack");
	const layers = (n) => Array.from({ length: n }, (_, i) => ({ label: `Layer ${i + 1}` }));
	const spec = (extra) => ({ type: "stack", id: "s", title: "S", description: "D", ...extra });

	it("the web-stack example passes the gate in every format and locale", () => {
		gateAll(webStack, LOCALES);
	});
	it("visits layers top to bottom, or bottom to top, one step each, carrying the spec's ids", () => {
		const withIds = { ...webStack, layers: webStack.layers.map((l, i) => ({ ...l, id: `l${i}` })) };
		const down = createScene(withIds, { format: "16:9", locale: "nl" });
		assert.deepEqual(down.steps.map((s) => s.id), ["l0", "l1", "l2", "l3", "l4"]);
		assert.deepEqual(down.steps.map((s) => s.label), ["Browser", "CDN", "API-gateway", "Bestelservice", "Database"]);
		const up = createScene({ ...withIds, direction: "up" }, { format: "16:9" });
		assert.deepEqual(up.steps.map((s) => s.id), ["l4", "l3", "l2", "l1", "l0"]);
		assert.ok(down.duration <= 8, `duration ${down.duration}`);
	});
	it("ends with the last layer filled, the passed ones outlined, and one emphasis packet", () => {
		const svg = renderSvg(createScene(spec({ layers: layers(4) }), { format: "16:9" }), 99);
		assert.equal((svg.match(/<rect[^>]*fill="var\(--mk-accent\)"/g) ?? []).length, 1, "one filled layer");
		assert.equal((svg.match(/<rect[^>]*fill="var\(--mk-surface\)" stroke="var\(--mk-accent\)"/g) ?? []).length, 3, "three outlined layers");
		assert.equal((svg.match(/var\(--mk-emphasis\)/g) ?? []).length, 1, "one emphasis element: the packet");
	});
	it("lays out 2 to 8 layers, two-line labels and both directions in every format", () => {
		gateAll(spec({ layers: layers(2) }));
		gateAll(spec({ layers: layers(8), direction: "up" }));
		gateAll(spec({ layers: [{ label: "Application" }, { label: "Network firewall and intrusion detection" }, { label: "Hardware" }] }));
	});
	it("grows strips to fit and keeps fixed formats at their size", () => {
		const s = spec({ layers: layers(6) });
		assert.equal(createScene(s, { format: "9:16" }).height, 960);
		const wide = createScene(s, { format: "wide" });
		assert.ok(wide.height > createScene(spec({ layers: layers(3) }), { format: "wide" }).height);
	});
	it("rejects specs it cannot draw, naming the cause", () => {
		const bad = (extra, re) => assert.throws(() => createScene(spec(extra), { format: "16:9" }), re);
		bad({}, /needs "layers"/);
		bad({ layers: layers(1) }, /needs 2–8 layers, got 1/);
		bad({ layers: layers(9) }, /needs 2–8 layers, got 9/);
		bad({ layers: [{ label: "A" }, {}] }, /layer 2 needs a "label"/);
		bad({ layers: layers(3), direction: "sideways" }, /"direction" must be "down" or "up", got "sideways"/);
		assert.throws(() => createScene(spec({ layers: layers(3) }), { format: "5:4" }), /unknown format "5:4"/);
	});
	it("refuses labels that do not fit, with the remedy", () => {
		const long = spec({ layers: [{ label: "Supercalifragilisticexpialidocious-gateway-layer" }, { label: "B" }] });
		assert.throws(() => createScene(long, { format: "tall" }), /2 layers do not fit format tall at ≥ 14px .*use fewer layers, shorter labels or a larger format/);
		const wordy = spec({ layers: layers(8).map(() => ({ label: "Many words that cannot fit into two lines of a narrow phone column at all" })) });
		assert.throws(() => createScene(wordy, { format: "16:9" }), /do not fit format 16:9/);
	});
});
