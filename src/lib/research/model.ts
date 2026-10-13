/** A question-led evidence notebook. No filesystem, model calls, or UI state. */
export const RESEARCH_VIRTUAL_PATH = "litthread:research";

export type EvidenceRelation = "supports" | "challenges" | "context";
export type ResearchEvidence = {
	id: string;
	path: string;
	title: string;
	page: string;
	excerpt: string;
	relation: EvidenceRelation;
};
export type ResearchDraft = {
	question: string;
	hypothesis: string;
	evidence: ResearchEvidence[];
	conclusion: string;
};
export type ResearchReadiness =
	| "question"
	| "evidence"
	| "counterevidence"
	| "review";

export function emptyResearchDraft(): ResearchDraft {
	return { question: "", hypothesis: "", evidence: [], conclusion: "" };
}

/** Only vault paper folders can become source links; never accept external paths. */
export function validEvidencePath(path: string): boolean {
	const parts = path.split("/");
	return (
		parts.length > 1 &&
		parts[0] === "papers" &&
		parts.every((part) => part !== "" && part !== "." && part !== "..") &&
		!path.includes("\0") &&
		!/[\\[\]|#\r\n:*?"<>]/.test(path)
	);
}

export function completeEvidence(evidence: ResearchEvidence): boolean {
	return (
		validEvidencePath(evidence.path) &&
		evidence.excerpt.trim().length > 0 &&
		/^[1-9]\d*$/.test(evidence.page) &&
		Number.isSafeInteger(Number(evidence.page))
	);
}

export function researchReadiness(draft: ResearchDraft): ResearchReadiness {
	if (!draft.question.trim()) return "question";
	const complete = draft.evidence.filter(completeEvidence);
	if (!complete.length) return "evidence";
	if (!complete.some((item) => item.relation === "challenges"))
		return "counterevidence";
	return "review";
}

export function researchSources(draft: ResearchDraft): number {
	return new Set(
		draft.evidence.filter(completeEvidence).map((item) => item.path),
	).size;
}

type NotebookLabels = {
	question: string;
	hypothesis: string;
	evidence: string;
	conclusion: string;
	pending: string;
	page: string;
	recorded: string;
	relations: Record<EvidenceRelation, string>;
};
const labels: Record<"en" | "zh-CN", NotebookLabels> = {
	en: {
		question: "Research question",
		hypothesis: "Working hypothesis",
		evidence: "Evidence ledger",
		conclusion: "Conclusion and limits",
		pending: "Pending",
		page: "Page",
		recorded:
			"User-recorded excerpts; source accuracy and conclusions require human review.",
		relations: {
			supports: "Supports",
			challenges: "Challenges",
			context: "Context",
		},
	},
	"zh-CN": {
		question: "研究问题",
		hypothesis: "工作假设",
		evidence: "证据记录",
		conclusion: "结论与边界",
		pending: "待补充",
		page: "页码",
		recorded: "摘录由用户记录；原文准确性与结论仍需人工核对。",
		relations: { supports: "支持", challenges: "反证", context: "背景" },
	},
};

/** Portable Markdown is the durable record; no parallel hidden database. */
export function renderResearchNotebook(
	draft: ResearchDraft,
	locale: "en" | "zh-CN",
): string {
	const l = labels[locale];
	const lines = [
		"---",
		"litthread_workflow: evidence-notebook",
		"schema_version: 1",
		"---",
		"",
		`# ${draft.question.trim().replace(/[\r\n]+/g, " ") || l.question}`,
		"",
		l.recorded,
		"",
		`## ${l.hypothesis}`,
		"",
		draft.hypothesis.trim() || l.pending,
		"",
		`## ${l.evidence}`,
		"",
	];
	for (const [index, item] of draft.evidence.entries()) {
		if (!validEvidencePath(item.path)) throw new Error("Invalid evidence path");
		const title = item.title.replace(/[\r\n[\]|#]/g, " ").trim() || item.path;
		const page = /^[1-9]\d*$/.test(item.page) ? item.page : l.pending;
		lines.push(
			`### ${index + 1}. ${l.relations[item.relation]} · ${title}`,
			"",
			`[[${item.path}/NOTES|${title}]] · ${l.page}: ${page}`,
			"",
			...(item.excerpt.trim() || l.pending)
				.split(/\r?\n/)
				.map((line) => `> ${line}`),
			"",
		);
	}
	if (!draft.evidence.length) lines.push(l.pending, "");
	lines.push(
		`## ${l.conclusion}`,
		"",
		draft.conclusion.trim() || l.pending,
		"",
	);
	return lines.join("\n");
}

/** Prepare a review request, without sending it or authorizing tool execution. */
export function researchReviewPrompt(
	draft: ResearchDraft,
	locale: "en" | "zh-CN",
): string {
	const instruction =
		locale === "zh-CN"
			? "请审查以下研究问题与证据。先读取引用的本地论文笔记，再定位同目录的原文或 PDF 核对摘录与页码；笔记不能代替原文。区分用户摘录、已核实原文、推断和未解决问题。逐条检查论据，主动寻找反证。不得将缺失证据写成已验证结论；没有核实的引用明确标记。给出结论边界和下一步，不修改文件。"
			: "Review this question and evidence. Read the referenced local paper notes, then locate the original text or PDF in the same folder to verify excerpts and page numbers; notes cannot substitute for the source. Separate user excerpts, verified sources, inferences, and open questions. Check each argument and seek counterevidence. Never present missing evidence as verified; mark unverified citations. Explain limits and next steps. Do not modify files.";
	return `${instruction}\n\n${renderResearchNotebook(draft, locale)}`;
}
