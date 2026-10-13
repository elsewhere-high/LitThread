/** A feasible caption edge; geometry and semantic gates are evaluated by the caller. */
export type CaptionCandidate = {
	hostId: string;
	captionId: string;
	affinity: number;
};

/**
 * Assign the largest feasible set of captions, then maximize its total affinity.
 * Empty columns let a host remain unmatched. Stable ID order makes equal-cost
 * solutions independent of detector order. No infeasible edge becomes a match.
 */
export function selectCaptionAssignments(
	candidates: readonly CaptionCandidate[],
): CaptionCandidate[] {
	const edges = candidates.filter((edge) => Number.isFinite(edge.affinity));
	if (!edges.length) return [];
	const hosts = [...new Set(edges.map((edge) => edge.hostId))].sort();
	const captions = [...new Set(edges.map((edge) => edge.captionId))].sort();
	const lookup = new Map<string, Map<string, CaptionCandidate>>();
	let scale = 1;
	for (const edge of edges) {
		scale = Math.max(scale, Math.abs(edge.affinity));
		const row = lookup.get(edge.hostId) ?? new Map();
		const previous = row.get(edge.captionId);
		if (!previous || previous.affinity < edge.affinity)
			row.set(edge.captionId, edge);
		lookup.set(edge.hostId, row);
	}
	// Normalize quality to [-1, 1]. One extra feasible pair outweighs every
	// possible quality difference, including finite negative affinity scores.
	const coverage = 2 * Math.min(hosts.length, captions.length) + 1;
	const cost = (row: number, column: number): number => {
		if (column > captions.length) return 0;
		const edge = lookup.get(hosts[row - 1])?.get(captions[column - 1]);
		return edge ? -coverage - edge.affinity / scale : Number.POSITIVE_INFINITY;
	};
	const width = captions.length + hosts.length;
	const rowPotential = new Float64Array(hosts.length + 1);
	const columnPotential = new Float64Array(width + 1);
	const occupant = new Int32Array(width + 1);
	const predecessor = new Int32Array(width + 1);

	// Rectangular minimum-cost assignment using augmenting paths and dual potentials.
	for (let row = 1; row <= hosts.length; row++) {
		occupant[0] = row;
		let column = 0;
		const visited = new Uint8Array(width + 1);
		const slack = new Float64Array(width + 1).fill(Number.POSITIVE_INFINITY);
		do {
			visited[column] = 1;
			const currentRow = occupant[column];
			let step = Number.POSITIVE_INFINITY;
			let next = 0;
			for (let candidate = 1; candidate <= width; candidate++) {
				if (visited[candidate]) continue;
				const reduced =
					cost(currentRow, candidate) -
					rowPotential[currentRow] -
					columnPotential[candidate];
				if (reduced < slack[candidate]) {
					slack[candidate] = reduced;
					predecessor[candidate] = column;
				}
				if (slack[candidate] < step) {
					step = slack[candidate];
					next = candidate;
				}
			}
			for (let candidate = 0; candidate <= width; candidate++) {
				if (visited[candidate]) {
					rowPotential[occupant[candidate]] += step;
					columnPotential[candidate] -= step;
				} else {
					slack[candidate] -= step;
				}
			}
			column = next;
		} while (occupant[column] !== 0);
		do {
			const previous = predecessor[column];
			occupant[column] = occupant[previous];
			column = previous;
		} while (column !== 0);
	}
	const result: CaptionCandidate[] = [];
	for (let column = 1; column <= captions.length; column++) {
		const row = occupant[column];
		if (!row) continue;
		const edge = lookup.get(hosts[row - 1])?.get(captions[column - 1]);
		if (edge) result.push(edge);
	}
	return result.sort((a, b) => (a.hostId < b.hostId ? -1 : 1));
}
