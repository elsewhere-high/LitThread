import { describe, expect, it } from "vitest";

import {
	bboxContainment,
	bboxIoU,
	dedupeLayoutRegions,
} from "@/lib/pdf/layout/dedupe";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";

function region(
	partial: Partial<PdfLayoutRegion> &
		Pick<PdfLayoutRegion, "id" | "kind" | "score" | "bbox">,
): PdfLayoutRegion {
	return {
		pageIndex: 0,
		label: partial.kind,
		readingOrder: 0,
		rect: {
			x: partial.bbox.x * 100,
			y: partial.bbox.y * 100,
			w: partial.bbox.w * 100,
			h: partial.bbox.h * 100,
		},
		...partial,
	};
}

describe("bboxIoU", () => {
	it("is 1 for identical boxes", () => {
		const b = { x: 0.1, y: 0.1, w: 0.4, h: 0.3 };
		expect(bboxIoU(b, b)).toBeCloseTo(1, 5);
	});

	it("is 0 for non-overlapping boxes", () => {
		expect(
			bboxIoU(
				{ x: 0, y: 0, w: 0.2, h: 0.2 },
				{ x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
			),
		).toBe(0);
	});
});

describe("dedupeLayoutRegions", () => {
	it("selects the same detection for every order of tied candidates", () => {
		const candidates = ["c", "a", "b"].map((id) =>
			region({
				id,
				kind: "image",
				score: 0.9,
				bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
			}),
		);
		for (const order of [
			[0, 1, 2],
			[0, 2, 1],
			[1, 0, 2],
			[1, 2, 0],
			[2, 0, 1],
			[2, 1, 0],
		]) {
			expect(
				dedupeLayoutRegions(order.map((index) => candidates[index])).map(
					(item) => item.id,
				),
			).toEqual(["a"]);
		}
	});

	it("keeps gallery order stable when reading-order values are tied", () => {
		const first = region({
			id: "a",
			kind: "image",
			score: 0.9,
			bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
		});
		const second = region({
			...first,
			id: "b",
			bbox: { x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
		});
		expect(dedupeLayoutRegions([second, first])).toEqual([first, second]);
	});

	it("rejects invalid detection metadata and geometry before ranking", () => {
		const valid = region({
			id: "valid",
			kind: "image",
			score: 0.8,
			bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
		});
		const invalid: Partial<PdfLayoutRegion>[] = [
			{ score: Number.POSITIVE_INFINITY },
			{ score: 1.2 },
			{ score: Number.NaN },
			{ pageIndex: -1 },
			{ pageIndex: 0.5 },
			{ readingOrder: Number.NaN },
			{ bbox: { x: Number.NaN, y: 0, w: 0.3, h: 0.3 } },
			{ bbox: { x: 0, y: Number.POSITIVE_INFINITY, w: 0.3, h: 0.3 } },
			{ bbox: { x: 0, y: 0, w: -0.3, h: -0.3 } },
			{ bbox: { x: 0, y: 0, w: Number.MAX_VALUE, h: 2 } },
		];
		for (const [index, partial] of invalid.entries()) {
			expect(
				dedupeLayoutRegions([
					{ ...valid, ...partial, id: `invalid-${index}` },
					valid,
				]),
			).toEqual([valid]);
		}
	});

	it("requires an actual intersection even when overlap thresholds are zero", () => {
		const boxes = [0, 0.3, 0.7].map((x, index) =>
			region({
				id: String(index),
				kind: "image",
				score: 0.9,
				bbox: { x, y: 0.1, w: 0.2, h: 0.2 },
			}),
		);
		expect(
			dedupeLayoutRegions(boxes, {
				iouThreshold: 0,
				containmentThreshold: 0,
			}),
		).toEqual(boxes);
	});

	it("uses defaults for non-finite or out-of-range options", () => {
		const candidate = region({
			id: "valid",
			kind: "image",
			score: 0.8,
			bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
		});
		expect(
			dedupeLayoutRegions([candidate, { ...candidate, id: "duplicate" }], {
				minScore: Number.NaN,
				minArea: -1,
				iouThreshold: Number.POSITIVE_INFINITY,
				containmentThreshold: 2,
			}),
		).toHaveLength(1);
	});

	it("does not suppress an identical detection on another page", () => {
		const first = region({
			id: "shared-id",
			kind: "image",
			score: 0.9,
			bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
		});
		const nextPage = { ...first, pageIndex: 1 };
		expect(dedupeLayoutRegions([nextPage, first])).toEqual([first, nextPage]);
	});

	it("keeps only image/table/algorithm candidates that pass score", () => {
		const regions = [
			region({
				id: "low",
				kind: "image",
				score: 0.2,
				bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
			}),
			region({
				id: "ok",
				kind: "table",
				score: 0.8,
				bbox: { x: 0.5, y: 0.5, w: 0.3, h: 0.2 },
			}),
		];
		const out = dedupeLayoutRegions(regions, { minScore: 0.5 });
		expect(out.map((r) => r.id)).toEqual(["ok"]);
	});

	it("suppresses overlapping same-kind boxes (keep higher score)", () => {
		const regions = [
			region({
				id: "a",
				kind: "image",
				score: 0.9,
				bbox: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
			}),
			region({
				id: "b",
				kind: "image",
				score: 0.7,
				bbox: { x: 0.15, y: 0.15, w: 0.35, h: 0.35 },
			}),
		];
		const out = dedupeLayoutRegions(regions, { minScore: 0.5 });
		expect(out.map((r) => r.id)).toEqual(["a"]);
	});

	it("keeps different NMS groups even if they overlap", () => {
		const regions = [
			region({
				id: "img",
				kind: "image",
				score: 0.9,
				bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
			}),
			region({
				id: "tbl",
				kind: "table",
				score: 0.85,
				bbox: { x: 0.15, y: 0.15, w: 0.4, h: 0.4 },
			}),
			region({
				id: "alg",
				kind: "algorithm",
				score: 0.8,
				bbox: { x: 0.12, y: 0.12, w: 0.45, h: 0.45 },
			}),
		];
		const out = dedupeLayoutRegions(regions, { minScore: 0.5 });
		expect(out.map((r) => r.id).sort()).toEqual(["alg", "img", "tbl"]);
	});

	it("dedupes image vs chart as one figure class (keep higher score)", () => {
		const regions = [
			region({
				id: "img",
				kind: "image",
				score: 0.7,
				bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
			}),
			region({
				id: "cht",
				kind: "chart",
				score: 0.92,
				bbox: { x: 0.12, y: 0.12, w: 0.48, h: 0.48 },
			}),
		];
		const out = dedupeLayoutRegions(regions, { minScore: 0.5 });
		expect(out.map((r) => r.id)).toEqual(["cht"]);
	});

	it("drops near-contained duplicates", () => {
		const regions = [
			region({
				id: "outer",
				kind: "image",
				score: 0.95,
				bbox: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
			}),
			region({
				id: "inner",
				kind: "image",
				score: 0.7,
				bbox: { x: 0.2, y: 0.2, w: 0.2, h: 0.2 },
			}),
		];
		const out = dedupeLayoutRegions(regions, {
			minScore: 0.5,
			containmentThreshold: 0.85,
		});
		expect(out.map((r) => r.id)).toEqual(["outer"]);
	});
});

describe("invalid layout bounds", () => {
	it("returns finite zero overlap for malformed geometry", () => {
		const valid = { x: 0, y: 0, w: 0.4, h: 0.4 };
		for (const invalid of [
			{ x: Number.NaN, y: 0, w: 0.4, h: 0.4 },
			{ x: 0, y: 0, w: -0.4, h: -0.4 },
			{ x: 0, y: 0, w: Number.MAX_VALUE, h: 2 },
		]) {
			expect(bboxIoU(invalid, valid)).toBe(0);
			expect(bboxContainment(valid, invalid)).toBe(0);
		}
	});
});
