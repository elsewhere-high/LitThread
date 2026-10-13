import { layoutDedupeGroup } from "@/lib/pdf/layout/labels";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";

type Bounds = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	area: number;
};

function measureBox(box: PdfLayoutRegion["bbox"]): Bounds | null {
	const right = box.x + box.w;
	const bottom = box.y + box.h;
	const area = box.w * box.h;
	if (
		box.w <= 0 ||
		box.h <= 0 ||
		area <= 0 ||
		![box.x, box.y, box.w, box.h, right, bottom, area].every(Number.isFinite)
	)
		return null;
	return { left: box.x, top: box.y, right, bottom, area };
}

function overlap(a: Bounds | null, b: Bounds | null) {
	if (!a || !b) return { iou: 0, containment: 0 };
	const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
	const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	if (width <= 0 || height <= 0) return { iou: 0, containment: 0 };
	const intersection = width * height;
	return {
		iou: intersection / (a.area + b.area - intersection),
		containment: intersection / Math.min(a.area, b.area),
	};
}

/** Malformed or empty boxes have no overlap. */
export function bboxIoU(
	a: PdfLayoutRegion["bbox"],
	b: PdfLayoutRegion["bbox"],
): number {
	return overlap(measureBox(a), measureBox(b)).iou;
}

/** Fraction of the smaller box covered by the intersection. */
export function bboxContainment(
	a: PdfLayoutRegion["bbox"],
	b: PdfLayoutRegion["bbox"],
): number {
	return overlap(measureBox(a), measureBox(b)).containment;
}

export type DedupeLayoutOptions = {
	/** Drop detections below this confidence (0–1). Default 0.3. */
	minScore?: number;
	/** IoU threshold for same-kind NMS. Default 0.45. */
	iouThreshold?: number;
	/** If smaller box is this covered by larger same-kind, drop smaller. Default 0.85. */
	containmentThreshold?: number;
	/** Drop boxes smaller than this fraction of page area. Default 0.002 (0.2%). */
	minArea?: number;
};

function unitOption(value: number | undefined, fallback: number): number {
	return value !== undefined &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 1
		? value
		: fallback;
}

type Candidate = { region: PdfLayoutRegion; bounds: Bounds; identity: string };

/** Code-point order is independent of the host locale. */
function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function compareIdentity(a: Candidate, b: Candidate): number {
	return (
		compareText(a.region.id, b.region.id) || compareText(a.identity, b.identity)
	);
}

function candidateOf(
	region: PdfLayoutRegion,
	minScore: number,
	minArea: number,
): Candidate | null {
	if (
		!Number.isInteger(region.pageIndex) ||
		region.pageIndex < 0 ||
		!Number.isFinite(region.readingOrder) ||
		!Number.isFinite(region.score) ||
		region.score < minScore ||
		region.score > 1
	)
		return null;
	const bounds = measureBox(region.bbox);
	if (!bounds || bounds.area < minArea) return null;
	return {
		region,
		bounds,
		// Preserve a deterministic winner even when a provider repeats an id.
		identity: JSON.stringify([
			region.kind,
			region.label,
			bounds.left,
			bounds.top,
			bounds.right,
			bounds.bottom,
			region.title,
			region.text,
			region.captionRole,
			region.titleBbox?.x,
			region.titleBbox?.y,
			region.titleBbox?.w,
			region.titleBbox?.h,
			region.rect.x,
			region.rect.y,
			region.rect.w,
			region.rect.h,
		]),
	};
}

/**
 * Deterministic NMS: validate once, rank inside each page/class, then return
 * reading order. Image and chart share a class. Input regions remain untouched.
 */
export function dedupeLayoutRegions(
	regions: readonly PdfLayoutRegion[],
	options: DedupeLayoutOptions = {},
): PdfLayoutRegion[] {
	const minScore = unitOption(options.minScore, 0.3);
	const minArea = unitOption(options.minArea, 0.002);
	const iouThreshold = unitOption(options.iouThreshold, 0.45);
	const containmentThreshold = unitOption(options.containmentThreshold, 0.85);
	const groups = new Map<string, Candidate[]>();
	for (const region of regions) {
		const candidate = candidateOf(region, minScore, minArea);
		if (!candidate) continue;
		const key = `${region.pageIndex}:${layoutDedupeGroup(region.kind)}`;
		const group = groups.get(key);
		if (group) group.push(candidate);
		else groups.set(key, [candidate]);
	}

	const retained: Candidate[] = [];
	for (const group of groups.values()) {
		group.sort(
			(a, b) =>
				b.region.score - a.region.score ||
				b.bounds.area - a.bounds.area ||
				a.region.readingOrder - b.region.readingOrder ||
				compareIdentity(a, b),
		);
		const selected: Candidate[] = [];
		for (const candidate of group) {
			const duplicate = selected.some((winner) => {
				const { iou, containment } = overlap(candidate.bounds, winner.bounds);
				return (
					(iou > 0 && iou >= iouThreshold) ||
					(containment > 0 && containment >= containmentThreshold)
				);
			});
			if (!duplicate) selected.push(candidate);
		}
		retained.push(...selected);
	}
	retained.sort(
		(a, b) =>
			a.region.pageIndex - b.region.pageIndex ||
			a.region.readingOrder - b.region.readingOrder ||
			compareText(a.region.kind, b.region.kind) ||
			compareIdentity(a, b),
	);
	return retained.map(({ region }) => region);
}
