import { z } from "zod";
import {
	emptyResearchDraft,
	type ResearchDraft,
	validEvidencePath,
} from "./model";

const draftSchema = z.object({
	question: z.string(),
	hypothesis: z.string(),
	conclusion: z.string(),
	evidence: z.array(
		z.object({
			id: z.string(),
			path: z.string().refine(validEvidencePath),
			title: z.string(),
			page: z.string(),
			excerpt: z.string(),
			relation: z.enum(["supports", "challenges", "context"]),
		}),
	),
});
type DraftStorage = Pick<Storage, "getItem" | "setItem">;

/** Vault-scoped drafts survive tab closure; Markdown remains the saved artifact. */
export function createResearchDraftCache(storage: () => DraftStorage | null) {
	const memory = new Map<string, ResearchDraft>();
	const key = (root: string) => `litthread-research-draft:${root}`;
	return {
		load(root: string | null): ResearchDraft {
			if (!root) return emptyResearchDraft();
			const cached = memory.get(root);
			if (cached) return cached;
			try {
				const raw = storage()?.getItem(key(root));
				if (raw) {
					const data = JSON.parse(raw) as {
						version?: unknown;
						draft?: unknown;
					};
					const parsed = draftSchema.safeParse(data?.draft);
					if (data?.version === 1 && parsed.success) {
						memory.set(root, parsed.data);
						return parsed.data;
					}
				}
			} catch {
				/* Unavailable storage does not block research. */
			}
			return emptyResearchDraft();
		},
		save(root: string | null, draft: ResearchDraft): void {
			if (!root) return;
			memory.set(root, draft);
			try {
				storage()?.setItem(key(root), JSON.stringify({ version: 1, draft }));
			} catch {
				/* The in-memory draft still survives remounts. */
			}
		},
	};
}

export const researchDraftCache = createResearchDraftCache(() =>
	typeof sessionStorage === "undefined" ? null : sessionStorage,
);
