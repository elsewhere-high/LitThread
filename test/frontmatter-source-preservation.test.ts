import { describe, expect, it } from "vitest";
import {
	parseFrontmatterProperties,
	patchFrontmatterProperties,
	serializeFrontmatterProperties,
} from "@/lib/markdown/frontmatter";

function properties(source: string) {
	const parsed = parseFrontmatterProperties(source);
	if (!parsed.ok) throw new Error("fixture not editable");
	return parsed.properties;
}

describe("frontmatter source-preserving form edits", () => {
	it("keeps comments, CRLF, and untouched quoting after one field changes", () => {
		const source =
			'# 我的笔记\r\ntitle: "原有标题" # 说明\r\n\r\naliases: [甲, 乙]\r\nstatus: reading\r\n';
		const next = properties(source).map((p) =>
			p.key === "status" ? { ...p, value: "done" } : p,
		);
		expect(patchFrontmatterProperties(source, next)).toBe(
			source.replace("status: reading", "status: done"),
		);
	});
	it("retains the edited property's inline comment", () => {
		const source = "status: reading # keep\ntitle: Study\n";
		expect(
			patchFrontmatterProperties(
				source,
				properties(source).map((p) =>
					p.key === "status" ? { ...p, value: "done" } : p,
				),
			),
		).toBe("status: done # keep\ntitle: Study\n");
	});
	it("updates lists with blank lines without leaving stale items", () => {
		const source =
			"tags:\n  - old\n\n  # keep comment\n  - stale\ntitle: Study";
		const output = patchFrontmatterProperties(
			source,
			properties(source).map((p) =>
				p.key === "tags" ? { ...p, items: ["new"] } : p,
			),
		);
		expect(output).not.toContain("stale");
		expect(output).toContain("# keep comment");
		expect(properties(output).find((p) => p.key === "tags")?.items).toEqual([
			"new",
		]);
	});
	it("removes a field without removing its comments or other fields", () => {
		const source = "# keep\ntags: [a] # also keep\ntitle: Study";
		expect(
			patchFrontmatterProperties(
				source,
				properties(source).filter((p) => p.key !== "tags"),
			),
		).toBe("# keep\n# also keep\ntitle: Study");
	});
	it("does not normalize a document for an unchanged form", () => {
		const source = "# 中文\ntitle: 'a # b'\n\ntags: [one, two]\n";
		expect(patchFrontmatterProperties(source, properties(source))).toBe(source);
	});
	it("preserves quoted booleans and dates as text", () => {
		const parsed = properties('label: "true"\ndate_label: "2026-10-12"');
		expect(parsed.map((p) => p.kind)).toEqual(["scalar", "scalar"]);
		expect(properties(serializeFrontmatterProperties(parsed))).toEqual(parsed);
	});
	it("distinguishes hashes in values from YAML comments", () => {
		expect(
			properties("url: https://example.test/#section\nname: C#").map(
				(p) => p.value,
			),
		).toEqual(["https://example.test/#section", "C#"]);
	});
	it("preserves embedded CR and tab text through serialization", () => {
		const parsed = properties('title: "a\\rb\\tc"');
		expect(properties(serializeFrontmatterProperties(parsed))).toEqual(parsed);
	});
	it("keeps duplicate and complex YAML in source mode", () => {
		for (const source of [
			"title: A\ntitle: B",
			"value: &anchor A",
			"value: *anchor",
			"value: !tag data",
			'value: "unterminated',
			'value: "valid" extra',
			'value: "\\u4E2D"',
			"tags: [{nested: value}]",
			"tags:\n  - &anchor value",
		])
			expect(parseFrontmatterProperties(source).ok).toBe(false);
	});
	it("handles an escaped trailing backslash before an inline comment", () => {
		const source = 'title: "C:\\\\" # keep\nstatus: reading';
		expect(properties(source)[0].value).toBe("C:\\");
		const next = properties(source).map((p) =>
			p.key === "title" ? { ...p, value: "new" } : p,
		);
		expect(patchFrontmatterProperties(source, next)).toBe(
			"title: new # keep\nstatus: reading",
		);
	});
	it("rejects duplicate form keys rather than silently losing one value", () => {
		const source = "title: A\nstatus: reading";
		expect(() =>
			patchFrontmatterProperties(
				source,
				properties(source).map((p) => ({ ...p, key: "title" })),
			),
		).toThrow("Duplicate");
	});
});
