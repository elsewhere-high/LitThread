import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveResearchNotebook } from "@/lib/research/actions";
import { emptyResearchDraft } from "@/lib/research/model";

const io = vi.hoisted(() => ({
	mkdir: vi.fn(),
	writeTextFile: vi.fn(),
	scope: vi.fn(),
	openPath: vi.fn(),
	refresh: vi.fn(),
	root: "test-vault",
	tauri: true,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
	mkdir: io.mkdir,
	writeTextFile: io.writeTextFile,
}));
vi.mock("@/lib/core/tauri", () => ({ isTauri: () => io.tauri }));
vi.mock("@/lib/vault/scope", () => ({ ensureLocalFsScope: io.scope }));
vi.mock("@/lib/vault/store", () => ({
	getVaultPath: () => io.root,
	scheduleTreeRefresh: io.refresh,
}));
vi.mock("@/lib/vault/remote/remote-vault", () => ({
	isRemoteVaultHandle: (root: string) => root.startsWith("remote:"),
}));
vi.mock("@/lib/workspace/actions", () => ({ openPath: io.openPath }));
vi.mock("@/lib/shell/ui-window-actions", () => ({ openRightTab: vi.fn() }));
vi.mock("@/lib/agent/composer-seed", () => ({
	setPendingAgentComposerPrompt: vi.fn(),
}));

beforeEach(() => {
	vi.clearAllMocks();
	io.root = "test-vault";
	io.tauri = true;
	io.mkdir.mockReset();
	io.scope.mockReset();
	io.writeTextFile.mockReset();
});
const draft = { ...emptyResearchDraft(), question: "研究问题" };

describe("research notebook writes", () => {
	it("creates a new note using exclusive creation, never a paper's NOTES.md", async () => {
		const path = await saveResearchNotebook("test-vault", draft);
		expect(path).toMatch(/^test-vault\/notes\/research\/question-[\w-]+\.md$/);
		expect(io.writeTextFile).toHaveBeenCalledWith(
			path,
			expect.stringContaining("litthread_workflow: evidence-notebook"),
			{ createNew: true },
		);
		expect(io.openPath).toHaveBeenCalledWith(path);
	});
	it("aborts before writing if the user switched vaults during scope preparation", async () => {
		io.scope.mockImplementation(async () => {
			io.root = "another-vault";
		});
		await expect(saveResearchNotebook("test-vault", draft)).rejects.toThrow();
		expect(io.writeTextFile).not.toHaveBeenCalled();
		expect(io.mkdir).not.toHaveBeenCalled();
	});
	it("also checks vault identity after directory creation", async () => {
		io.mkdir.mockImplementation(async () => {
			io.root = "another-vault";
		});
		await expect(saveResearchNotebook("test-vault", draft)).rejects.toThrow();
		expect(io.writeTextFile).not.toHaveBeenCalled();
	});
	it("propagates write failure without opening an empty notebook", async () => {
		io.writeTextFile.mockRejectedValue(new Error("existing path"));
		await expect(saveResearchNotebook("test-vault", draft)).rejects.toThrow(
			"existing path",
		);
		expect(io.openPath).not.toHaveBeenCalled();
	});
	it("does not open a saved notebook into a different vault", async () => {
		io.writeTextFile.mockImplementation(async () => {
			io.root = "another-vault";
		});
		await saveResearchNotebook("test-vault", draft);
		expect(io.openPath).not.toHaveBeenCalled();
	});
	it("requires a local desktop vault and an actual question", async () => {
		await expect(
			saveResearchNotebook("remote:session", draft),
		).rejects.toThrow();
		await expect(
			saveResearchNotebook("test-vault", emptyResearchDraft()),
		).rejects.toThrow();
		io.tauri = false;
		await expect(saveResearchNotebook("test-vault", draft)).rejects.toThrow();
		expect(io.writeTextFile).not.toHaveBeenCalled();
	});
});
