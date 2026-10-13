import { describe, expect, it } from "vitest";
import { createResearchDraftCache } from "@/lib/research/drafts";
import { emptyResearchDraft } from "@/lib/research/model";

describe("research draft isolation", () => {
	it("restores drafts across cache instances without crossing vaults", () => {
		const saved = new Map<string, string>();
		const storage = {
			getItem: (key: string) => saved.get(key) ?? null,
			setItem: (key: string, value: string) => {
				saved.set(key, value);
			},
		};
		createResearchDraftCache(() => storage).save("vault-A", {
			...emptyResearchDraft(),
			question: "Private question A",
		});
		const reopened = createResearchDraftCache(() => storage);
		expect(reopened.load("vault-A").question).toBe("Private question A");
		expect(reopened.load("vault-B")).toEqual(emptyResearchDraft());
		expect(reopened.load(null)).toEqual(emptyResearchDraft());
	});
	it("keeps drafts in memory when session storage rejects writes", () => {
		const cache = createResearchDraftCache(() => {
			throw new Error("blocked");
		});
		cache.save("vault", { ...emptyResearchDraft(), question: "Still here" });
		expect(cache.load("vault").question).toBe("Still here");
	});
	it.each([
		'{"version":2,"draft":{}}',
		"not json",
		'{"version":1,"draft":{"question":false}}',
		"null",
	])("ignores invalid or future stored draft %s", (data) => {
		const cache = createResearchDraftCache(() => ({
			getItem: () => data,
			setItem: () => {},
		}));
		expect(cache.load("vault")).toEqual(emptyResearchDraft());
	});
	it("does not restore source paths outside the vault", () => {
		const data = JSON.stringify({
			version: 1,
			draft: {
				...emptyResearchDraft(),
				evidence: [
					{
						id: "1",
						title: "outside",
						path: "../outside",
						page: "1",
						excerpt: "x",
						relation: "context",
					},
				],
			},
		});
		const cache = createResearchDraftCache(() => ({
			getItem: () => data,
			setItem: () => {},
		}));
		expect(cache.load("vault").evidence).toEqual([]);
	});
});
