/** Compatibility exports for page-local layout assembly. */

export {
	captionAttachScore,
	captionCompatibleWithHost,
	hostFamily,
	isMainAlgorithmCaption,
	isMainFigureCaption,
	isMainTableCaption,
	isSubpanelCaption,
	preferredCaptionPlacement,
} from "./assembly/affinity";
export {
	assembleLayout,
	type LayoutAssemblyDecision,
	type LayoutAssemblyReport,
	mergeCaptionsIntoHosts,
} from "./assembly/engine";
export {
	areFigureNeighbors,
	buildFigureBboxWithFullTitle,
	clipFigureBboxToTitleColumn,
	connectedPanelGroups,
	figureCoveredByBodyText,
	panelInTitleColumn,
	panelsAboveTitle,
	requireFigureTitles,
	resolveFigureBboxOverlaps,
	selectClusterForTitle,
	suppressOrphanFiguresInsideClusters,
	suppressSpuriousFigureDetections,
	verticalCeilingForTitle,
} from "./assembly/figures";
export {
	mergeFormulasByNumber,
	selectFormulasForNumber,
} from "./assembly/formulas";
export {
	bboxCoveredBy,
	bboxFullyContains,
	compareLayoutReadingOrder,
	formulaSortAnchor,
	layoutReadingColumn,
	unionBbox,
} from "./assembly/geometry";
export {
	type CaptionPlacement,
	LAYOUT_MERGE,
	type LayoutHostFamily,
} from "./assembly/policy";
