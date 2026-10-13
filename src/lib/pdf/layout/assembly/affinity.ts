import type { PdfAskNormalizedRect } from "@/lib/pdf/ask/types";
import { LAYOUT_SIDEBAR_MIN_SCORE } from "@/lib/pdf/layout/constants";
import {
	isAlgorithmLayoutKind,
	isFigureLayoutKind,
	isTableLayoutKind,
} from "@/lib/pdf/layout/labels";
import { resolveCaptionRole } from "@/lib/pdf/layout/title-text";
import type { PdfLayoutKind, PdfLayoutRegion } from "@/lib/pdf/layout/types";
import { horizontalOverlapRatio, unionBbox, unionRect } from "./geometry";
import { type CaptionCandidate, selectCaptionAssignments } from "./matching";
import type { CaptionPlacement, LayoutHostFamily } from "./policy";

export function hostFamily(kind: PdfLayoutKind): LayoutHostFamily | null {
	if (isFigureLayoutKind(kind)) return "figure";
	if (isTableLayoutKind(kind)) return "table";
	if (isAlgorithmLayoutKind(kind)) return "algorithm";
	return null;
}

export function preferredCaptionPlacement(
	family: LayoutHostFamily,
): CaptionPlacement {
	switch (family) {
		case "figure":
			return "below";
		case "table":
		case "algorithm":
			return "above";
	}
}

export function captionCompatibleWithHost(
	captionKind: PdfLayoutKind,
	family: LayoutHostFamily,
	role?: PdfLayoutRegion["captionRole"],
): boolean {
	const r = role ?? "other";
	if (r === "table_main") return family === "table";
	if (r === "algorithm_main") return family === "algorithm";
	if (r === "figure_main") return family === "figure";
	if (r === "subpanel") return family === "figure";
	// Unclassified model labels:
	if (captionKind === "figure_title") return family === "figure";
	if (captionKind === "header") return true;
	return false;
}

/** Main whole-figure anchors only (not Table/Algorithm, not (a)(b)). */
export function isMainFigureCaption(c: PdfLayoutRegion): boolean {
	const role = resolveCaptionRole(c);
	if (role === "table_main" || role === "algorithm_main" || role === "subpanel")
		return false;
	if (role === "figure_main") return true;
	// No text: wide figure_title only.
	return c.kind === "figure_title" && c.bbox.w >= 0.4;
}

export function isMainTableCaption(c: PdfLayoutRegion): boolean {
	return resolveCaptionRole(c) === "table_main";
}

export function isMainAlgorithmCaption(c: PdfLayoutRegion): boolean {
	return resolveCaptionRole(c) === "algorithm_main";
}

export function isSubpanelCaption(c: PdfLayoutRegion): boolean {
	return resolveCaptionRole(c) === "subpanel";
}

export function captionAttachScore(
	host: PdfAskNormalizedRect,
	caption: PdfAskNormalizedRect,
	preferred: CaptionPlacement = "below",
): number {
	const hOverlap = horizontalOverlapRatio(host, caption);
	if (hOverlap < 0.2) return Number.NEGATIVE_INFINITY;
	if (caption.h > 0.2) return Number.NEGATIVE_INFINITY;

	const hostBottom = host.y + host.h;
	const capBottom = caption.y + caption.h;
	const gapBelow = caption.y - hostBottom;
	const gapAbove = host.y - capBottom;

	const belowOk = gapBelow >= -0.02 && gapBelow <= 0.12;
	const aboveOk = gapAbove >= -0.02 && gapAbove <= 0.1;

	if (preferred === "below") {
		if (!belowOk) return Number.NEGATIVE_INFINITY;
		return hOverlap * 2 + 0.2 - Math.abs(gapBelow) * 8;
	}
	if (!aboveOk) return Number.NEGATIVE_INFINITY;
	return hOverlap * 2 + 0.2 - Math.abs(gapAbove) * 8;
}

/** A confident block in the vertical gap separates floats, not text inside panels. */
export function hasFigureSeparator(
	a: PdfLayoutRegion,
	b: PdfLayoutRegion,
	blockers: readonly PdfLayoutRegion[],
): boolean {
	const [upper, lower] =
		a.bbox.y < b.bbox.y ? [a.bbox, b.bbox] : [b.bbox, a.bbox];
	const top = upper.y + upper.h;
	const bottom = lower.y;
	if (bottom <= top) return false;
	const x = Math.max(upper.x, lower.x);
	const right = Math.min(upper.x + upper.w, lower.x + lower.w);
	if (right <= x) return false;
	return blockers.some((block) => {
		if (
			block.pageIndex !== a.pageIndex ||
			block.id === a.id ||
			block.id === b.id
		)
			return false;
		if (!(block.score >= LAYOUT_SIDEBAR_MIN_SCORE)) return false;
		const r = block.bbox;
		const overlap = Math.max(0, Math.min(right, r.x + r.w) - Math.max(x, r.x));
		return (
			r.y >= top - 0.005 &&
			r.y + r.h <= bottom + 0.005 &&
			r.h >= 0.015 &&
			overlap / (right - x) >= 0.5
		);
	});
}

export function pairCaptionsOneToOne(
	hosts: PdfLayoutRegion[],
	captions: PdfLayoutRegion[],
	familyFilter: LayoutHostFamily,
	blockers: readonly PdfLayoutRegion[] = [],
): Map<string, PdfLayoutRegion> {
	const candidates: CaptionCandidate[] = [];
	const preferred = preferredCaptionPlacement(familyFilter);

	for (const host of hosts) {
		const family = hostFamily(host.kind);
		if (family !== familyFilter) continue;
		for (const caption of captions) {
			if (caption.pageIndex !== host.pageIndex) continue;
			const role = resolveCaptionRole(caption);
			if (!captionCompatibleWithHost(caption.kind, family, role)) continue;
			// Subpanels handled separately.
			if (role === "subpanel") continue;
			if (family === "figure" && hasFigureSeparator(host, caption, blockers))
				continue;

			const place =
				role === "figure_main"
					? "below"
					: role === "table_main" || role === "algorithm_main"
						? "above"
						: preferred;

			const spatial = captionAttachScore(host.bbox, caption.bbox, place);
			if (!Number.isFinite(spatial)) continue;

			let score = spatial + caption.score * 0.1;
			if (role === "figure_main" && family === "figure") score += 0.8;
			if (role === "table_main" && family === "table") score += 0.8;
			if (role === "algorithm_main" && family === "algorithm") score += 0.8;
			// Don't let mislabeled figure_title win over tables if role is table.
			if (role === "table_main" && caption.kind === "figure_title")
				score += 0.5;

			candidates.push({
				hostId: host.id,
				captionId: caption.id,
				affinity: score,
			});
		}
	}

	const byId = new Map(captions.map((caption) => [caption.id, caption]));
	return new Map(
		selectCaptionAssignments(candidates).map((edge) => [
			edge.hostId,
			byId.get(edge.captionId) as PdfLayoutRegion,
		]),
	);
}

export function attachCaptionToHost(
	host: PdfLayoutRegion,
	caption: PdfLayoutRegion,
): PdfLayoutRegion {
	// Always expand host so the entire caption sits inside the box.
	const bbox = unionBbox(host.bbox, caption.bbox);
	return {
		...host,
		bbox,
		rect: unionRect(host.rect, caption.rect),
		titleBbox: caption.bbox,
		title: caption.title ?? host.title,
	};
}
