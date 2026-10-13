import type { PlazaImportRequest } from "@/lib/plaza/import";

export type PlazaFrameAction =
	| { kind: "navigate"; path: string }
	| { kind: "external"; url: string }
	| { kind: "import"; paper: PlazaImportRequest; requestId: string };

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function webUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 8192) return null;
	try {
		const url = new URL(value);
		return /^https?:$/.test(url.protocol) && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
}
function localPath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 8192 &&
		value.startsWith("/") &&
		!value.startsWith("//") &&
		!Array.from(value).some(
			(character) => character === "\\" || character.charCodeAt(0) <= 32,
		)
	);
}

/** Only the active iframe can request actions. Validate one action before any side effect. */
export function readPlazaFrameAction(
	event: Pick<MessageEvent, "origin" | "source" | "data">,
	expected: {
		origin: string;
		frame: MessageEventSource | null;
		homeUrl: string;
	},
): PlazaFrameAction | null {
	if (
		!expected.frame ||
		event.source !== expected.frame ||
		event.origin !== expected.origin ||
		!record(event.data) ||
		event.data.source !== "litthread-plaza"
	)
		return null;
	const value = event.data;
	const fields = ["path", "external", "externalPath", "importPaper"].filter(
		(key) => value[key] !== undefined,
	);
	if (fields.length !== 1) return null;
	if (fields[0] === "path")
		return localPath(value.path)
			? { kind: "navigate", path: value.path }
			: null;
	if (fields[0] === "external") {
		const url = webUrl(value.external);
		return url ? { kind: "external", url } : null;
	}
	if (fields[0] === "externalPath") {
		if (!localPath(value.externalPath)) return null;
		try {
			const home = new URL(expected.homeUrl);
			const url = new URL(value.externalPath, home);
			return url.origin === home.origin && webUrl(url.href)
				? { kind: "external", url: url.href }
				: null;
		} catch {
			return null;
		}
	}
	if (
		typeof value.requestId !== "string" ||
		!value.requestId ||
		value.requestId.length > 128
	)
		return null;
	const paper = value.importPaper;
	if (
		!record(paper) ||
		typeof paper.id !== "string" ||
		!paper.id.trim() ||
		paper.id.length > 512 ||
		(paper.title !== null && typeof paper.title !== "string") ||
		(typeof paper.title === "string" && paper.title.length > 16384) ||
		(paper.branch !== undefined &&
			paper.branch !== "arxiv" &&
			paper.branch !== "venue")
	)
		return null;
	const url = webUrl(paper.url);
	return url
		? {
				kind: "import",
				requestId: value.requestId,
				paper: {
					id: paper.id,
					url,
					title: paper.title as string | null,
					...(paper.branch ? { branch: paper.branch as string } : {}),
				},
			}
		: null;
}
