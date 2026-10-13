import i18n from "@/i18n";
import { setPendingAgentComposerPrompt } from "@/lib/agent/composer-seed";
import { isTauri } from "@/lib/core/tauri";
import {
	type ResearchDraft,
	renderResearchNotebook,
	researchReviewPrompt,
} from "@/lib/research/model";
import { openRightTab } from "@/lib/shell/ui-window-actions";
import { joinVaultPath } from "@/lib/vault/path";
import { isRemoteVaultHandle } from "@/lib/vault/remote/remote-vault";
import { ensureLocalFsScope } from "@/lib/vault/scope";
import { getVaultPath, scheduleTreeRefresh } from "@/lib/vault/store";
import { openPath } from "@/lib/workspace/actions";

function locale(): "en" | "zh-CN" {
	return i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";
}

/** Writes only a newly allocated note. Existing paper notes and databases are untouched. */
export async function saveResearchNotebook(
	root: string,
	draft: ResearchDraft,
): Promise<string> {
	if (!isTauri() || isRemoteVaultHandle(root))
		throw new Error(i18n.t("research:localOnly"));
	if (!draft.question.trim())
		throw new Error(i18n.t("research:questionNeeded"));
	const content = renderResearchNotebook(draft, locale());
	await ensureLocalFsScope(root);
	if (getVaultPath() !== root) throw new Error(i18n.t("research:vaultChanged"));
	const folder = joinVaultPath(root, "notes/research");
	const path = joinVaultPath(folder, `question-${crypto.randomUUID()}.md`);
	const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
	await mkdir(folder, { recursive: true });
	if (getVaultPath() !== root) throw new Error(i18n.t("research:vaultChanged"));
	await writeTextFile(path, content, { createNew: true });
	if (getVaultPath() === root) {
		scheduleTreeRefresh();
		openPath(path);
	}
	return path;
}

export function prepareResearchReview(draft: ResearchDraft): void {
	setPendingAgentComposerPrompt(researchReviewPrompt(draft, locale()));
	openRightTab("agent");
}
