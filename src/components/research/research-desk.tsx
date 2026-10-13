import {
	BookOpen,
	ChevronDown,
	FilePlus2,
	Plus,
	ScanSearch,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/hooks/use-app-stores";
import { errorText } from "@/lib/core/error";
import { notifyError, notifySuccess } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import {
	prepareResearchReview,
	saveResearchNotebook,
} from "@/lib/research/actions";
import { researchDraftCache } from "@/lib/research/drafts";
import {
	completeEvidence,
	type EvidenceRelation,
	type ResearchEvidence,
	renderResearchNotebook,
	researchReadiness,
	researchSources,
	validEvidencePath,
} from "@/lib/research/model";
import { isRemoteVaultHandle } from "@/lib/vault/remote/remote-vault";
import { openGraphPath } from "@/lib/workspace/actions";

const fieldClass =
	"w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Presentation only; notebook policy and AI preparation live in the research domain. */
export function ResearchDesk({ vaultPath }: { vaultPath: string | null }) {
	const { t, i18n } = useTranslation("research");
	const id = useId();
	const papers = useLibraryStore((s) => s.papers);
	const [draft, setDraft] = useState(() => researchDraftCache.load(vaultPath));
	useEffect(() => {
		researchDraftCache.save(vaultPath, draft);
	}, [vaultPath, draft]);
	const [query, setQuery] = useState("");
	const [saving, setSaving] = useState(false);
	const [choosing, setChoosing] = useState(false);
	const locale = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";
	const readiness = researchReadiness(draft);
	const candidates = useMemo(
		() =>
			papers
				.filter(
					(paper) =>
						validEvidencePath(paper.path) &&
						paper.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
				)
				.slice(0, 30),
		[papers, query],
	);
	const editable = !saving;
	const canSave =
		!!vaultPath &&
		isTauri() &&
		!isRemoteVaultHandle(vaultPath) &&
		!!draft.question.trim();
	const patchEvidence = (
		evidenceId: string,
		patch: Partial<ResearchEvidence>,
	) => {
		setDraft((previous) => ({
			...previous,
			evidence: previous.evidence.map((item) =>
				item.id === evidenceId ? { ...item, ...patch } : item,
			),
		}));
	};
	const save = async () => {
		if (!vaultPath || saving) return;
		setSaving(true);
		try {
			await saveResearchNotebook(vaultPath, draft);
			notifySuccess(t("saved"));
		} catch (error) {
			notifyError(t("saveFailed"), { description: errorText(error) });
		} finally {
			setSaving(false);
		}
	};
	return (
		<div className="evidence-desk litthread-scroll h-full overflow-y-auto bg-background">
			<div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
				<header className="mb-7 flex items-start gap-4">
					<ScanSearch
						className="mt-1 size-7 shrink-0 text-primary"
						aria-hidden
					/>
					<div>
						<h1 className="font-serif text-3xl">{t("title")}</h1>
						<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
							{t("subtitle")}
						</p>
					</div>
				</header>
				<div
					className="mb-7 flex flex-wrap gap-3 rounded-xl border bg-muted/30 p-4 text-sm"
					aria-live="polite"
				>
					<span className="mr-auto font-medium">
						{t(`readiness.${readiness}`)}
					</span>
					<span>
						{t("sources")}: {researchSources(draft)}
					</span>
					<span>
						{t("records")}: {draft.evidence.filter(completeEvidence).length}
					</span>
				</div>
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
					<div className="space-y-6">
						<section className="evidence-question space-y-4 rounded-xl border p-5">
							<label className="block space-y-2" htmlFor={`${id}-question`}>
								<span className="font-medium text-sm">{t("question")}</span>
								<textarea
									id={`${id}-question`}
									className={fieldClass}
									rows={2}
									value={draft.question}
									disabled={!editable}
									placeholder={t("questionPlaceholder")}
									onChange={(event) =>
										setDraft({ ...draft, question: event.target.value })
									}
								/>
							</label>
							<label className="block space-y-2" htmlFor={`${id}-hypothesis`}>
								<span className="font-medium text-sm">{t("hypothesis")}</span>
								<textarea
									id={`${id}-hypothesis`}
									className={fieldClass}
									rows={2}
									value={draft.hypothesis}
									disabled={!editable}
									placeholder={t("hypothesisPlaceholder")}
									onChange={(event) =>
										setDraft({ ...draft, hypothesis: event.target.value })
									}
								/>
							</label>
						</section>
						<section className="space-y-4">
							<div className="flex items-center justify-between gap-3">
								<h2 className="font-serif text-xl">{t("evidence")}</h2>
								<Button
									variant="outline"
									size="sm"
									disabled={!editable}
									onClick={() => setChoosing(!choosing)}
								>
									<Plus aria-hidden />
									{t("addSource")}
								</Button>
							</div>
							{choosing && (
								<div className="space-y-2 rounded-xl border p-4">
									<label htmlFor={`${id}-search`} className="text-sm">
										{t("chooseSource")}
									</label>
									<input
										id={`${id}-search`}
										className={fieldClass}
										placeholder={t("sourceSearch")}
										value={query}
										onChange={(event) => setQuery(event.target.value)}
									/>
									<div className="max-h-48 overflow-auto">
										{!papers.length && (
											<p className="py-3 text-muted-foreground text-sm">
												{t("noPapers")}
											</p>
										)}
										{candidates.map((paper) => (
											<button
												type="button"
												key={paper.path}
												disabled={!editable}
												className="block w-full rounded-md p-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
												onClick={() => {
													setDraft((previous) => ({
														...previous,
														evidence: [
															...previous.evidence,
															{
																id: crypto.randomUUID(),
																path: paper.path,
																title: paper.title,
																page: "",
																excerpt: "",
																relation: "context",
															},
														],
													}));
													setChoosing(false);
												}}
											>
												<span className="block font-medium">{paper.title}</span>
												<span className="text-muted-foreground text-xs">
													{paper.path}
												</span>
											</button>
										))}
									</div>
								</div>
							)}
							{draft.evidence.map((item) => (
								<article
									key={item.id}
									data-relation={item.relation}
									className="evidence-card space-y-3 rounded-xl border border-l-4 p-4"
								>
									<div className="flex items-start gap-2">
										<h3 className="mr-auto min-w-0 font-medium text-sm">
											{item.title}
										</h3>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={t("openSource")}
											onClick={() => openGraphPath(item.path)}
										>
											<BookOpen aria-hidden />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											disabled={!editable}
											aria-label={t("remove")}
											onClick={() =>
												setDraft({
													...draft,
													evidence: draft.evidence.filter(
														(entry) => entry.id !== item.id,
													),
												})
											}
										>
											<Trash2 aria-hidden />
										</Button>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<label
											className="space-y-1 text-xs"
											htmlFor={`${id}-${item.id}-relation`}
										>
											<span>{t("relation")}</span>
											<span className="relative block">
												<select
													id={`${id}-${item.id}-relation`}
													className={`${fieldClass} appearance-none pr-8`}
													value={item.relation}
													disabled={!editable}
													onChange={(event) =>
														patchEvidence(item.id, {
															relation: event.target.value as EvidenceRelation,
														})
													}
												>
													{(["supports", "challenges", "context"] as const).map(
														(role) => (
															<option key={role} value={role}>
																{t(role)}
															</option>
														),
													)}
												</select>
												<ChevronDown
													className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
													aria-hidden
												/>
											</span>
										</label>
										<label
											className="space-y-1 text-xs"
											htmlFor={`${id}-${item.id}-page`}
										>
											<span>{t("page")}</span>
											<input
												id={`${id}-${item.id}-page`}
												className={fieldClass}
												inputMode="numeric"
												value={item.page}
												disabled={!editable}
												onChange={(event) =>
													patchEvidence(item.id, { page: event.target.value })
												}
											/>
										</label>
									</div>
									<label
										className="block space-y-1 text-xs"
										htmlFor={`${id}-${item.id}-excerpt`}
									>
										<span>{t("excerpt")}</span>
										<textarea
											id={`${id}-${item.id}-excerpt`}
											className={fieldClass}
											rows={3}
											value={item.excerpt}
											disabled={!editable}
											onChange={(event) =>
												patchEvidence(item.id, { excerpt: event.target.value })
											}
										/>
									</label>
									{!completeEvidence(item) && (
										<p className="text-muted-foreground text-xs">
											{t("incomplete")}
										</p>
									)}
								</article>
							))}
							{!draft.evidence.length && (
								<div className="evidence-empty flex items-center gap-3 rounded-xl border border-dashed p-5 text-muted-foreground text-sm leading-relaxed">
									<BookOpen className="size-5 shrink-0" aria-hidden />
									<p>{t("emptyEvidence")}</p>
								</div>
							)}
							<p className="text-muted-foreground text-xs">{t("recorded")}</p>
						</section>
						<label className="block space-y-2" htmlFor={`${id}-conclusion`}>
							<span className="font-serif text-xl">{t("conclusion")}</span>
							<textarea
								id={`${id}-conclusion`}
								className={fieldClass}
								rows={4}
								value={draft.conclusion}
								disabled={!editable}
								placeholder={t("conclusionPlaceholder")}
								onChange={(event) =>
									setDraft({ ...draft, conclusion: event.target.value })
								}
							/>
						</label>
					</div>
					<aside className="evidence-actions space-y-4 rounded-xl border p-4 lg:sticky lg:top-0 lg:self-start">
						<Button
							className="h-auto min-h-9 w-full whitespace-normal"
							disabled={!canSave || saving}
							onClick={() => void save()}
						>
							<FilePlus2 aria-hidden />
							{t(saving ? "saving" : "save")}
						</Button>
						{(!vaultPath || !isTauri() || isRemoteVaultHandle(vaultPath)) && (
							<p className="text-muted-foreground text-xs">{t("localOnly")}</p>
						)}
						<p className="text-muted-foreground text-xs leading-relaxed">
							{t("draftHint")}
						</p>
						<Button
							className="w-full"
							variant="outline"
							disabled={!draft.question.trim() || saving}
							onClick={() => prepareResearchReview(draft)}
						>
							<Sparkles aria-hidden />
							{t("review")}
						</Button>
						<p className="text-muted-foreground text-xs leading-relaxed">
							{t("reviewHint")}
						</p>
						<details className="rounded-lg border p-3 text-xs">
							<summary className="cursor-pointer">{t("preview")}</summary>
							<pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono">
								{renderResearchNotebook(draft, locale)}
							</pre>
						</details>
					</aside>
				</div>
			</div>
		</div>
	);
}
