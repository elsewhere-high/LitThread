import { describe, expect, it } from "vitest";
import {
	completeEvidence,
	emptyResearchDraft,
	type ResearchEvidence,
	renderResearchNotebook,
	researchReadiness,
	researchReviewPrompt,
	researchSources,
	validEvidencePath,
} from "@/lib/research/model";

const evidence: ResearchEvidence = {
	id: "e1",
	path: "papers/topic/study",
	title: "研究论文",
	page: "3",
	excerpt: "原文中的结论。",
	relation: "supports",
};

describe("research evidence workflow", () => {
	it.each([
		"../outside",
		"papers/../outside",
		"papers//study",
		"papers/study#anchor",
		"papers/study|alias",
		"papers\\study",
		"papers",
		"/papers/study",
	])("rejects ambiguous or outside source path %s", (path) =>
		expect(validEvidencePath(path)).toBe(false));
	it("supports nested and Chinese paper folders", () =>
		expect(validEvidencePath("papers/学习/研究论文")).toBe(true));
	it.each([
		"",
		"0",
		"-1",
		"1.5",
		"3abc",
		"9007199254740992",
	])("does not count invalid page %s as evidence", (page) =>
		expect(completeEvidence({ ...evidence, page })).toBe(false));
	it("does not mistake a blank excerpt for a complete record", () =>
		expect(completeEvidence({ ...evidence, excerpt: " \n" })).toBe(false));
	it("counts independent sources instead of repeated excerpts", () => {
		const draft = {
			...emptyResearchDraft(),
			question: "是否成立？",
			evidence: [evidence, { ...evidence, id: "e2", page: "4" }],
		};
		expect(researchSources(draft)).toBe(1);
		expect(researchReadiness(draft)).toBe("counterevidence");
		expect(
			researchReadiness({
				...draft,
				evidence: [
					...draft.evidence,
					{ ...evidence, id: "e3", relation: "challenges" },
				],
			}),
		).toBe("review");
	});
	it("keeps incomplete evidence visible without promoting it", () => {
		const draft = {
			...emptyResearchDraft(),
			question: "问题",
			evidence: [{ ...evidence, page: "" }],
		};
		expect(researchReadiness(draft)).toBe("evidence");
		expect(renderResearchNotebook(draft, "zh-CN")).toContain("页码: 待补充");
	});
	it("exports source wikilinks, role, page, and quoted multiline excerpts", () => {
		const draft = {
			...emptyResearchDraft(),
			question: "假设是否成立？",
			evidence: [
				{
					...evidence,
					excerpt: "第一行\n第二行",
					relation: "challenges" as const,
				},
			],
		};
		const markdown = renderResearchNotebook(draft, "zh-CN");
		expect(markdown).toContain(
			"[[papers/topic/study/NOTES|研究论文]] · 页码: 3",
		);
		expect(markdown).toContain("反证");
		expect(markdown).toContain("> 第一行\n> 第二行");
		expect(markdown).toContain("schema_version: 1");
		expect(markdown).toContain("仍需人工核对");
	});
	it("cannot introduce a second source through a display title", () => {
		const markdown = renderResearchNotebook(
			{
				...emptyResearchDraft(),
				evidence: [{ ...evidence, title: "A]]\n[[outside|B" }],
			},
			"en",
		);
		expect(markdown).not.toContain("[[outside");
	});
	it("rejects malformed evidence even when exporting an incomplete notebook", () =>
		expect(() =>
			renderResearchNotebook(
				{
					...emptyResearchDraft(),
					evidence: [{ ...evidence, path: "../outside" }],
				},
				"en",
			),
		).toThrow("Invalid evidence path"));
	it("prepares human review without granting write permission", () => {
		const prompt = researchReviewPrompt(
			{
				...emptyResearchDraft(),
				question: "What follows?",
				evidence: [evidence],
			},
			"en",
		);
		expect(prompt).toContain("Do not modify files");
		expect(prompt).toContain("mark unverified citations");
		expect(prompt).toContain("papers/topic/study/NOTES");
	});
});
