import i18n from "@/i18n";
import {
	isLibraryVirtualPath,
	isTrashVirtualPath,
	LIBRARY_VIRTUAL_PATH,
	TRASH_VIRTUAL_PATH,
} from "@/lib/paper/api";
import {
	isPlazaVirtualPath,
	plazaSourceForPath,
	plazaTitleForPath,
} from "@/lib/plaza";
import { RESEARCH_VIRTUAL_PATH } from "@/lib/research/model";

export type VirtualView = {
	path: string;
	kind: "library" | "trash" | "plaza" | "research";
	title: string;
	htmlUrl: string | null;
};

/** One resolver for identity, placeholders, and hydration. Virtual views never use disk IO. */
export function resolveVirtualView(path: string): VirtualView | null {
	if (path === RESEARCH_VIRTUAL_PATH)
		return {
			path,
			kind: "research",
			title: i18n.t("research:title"),
			htmlUrl: null,
		};
	if (isLibraryVirtualPath(path))
		return {
			path: LIBRARY_VIRTUAL_PATH,
			kind: "library",
			title: "Library",
			htmlUrl: null,
		};
	if (isTrashVirtualPath(path))
		return {
			path: TRASH_VIRTUAL_PATH,
			kind: "trash",
			title: "Recycle Bin",
			htmlUrl: null,
		};
	if (isPlazaVirtualPath(path))
		return {
			path,
			kind: "plaza",
			title: plazaTitleForPath(path),
			htmlUrl: plazaSourceForPath(path)?.url ?? null,
		};
	return null;
}

export function canDetachDocument(path: string): boolean {
	const view = resolveVirtualView(path);
	return !view || view.kind === "plaza";
}
