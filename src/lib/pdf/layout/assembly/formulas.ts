import {
	isFormulaLayoutKind,
	isFormulaNumberLayoutKind,
	isTextLayoutKind,
} from "@/lib/pdf/layout/labels";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import {
	compareLayoutReadingOrder,
	expandBbox,
	formulaSortAnchor,
	unionBbox,
	unionRect,
	verticalOverlapRatio,
} from "./geometry";
import { LAYOUT_MERGE } from "./policy";

/** Rank bodies before choosing the baseline; input order must not choose a line. */
export function selectFormulasForNumber(
	number: PdfLayoutRegion,
	formulas: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	const anchor = number.bbox;
	const center = anchor.y + anchor.h / 2;
	const band = expandBbox(anchor, 0, LAYOUT_MERGE.formulaNumberBandPad);
	const tolerance =
		Math.max(anchor.h, 0.012) * 0.75 + LAYOUT_MERGE.formulaNumberBandPad;
	const candidates = formulas.filter((body) => {
		const box = body.bbox;
		const distance = anchor.x - box.x - box.w;
		return (
			body.pageIndex === number.pageIndex &&
			isFormulaLayoutKind(body.kind) &&
			body.score >= LAYOUT_MERGE.formulaBodyMinScore &&
			box.h <= LAYOUT_MERGE.formulaMaxBodyHeight &&
			box.x < anchor.x + anchor.w / 2 &&
			distance >= -0.12 &&
			distance <= LAYOUT_MERGE.formulaNumberMaxGap &&
			(verticalOverlapRatio(box, band) >= 0.2 ||
				Math.abs(box.y + box.h / 2 - center) <= tolerance)
		);
	});
	const baseline = [...candidates].sort(
		(a, b) =>
			b.score - a.score ||
			b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h ||
			Math.abs(a.bbox.y + a.bbox.h / 2 - center) -
				Math.abs(b.bbox.y + b.bbox.h / 2 - center) ||
			Math.abs(anchor.x - a.bbox.x - a.bbox.w) -
				Math.abs(anchor.x - b.bbox.x - b.bbox.w) ||
			compareLayoutReadingOrder(a, b),
	)[0];
	if (!baseline) return [];
	return candidates
		.filter(
			(body) =>
				body === baseline ||
				verticalOverlapRatio(body.bbox, baseline.bbox) >= 0.35,
		)
		.sort(compareLayoutReadingOrder);
}

export type FormulaAssembly = {
	host: PdfLayoutRegion;
	sources: PdfLayoutRegion[];
};

/** Consume each body once. Preserve the equation number as geometry, never infer text. */
export function assembleNumberedFormulas(
	regions: readonly PdfLayoutRegion[],
): FormulaAssembly[] {
	const bodies = new Set(regions.filter((r) => isFormulaLayoutKind(r.kind)));
	const anchors = regions
		.filter(
			(r) =>
				isFormulaNumberLayoutKind(r.kind) &&
				r.score >= LAYOUT_MERGE.formulaNumberMinScore,
		)
		.sort(compareLayoutReadingOrder);
	const assemblies: FormulaAssembly[] = [];
	for (const anchor of anchors) {
		const line = selectFormulasForNumber(anchor, [...bodies]);
		if (!line.length) continue;
		for (const body of line) bodies.delete(body);
		const sources = [anchor, ...line];
		assemblies.push({
			sources,
			host: {
				id: anchor.id,
				pageIndex: anchor.pageIndex,
				kind: "formula",
				label: "formula",
				bbox: sources.map((s) => s.bbox).reduce(unionBbox),
				rect: sources.map((s) => s.rect).reduce(unionRect),
				titleBbox: anchor.bbox,
				score: Math.max(...sources.map((s) => s.score)),
				readingOrder: anchor.readingOrder,
			},
		});
	}
	assemblies.sort((a, b) =>
		compareLayoutReadingOrder(a.host, b.host, formulaSortAnchor),
	);
	return assemblies.map((assembly, readingOrder) => ({
		...assembly,
		host: { ...assembly.host, readingOrder },
	}));
}

export function mergeFormulasByNumber(
	regions: PdfLayoutRegion[],
): PdfLayoutRegion[] {
	const rest = regions.filter(
		(r) =>
			!isFormulaLayoutKind(r.kind) &&
			!isFormulaNumberLayoutKind(r.kind) &&
			!isTextLayoutKind(r.kind),
	);
	return [...rest, ...assembleNumberedFormulas(regions).map((a) => a.host)];
}
