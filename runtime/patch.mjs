// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · update rendered SVG in place (browser; the parser runs anywhere).
 *
 *   patchMarkup(parent, markup) → true when updated in place, false when it fell back to innerHTML
 *
 * The live player draws each frame by handing the frame's markup to
 * patchMarkup instead of assigning innerHTML. Nodes that persist between
 * frames are kept; only changed attributes and text are written; nodes are
 * added or removed only where the markup's structure changes. The browser
 * then restyles and lays out what changed, and hover and other node state
 * survive.
 *
 * Children are matched by position: a child whose tag differs from the one
 * drawn before is replaced with its subtree, and a child whose markup is
 * byte-identical to the one drawn before is not visited at all.
 *
 * The parser takes the markup scenes emit (one or more `<svg>` elements;
 * double-quoted attributes; text with the entities `esc()` writes and numeric
 * ones) and builds the nodes the HTML parser would build from the same string:
 * names lowercased then SVG-cased, `xlink:`/`xml:`/`xmlns` attributes in their
 * namespaces. Anything else (comments, CDATA, single-quoted or bare
 * attributes, named entities beyond the XML five, elements inside `<title>`,
 * `<desc>` or `<foreignObject>`, HTML elements that leave SVG) is left to the
 * HTML parser: patchMarkup then assigns innerHTML for that call.
 *
 * The patch owns the parent's content: change it only through patchMarkup. If
 * the parent's children were replaced by other code, the next call rebuilds.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** @param {string} names @returns {Map<string, string>} lowercased → SVG-cased */
const caseMap = (names) => new Map(names.split(" ").map((n) => [n.toLowerCase(), n]));

// The HTML parser's "adjust SVG tag names" and "adjust SVG attributes" tables.
const SVG_TAGS = caseMap(
	"altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer " +
		"feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR " +
		"feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence " +
		"foreignObject glyphRef linearGradient radialGradient textPath",
);
const SVG_ATTRS = caseMap(
	"attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits diffuseConstant edgeMode filterUnits glyphRef " +
		"gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle " +
		"markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform " +
		"patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur " +
		"requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles " +
		"surfaceScale systemLanguage tableValues targetX targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan",
);
/** The HTML parser's "adjust foreign attributes": name → [namespace, local name]. @type {Map<string, [string, string]>} */
const FOREIGN_ATTRS = new Map([
	...["actuate", "arcrole", "href", "role", "show", "title", "type"].map((n) => /** @type {[string, [string, string]]} */ ([`xlink:${n}`, [XLINK_NS, n]])),
	["xml:lang", [XML_NS, "lang"]],
	["xml:space", [XML_NS, "space"]],
	["xmlns", [XMLNS_NS, "xmlns"]],
	["xmlns:xlink", [XMLNS_NS, "xlink"]],
]);
// Start tags that take the HTML parser out of SVG, and the SVG elements whose
// child elements it parses as HTML.
const LEAVES_SVG = new Set(
	"b big blockquote body br center code dd div dl dt em embed font h1 h2 h3 h4 h5 h6 head hr i img li listing math menu meta nobr ol p pre ruby s small span strike strong sub sup table tt u ul var".split(" "),
);
const HTML_INSIDE = new Set(["title", "desc", "foreignObject"]);

// Whitespace is the HTML parser's: tab, line feed, form feed, space.
const TAG = /<(\/?)([A-Za-z][^\t\n\f />]*)((?:[\t\n\f ]+[^\t\n\f "'<>/=]+="[^"]*")*)[\t\n\f ]*(\/?)>/y;
const ATTR = /([^\t\n\f "'<>/=]+)="([^"]*)"/g;
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));|&/g;
const NAMED = /** @type {Record<string, string>} */ ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" });

/**
 * One parsed node. Elements have a tag, attributes as a flat
 * `[name, value, …]` list and children; text nodes have the tag `#text` and
 * their decoded `text`. `src` is the node's own markup; `dom` the live node
 * once drawn.
 * @typedef {{ tag: string, attrs: string[], kids: MarkupNode[], src: string, text: string, dom: Node | null }} MarkupNode
 */

// Shared empty lists: a node's attributes when it has none, and a text node's
// children (never patched).
/** @type {string[]} */
const NO_ATTRS = [];
/** @type {MarkupNode[]} */
const NO_KIDS = [];

/** Decode entities as the HTML parser does; null for an `&` it might read differently. @param {string} s */
function decode(s) {
	if (!s.includes("&")) return s;
	let ok = true;
	const out = s.replace(ENTITY, (m, dec, hex, name) => {
		if (name) return NAMED[name];
		const cp = dec ? Number(dec) : hex ? parseInt(hex, 16) : -1;
		// Code points the HTML parser remaps or rejects are left to it.
		if (cp < 0x20 ? cp !== 9 && cp !== 10 : (cp >= 0x7f && cp <= 0x9f) || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) ok = false;
		return ok ? String.fromCodePoint(cp) : m;
	});
	return ok ? out : null;
}

/** @param {string} s */
function parseAttrs(s) {
	/** @type {string[]} */
	const attrs = [];
	for (const m of s.matchAll(ATTR)) {
		const lower = m[1].toLowerCase();
		const name = SVG_ATTRS.get(lower) ?? lower;
		const value = decode(m[2]);
		if (value === null) return null;
		// The HTML parser keeps the first of a repeated attribute.
		if (find(attrs, name) < 0) attrs.push(name, value);
	}
	return attrs;
}

/**
 * Parse markup into nodes, or return null when it is outside the subset this
 * module reproduces exactly (see the module comment). Exported for tests.
 * @param {string} markup
 * @returns {MarkupNode[] | null}
 */
export function parseMarkup(markup) {
	if (/[\r\0]/.test(markup)) return null;
	/** @type {MarkupNode[]} */
	const root = [];
	/** @type {MarkupNode[]} */
	const open = [];
	/** @type {number[]} */
	const starts = [];
	let kids = root;
	let pos = 0;
	while (pos < markup.length) {
		if (markup.charCodeAt(pos) !== 60 /* < */) {
			let end = markup.indexOf("<", pos);
			if (end < 0) end = markup.length;
			const src = markup.slice(pos, end);
			const text = decode(src);
			if (text === null) return null;
			kids.push({ tag: "#text", attrs: NO_ATTRS, kids: NO_KIDS, src, text, dom: null });
			pos = end;
			continue;
		}
		TAG.lastIndex = pos;
		const m = TAG.exec(markup);
		if (!m) return null;
		const lower = m[2].toLowerCase();
		const tag = SVG_TAGS.get(lower) ?? lower;
		if (m[1]) {
			if (m[3] || m[4]) return null;
			const el = open.pop();
			if (!el || el.tag !== tag) return null;
			el.src = markup.slice(/** @type {number} */ (starts.pop()), TAG.lastIndex);
			kids = open.length ? open[open.length - 1].kids : root;
		} else {
			const parent = open[open.length - 1];
			if (parent ? HTML_INSIDE.has(parent.tag) || LEAVES_SVG.has(tag) : tag !== "svg") return null;
			const attrs = m[3] ? parseAttrs(m[3]) : NO_ATTRS;
			if (!attrs) return null;
			/** @type {MarkupNode} */
			const el = { tag, attrs, kids: [], src: m[0], text: "", dom: null };
			kids.push(el);
			if (!m[4]) {
				open.push(el);
				starts.push(pos);
				kids = el.kids;
			}
		}
		pos = TAG.lastIndex;
	}
	return open.length ? null : root;
}

/** @param {Element} el @param {string} name @param {string} value */
function setAttr(el, name, value) {
	const f = FOREIGN_ATTRS.get(name);
	if (f) el.setAttributeNS(f[0], name, value);
	else el.setAttribute(name, value);
}

/** @param {Element} el @param {string} name */
function removeAttr(el, name) {
	const f = FOREIGN_ATTRS.get(name);
	if (f) el.removeAttributeNS(f[0], f[1]);
	else el.removeAttribute(name);
}

/** Write the attributes that changed. @param {Element} el @param {string[]} from @param {string[]} to */
function patchAttrs(el, from, to) {
	let same = from.length === to.length;
	for (let i = 0; same && i < to.length; i += 2) same = from[i] === to[i];
	if (same) {
		// Same names in the same order: the usual case for an animated element.
		for (let i = 1; i < to.length; i += 2) if (from[i] !== to[i]) setAttr(el, to[i - 1], to[i]);
		return;
	}
	for (let i = 0; i < from.length; i += 2) if (find(to, from[i]) < 0) removeAttr(el, from[i]);
	for (let i = 0; i < to.length; i += 2) {
		const j = find(from, to[i]);
		if (j < 0 || from[j + 1] !== to[i + 1]) setAttr(el, to[i], to[i + 1]);
	}
}

/** Index of an attribute's name in a flat `[name, value, …]` list, or -1. @param {string[]} attrs @param {string} name */
function find(attrs, name) {
	for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === name) return i;
	return -1;
}

/** Build a node's subtree, detached. @param {Document} doc @param {MarkupNode} node @returns {Node} */
function create(doc, node) {
	if (node.tag === "#text") return (node.dom = doc.createTextNode(node.text));
	const el = doc.createElementNS(SVG_NS, node.tag);
	for (let i = 0; i < node.attrs.length; i += 2) setAttr(el, node.attrs[i], node.attrs[i + 1]);
	for (const kid of node.kids) el.appendChild(create(doc, kid));
	return (node.dom = el);
}

/**
 * Make `parent`'s children, drawn from `from`, match `to`. Children of `to`
 * whose markup did not change are replaced by their `from` node, which keeps
 * its live node and its children.
 * @param {Document} doc @param {Node} parent @param {MarkupNode[]} from @param {MarkupNode[]} to
 */
function patchKids(doc, parent, from, to) {
	for (let i = 0; i < to.length; i++) {
		const next = to[i];
		const prev = from[i];
		if (!prev) {
			parent.appendChild(create(doc, next));
		} else if (prev.src === next.src) {
			to[i] = prev;
		} else if (prev.tag !== next.tag) {
			parent.replaceChild(create(doc, next), /** @type {Node} */ (prev.dom));
		} else if (next.tag === "#text") {
			next.dom = prev.dom;
			if (prev.text !== next.text) /** @type {Text} */ (next.dom).data = next.text;
		} else {
			const el = /** @type {Element} */ (prev.dom);
			next.dom = el;
			patchAttrs(el, prev.attrs, next.attrs);
			patchKids(doc, el, prev.kids, next.kids);
		}
	}
	for (let i = from.length - 1; i >= to.length; i--) parent.removeChild(/** @type {Node} */ (from[i].dom));
}

/** What each parent shows: its nodes and the markup they came from. @type {WeakMap<Node, { kids: MarkupNode[], markup: string }>} */
const drawn = new WeakMap();

/** Whether the parent still holds exactly the nodes drawn last time. @param {Node} parent @param {MarkupNode[]} kids */
function intact(parent, kids) {
	const nodes = parent.childNodes;
	if (nodes.length !== kids.length) return false;
	for (let i = 0; i < kids.length; i++) if (nodes[i] !== kids[i].dom) return false;
	return true;
}

/**
 * Show `markup` in `parent`, updating the nodes already there instead of
 * replacing them. The result is the DOM `parent.innerHTML = markup` would
 * build. Falls back to that assignment when the markup is outside the subset
 * described in the module comment.
 * @param {Element} parent an HTML element whose content only patchMarkup changes
 * @param {string} markup one frame's SVG markup (renderSvg output)
 * @returns {boolean} true when the DOM was updated in place, false when innerHTML was assigned
 */
export function patchMarkup(parent, markup) {
	const last = drawn.get(parent);
	const kept = last !== undefined && intact(parent, last.kids);
	if (kept && last.markup === markup) return true;
	const kids = parseMarkup(markup);
	if (kids) {
		const doc = /** @type {Document} */ (parent.ownerDocument);
		try {
			if (kept) patchKids(doc, parent, last.kids, kids);
			else {
				parent.textContent = "";
				for (const kid of kids) parent.appendChild(create(doc, kid));
			}
			drawn.set(parent, { kids, markup });
			return true;
		} catch (e) {
			// A name the DOM refuses (createElementNS, setAttribute) but the HTML
			// parser accepts: let it decide. Anything else is a bug; surface it.
			// A DOMException, possibly from another realm (an iframe's document).
			const name = typeof e === "object" && e !== null && "name" in e ? e.name : "";
			if (name !== "InvalidCharacterError" && name !== "NamespaceError") throw e;
		}
	}
	drawn.delete(parent);
	parent.innerHTML = markup;
	return false;
}
