import { describe, expect, it } from "vitest";
import { readPlazaFrameAction } from "@/lib/plaza/frame-protocol";

const frame = {} as Window;
const expected = {
	origin: "coolpapers://localhost",
	frame,
	homeUrl: "https://papers.cool/arxiv",
};
function read(
	data: unknown,
	source: MessageEventSource | null = frame,
	origin = expected.origin,
) {
	return readPlazaFrameAction({ data, source, origin }, expected);
}
const message = (value: Record<string, unknown>) => ({
	source: "litthread-plaza",
	...value,
});
describe("active plaza frame protocol", () => {
	it("rejects sibling windows even with the correct origin", () => {
		expect(read(message({ path: "/arxiv" }), {} as Window)).toBeNull();
		expect(
			read(message({ path: "/arxiv" }), frame, "https://evil.test"),
		).toBeNull();
		expect(read(message({ path: "/arxiv" }), null)).toBeNull();
	});
	it("accepts one typed action, refusing conflicting or malformed payloads", () => {
		expect(read(message({ path: "/arxiv?query=a%20b" }))).toEqual({
			kind: "navigate",
			path: "/arxiv?query=a%20b",
		});
		for (const data of [
			null,
			[],
			message({ path: 3 }),
			message({ path: "/x", external: "https://example.test" }),
			message({ importPaper: null }),
		])
			expect(read(data)).toBeNull();
	});
	it("cannot use navigation or feeds to replace the upstream origin", () => {
		for (const path of [
			"//evil.test/x",
			"/\\evil.test/x",
			"/x\n",
			"https://evil.test",
		]) {
			expect(read(message({ path }))).toBeNull();
			expect(read(message({ externalPath: path }))).toBeNull();
		}
		expect(read(message({ externalPath: "/arxiv/feed?x=1" }))).toEqual({
			kind: "external",
			url: "https://papers.cool/arxiv/feed?x=1",
		});
	});
	it("permits credential-free HTTP links and refuses executable/private schemes", () => {
		for (const external of [
			"javascript:alert(1)",
			"file:///secret",
			"tauri://localhost/x",
			"https://user:pass@example.test",
		])
			expect(read(message({ external }))).toBeNull();
		expect(
			read(message({ external: "https://arxiv.org/abs/1706.03762" })),
		).toEqual({ kind: "external", url: "https://arxiv.org/abs/1706.03762" });
	});
	it("validates every import field and requires a receipt correlation ID", () => {
		const importPaper = {
			id: "1706.03762",
			branch: "arxiv",
			title: "Attention",
			url: "https://arxiv.org/abs/1706.03762",
		};
		expect(read(message({ requestId: "req-1", importPaper }))).toEqual({
			kind: "import",
			requestId: "req-1",
			paper: importPaper,
		});
		expect(read(message({ importPaper }))).toBeNull();
		for (const patch of [
			{ id: "" },
			{ branch: "../private" },
			{ title: 42 },
			{ url: "file:///secret" },
			{ url: "https://user@example.test" },
		])
			expect(
				read(
					message({
						requestId: "req-1",
						importPaper: { ...importPaper, ...patch },
					}),
				),
			).toBeNull();
	});
});
