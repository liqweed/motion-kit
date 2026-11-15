/**
 * motion-kit · label wrapping.
 *
 * SVG text does not wrap, so every layout declares a character budget. Labels
 * break at spaces and after a slash ("Archive/Dispose" → "Archive/", "Dispose").
 * Overflow throws, so a long translation fails the checks instead of spilling
 * out of its box. Budget for Dutch/German being ~30 % longer than English.
 */
export function wrapLabel(label, maxChars, maxLines = 2) {
	const tokens = String(label)
		.split(/\s+/)
		.filter(Boolean)
		// A standalone separator ("A / B", "A – B") sticks to the word before it,
		// so no line ever starts with "/" or "–".
		.reduce((acc, w) => {
			if (/^[\/–—&+|]$/.test(w) && acc.length) acc[acc.length - 1] += ` ${w}`;
			else acc.push(w);
			return acc;
		}, [])
		.flatMap((word) => word.split(/(?<=\/)(?=[^\s])/).map((part, i) => ({ part, space: i === 0 })));
	const lines = [];
	let cur = "";
	for (const { part, space } of tokens) {
		if (part.length > maxChars) throw new Error(`label "${label}": "${part}" is longer than ${maxChars} characters`);
		const joined = cur === "" ? part : `${cur}${space ? " " : ""}${part}`;
		if (joined.length <= maxChars) cur = joined;
		else {
			lines.push(cur);
			cur = part;
		}
	}
	if (cur) lines.push(cur);
	if (lines.length > maxLines) {
		throw new Error(`label "${label}" needs ${lines.length} lines at ${maxChars} chars; the layout allows ${maxLines}`);
	}
	return lines;
}

/** Rough rendered width of a line, in px, for a sans-serif face. */
export function estimateWidth(line, fontSize) {
	return line.length * fontSize * 0.56;
}
