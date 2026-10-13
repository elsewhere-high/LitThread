import type { PdfAskNormalizedRect } from "@/lib/pdf/ask/types";
import { LAYOUT_SIDEBAR_MIN_SCORE } from "@/lib/pdf/layout/constants";
import {
	isFigureLayoutKind,
	isLayoutBodyTextKind,
} from "@/lib/pdf/layout/labels";
import { resolveCaptionRole } from "@/lib/pdf/layout/title-text";
import type { PdfLayoutKind, PdfLayoutRegion } from "@/lib/pdf/layout/types";
import {
	captionAttachScore,
	hasFigureSeparator,
	hostFamily,
	preferredCaptionPlacement,
} from "./affinity";
import {
	bboxCoveredBy,
	bboxFullyContains,
	compareLayoutReadingOrder,
	expandBbox,
	horizontalOverlapRatio,
	unionBbox,
	unionMany,
	unionRect,
	verticalOverlapRatio,
} from "./geometry";
import { LAYOUT_MERGE } from "./policy";

/**
 * True when a confident text/header/abstract box covers most of `box`.
 * Used to reject image/chart dual-labels on pure text blocks.
 */
export function figureCoveredByBodyText(
	box: PdfAskNormalizedRect,
	pageIndex: number,
	bodyBlocks: readonly PdfLayoutRegion[],
	coverThreshold: number = LAYOUT_MERGE.figureTextCover,
): boolean {
	for (const t of bodyBlocks) {
		if (t.pageIndex !== pageIndex) continue;
		if (!isLayoutBodyTextKind(t.kind)) continue;
		if (t.score < LAYOUT_MERGE.figureTextMinScore) continue;
		if (bboxCoveredBy(box, t.bbox) >= coverThreshold) return true;
	}
	return false;
}

/**
 * Drop image/chart detections that are really text/header regions.
 * Model often dual-labels section titles and paragraphs as low/mid image;
 * pure text+header areas must not surface as figures (sidebar or Eye overlay).
 */
export function suppressSpuriousFigureDetections(
	regions: readonly PdfLayoutRegion[],
): PdfLayoutRegion[] {
	const bodyBlocks = regions.filter(
		(r) =>
			isLayoutBodyTextKind(r.kind) &&
			r.score >= LAYOUT_MERGE.figureTextMinScore,
	);
	if (!bodyBlocks.length) return [...regions];

	return regions.filter((r) => {
		if (!isFigureLayoutKind(r.kind)) return true;
		// Strong figure boxes that beat overlapping body text stay.
		// Veto when body text covers most of the box (same area dual-label / wrap).
		if (!figureCoveredByBodyText(r.bbox, r.pageIndex, bodyBlocks)) {
			return true;
		}
		// If a body block covers us, only keep the figure when it is clearly
		// more confident than every covering body block.
		for (const t of bodyBlocks) {
			if (t.pageIndex !== r.pageIndex) continue;
			if (bboxCoveredBy(r.bbox, t.bbox) < LAYOUT_MERGE.figureTextCover) {
				continue;
			}
			// Body is competitive or stronger → not a real figure.
			if (t.score >= r.score * 0.85) return false;
		}
		return true;
	});
}

/**
 * Vertical band for a main figure title: from previous main caption bottom
 * down to this title top, restricted to horizontally overlapping captions.
 */
export function verticalCeilingForTitle(
	title: PdfLayoutRegion,
	mainCaptions: PdfLayoutRegion[],
): number {
	let ceiling = 0;
	for (const other of mainCaptions) {
		if (other.id === title.id) continue;
		if (other.pageIndex !== title.pageIndex) continue;
		if (horizontalOverlapRatio(other.bbox, title.bbox) < 0.2) continue;
		const otherBottom = other.bbox.y + other.bbox.h;
		// Captions strictly above this title.
		if (otherBottom <= title.bbox.y + 0.01) {
			ceiling = Math.max(ceiling, otherBottom);
		}
	}
	return ceiling;
}

/**
 * Side-by-side Fig 7 | Fig 8: panel must sit in the title's column
 * unless the title is full-width (联图 spanning whole page).
 */
export function panelInTitleColumn(
	panel: PdfAskNormalizedRect,
	title: PdfAskNormalizedRect,
): boolean {
	// Full-width caption → any column under it.
	if (title.w >= LAYOUT_MERGE.fullWidthTitle) {
		const span = expandBbox(title, 0.08);
		const cx = panel.x + panel.w / 2;
		return cx >= span.x - 0.02 && cx <= span.x + span.w + 0.02;
	}
	const pad = 0.06;
	const cx = panel.x + panel.w / 2;
	return cx >= title.x - pad && cx <= title.x + title.w + pad;
}

export function areFigureNeighbors(
	a: PdfAskNormalizedRect,
	b: PdfAskNormalizedRect,
	maxGap = LAYOUT_MERGE.panelNeighborGap,
): boolean {
	const ax2 = a.x + a.w;
	const ay2 = a.y + a.h;
	const bx2 = b.x + b.w;
	const by2 = b.y + b.h;
	const hGap = Math.max(0, Math.max(a.x - bx2, b.x - ax2));
	const vGap = Math.max(0, Math.max(a.y - by2, b.y - ay2));
	const hOv = horizontalOverlapRatio(a, b);
	const vOv = verticalOverlapRatio(a, b);
	if (hGap <= maxGap && vOv >= 0.15) return true;
	if (vGap <= maxGap && hOv >= 0.15) return true;
	if (hGap <= maxGap && vGap <= maxGap) return true;
	if (hGap === 0 && vGap === 0) return true;
	return false;
}

export function connectedPanelGroups(
	panels: PdfLayoutRegion[],
	blockers: readonly PdfLayoutRegion[] = [],
): PdfLayoutRegion[][] {
	// A graph node is a detection, not a region ID: IDs may repeat across pages.
	const nodes = [...panels].sort(compareLayoutReadingOrder);
	const remaining = new Set(nodes);
	const groups: PdfLayoutRegion[][] = [];
	for (const seed of nodes) {
		if (!remaining.delete(seed)) continue;
		const component = [seed];
		for (let cursor = 0; cursor < component.length; cursor++) {
			const current = component[cursor];
			for (const neighbor of remaining) {
				if (current.pageIndex !== neighbor.pageIndex) continue;
				if (!areFigureNeighbors(current.bbox, neighbor.bbox)) continue;
				if (hasFigureSeparator(current, neighbor, blockers)) continue;
				remaining.delete(neighbor);
				component.push(neighbor);
			}
		}
		groups.push(component.sort(compareLayoutReadingOrder));
	}
	return groups;
}

/**
 * image/chart panels in the vertical band (ceiling → title) and title column.
 *
 * Full-width Figure N titles (3×3 / multi-row):
 * - no soft maxHeightAbove (tall figures keep the top row)
 * - looser bottom slack so bottom-row charts that bleed into the caption stay in
 * Half-width: keep tight height + bottom slack so Fig7|Fig8 do not over-merge.
 */
export function panelsAboveTitle(
	title: PdfLayoutRegion,
	panels: PdfLayoutRegion[],
	options?: {
		/** Bottom of previous main caption (exclusive band start). */
		ceiling?: number;
		maxHeightAbove?: number;
		/** Override full-width treatment (default: title.bbox.w ≥ fullWidthTitle). */
		fullWidth?: boolean;
	},
): PdfLayoutRegion[] {
	const fullWidth =
		options?.fullWidth ?? title.bbox.w >= LAYOUT_MERGE.fullWidthTitle;
	const ceiling = options?.ceiling ?? 0;
	const maxHeightAbove =
		options?.maxHeightAbove ??
		(fullWidth ? Number.POSITIVE_INFINITY : LAYOUT_MERGE.maxHeightAboveTitle);
	const bottomSlack = fullWidth
		? LAYOUT_MERGE.fullWidthPanelBottomSlack
		: LAYOUT_MERGE.panelBottomSlack;
	const titleTop = title.bbox.y;
	const titleBottom = title.bbox.y + title.bbox.h;

	return panels.filter((p) => {
		if (!isFigureLayoutKind(p.kind)) return false;
		if (p.pageIndex !== title.pageIndex) return false;
		if (!panelInTitleColumn(p.bbox, title.bbox)) return false;

		const pBottom = p.bbox.y + p.bbox.h;
		const pCy = p.bbox.y + p.bbox.h / 2;
		// Panel must start above the title (not a box sitting under the caption).
		if (p.bbox.y >= titleTop - 0.005) return false;
		// Center of mass should not sit deep inside the caption strip.
		if (pCy >= titleBottom - 0.01) return false;
		// Bottom edge may slightly overlap the caption (model bleed).
		if (pBottom > titleTop + bottomSlack) {
			// Full-width: still accept if most of the panel is above the title.
			if (!(fullWidth && titleTop - p.bbox.y >= p.bbox.h * 0.35)) {
				return false;
			}
		}
		// Not above the previous main caption (avoid multi-figure stack merge).
		if (p.bbox.y + 0.01 < ceiling) return false;
		// Soft max height only for half-width titles without a ceiling.
		if (
			ceiling <= 0 &&
			Number.isFinite(maxHeightAbove) &&
			titleTop - p.bbox.y > maxHeightAbove + 1e-9
		) {
			return false;
		}
		return true;
	});
}

/**
 * Grow connected panels from groups close to the caption. Full-width captions
 * can seed several disconnected columns, but never collect an entire page band.
 */
export function selectClusterForTitle(
	title: PdfLayoutRegion,
	panels: PdfLayoutRegion[],
	mainFigureCaptions: PdfLayoutRegion[],
	blockers: readonly PdfLayoutRegion[] = [],
): PdfLayoutRegion[] {
	const ceiling = verticalCeilingForTitle(title, mainFigureCaptions);
	const fullWidth = title.bbox.w >= LAYOUT_MERGE.fullWidthTitle;
	const candidates = panelsAboveTitle(
		title,
		panels.filter((p) => p.score >= LAYOUT_SIDEBAR_MIN_SCORE),
		{ ceiling, fullWidth },
	);
	const groups = connectedPanelGroups(candidates, blockers);
	const anchored = groups.filter((group) =>
		group.some((panel) => {
			const gap = title.bbox.y - (panel.bbox.y + panel.bbox.h);
			const slack = fullWidth
				? LAYOUT_MERGE.fullWidthPanelBottomSlack
				: LAYOUT_MERGE.panelBottomSlack;
			return (
				gap >= -slack &&
				gap <= 0.12 + 1e-9 &&
				horizontalOverlapRatio(panel.bbox, title.bbox) >= 0.2 &&
				!hasFigureSeparator(panel, title, blockers)
			);
		}),
	);
	if (fullWidth) return anchored.flat();
	let best: PdfLayoutRegion[] = [];
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const group of anchored) {
		const body = unionMany(group.map((p) => p.bbox));
		if (!body) continue;
		const gap = title.bbox.y - (body.y + body.h);
		const score =
			horizontalOverlapRatio(body, title.bbox) * 2.5 - Math.abs(gap) * 6;
		if (score > bestScore) {
			bestScore = score;
			best = group;
		}
	}
	return best;
}

/**
 * Build figure bbox = panels (optionally column-clipped) ∪ **entire** title.
 * Rule: figure_title must always be 100% inside the host box — never half-in.
 */
export function buildFigureBboxWithFullTitle(
	panelBoxes: PdfAskNormalizedRect[],
	title: PdfAskNormalizedRect,
	legendBoxes: PdfAskNormalizedRect[] = [],
): PdfAskNormalizedRect {
	// 1) Always start from the full title (hard requirement).
	let bbox: PdfAskNormalizedRect = { ...title };

	// 2) Union panels; for half-width titles only include x-overlap with title column.
	const halfWidth = title.w < LAYOUT_MERGE.fullWidthTitle;
	const col = expandBbox(title, 0.05, 0);
	for (const p of panelBoxes) {
		if (halfWidth) {
			// Drop panels that barely touch this column (belong to the other figure).
			if (horizontalOverlapRatio(p, col) < 0.2) {
				const cx = p.x + p.w / 2;
				if (cx < col.x || cx > col.x + col.w) continue;
			}
		}
		bbox = unionBbox(bbox, p);
	}
	for (const leg of legendBoxes) {
		if (halfWidth && horizontalOverlapRatio(leg, col) < 0.15) continue;
		bbox = unionBbox(bbox, leg);
	}

	// 3) Force title fully inside again (in case of any numerical drift).
	bbox = unionBbox(bbox, title);
	return bbox;
}

/**
 * @deprecated Use buildFigureBboxWithFullTitle — never clip title out of the box.
 */
export function clipFigureBboxToTitleColumn(
	bbox: PdfAskNormalizedRect,
	title: PdfAskNormalizedRect,
): PdfAskNormalizedRect {
	// Preserve full title; only used as a soft body clamp then re-union title.
	return buildFigureBboxWithFullTitle([bbox], title);
}

export function isHalfWidthFigureHost(h: PdfLayoutRegion): boolean {
	const tw = h.titleBbox?.w ?? h.bbox.w;
	return tw < LAYOUT_MERGE.fullWidthTitle;
}

/**
 * Soft-split side-by-side half-width figures only.
 * After any body clip, re-union the **entire** titleBbox so the caption is never half-out.
 */
export function resolveFigureBboxOverlaps(
	hosts: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	const out = hosts.map((h) => ({ ...h, bbox: { ...h.bbox } }));
	for (let i = 0; i < out.length; i++) {
		for (let j = i + 1; j < out.length; j++) {
			const a = out[i];
			const b = out[j];
			if (!isFigureLayoutKind(a.kind) || !isFigureLayoutKind(b.kind)) continue;
			if (a.pageIndex !== b.pageIndex) continue;
			if (!isHalfWidthFigureHost(a) || !isHalfWidthFigureHost(b)) continue;
			if (verticalOverlapRatio(a.bbox, b.bbox) < 0.2) continue;
			// Same-column/stacked captions do not establish a left/right split.
			if (
				a.titleBbox &&
				b.titleBbox &&
				horizontalOverlapRatio(a.titleBbox, b.titleBbox) > 0.2
			)
				continue;

			const ax2 = a.bbox.x + a.bbox.w;
			const bx2 = b.bbox.x + b.bbox.w;
			const overlap = Math.min(ax2, bx2) - Math.max(a.bbox.x, b.bbox.x);
			if (overlap <= 0.02) continue;

			const acx = a.titleBbox
				? a.titleBbox.x + a.titleBbox.w / 2
				: a.bbox.x + a.bbox.w / 2;
			const bcx = b.titleBbox
				? b.titleBbox.x + b.titleBbox.w / 2
				: b.bbox.x + b.bbox.w / 2;
			const mid = (acx + bcx) / 2;
			const left = acx <= bcx ? a : b;
			const rightHost = acx <= bcx ? b : a;

			const lRight = Math.min(left.bbox.x + left.bbox.w, mid - 0.005);
			if (lRight > left.bbox.x + 0.12) {
				left.bbox = { ...left.bbox, w: lRight - left.bbox.x };
			}
			const rLeft = Math.max(rightHost.bbox.x, mid + 0.005);
			const rRight = rightHost.bbox.x + rightHost.bbox.w;
			if (rRight > rLeft + 0.12) {
				rightHost.bbox = {
					...rightHost.bbox,
					x: rLeft,
					w: rRight - rLeft,
				};
			}
			// Hard rule: full figure_title must stay inside each host box.
			if (left.titleBbox) {
				left.bbox = unionBbox(left.bbox, left.titleBbox);
			}
			if (rightHost.titleBbox) {
				rightHost.bbox = unionBbox(rightHost.bbox, rightHost.titleBbox);
			}
		}
	}
	return out;
}

/**
 * Drop orphan figure panels that sit inside a larger clustered figure
 * (leftover panel (d) after Fig 2 联图 would otherwise fight mid-split).
 */
export function suppressOrphanFiguresInsideClusters(
	hosts: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	const figures = hosts.filter((h) => isFigureLayoutKind(h.kind));
	const drop = new Set<string>();
	for (const small of figures) {
		for (const big of figures) {
			if (small.id === big.id) continue;
			if (small.pageIndex !== big.pageIndex) continue;
			// Prefer keeping titled/full-width clusters over bare panel leftovers.
			const bigIsCluster =
				(big.titleBbox?.w ?? 0) >= 0.5 || Boolean(big.title?.match(/^fig/i));
			const smallIsOrphan = !small.titleBbox;
			if (!bigIsCluster || !smallIsOrphan) continue;
			const cont = (() => {
				const a = small.bbox;
				const b = big.bbox;
				const ix1 = Math.max(a.x, b.x);
				const iy1 = Math.max(a.y, b.y);
				const ix2 = Math.min(a.x + a.w, b.x + b.w);
				const iy2 = Math.min(a.y + a.h, b.y + b.h);
				const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
				const area = a.w * a.h;
				return area > 0 ? inter / area : 0;
			})();
			if (cont >= LAYOUT_MERGE.orphanContainment) drop.add(small.id);
		}
	}
	return hosts.filter((h) => !drop.has(h.id));
}

export function attachLegendHeaders(
	clusterBbox: PdfAskNormalizedRect,
	title: PdfLayoutRegion,
	headers: PdfLayoutRegion[],
	pageIndex: number,
	blockers: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	return headers.filter((h) => {
		if (h.pageIndex !== pageIndex) return false;
		// Never treat table/algorithm captions as figure legends.
		const role = resolveCaptionRole(h);
		if (role === "table_main" || role === "algorithm_main") return false;
		if (role === "subpanel") return false;
		if (h.bbox.h > 0.12) return false;
		const hCy = h.bbox.y + h.bbox.h / 2;
		const bandTop = clusterBbox.y - 0.04;
		const bandBottom = title.bbox.y + title.bbox.h;
		if (hCy < bandTop || hCy > bandBottom) return false;
		const span = expandBbox(unionBbox(clusterBbox, title.bbox), 0.06);
		if (horizontalOverlapRatio(h.bbox, span) < 0.2) return false;
		for (const b of blockers) {
			if (b.pageIndex !== pageIndex) continue;
			const fam = hostFamily(b.kind);
			if (fam !== "table" && fam !== "algorithm") continue;
			const s = captionAttachScore(
				b.bbox,
				h.bbox,
				preferredCaptionPlacement(fam),
			);
			if (Number.isFinite(s) && s > 0.5) return false;
		}
		return true;
	});
}

/**
 * Fold (a)(b) subpanel titles into the nearest figure panel above them.
 */
export function absorbSubpanelTitles(
	panels: PdfLayoutRegion[],
	subpanels: PdfLayoutRegion[],
): {
	panels: PdfLayoutRegion[];
	usedSubIds: Set<string>;
	subcaptionsByPanel: Map<string, PdfLayoutRegion[]>;
} {
	const usedSubIds = new Set<string>();
	const subcaptionsByPanel = new Map<string, PdfLayoutRegion[]>();
	const next = panels.map((p) => ({ ...p }));

	for (const sub of subpanels) {
		let best: { idx: number; score: number } | null = null;
		for (let i = 0; i < next.length; i++) {
			const p = next[i];
			if (p.pageIndex !== sub.pageIndex) continue;
			if (!isFigureLayoutKind(p.kind)) continue;
			const score = captionAttachScore(p.bbox, sub.bbox, "below");
			if (!Number.isFinite(score)) continue;
			// Prefer subpanel whose width matches the panel.
			const wScore = horizontalOverlapRatio(p.bbox, sub.bbox);
			const total = score + wScore;
			if (!best || total > best.score) best = { idx: i, score: total };
		}
		if (!best) continue;
		const host = next[best.idx];
		next[best.idx] = {
			...host,
			bbox: unionBbox(host.bbox, sub.bbox),
			rect: unionRect(host.rect, sub.rect),
		};
		usedSubIds.add(sub.id);
		subcaptionsByPanel.set(host.id, [
			...(subcaptionsByPanel.get(host.id) ?? []),
			sub,
		]);
	}
	return { panels: next, usedSubIds, subcaptionsByPanel };
}

export function mergeCluster(
	panels: PdfLayoutRegion[],
	title: PdfLayoutRegion,
	legends: PdfLayoutRegion[],
	extra: PdfLayoutRegion[] = [],
): PdfLayoutRegion {
	const panelBoxes = [...panels, ...extra].map((p) => p.bbox);
	const legendBoxes = legends.map((l) => l.bbox);
	// Title is always fully contained — never half-in / half-out.
	const bbox = buildFigureBboxWithFullTitle(
		panelBoxes,
		title.bbox,
		legendBoxes,
	);

	let rect = title.rect;
	for (const p of panels) rect = unionRect(rect, p.rect);
	for (const p of legends) rect = unionRect(rect, p.rect);
	for (const p of extra) rect = unionRect(rect, p.rect);

	const chartCount = panels.filter((p) => p.kind === "chart").length;
	const kind: PdfLayoutKind =
		chartCount >= panels.length / 2 ? "chart" : (panels[0]?.kind ?? "image");
	const score = Math.max(
		title.score,
		...panels.map((p) => p.score),
		...legends.map((p) => p.score),
		0,
	);
	const readingOrder = Math.min(
		title.readingOrder,
		...panels.map((p) => p.readingOrder),
	);
	return {
		id: title.id,
		pageIndex: title.pageIndex,
		kind,
		label: kind,
		score,
		readingOrder,
		rect,
		bbox,
		titleBbox: title.bbox,
		title: title.title,
		captionRole: "figure_main",
	};
}

/**
 * Every figure must have a title fully inside its box.
 * - No titleBbox → drop (panel without Figure N caption = mis-clustered)
 * - Title sticks out → expand bbox to cover full title
 */
export function requireFigureTitles(
	hosts: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	const result: PdfLayoutRegion[] = [];
	for (const h of hosts) {
		if (!isFigureLayoutKind(h.kind)) {
			result.push(h);
			continue;
		}
		if (!h.titleBbox) continue;
		let bbox = h.bbox;
		if (!bboxFullyContains(bbox, h.titleBbox)) {
			bbox = unionBbox(bbox, h.titleBbox);
		}
		if (!bboxFullyContains(bbox, h.titleBbox)) continue;
		result.push({ ...h, bbox });
	}
	return result;
}
