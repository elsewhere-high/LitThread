/** Semantic family for layout hosts — never cross-attach captions across families. */
export type LayoutHostFamily = "figure" | "table" | "algorithm";

/** Where the caption usually sits relative to the host (paper convention). */
export type CaptionPlacement = "below" | "above";

/**
 * Shared geometry thresholds (normalized page coords 0–1).
 * Behavior is covered by test/pdf-layout-*.test.ts; retained thresholds are not a new contribution.
 */
export const LAYOUT_MERGE = {
	/** Title width ≥ this → allow several caption-anchored panel groups. */
	fullWidthTitle: 0.55,
	/**
	 * Max vertical reach above a *half-width* title when no previous caption ceiling.
	 * Full-width multi-row figures (e.g. 3×3 Fig 4) ignore this cap — only the
	 * previous main-caption ceiling bounds the band.
	 */
	maxHeightAboveTitle: 0.55,
	/**
	 * How far a panel bottom may extend past the title top and still count as
	 * “above” it. Full-width titles allow more (bottom-row charts often bleed
	 * into the caption box); half-width stays tight.
	 */
	panelBottomSlack: 0.04,
	fullWidthPanelBottomSlack: 0.14,
	/** Panel neighbor gap (gutter) for grid connectivity. */
	panelNeighborGap: 0.08,
	/** Orphan panel containment inside larger cluster → drop. */
	orphanContainment: 0.55,
	/** Max horizontal gap between formula body and formula_number. */
	formulaNumberMaxGap: 0.28,
	/**
	 * Vertical pad around formula_number when matching same-line bodies.
	 * Kept tight — no multi-line vertical grow into body text.
	 */
	formulaNumberBandPad: 0.02,
	/**
	 * Min model score for a `formula_number` box to start a merge.
	 * Aligns with sidebar gate; filters dual-label / margin noise (~0.01–0.05).
	 */
	formulaNumberMinScore: 0.3,
	/**
	 * Min score for a formula body to be a merge seed.
	 * Tiny score~0.02 fragments next to the number would otherwise win seed sort.
	 */
	formulaBodyMinScore: 0.3,
	/**
	 * Max normalized height of a formula body seed.
	 * Taller boxes are usually paragraph dual-labels / stacked inline math,
	 * not a single display equation line.
	 */
	formulaMaxBodyHeight: 0.055,
	/**
	 * Page midline for two-column reading order (left column before right).
	 * Equation numbers sit on the outer edge of each column; center-x vs mid
	 * is enough for typical academic PDFs.
	 */
	columnMidX: 0.5,
	/**
	 * Drop image/chart when this fraction of its area is covered by a confident
	 * text/header/abstract box (dual-label or text misclassified as figure).
	 */
	figureTextCover: 0.55,
	/** Min score for text/header/abstract to veto a figure detection. */
	figureTextMinScore: 0.3,
} as const;
