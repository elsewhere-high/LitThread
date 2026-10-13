import { clamp01 } from "@/lib/core/math";
import type { PdfAskNormalizedRect } from "@/lib/pdf/ask/types";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import { LAYOUT_MERGE } from "./policy";

/**
 * 0 = left column, 1 = right column (two-column page reading order).
 * Single-column papers usually put numbers on the right → all col 1 → sort by y.
 */
export function layoutReadingColumn(
	bbox: PdfAskNormalizedRect,
	midX: number = LAYOUT_MERGE.columnMidX,
): 0 | 1 {
	return bbox.x + bbox.w / 2 < midX ? 0 : 1;
}

/** Prefer equation-number box for column/y order when present. */
export function formulaSortAnchor(
	region: PdfLayoutRegion,
): PdfAskNormalizedRect {
	return region.titleBbox ?? region.bbox;
}

/**
 * Reading order for layout hosts: page → left column → right column → top→bottom.
 * Matches equation-number sequence on two-column papers better than raw y-only.
 */
export function compareLayoutReadingOrder(
	a: PdfLayoutRegion,
	b: PdfLayoutRegion,
	anchor: (r: PdfLayoutRegion) => PdfAskNormalizedRect = (r) => r.bbox,
): number {
	const aa = anchor(a);
	const ba = anchor(b);
	return (
		a.pageIndex - b.pageIndex ||
		layoutReadingColumn(aa) - layoutReadingColumn(ba) ||
		aa.y - ba.y ||
		aa.x - ba.x ||
		a.readingOrder - b.readingOrder ||
		(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
}

export function unionBbox(
	a: PdfAskNormalizedRect,
	b: PdfAskNormalizedRect,
): PdfAskNormalizedRect {
	const x1 = Math.min(a.x, b.x);
	const y1 = Math.min(a.y, b.y);
	const x2 = Math.max(a.x + a.w, b.x + b.w);
	const y2 = Math.max(a.y + a.h, b.y + b.h);
	return {
		x: clamp01(x1),
		y: clamp01(y1),
		w: clamp01(x2 - x1),
		h: clamp01(y2 - y1),
	};
}

export function unionMany(
	boxes: PdfAskNormalizedRect[],
): PdfAskNormalizedRect | null {
	if (!boxes.length) return null;
	return boxes.reduce((acc, b) => unionBbox(acc, b));
}

export function unionRect(
	a: PdfLayoutRegion["rect"],
	b: PdfLayoutRegion["rect"],
): PdfLayoutRegion["rect"] {
	const x1 = Math.min(a.x, b.x);
	const y1 = Math.min(a.y, b.y);
	const x2 = Math.max(a.x + a.w, b.x + b.w);
	const y2 = Math.max(a.y + a.h, b.y + b.h);
	return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function horizontalOverlapRatio(
	a: PdfAskNormalizedRect,
	b: PdfAskNormalizedRect,
): number {
	const ax2 = a.x + a.w;
	const bx2 = b.x + b.w;
	const ix1 = Math.max(a.x, b.x);
	const ix2 = Math.min(ax2, bx2);
	const inter = Math.max(0, ix2 - ix1);
	const denom = Math.min(a.w, b.w);
	return denom > 0 ? inter / denom : 0;
}

export function verticalOverlapRatio(
	a: PdfAskNormalizedRect,
	b: PdfAskNormalizedRect,
): number {
	const ay2 = a.y + a.h;
	const by2 = b.y + b.h;
	const iy1 = Math.max(a.y, b.y);
	const iy2 = Math.min(ay2, by2);
	const inter = Math.max(0, iy2 - iy1);
	const denom = Math.min(a.h, b.h);
	return denom > 0 ? inter / denom : 0;
}

export function expandBbox(
	b: PdfAskNormalizedRect,
	padX: number,
	padY = 0,
): PdfAskNormalizedRect {
	const x = clamp01(b.x - padX);
	const y = clamp01(b.y - padY);
	const x2 = clamp01(b.x + b.w + padX);
	const y2 = clamp01(b.y + b.h + padY);
	return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

/** True if outer fully covers inner (title must never stick out of the figure box). */
export function bboxFullyContains(
	outer: PdfAskNormalizedRect,
	inner: PdfAskNormalizedRect,
	eps = 0.005,
): boolean {
	return (
		outer.x <= inner.x + eps &&
		outer.y <= inner.y + eps &&
		outer.x + outer.w >= inner.x + inner.w - eps &&
		outer.y + outer.h >= inner.y + inner.h - eps
	);
}

/** How much of `box` is covered by intersection with `other` (0–1). */
export function bboxCoveredBy(
	box: PdfAskNormalizedRect,
	other: PdfAskNormalizedRect,
): number {
	const ax2 = box.x + box.w;
	const ay2 = box.y + box.h;
	const bx2 = other.x + other.w;
	const by2 = other.y + other.h;
	const ix1 = Math.max(box.x, other.x);
	const iy1 = Math.max(box.y, other.y);
	const ix2 = Math.min(ax2, bx2);
	const iy2 = Math.min(ay2, by2);
	const iw = Math.max(0, ix2 - ix1);
	const ih = Math.max(0, iy2 - iy1);
	const inter = iw * ih;
	const area = box.w * box.h;
	return area > 0 ? inter / area : 0;
}
