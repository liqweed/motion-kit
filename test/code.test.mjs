import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkScene, findColourLiteral } from "../lib/check.mjs";
import { loadScene } from "../lib/load.mjs";
import { CODE_BAND_LAG, CODE_FONT, CODE_ROLES, codeBlock, codeEnd, codeFocus, codePairs, drawCode } from "../runtime/code.mjs";
import { KIT } from "../runtime/kit.mjs";
import { easeStandard, linear } from "../runtime/motion.mjs";
import { FORMATS, renderSvg } from "../runtime/scene.mjs";
import { contrastReport, normalizeStyle } from "../runtime/style.mjs";

const EXAMPLE = fileURLToPath(new URL("../examples/code-steps.scene.mjs", import.meta.url));
const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

const LINES = ["const a = 1;", "if (a) {", "\treturn a;", "}", "", "// done"];
/** A block 14 px wide per 8.4 px column: 40 columns with 14 px padding and line numbers. */
const block = (/** @type {Record<string, unknown>} */ extra = {}) => codeBlock({ lines: LINES, x: 10, y: 20, width: 400, ...extra });

describe("codeBlock", () => {
	it("lays out one row per line, expands tabs and keeps the text", () => {
		const b = block();
		assert.equal(b.lineCount, 6);
		assert.equal(b.rows.length, 6);
		assert.equal(b.source[2], "  return a;");
		assert.equal(b.text, "const a = 1;\nif (a) {\n  return a;\n}\n\n// done");
		assert.equal(b.rangeText(2, 3), "if (a) {\n  return a;");
		near(b.rowHeight, 21);
		near(b.height, 2 * 14 + 6 * 21);
		assert.equal(b.columns, Math.floor((400 - 28 - 3 * 8.4) / 8.4));
	});

	it("takes lines as runs of syntax roles and sets each run at its column", () => {
		const b = codeBlock({ lines: [[{ text: "let", role: "keyword" }, " x = ", { text: '"hi"', role: "string" }]], x: 0, y: 0, width: 400 });
		assert.deepEqual(b.rows[0].runs, [
			{ text: "let", role: "keyword", col: 0 },
			{ text: " x = ", role: "code", col: 3 },
			{ text: '"hi"', role: "string", col: 8 },
		]);
	});

	it("refuses a line that is too wide, naming the line and the remedy", () => {
		const lines = ["short", "x".repeat(60)];
		assert.throws(
			() => codeBlock({ lines, x: 0, y: 0, width: 400 }),
			(/** @type {Error} */ e) => /line 2 is 60 columns wide, and the block fits 41/.test(e.message) && /Shorten the line/.test(e.message) && /"wrap" or "clip"/.test(e.message) && /wider format/.test(e.message),
		);
	});

	it("wraps a wide line at a space, indenting the continuation", () => {
		const b = codeBlock({ lines: ["  await sleep(100 * 2 ** i) + another(call, here, now);"], x: 0, y: 0, width: 300, overflow: "wrap" });
		assert.ok(b.rows.length >= 2);
		assert.ok(b.rows.every((r) => r.line === 1));
		assert.deepEqual(b.rows.map((r) => r.first), b.rows.map((_, i) => i === 0));
		const columnsOf = (/** @type {typeof b.rows[number]} */ r) => Math.max(...r.runs.map((run) => run.col + run.text.length));
		assert.ok(b.rows.every((r) => columnsOf(r) <= b.columns));
		assert.ok(b.rows[1].runs[0].col > 0, "the continuation is indented");
		assert.equal(b.rows.map((r) => r.runs.map((run) => run.text).join("")).join(" ").replace(/\s+/g, " ").trim(), "await sleep(100 * 2 ** i) + another(call, here, now);");
		// The band of that line covers every row it wrapped to.
		assert.deepEqual(b.rowSpan(1, 1), [0, b.rows.length]);
	});

	it("breaks a word that has no space to break at", () => {
		const b = codeBlock({ lines: ["a".repeat(50)], x: 0, y: 0, width: 300, overflow: "wrap" });
		assert.ok(b.rows.length >= 2);
		assert.equal(b.rows.map((r) => r.runs.map((x) => x.text).join("")).join(""), "a".repeat(50));
	});

	it("clips a wide line with an ellipsis in its last column", () => {
		const b = codeBlock({ lines: ["x".repeat(60)], x: 0, y: 0, width: 400, overflow: "clip" });
		assert.equal(b.rows.length, 1);
		const text = b.rows[0].runs.map((r) => r.text).join("");
		assert.equal(text.length, b.columns);
		assert.ok(text.endsWith("…"));
		// The accessible text keeps the whole line.
		assert.equal(b.source[0].length, 60);
	});

	it("refuses code taller than the room, naming the first line that does not fit", () => {
		assert.throws(
			() => block({ maxHeight: 2 * 14 + 4 * 21 }),
			(/** @type {Error} */ e) => /line 5 does not fit/.test(e.message) && /room for 4 rows/.test(e.message) && /needs 6/.test(e.message) && /Show fewer lines/.test(e.message) && /taller format/.test(e.message),
		);
		assert.doesNotThrow(() => block({ maxHeight: 2 * 14 + 6 * 21 }));
	});

	it("counts wrapped rows against the height, and says to shorten the lines", () => {
		assert.throws(
			() => codeBlock({ lines: ["y", "x".repeat(60)], x: 0, y: 0, width: 300, overflow: "wrap", maxHeight: 2 * 14 + 2 * 21 }),
			/line 2 does not fit.*shorten the lines/s,
		);
	});

	it("refuses a width with no room for code, and text under the kit's minimum size", () => {
		assert.throws(() => codeBlock({ lines: ["a"], x: 0, y: 0, width: 100 }), /columns for code.*wider format/);
		assert.throws(() => block({ fontSize: 12 }), /under 14 px/);
	});

	it("refuses wide characters and over-indented lines that cannot wrap", () => {
		assert.throws(() => codeBlock({ lines: ["ok", "日本"], x: 0, y: 0, width: 400 }), /line 2 has "日".*wider than one column/);
		assert.throws(() => codeBlock({ lines: ["a 😀"], x: 0, y: 0, width: 400 }), /line 1 has/);
		assert.throws(() => codeBlock({ lines: [" ".repeat(50) + "x"], x: 0, y: 0, width: 300, overflow: "wrap" }), /line 1 is indented 50 columns.*cannot wrap/);
		assert.throws(() => block({ radius: -1 }), /must not be negative/);
	});

	it("counts a tab stop and a run in characters, not UTF-16 units", () => {
		const b = codeBlock({ lines: [["a\tb", "𝒳y"]], x: 0, y: 0, width: 400 });
		assert.equal(b.source[0], "a b𝒳y");
		// One run: an astral character does not start a new one.
		assert.deepEqual(b.rows[0].runs.map((r) => [r.text, r.col]), [["a b𝒳y", 0]]);
	});

	it("refuses undefined roles, non-token roles and line breaks inside a run", () => {
		assert.throws(() => codeBlock({ lines: [[{ text: "a", role: "nope" }]], x: 0, y: 0, width: 400 }), /line 1 uses the role "nope"/);
		assert.throws(() => block({ roles: { keyword: { token: "#ff0000" } } }), /not a style token/);
		assert.throws(() => block({ roles: { keyword: { token: "accent", weight: 5 } } }), /weight/);
		assert.throws(() => codeBlock({ lines: ["a\nb"], x: 0, y: 0, width: 400 }), /line 1 contains a line break/);
		assert.throws(() => codeBlock({ lines: [], x: 0, y: 0, width: 400 }), /at least one line/);
		assert.throws(() => block({ overflow: "scroll" }), /overflow/);
		assert.throws(() => block({ font: "a{b}" }), /font-family/);
	});

	it("maps every default role to a style token", () => {
		for (const role of Object.values(CODE_ROLES)) assert.ok(KIT.TOKENS.includes(role.token));
		assert.ok(CODE_FONT.endsWith("monospace"));
	});
});

describe("moves", () => {
	const b = block();
	const moves = [
		{ lines: [1, 2], start: 0.5, duration: 0.3 },
		{ lines: [4, 4], start: 1.5, duration: 0.5 },
		{ lines: 1, start: 3, duration: 0.5 },
	];

	it("ends when the last move is over, trailing edge included", () => {
		near(codeEnd(b, moves.slice(0, 1)), 0.8);
		near(codeEnd(b, moves.slice(0, 2)), 1.5 + 0.5 + CODE_BAND_LAG);
		near(codeEnd(b, moves), 3 + 0.5 + CODE_BAND_LAG);
	});

	it("refuses moves that overlap, leave the snippet or have no time", () => {
		assert.throws(() => codeEnd(b, [moves[0], { lines: 3, start: 0.7, duration: 0.5 }]), /code move 2 starts at 0.7s, before the move before it is over \(at 0.8s/);
		assert.throws(() => codeEnd(b, [{ lines: [3, 9], start: 0 }]), /inside the snippet's 6 lines/);
		assert.throws(() => codeEnd(b, [{ lines: [3, 2], start: 0 }]), /code move 1/);
		assert.throws(() => codeEnd(b, [{ lines: [1, 2, 3], start: 0 }]), /\[from, to\] pair/);
		assert.throws(() => codeEnd(b, [{ lines: 1, start: -1 }]), /start of 0 or more/);
		assert.throws(() => codeEnd(b, []), /at least one move/);
		assert.throws(() => b.rowSpan(0, 1), RangeError);
	});

	it("has no band before the first move, then fades it in over the first range", () => {
		assert.equal(codeFocus(b, 0.4, moves), null);
		const mid = codeFocus(b, 0.65, moves);
		assert.ok(mid && mid.opacity > 0 && mid.opacity < 1);
		assert.deepEqual([mid?.top, mid?.bottom], b.rowSpan(1, 2));
		assert.deepEqual(codeFocus(b, 0.8, moves), { top: 0, bottom: 2, opacity: 1 });
	});

	it("moves with the leading edge first, going down and going up", () => {
		const down = (/** @type {number} */ t) => /** @type {{ top: number, bottom: number }} */ (codeFocus(b, t, moves));
		const t = 1.5 + 0.2;
		const [fromTop, fromBottom] = [0, 2];
		const [toTop, toBottom] = b.rowSpan(4, 4);
		const d = down(t);
		assert.ok(d.top > fromTop && d.bottom > fromBottom);
		// Going down the bottom edge leads: it has covered more of its way.
		assert.ok((d.bottom - fromBottom) / (toBottom - fromBottom) > (d.top - fromTop) / (toTop - fromTop));
		const up = /** @type {{ top: number, bottom: number }} */ (codeFocus(b, 3.2, moves));
		const [upTop, upBottom] = b.rowSpan(1, 1);
		// Going up the top edge leads.
		assert.ok((3 - up.top) / (3 - upTop) > (4 - up.bottom) / (4 - upBottom));
	});

	it("is at rest on each range once its move is over", () => {
		assert.deepEqual(codeFocus(b, codeEnd(b, moves.slice(0, 2)), moves), { top: 3, bottom: 4, opacity: 1 });
		assert.deepEqual(codeFocus(b, 100, moves), { top: 0, bottom: 1, opacity: 1 });
		// And held, exactly, between moves.
		assert.deepEqual(codeFocus(b, 1.49, moves), codeFocus(b, 1.2, moves));
	});

	it("follows the curve it is given", () => {
		const t = 1.5 + 0.25;
		const a = /** @type {{ bottom: number }} */ (codeFocus(b, t, moves, { ease: linear }));
		const c = /** @type {{ bottom: number }} */ (codeFocus(b, t, moves, { ease: easeStandard }));
		assert.notEqual(a.bottom, c.bottom);
	});
});

describe("drawCode", () => {
	const b = block();
	const moves = [{ lines: [2, 3], start: 0.2, duration: 0.3 }, { lines: 6, start: 1, duration: 0.5 }];
	/** The opacity of each row: 1 when it has none. */
	const brightness = (/** @type {string} */ svg) => [...svg.matchAll(/<g( opacity="([\d.]+)")?><text/g)].map((m) => Number(m[2] ?? 1));

	it("draws the lines in the band at full ink and dims the rest", () => {
		const svg = drawCode(b, codeEnd(b, moves.slice(0, 1)), moves);
		// One group per line: 1 const, 2 if, 3 return, 4 }, 5 (blank, its number only), 6 // done.
		assert.deepEqual(brightness(svg), [0.45, 1, 1, 0.45, 0.45, 0.45]);
		assert.match(svg, /<rect [^>]*fill="var\(--mk-accent\)"[^>]*opacity="0.18"/);
		assert.match(svg, /<rect [^>]*width="3"[^>]*fill="var\(--mk-accent\)"/);
	});

	it("dims every line before the band appears", () => {
		const svg = drawCode(b, 0, moves);
		assert.deepEqual(brightness(svg), [0.45, 0.45, 0.45, 0.45, 0.45, 0.45]);
		assert.doesNotMatch(svg, /--mk-accent/);
	});

	it("lights a line as the band reaches it, and hands the light on", () => {
		const mid = brightness(drawCode(b, 1.3, moves));
		assert.ok(mid.some((o) => o > 0.45 && o < 1), "a line is part-way");
		const done = brightness(drawCode(b, 5, moves));
		assert.deepEqual(done, [0.45, 0.45, 0.45, 0.45, 0.45, 1]);
	});

	it("is deterministic, rounded, and uses tokens only", () => {
		for (const t of [0, 0.35, 1.3, 1.77, 9]) {
			const svg = drawCode(b, t, moves);
			assert.equal(svg, drawCode(b, t, moves));
			assert.equal(findColourLiteral(svg), null);
			assert.doesNotMatch(svg, /\d\.\d{4,}/);
		}
	});

	it("escapes the code and keeps spaces, so the markup stays well-formed", () => {
		const c = codeBlock({ lines: ['<a href="x">&</a>'], x: 0, y: 0, width: 400 });
		const svg = drawCode(c, 0, [{ lines: 1, start: 0 }]);
		assert.ok(svg.includes("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"));
		assert.match(svg, /xml:space="preserve"/);
	});

	it("sets the font on the group, from the option", () => {
		assert.match(drawCode(b, 0, moves), /font-family="ui-monospace/);
		assert.match(drawCode(block({ font: "DejaVu Sans Mono, monospace" }), 0, moves), /font-family="DejaVu Sans Mono, monospace"/);
	});
});

describe("codePairs", () => {
	it("lists the tokens the roles in use and the line numbers set text in, against surface", () => {
		const pairs = codePairs(block());
		assert.deepEqual(pairs.map((p) => `${p.fg}/${p.bg}`), ["ink/surface", "muted/surface", "accent/surface", "line/bg"]);
		assert.equal(pairs.find((p) => p.fg === "muted")?.min, 4.5);
		assert.equal(pairs.find((p) => p.fg === "accent")?.min, 3);
	});

	it("passes the neutral style in both themes, and fails a role set in a token that does not read on surface", () => {
		assert.deepEqual(contrastReport("neutral", codePairs(block())).problems, []);
		const risky = codeBlock({ lines: [[{ text: "if", role: "keyword" }]], x: 0, y: 0, width: 400, roles: { keyword: { token: "emphasis" } } });
		const { problems } = contrastReport("neutral", codePairs(risky));
		assert.ok(problems.some((p) => /emphasis on surface/.test(p)), problems.join("\n"));
	});

	it("leaves out the tokens no role uses", () => {
		const plain = codeBlock({ lines: ["a"], x: 0, y: 0, width: 400, lineNumbers: false });
		assert.deepEqual(codePairs(plain).map((p) => p.fg), ["ink", "accent", "line"]);
	});
});

describe("the code-steps example", () => {
	it("passes the gate in every format and both locales", async () => {
		for (const format of Object.keys(FORMATS)) {
			for (const locale of ["en", "nl"]) {
				const { scene } = await loadScene(EXAMPLE, { format, locale });
				const r = checkScene(scene);
				assert.ok(r.ok, `${format} ${locale}: ${r.problems.join("; ")}`);
			}
		}
	});

	it("highlights three line ranges, one per step, at rest at each step", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		assert.equal(scene.steps.length, 3);
		const lit = scene.steps.map((s) => {
			const svg = renderSvg(scene, s.at, { style: "neutral" });
			return [...svg.matchAll(/<g( opacity="[\d.]+")?><text/g)].map((m) => !m[1]);
		});
		const ranges = [[3, 5], [6, 8], [10, 10]];
		for (const [i, [from, to]] of ranges.entries()) {
			// Rows are the lines, one each at this width; line numbers come first in each row.
			const rows = lit[i];
			assert.equal(rows.length, 11);
			rows.forEach((full, n) => assert.equal(full, n + 1 >= from && n + 1 <= to, `step ${i + 1}, line ${n + 1}`));
		}
	});

	it("holds one range per step and plays once within the limit", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "en" });
		assert.ok(scene.duration <= 8);
		assert.equal(renderSvg(scene, scene.duration + 3), renderSvg(scene, scene.duration));
		const ctx = { idPrefix: "x", style: normalizeStyle() };
		assert.equal(scene.frame(scene.duration + 3, ctx), scene.frame(scene.duration, ctx));
	});

	it("gives the code's text to the description and each step's range to its detail", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "16:9", locale: "nl" });
		for (const line of ["async function load(url) {", 'throw new Error("gave up");', "// retry a flaky request"]) assert.ok(scene.description.includes(line), line);
		assert.match(scene.steps[0].detail ?? "", /regels 3–5/);
		assert.ok(scene.steps[0].detail?.includes("return await fetch(url);"));
		assert.ok(scene.steps[2].detail?.includes('throw new Error("gave up");'));
	});

	it("wraps in a phone column instead of failing", async () => {
		const { scene } = await loadScene(EXAMPLE, { format: "tall", locale: "en" });
		assert.equal(scene.width, 360);
		const rows = (/** @type {string} */ svg) => (svg.match(/xml:space="preserve"/g) ?? []).length;
		const wide = (await loadScene(EXAMPLE, { format: "16:9", locale: "en" })).scene;
		assert.equal(rows(renderSvg(wide, wide.duration)), 11);
		assert.ok(rows(renderSvg(scene, scene.duration)) > 11, "the longest lines wrapped");
	});

	it("fails construction with a message that names the line, when the snippet is too long for a format", async () => {
		// The example's options take no snippet; the same block, built for the narrowest format, is what fails.
		const wide = ["x".repeat(30), "x".repeat(44)];
		const { width } = FORMATS.tall;
		assert.throws(
			() => codeBlock({ lines: wide, x: 16, y: 16, width: width - 32 }),
			/line 2 is 44 columns wide, and the block fits \d+ .*Shorten the line.*wider format/,
		);
	});
});

describe("codeBlock input hardening", () => {
	it("refuses combining marks and characters XML cannot hold, naming the line", () => {
		assert.throws(() => codeBlock({ lines: ["ok", "e\u0301"], x: 0, y: 0, width: 400 }), /line 2 has U\+0301/);
		assert.throws(() => codeBlock({ lines: ["a\u0000b"], x: 0, y: 0, width: 400 }), /line 1 has the character U\+0000/);
		assert.throws(() => codeBlock({ lines: ["a\u000Bb"], x: 0, y: 0, width: 400 }), /U\+000B/);
	});

	it("refuses bidi marks and other invisible format controls", () => {
		for (const c of ["\u200E", "\u200F", "\u061C", "\u202A", "\u202E", "\u2066", "\u2069", "\u00AD", "\u180E", "\u{E0041}"]) {
			assert.throws(() => codeBlock({ lines: [`a${c}b`], x: 0, y: 0, width: 400 }), /combining or zero-width/, c.charCodeAt(0).toString(16));
		}
		assert.doesNotThrow(() => codeBlock({ lines: ["a b"], x: 0, y: 0, width: 400 }));
	});

	it("copies roles declared on a prototype", () => {
		const role = Object.create({ token: "ink", weight: 700, italic: true });
		const b = codeBlock({ lines: [[{ text: "x", role: "mine" }]], x: 0, y: 0, width: 400, roles: { mine: role } });
		assert.deepEqual({ ...b.roles.mine }, { token: "ink", weight: 700, italic: true });
		assert.doesNotThrow(() => drawCode(b, 1, [{ lines: 1, start: 0 }]));
	});

	it("keeps its own copy of the roles", () => {
		const role = { token: "ink" };
		const b = codeBlock({ lines: [[{ text: "x", role: "mine" }]], x: 0, y: 0, width: 400, roles: { mine: role } });
		const before = drawCode(b, 1, [{ lines: 1, start: 0 }]);
		role.token = "nope";
		assert.equal(drawCode(b, 1, [{ lines: 1, start: 0 }]), before);
	});

	it("takes its line count once, at construction", () => {
		const lines = ["a", "b", "c"];
		const b = codeBlock({ lines, x: 0, y: 0, width: 400 });
		lines.length = 0;
		assert.deepEqual(b.rowSpan(1, 3), [0, 3]);
		lines.push("a", "b", "c", "d");
		assert.throws(() => b.rowSpan(1, 4), RangeError);
	});

	it("refuses a font with an XML-invalid character", () => {
		assert.throws(() => block({ font: "Mono\u0000" }), /font/);
	});

	it("names no quoted family in the default stack", () => {
		assert.ok(!CODE_FONT.includes('"') && !CODE_FONT.includes("'"));
	});

	it("keeps code that looks like a token as written in a standalone SVG", () => {
		const b = codeBlock({ lines: ["color: var(--mk-accent)"], x: 0, y: 0, width: 400 });
		const scene = { id: "s", title: "t", description: b.text, width: 400, height: 100, duration: 1, steps: [], frame: () => drawCode(b, 0, [{ lines: [1, 1], start: 0 }]) };
		const svg = renderSvg(scene, 1, { standalone: true });
		assert.match(svg.split("</desc>")[1], /<tspan[^>]*>color: var\(--mk-accent\)<\/tspan>/);
		const odd = codeBlock({ lines: ["var(--mk-nope)"], x: 0, y: 0, width: 400 });
		const s2 = { ...scene, frame: () => drawCode(odd, 0, [{ lines: [1, 1], start: 0 }]) };
		assert.match(renderSvg(s2, 1, { standalone: true }).split("</desc>")[1], />var\(--mk-nope\)</);
	});

	it("keeps the band's marker off the code", () => {
		assert.throws(() => block({ padding: 0 }), /padding.*at least 10/);
	});
});

describe("kit", () => {
	it("hands the code parts to custom scenes", () => {
		for (const name of ["codeBlock", "drawCode", "codeEnd", "codeFocus", "codePairs", "CODE_ROLES", "CODE_FONT", "CODE_BAND_LAG"]) assert.ok(name in KIT, name);
	});
});
