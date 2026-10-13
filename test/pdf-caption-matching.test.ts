import { describe, expect, it } from "vitest";
import {
	type CaptionCandidate,
	selectCaptionAssignments,
} from "@/lib/pdf/layout/assembly/matching";

function edge(
	hostId: string,
	captionId: string,
	affinity: number,
): CaptionCandidate {
	return { hostId, captionId, affinity };
}

// Independent exhaustive oracle for small graphs: prefer coverage, then quality.
function optimum(edges: CaptionCandidate[]): [number, number] {
	const hosts = [...new Set(edges.map((candidate) => candidate.hostId))];
	let best: [number, number] = [0, 0];
	const visit = (index: number, used: Set<string>, total: number) => {
		if (index === hosts.length) {
			if (used.size > best[0] || (used.size === best[0] && total > best[1]))
				best = [used.size, total];
			return;
		}
		visit(index + 1, used, total);
		for (const candidate of edges) {
			if (candidate.hostId !== hosts[index] || used.has(candidate.captionId))
				continue;
			used.add(candidate.captionId);
			visit(index + 1, used, total + candidate.affinity);
			used.delete(candidate.captionId);
		}
	};
	visit(0, new Set(), 0);
	return best;
}

describe("caption allocation", () => {
	it("reassigns a shared caption rather than starving a host with no alternative", () => {
		const shared = edge("left", "shared", 9);
		const alternative = edge("left", "left-only", 5);
		const constrained = edge("right", "shared", 4);
		expect(
			selectCaptionAssignments([shared, alternative, constrained]),
		).toEqual([alternative, constrained]);
	});
	it("maximizes overall affinity when coverage is equal", () => {
		const candidates = [
			edge("a", "x", 10),
			edge("a", "y", 9),
			edge("b", "x", 8),
			edge("b", "y", 1),
		];
		expect(selectCaptionAssignments(candidates)).toEqual([
			candidates[1],
			candidates[2],
		]);
	});
	it("handles empty, invalid, duplicate and negative-affinity edges", () => {
		expect(selectCaptionAssignments([])).toEqual([]);
		const selected = edge("a", "x", -3);
		expect(
			selectCaptionAssignments([
				edge("a", "x", -4),
				selected,
				edge("b", "x", Number.NaN),
				edge("c", "y", Number.POSITIVE_INFINITY),
				edge("d", "z", Number.NEGATIVE_INFINITY),
			]),
		).toEqual([selected]);
	});
	it("makes equal-cost allocation independent of input order", () => {
		const candidates = [
			edge("b", "y", 1),
			edge("a", "y", 1),
			edge("b", "x", 1),
			edge("a", "x", 1),
		];
		const expected = selectCaptionAssignments(candidates);
		for (let offset = 0; offset < candidates.length; offset++) {
			const rotated = candidates
				.slice(offset)
				.concat(candidates.slice(0, offset));
			expect(selectCaptionAssignments(rotated)).toEqual(expected);
			expect(selectCaptionAssignments(rotated.reverse())).toEqual(expected);
		}
	});
	it("agrees with exhaustive feasible assignments for every small graph", () => {
		// Includes sparse/disconnected graphs, ties, negative weights and unequal sides.
		const possible = Array.from({ length: 9 }, (_, index) =>
			edge(
				`host-${Math.floor(index / 3)}`,
				`cap-${index % 3}`,
				(index % 4) - 1,
			),
		);
		for (let mask = 0; mask < 512; mask++) {
			const candidates = possible.filter((_, index) => mask & (1 << index));
			const result = selectCaptionAssignments(candidates);
			expect([
				result.length,
				result.reduce((total, candidate) => total + candidate.affinity, 0),
			]).toEqual(optimum(candidates));
			expect(new Set(result.map((candidate) => candidate.hostId)).size).toBe(
				result.length,
			);
			expect(new Set(result.map((candidate) => candidate.captionId)).size).toBe(
				result.length,
			);
			for (const selected of result) expect(candidates).toContain(selected);
		}
	});
});
