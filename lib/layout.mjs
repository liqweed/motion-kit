// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ophir Radnitz
/**
 * motion-kit · layered graph layout, run once at build time (Node).
 *
 *   layered(nodeIds, edges) → { ranks: Map<id, number>, pos: Map<id, number>, via: [rank, pos][][] }
 *
 * A small Sugiyama layout with no dependencies and no randomness, so the same
 * graph always gets the same coordinates:
 *
 * 1. Cycles are broken by reversing the edges a depth-first search (in
 *    declaration order) finds going back to a node still on its stack.
 * 2. Ranks: longest path from the sources, then every node that is not a
 *    source moves as close to its successors as its predecessors allow.
 * 3. Edges spanning more than one rank get a waypoint on every rank between.
 * 4. Order within a rank: barycenter sweeps down and up, keeping the order with
 *    the fewest crossings; ties keep declaration order.
 * 5. Positions: each rank is placed as close as possible to the mean position
 *    of its neighbours, with a minimum gap (1 between nodes, less next to and
 *    between waypoints), by isotonic regression. Positions start at 0.
 *
 * The scene type maps ranks and positions to pixels per format; it never lays
 * the graph out itself. Positions are in node pitches; ranks are integers.
 */

const GAP_NODE = 1;
const GAP_MIXED = 0.75;
const GAP_VIA = 0.4;
const SWEEPS = 12;
const PLACE_ROUNDS = 8;

/**
 * @typedef {{ from: string, to: string }} LayoutEdge
 * @typedef {{ ranks: Map<string, number>, pos: Map<string, number>, via: [number, number][][] }} Layout
 */

/**
 * @param {string[]} nodeIds in declaration order
 * @param {LayoutEdge[]} edges no self-loops
 * @returns {Layout}
 */
export function layered(nodeIds, edges) {
	const index = new Map(nodeIds.map((id, i) => [id, i]));
	const n = nodeIds.length;
	for (const e of edges) {
		if (!index.has(e.from) || !index.has(e.to)) throw new Error(`layout: edge ${e.from} → ${e.to} names an unknown node`);
		if (e.from === e.to) throw new Error(`layout: self-loop on ${e.from}`);
	}

	// 1. Break cycles: reverse back edges found by a DFS in declaration order.
	const out = nodeIds.map(() => /** @type {number[]} */ ([]));
	edges.forEach((e, i) => out[/** @type {number} */ (index.get(e.from))].push(i));
	const state = new Array(n).fill(0); // 0 new, 1 on stack, 2 done
	const reversed = new Set();
	/** @param {number} v */
	const visit = (v) => {
		state[v] = 1;
		for (const ei of out[v]) {
			const w = /** @type {number} */ (index.get(edges[ei].to));
			if (state[w] === 1) reversed.add(ei);
			else if (state[w] === 0) visit(w);
		}
		state[v] = 2;
	};
	for (let v = 0; v < n; v++) if (state[v] === 0) visit(v);
	// Directed, acyclic edges as [tail, head] node indices.
	const dag = edges.map((e, i) => {
		const a = /** @type {number} */ (index.get(e.from));
		const b = /** @type {number} */ (index.get(e.to));
		return reversed.has(i) ? [b, a] : [a, b];
	});

	// 2. Ranks: longest path, then pull nodes down toward their successors.
	const preds = nodeIds.map(() => /** @type {number[]} */ ([]));
	const succs = nodeIds.map(() => /** @type {number[]} */ ([]));
	for (const [a, b] of dag) {
		preds[b].push(a);
		succs[a].push(b);
	}
	const rank = new Array(n).fill(-1);
	/** @param {number} v @returns {number} */
	const rankOf = (v) => {
		if (rank[v] < 0) rank[v] = preds[v].length ? Math.max(...preds[v].map(rankOf)) + 1 : 0;
		return rank[v];
	};
	for (let v = 0; v < n; v++) rankOf(v);
	for (let changed = true; changed;) {
		changed = false;
		for (let v = n - 1; v >= 0; v--) {
			if (!preds[v].length || !succs[v].length) continue;
			const best = Math.min(...succs[v].map((w) => rank[w])) - 1;
			if (best > rank[v]) {
				rank[v] = best;
				changed = true;
			}
		}
	}

	// 3. Chains of waypoints for edges that span ranks. Items: real nodes are
	//    0..n-1; waypoints follow. Each item has a rank.
	/** @type {{ rank: number, node: boolean }[]} */
	const items = rank.map((r) => ({ rank: r, node: true }));
	/** @type {[number, number][]} */
	const links = [];
	/** @type {number[][]} */
	const chains = dag.map(([a, b]) => {
		const chain = [];
		let prev = a;
		for (let r = rank[a] + 1; r < rank[b]; r++) {
			const id = items.length;
			items.push({ rank: r, node: false });
			links.push([prev, id]);
			chain.push(id);
			prev = id;
		}
		links.push([prev, b]);
		return chain;
	});
	const R = Math.max(...rank) + 1;
	const up = items.map(() => /** @type {number[]} */ ([]));
	const down = items.map(() => /** @type {number[]} */ ([]));
	for (const [a, b] of links) {
		down[a].push(b);
		up[b].push(a);
	}

	// 4. Order within ranks: barycenter sweeps, keep the fewest crossings.
	/** @type {number[][]} */
	let layers = Array.from({ length: R }, () => []);
	items.forEach((it, i) => layers[it.rank].push(i));
	const crossings = (/** @type {number[][]} */ ls) => {
		const at = new Map();
		ls.forEach((l) => l.forEach((v, i) => at.set(v, i)));
		let c = 0;
		for (let r = 0; r + 1 < ls.length; r++) {
			const es = [];
			for (const v of ls[r]) for (const w of down[v]) es.push([at.get(v), at.get(w)]);
			for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
				if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
			}
		}
		return c;
	};
	let best = layers.map((l) => [...l]);
	let bestC = crossings(best);
	for (let s = 0; s < SWEEPS && bestC > 0; s++) {
		const downward = s % 2 === 0;
		const at = new Map();
		layers.forEach((l) => l.forEach((v, i) => at.set(v, i)));
		const order = downward ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1);
		for (const r of order) {
			const bary = new Map();
			for (const v of layers[r]) {
				const ns = downward ? up[v] : down[v];
				bary.set(v, ns.length ? ns.reduce((sum, w) => sum + at.get(w), 0) / ns.length : at.get(v));
			}
			layers[r] = [...layers[r]].sort((a, b) => bary.get(a) - bary.get(b) || at.get(a) - at.get(b));
			layers[r].forEach((v, i) => at.set(v, i));
		}
		const c = crossings(layers);
		if (c < bestC) {
			best = layers.map((l) => [...l]);
			bestC = c;
		}
	}
	layers = best;

	// 5. Positions: pull toward neighbours' mean, keep minimum gaps.
	const gap = (/** @type {number} */ a, /** @type {number} */ b) => (items[a].node && items[b].node ? GAP_NODE : items[a].node || items[b].node ? GAP_MIXED : GAP_VIA);
	const x = new Array(items.length).fill(0);
	for (const l of layers) l.forEach((v, i) => (x[v] = i === 0 ? 0 : x[l[i - 1]] + gap(l[i - 1], v)));
	const centre = (/** @type {number[]} */ l) => (x[l[0]] + x[l[l.length - 1]]) / 2;
	const widest = Math.max(...layers.map((l) => x[l[l.length - 1]] - x[l[0]]));
	for (const l of layers) {
		const shift = widest / 2 - centre(l);
		for (const v of l) x[v] += shift;
	}
	for (let round = 0; round < PLACE_ROUNDS; round++) {
		const downward = round % 2 === 0;
		const order = downward ? [...layers.keys()] : [...layers.keys()].reverse();
		for (const r of order) {
			const l = layers[r];
			const want = l.map((v) => {
				const ns = [...up[v], ...down[v]];
				return ns.length ? ns.reduce((sum, w) => sum + x[w], 0) / ns.length : x[v];
			});
			const placed = placeInOrder(want, l.slice(1).map((v, i) => gap(l[i], v)));
			l.forEach((v, i) => (x[v] = placed[i]));
		}
	}
	// Snap to a quarter-pitch grid, so a chain whose ends sit a hair apart
	// draws straight, then restore the gaps left to right.
	for (const l of layers) {
		l.forEach((v, i) => {
			x[v] = Math.round(x[v] * 4) / 4;
			if (i > 0) x[v] = Math.max(x[v], x[l[i - 1]] + Math.ceil(gap(l[i - 1], v) * 4) / 4);
		});
	}
	const min = Math.min(...x);
	const round2 = (/** @type {number} */ v) => Math.round((v - min) * 100) / 100;

	const ranks = new Map(nodeIds.map((id, i) => [id, rank[i]]));
	const pos = new Map(nodeIds.map((id, i) => [id, round2(x[i])]));
	const via = chains.map((chain, i) => {
		/** @type {[number, number][]} */
		const pts = chain.map((v) => [items[v].rank, round2(x[v])]);
		return reversed.has(i) ? pts.reverse() : pts;
	});
	return { ranks, pos, via };
}

/**
 * Positions closest (least squares) to `want`, in the same order, with
 * position[i + 1] − position[i] ≥ gaps[i]: pool-adjacent-violators on the
 * gap-shifted targets.
 * @param {number[]} want
 * @param {number[]} gaps
 * @returns {number[]}
 */
export function placeInOrder(want, gaps) {
	const offset = [0];
	for (const g of gaps) offset.push(offset[offset.length - 1] + g);
	/** @type {{ sum: number, count: number }[]} */
	const blocks = [];
	want.forEach((w, i) => {
		blocks.push({ sum: w - offset[i], count: 1 });
		while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].count > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count) {
			const b = /** @type {{ sum: number, count: number }} */ (blocks.pop());
			blocks[blocks.length - 1].sum += b.sum;
			blocks[blocks.length - 1].count += b.count;
		}
	});
	const out = [];
	for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(b.sum / b.count + offset[out.length]);
	return out;
}
