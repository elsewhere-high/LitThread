import { LAYOUT_SIDEBAR_MIN_SCORE } from "@/lib/pdf/layout/constants";
import {
	isAlgorithmLayoutKind,
	isCaptionLayoutKind,
	isFigureLayoutKind,
	isFormulaLayoutKind,
	isFormulaNumberLayoutKind,
	isLayoutBodyTextKind,
	isSidebarLayoutKind,
	isTableLayoutKind,
} from "@/lib/pdf/layout/labels";
import { resolveCaptionRole } from "@/lib/pdf/layout/title-text";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import {
	attachCaptionToHost,
	captionAttachScore,
	hostFamily,
	isMainFigureCaption,
	isSubpanelCaption,
	pairCaptionsOneToOne,
} from "./affinity";
import {
	absorbSubpanelTitles,
	attachLegendHeaders,
	mergeCluster,
	requireFigureTitles,
	resolveFigureBboxOverlaps,
	selectClusterForTitle,
	suppressOrphanFiguresInsideClusters,
	suppressSpuriousFigureDetections,
} from "./figures";
import { assembleNumberedFormulas } from "./formulas";
import {
	compareLayoutReadingOrder,
	expandBbox,
	unionBbox,
	unionMany,
} from "./geometry";

export type LayoutAssemblyDecision = {
	pageIndex: number;
	hostId: string;
	rule: "figure-cluster" | "caption-pair" | "numbered-equation" | "retained";
	sourceIds: string[];
};
export type LayoutAssemblyReport = {
	regions: PdfLayoutRegion[];
	decisions: LayoutAssemblyDecision[];
	excluded: {
		pageIndex: number;
		sourceId: string;
		reason: "low-confidence" | "text-covered" | "unassigned";
	}[];
};

/** A page owns its detections. A claim is observable and may not silently reuse a source. */
class PageClaims {
	readonly decisions: LayoutAssemblyDecision[] = [];
	private readonly owners = new Map<string, string>();
	available(region: PdfLayoutRegion): boolean {
		return !this.owners.has(region.id);
	}
	record(
		host: PdfLayoutRegion,
		sources: PdfLayoutRegion[],
		rule: LayoutAssemblyDecision["rule"],
	): void {
		const unique = [...new Set(sources.map((s) => s.id))];
		for (const id of unique) {
			if (this.owners.has(id))
				throw new Error(`layout source already claimed: ${id}`);
			this.owners.set(id, host.id);
		}
		this.decisions.push({
			pageIndex: host.pageIndex,
			hostId: host.id,
			sourceIds: unique,
			rule,
		});
	}
}

function recoverCaption(
	region: PdfLayoutRegion,
	panels: PdfLayoutRegion[],
): PdfLayoutRegion {
	if (
		region.kind !== "text" ||
		region.score < LAYOUT_SIDEBAR_MIN_SCORE ||
		!region.text ||
		!/^fig(?:ure)?\.?\s*\d+[a-z]?\s*[:.]\s+\S/i.test(region.text.trim())
	)
		return region;
	if (
		!panels.some((panel) =>
			Number.isFinite(captionAttachScore(panel.bbox, region.bbox)),
		)
	)
		return region;
	return {
		...region,
		kind: "figure_title",
		title: region.text,
		captionRole: "figure_main",
	};
}

function assemblePage(raw: PdfLayoutRegion[]): LayoutAssemblyReport {
	const claims = new PageClaims();
	const panels = raw.filter(
		(r) => isFigureLayoutKind(r.kind) && r.score >= LAYOUT_SIDEBAR_MIN_SCORE,
	);
	const recovered = raw.map((r) => recoverCaption(r, panels));
	const kept = suppressSpuriousFigureDetections(recovered);
	const vetoed = new Set(
		recovered.filter((r) => !kept.includes(r)).map((r) => r.id),
	);
	const excluded: LayoutAssemblyReport["excluded"] = [];
	const page = kept
		.filter((r) => {
			const admitted =
				!(isFigureLayoutKind(r.kind) || isCaptionLayoutKind(r.kind)) ||
				r.score >= LAYOUT_SIDEBAR_MIN_SCORE;
			if (!admitted)
				excluded.push({
					pageIndex: r.pageIndex,
					sourceId: r.id,
					reason: "low-confidence",
				});
			return admitted;
		})
		.map((r) =>
			isCaptionLayoutKind(r.kind)
				? { ...r, captionRole: resolveCaptionRole(r) }
				: r,
		);
	for (const r of recovered)
		if (vetoed.has(r.id))
			excluded.push({
				pageIndex: r.pageIndex,
				sourceId: r.id,
				reason: "text-covered",
			});
	const captions = page.filter((r) => isCaptionLayoutKind(r.kind));
	const main = captions.filter(isMainFigureCaption);
	const subcaptions = captions.filter(isSubpanelCaption);
	const neutral = captions.filter((r) => resolveCaptionRole(r) === "other");
	const floats = page.filter(
		(r) => isTableLayoutKind(r.kind) || isAlgorithmLayoutKind(r.kind),
	);
	const blockers = [
		...floats,
		...page.filter(
			(r) => isLayoutBodyTextKind(r.kind) && resolveCaptionRole(r) === "other",
		),
	];
	const absorbed = absorbSubpanelTitles(
		page.filter((r) => isFigureLayoutKind(r.kind)),
		subcaptions,
	);
	const availableCaption = (r: PdfLayoutRegion) =>
		claims.available(r) && !absorbed.usedSubIds.has(r.id);
	const sourcesForPanels = (members: PdfLayoutRegion[]) =>
		members.flatMap((member) => [
			member,
			...(absorbed.subcaptionsByPanel.get(member.id) ?? []),
		]);
	const hosts: PdfLayoutRegion[] = [];
	const topToBottom = (a: PdfLayoutRegion, b: PdfLayoutRegion) =>
		a.bbox.y - b.bbox.y ||
		a.bbox.x - b.bbox.x ||
		compareLayoutReadingOrder(a, b);
	const titles = [...main]
		.sort(topToBottom)
		.concat(
			neutral
				.filter((c) => c.kind === "figure_title" && !c.title?.trim())
				.sort(topToBottom),
		);
	for (const title of titles) {
		if (!availableCaption(title)) continue;
		const cluster = selectClusterForTitle(
			title,
			absorbed.panels.filter((r) => claims.available(r)),
			main,
			blockers,
		);
		const body = unionMany(cluster.map((r) => r.bbox));
		if (!body) continue;
		const legends = attachLegendHeaders(
			body,
			title,
			neutral.filter((r) => availableCaption(r) && r.kind === "header"),
			title.pageIndex,
			floats,
		);
		const band = expandBbox(unionBbox(body, title.bbox), 0.04, 0.02);
		const extra = subcaptions.filter(
			(r) =>
				availableCaption(r) &&
				r.bbox.x + r.bbox.w / 2 >= band.x &&
				r.bbox.x + r.bbox.w / 2 <= band.x + band.w &&
				r.bbox.y + r.bbox.h / 2 >= band.y &&
				r.bbox.y + r.bbox.h / 2 <= band.y + band.h,
		);
		const host = mergeCluster(cluster, title, legends, extra);
		claims.record(
			host,
			[title, ...sourcesForPanels(cluster), ...legends, ...extra],
			"figure-cluster",
		);
		hosts.push(host);
	}
	// Keep the existing family priority, but make every ownership decision explicit.
	for (const family of ["table", "algorithm", "figure"] as const) {
		const candidates =
			family === "figure"
				? absorbed.panels.filter((r) => claims.available(r))
				: floats.filter((r) => hostFamily(r.kind) === family);
		const anchors = captions.filter(
			(r) =>
				availableCaption(r) &&
				(resolveCaptionRole(r) === "other" ||
					(family === "figure"
						? isMainFigureCaption(r)
						: resolveCaptionRole(r) === `${family}_main`)),
		);
		const pairs = pairCaptionsOneToOne(candidates, anchors, family, blockers);
		for (const body of candidates) {
			const caption = pairs.get(body.id);
			if (!caption && family === "figure") continue;
			const host = caption ? attachCaptionToHost(body, caption) : body;
			const members = family === "figure" ? sourcesForPanels([body]) : [body];
			claims.record(
				host,
				[...members, ...(caption ? [caption] : [])],
				caption ? "caption-pair" : "retained",
			);
			hosts.push(host);
		}
	}
	for (const assembly of assembleNumberedFormulas(page)) {
		claims.record(assembly.host, assembly.sources, "numbered-equation");
		hosts.push(assembly.host);
	}
	for (const r of page) {
		if (
			hostFamily(r.kind) ||
			isCaptionLayoutKind(r.kind) ||
			isFormulaLayoutKind(r.kind) ||
			isFormulaNumberLayoutKind(r.kind) ||
			!isSidebarLayoutKind(r.kind)
		)
			continue;
		claims.record(r, [r], "retained");
		hosts.push(r);
	}
	const regions = requireFigureTitles(
		resolveFigureBboxOverlaps(suppressOrphanFiguresInsideClusters(hosts)),
	);
	const surviving = new Set(regions.map((r) => r.id));
	const decisions = claims.decisions.filter((d) => surviving.has(d.hostId));
	const assigned = new Set(decisions.flatMap((d) => d.sourceIds));
	for (const r of page)
		if (!assigned.has(r.id))
			excluded.push({
				pageIndex: r.pageIndex,
				sourceId: r.id,
				reason: "unassigned",
			});
	return { regions, decisions, excluded };
}

/** Page partitioning prevents geometry and IDs on another page from influencing a claim. */
export function assembleLayout(
	regions: readonly PdfLayoutRegion[],
): LayoutAssemblyReport {
	const pages = new Map<number, PdfLayoutRegion[]>();
	for (const region of regions) {
		const page = pages.get(region.pageIndex) ?? [];
		page.push(region);
		pages.set(region.pageIndex, page);
	}
	const reports = [...pages]
		.sort(([a], [b]) => a - b)
		.map(([, page]) => assemblePage([...page].sort(compareLayoutReadingOrder)));
	const formulas = reports
		.flatMap((r) => r.regions)
		.filter((r) => isFormulaLayoutKind(r.kind))
		.sort((a, b) =>
			compareLayoutReadingOrder(a, b, (r) => r.titleBbox ?? r.bbox),
		);
	const orders = new Map(formulas.map((r, i) => [r, i]));
	return {
		regions: reports
			.flatMap((r) => r.regions)
			.map((r) =>
				orders.has(r) ? { ...r, readingOrder: orders.get(r) as number } : r,
			),
		decisions: reports.flatMap((r) => r.decisions),
		excluded: reports.flatMap((r) => r.excluded),
	};
}

export function mergeCaptionsIntoHosts(
	regions: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	return assembleLayout(regions).regions;
}
