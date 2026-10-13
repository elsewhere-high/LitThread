import { describe, expect, it } from "vitest";
import { RESEARCH_VIRTUAL_PATH } from "@/lib/research/model";
import {
	createPlaceholderTab,
	remapPathUnder,
	removeTabsUnderPath,
} from "@/lib/workspace/tabs/model";
import { extractTabsFromLayout } from "@/lib/workspace/tabs/persist";
import { loadTabResources } from "@/lib/workspace/tabs/resources";
import {
	canDetachDocument,
	resolveVirtualView,
} from "@/lib/workspace/virtual-views";

describe("virtual workspace view contract", () => {
	it("resolves the research view consistently without a vault or filesystem", async () => {
		const placeholder = createPlaceholderTab(RESEARCH_VIRTUAL_PATH);
		const loaded = await loadTabResources(RESEARCH_VIRTUAL_PATH, null, [], []);
		expect(placeholder.kind).toBe("research");
		expect(loaded.kind).toBe(placeholder.kind);
		expect(loaded.title).toBe(placeholder.title);
		expect(loaded.loaded).toBe(true);
		expect(canDetachDocument(RESEARCH_VIRTUAL_PATH)).toBe(false);
	});
	it("does not remap or remove virtual views during file lifecycle changes", () => {
		const tab = createPlaceholderTab(RESEARCH_VIRTUAL_PATH);
		expect(remapPathUnder(tab.path, "litthread:research", "notes/new")).toBe(
			tab.path,
		);
		expect(removeTabsUnderPath([tab], "litthread:research").tabs).toEqual([
			tab,
		]);
	});
	it("restores the research identity through existing dockview persistence", () => {
		const tabs = extractTabsFromLayout({
			panels: {
				[RESEARCH_VIRTUAL_PATH]: {
					params: { path: RESEARCH_VIRTUAL_PATH, mode: "markdown" },
				},
			},
		}).tabs;
		expect(createPlaceholderTab(tabs[0].path).kind).toBe("research");
	});
	it("ordinary notes remain documents, rather than being classified by a loose prefix", () => {
		expect(resolveVirtualView("notes/research/question.md")).toBeNull();
		expect(resolveVirtualView("litthread:research/unknown")).toBeNull();
		expect(canDetachDocument("notes/research/question.md")).toBe(true);
	});
});
