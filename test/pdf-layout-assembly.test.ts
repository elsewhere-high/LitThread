import { describe, expect, it } from "vitest";
import {
	assembleLayout,
	connectedPanelGroups,
	mergeCaptionsIntoHosts,
	selectFormulasForNumber,
} from "@/lib/pdf/layout/merge-captions";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";

function box(
	id: string,
	kind: PdfLayoutRegion["kind"],
	x: number,
	y: number,
	w: number,
	h: number,
	pageIndex = 0,
	score = 0.9,
	title?: string,
): PdfLayoutRegion {
	return {
		id,
		kind,
		label: kind,
		pageIndex,
		score,
		readingOrder: 0,
		bbox: { x, y, w, h },
		rect: { x: x * 600, y: y * 800, w: w * 600, h: h * 800 },
		...(title ? { title } : {}),
	};
}
describe("page ownership and deterministic layout assembly", () => {
	it("never connects identical geometry on different pages, including repeated IDs", () => {
		const a = box("panel", "image", 0.1, 0.1, 0.3, 0.2);
		const b = { ...a, pageIndex: 1 };
		expect(
			connectedPanelGroups([b, a]).map((g) => g.map((r) => r.pageIndex)),
		).toEqual([[0], [1]]);
	});
	it("selects the ranked equation baseline before collecting fragments", () => {
		const number = box("n", "formula_number", 0.9, 0.41, 0.04, 0.02);
		const weak = box("weak", "formula", 0.2, 0.44, 0.5, 0.02, 0, 0.6);
		const strong = box("strong", "formula", 0.2, 0.407, 0.5, 0.02, 0, 0.95);
		expect(
			selectFormulasForNumber(number, [weak, strong]).map((r) => r.id),
		).toEqual(["strong"]);
		expect(
			selectFormulasForNumber(number, [strong, weak]).map((r) => r.id),
		).toEqual(["strong"]);
	});
	it("preserves page-local captions when a detector reuses IDs", () => {
		const one = [
			box("panel", "image", 0.1, 0.2, 0.35, 0.2),
			box(
				"caption",
				"figure_title",
				0.1,
				0.42,
				0.35,
				0.04,
				0,
				0.9,
				"Figure 1: First",
			),
		];
		const two = one.map((r) => ({
			...r,
			pageIndex: 1,
			title: r.title ? "Figure 2: Second" : undefined,
		}));
		const result = assembleLayout([...two, ...one]);
		expect(result.regions.map((r) => [r.pageIndex, r.title])).toEqual([
			[0, "Figure 1: First"],
			[1, "Figure 2: Second"],
		]);
		expect(result.decisions).toHaveLength(2);
		expect(result.excluded).toEqual([]);
	});
	it("traces absorbed subcaptions and rejects low confidence without mutating raw detections", () => {
		const raw = [
			box("p", "image", 0.1, 0.2, 0.35, 0.18),
			box("sub", "figure_title", 0.1, 0.385, 0.35, 0.025, 0, 0.9, "(a) sample"),
			box(
				"main",
				"figure_title",
				0.1,
				0.44,
				0.35,
				0.04,
				0,
				0.9,
				"Figure 1: Evidence",
			),
			box("noise", "image", 0.7, 0.1, 0.1, 0.1, 0, 0.02),
		];
		const snapshot = JSON.stringify(raw);
		const report = assembleLayout(raw);
		expect(report.decisions[0].sourceIds.sort()).toEqual(["main", "p", "sub"]);
		expect(report.excluded).toEqual([
			{ pageIndex: 0, sourceId: "noise", reason: "low-confidence" },
		]);
		expect(JSON.stringify(raw)).toBe(snapshot);
		expect(mergeCaptionsIntoHosts(raw)).toEqual(report.regions);
	});
	it("gives equal-score tables and captions a stable one-to-one assignment", () => {
		const raw = [
			box("table-b", "table", 0.1, 0.3, 0.5, 0.2),
			box("table-a", "table", 0.1, 0.3, 0.5, 0.2),
			box("cap-b", "figure_title", 0.1, 0.25, 0.5, 0.03, 0, 0.9, "Table 2: B"),
			box("cap-a", "figure_title", 0.1, 0.25, 0.5, 0.03, 0, 0.9, "Table 1: A"),
		];
		const baseline = assembleLayout(raw);
		expect(assembleLayout([...raw].reverse())).toEqual(baseline);
		expect(baseline.decisions.map((d) => d.sourceIds)).toEqual([
			["table-a", "cap-a"],
			["table-b", "cap-b"],
		]);
	});
	it("keeps equation order global across page partitions", () => {
		const raw = [0, 1].flatMap((page) => [
			box("body", "formula", 0.2, 0.4, 0.5, 0.02, page),
			box("number", "formula_number", 0.9, 0.4, 0.03, 0.02, page),
		]);
		expect(assembleLayout(raw).regions.map((r) => r.readingOrder)).toEqual([
			0, 1,
		]);
	});
	it("allocates two competing table captions without losing the constrained match", () => {
		const raw = [
			box("left", "table", 0.1, 0.4, 0.4, 0.2),
			box("right", "table", 0.48, 0.4, 0.4, 0.2),
			box("shared", "header", 0.15, 0.35, 0.5, 0.03, 0, 0.9, "Table 2: Shared"),
			box(
				"left-only",
				"header",
				0.05,
				0.35,
				0.12,
				0.03,
				0,
				0.9,
				"Table 1: Left",
			),
		];
		const report = assembleLayout(raw);
		expect(report.regions.map((region) => [region.id, region.title])).toEqual([
			["left", "Table 1: Left"],
			["right", "Table 2: Shared"],
		]);
		expect(report.decisions.map((decision) => decision.sourceIds)).toEqual([
			["left", "left-only"],
			["right", "shared"],
		]);
		expect(report.excluded).toEqual([]);
		expect(assembleLayout([...raw].reverse())).toEqual(report);
	});
});
