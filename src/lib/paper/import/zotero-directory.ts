/** The conventional Zotero directory is a domain policy, not UI behavior. */
export async function defaultZoteroDirectory(): Promise<string> {
	const { homeDir, join } = await import("@tauri-apps/api/path");
	return join(await homeDir(), "Zotero");
}
