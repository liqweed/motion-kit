import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMarkup, patchMarkup } from "../runtime/patch.mjs";

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

/** A small DOM that counts writes: enough for patchMarkup. */
function makeDocument() {
	const writes = { attrs: 0, texts: 0, created: 0, removed: 0, html: 0 };
	class Text {
		constructor(data) { this.nodeType = 3; this._data = data; this.parentNode = null; writes.created++; }
		get data() { return this._data; }
		set data(v) { this._data = v; writes.texts++; }
	}
	class Element {
		constructor(ns, tag) {
			this.nodeType = 1;
			this.namespaceURI = ns;
			this.localName = tag;
			this.ownerDocument = doc;
			this.childNodes = [];
			this.parentNode = null;
			/** @type {Map<string, { ns: string | null, value: string }>} */
			this.attrs = new Map();
			writes.created++;
		}
		set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = v ? [new Text(v)] : []; }
		set innerHTML(v) { writes.html++; this.childNodes = []; this.html = v; }
		appendChild(c) { c.parentNode?.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
		removeChild(c) { const i = this.childNodes.indexOf(c); assert.ok(i >= 0, "removeChild: not a child"); this.childNodes.splice(i, 1); c.parentNode = null; writes.removed++; return c; }
		replaceChild(c, old) { const i = this.childNodes.indexOf(old); assert.ok(i >= 0, "replaceChild: not a child"); this.childNodes[i] = c; c.parentNode = this; old.parentNode = null; writes.removed++; return old; }
		setAttribute(k, v) { if (/[\s"]/.test(k)) throw Object.assign(new Error("invalid name"), { name: "InvalidCharacterError" }); this.attrs.set(k, { ns: null, value: String(v) }); writes.attrs++; }
		setAttributeNS(ns, k, v) { this.attrs.set(k, { ns, value: String(v) }); writes.attrs++; }
		removeAttribute(k) { this.attrs.delete(k); writes.attrs++; }
		removeAttributeNS(ns, local) {
			for (const [k, a] of this.attrs) if (a.ns === ns && k.split(":").pop() === local) this.attrs.delete(k);
			writes.attrs++;
		}
		getAttribute(k) { return this.attrs.get(k)?.value ?? null; }
	}
	const doc = {
		createElementNS: (ns, tag) => {
			if (!/^[A-Za-z][\w.-]*$/.test(tag)) throw Object.assign(new Error("invalid name"), { name: "InvalidCharacterError" });
			return new Element(ns, tag);
		},
		createTextNode: (data) => new Text(data),
	};
	const host = new Element("http://www.w3.org/1999/xhtml", "div");
	writes.created = 0;
	// The fake stands in for a DOM Element; its type is not the DOM's.
	return { doc, host: /** @type {any} */ (host), writes, reset: () => Object.keys(writes).forEach((k) => (writes[k] = 0)) };
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
/** The DOM as markup, attributes sorted, empty elements self-closed. */
function serialize(node) {
	if (node.nodeType === 3) return esc(node.data);
	const attrs = [...node.attrs].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, a]) => ` ${k}="${esc(a.value)}"`).join("");
	const inner = node.childNodes.map(serialize).join("");
	return inner ? `<${node.localName}${attrs}>${inner}</${node.localName}>` : `<${node.localName}${attrs}/>`;
}
/** Markup in the same canonical form. */
const canonical = (markup) =>
	markup
		.replace(/<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g, (_m, tag, attrs, self) => {
			const list = [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => ` ${a[1]}="${a[2]}"`).sort();
			return `<${tag}${list.join("")}${self ? "/" : ""}>`;
		})
		.replace(/<([\w:-]+)([^<>]*)><\/\1>/g, "<$1$2/>");
const shown = (host) => host.childNodes.map(serialize).join("");

describe("parseMarkup", () => {
	it("decodes text and attributes, keeps tspans, and records each element's markup", () => {
		const src = `<svg viewBox="0 0 10 10"><text x="1" data-l="a &amp; &quot;b&quot;">Tom &amp; Jerry&#39;s &lt;3 &#233;&#x1F600;<tspan dy="2">two</tspan></text></svg>`;
		const [svg] = /** @type {any} */ (parseMarkup(src));
		assert.equal(svg.tag, "svg");
		assert.equal(svg.src, src);
		const textEl = svg.kids[0];
		assert.deepEqual(textEl.attrs, ["x", "1", "data-l", 'a & "b"']);
		assert.equal(textEl.kids[0].text, "Tom & Jerry's <3 é😀");
		assert.equal(textEl.kids[1].tag, "tspan");
		assert.equal(textEl.kids[1].src, `<tspan dy="2">two</tspan>`);
	});

	it("names elements and attributes as the HTML parser does", () => {
		const [svg] = /** @type {any} */ (parseMarkup(`<SVG VIEWBOX="0 0 1 1" xmlns:xlink="x"><LinearGradient GRADIENTUNITS="userSpaceOnUse" x="1" X="2"/><use xlink:href="#a" xml:space="preserve"/></SVG>`));
		assert.equal(svg.tag, "svg");
		assert.deepEqual(svg.attrs, ["viewBox", "0 0 1 1", "xmlns:xlink", "x"]);
		assert.equal(svg.kids[0].tag, "linearGradient");
		// Repeated attribute: the first wins.
		assert.deepEqual(svg.kids[0].attrs, ["gradientUnits", "userSpaceOnUse", "x", "1"]);
		assert.deepEqual(svg.kids[1].attrs, ["xlink:href", "#a", "xml:space", "preserve"]);
	});

	it("returns null for markup the HTML parser may read differently", () => {
		for (const markup of [
			`<svg><!-- c --></svg>`,
			`<svg><![CDATA[x]]></svg>`,
			`<svg><rect x='1'/></svg>`,
			`<svg><rect hidden/></svg>`,
			`<svg><text>&nbsp;</text></svg>`,
			`<svg><text>a & b</text></svg>`,
			`<svg><text>&#128;</text></svg>`,
			`<svg><text>&#0;</text></svg>`,
			`<svg><title><b>x</b></title></svg>`,
			`<svg><foreignObject><div>x</div></foreignObject></svg>`,
			`<svg><g><div/></g></svg>`,
			`<svg><g></svg>`,
			`<svg><g></g>`,
			`<svg></g></svg>`,
			`<div><svg/></div>`,
			`<svg>\r\n</svg>`,
			`<svg>a < b</svg>`,
		])
			assert.equal(parseMarkup(markup), null, markup);
	});
});

describe("patchMarkup", () => {
	const frame = (x, label, extra = "") =>
		`<svg viewBox="0 0 100 100"><title id="p-title">T</title><g transform="translate(${x} 0)"><rect width="10" height="10" fill="var(--mk-accent)"/><text x="5">${label}</text></g>${extra}</svg>`;

	it("builds the frame, then writes only the attributes and text that changed", () => {
		const { doc, host, writes, reset } = makeDocument();
		assert.equal(patchMarkup(host, frame(0, "A")), true);
		assert.equal(shown(host), canonical(frame(0, "A")));
		assert.equal(host.childNodes[0].namespaceURI, SVG);
		const [svg] = host.childNodes;
		const [, g] = svg.childNodes;
		const [rect, label] = g.childNodes;
		reset();
		patchMarkup(host, frame(5, "B"));
		assert.equal(shown(host), canonical(frame(5, "B")));
		assert.deepEqual(writes, { attrs: 1, texts: 1, created: 0, removed: 0, html: 0 });
		// The same nodes, updated.
		assert.equal(host.childNodes[0], svg);
		assert.equal(svg.childNodes[1], g);
		assert.equal(g.childNodes[0], rect);
		assert.equal(g.childNodes[1], label);
		reset();
		patchMarkup(host, frame(5, "B"));
		assert.deepEqual(writes, { attrs: 0, texts: 0, created: 0, removed: 0, html: 0 });
		assert.equal(doc.createElementNS(SVG, "g").namespaceURI, SVG);
	});

	it("adds, removes and replaces nodes where the structure changes", () => {
		const { host, writes, reset } = makeDocument();
		patchMarkup(host, frame(0, "A"));
		const svg = host.childNodes[0];
		const title = svg.childNodes[0];
		reset();
		patchMarkup(host, frame(0, "A", `<circle r="2"/><path d="M0 0"/>`));
		assert.equal(shown(host), canonical(frame(0, "A", `<circle r="2"/><path d="M0 0"/>`)));
		assert.equal(writes.removed, 0);
		// A different tag at a position replaces that subtree; extra old nodes go.
		patchMarkup(host, frame(0, "A", `<line x1="1"/>`));
		assert.equal(shown(host), canonical(frame(0, "A", `<line x1="1"/>`)));
		patchMarkup(host, `<svg viewBox="0 0 100 100"><title id="p-title">T</title>text<g fill="x" opacity="0.5"/></svg>`);
		assert.equal(shown(host), canonical(`<svg viewBox="0 0 100 100"><title id="p-title">T</title>text<g fill="x" opacity="0.5"/></svg>`));
		assert.equal(host.childNodes[0], svg);
		assert.equal(svg.childNodes[0], title);
		// Attribute sets that differ: added, changed and removed by name.
		patchMarkup(host, `<svg viewBox="0 0 100 100"><title id="p-title">T</title>text<g opacity="fill" stroke="y"/></svg>`);
		assert.equal(shown(host), canonical(`<svg viewBox="0 0 100 100"><title id="p-title">T</title>text<g opacity="fill" stroke="y"/></svg>`));
	});

	it("puts xlink, xml and xmlns attributes in their namespaces", () => {
		const { host } = makeDocument();
		patchMarkup(host, `<svg xmlns="${SVG}"><use xlink:href="#a"/></svg>`);
		const use = host.childNodes[0].childNodes[0];
		assert.equal(use.attrs.get("xlink:href").ns, XLINK);
		assert.equal(host.childNodes[0].attrs.get("xmlns").ns, "http://www.w3.org/2000/xmlns/");
		patchMarkup(host, `<svg xmlns="${SVG}"><use/></svg>`);
		assert.equal(use.attrs.size, 0);
	});

	it("falls back to innerHTML outside its subset, and rebuilds after another writer", () => {
		const { host, writes, reset } = makeDocument();
		assert.equal(patchMarkup(host, `<svg><!-- x --></svg>`), false);
		assert.equal(host.html, `<svg><!-- x --></svg>`);
		assert.equal(writes.html, 1);
		assert.equal(patchMarkup(host, frame(0, "A")), true);
		assert.equal(shown(host), canonical(frame(0, "A")));
		// A name the DOM refuses: the HTML parser decides.
		reset();
		assert.ok(parseMarkup(`<svg><g!/></svg>`));
		assert.equal(patchMarkup(host, `<svg><g!/></svg>`), false);
		assert.equal(writes.html, 1);
		patchMarkup(host, frame(0, "A"));
		// Content replaced behind the patch's back: build afresh, not patch stale nodes.
		host.innerHTML = "<p>other</p>";
		assert.equal(patchMarkup(host, frame(0, "A")), true);
		assert.equal(shown(host), canonical(frame(0, "A")));
	});
});
