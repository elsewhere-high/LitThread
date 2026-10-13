import { isTauri } from "./tauri";

/** Native shell access is centralized here; callers own error presentation. */
export async function closeNativeWindow(): Promise<void> {
	if (!isTauri()) return;
	const { getCurrentWindow } = await import("@tauri-apps/api/window");
	await getCurrentWindow().close();
}

export async function setNativeWindowTitle(title: string): Promise<void> {
	if (!isTauri()) return;
	const { getCurrentWindow } = await import("@tauri-apps/api/window");
	await getCurrentWindow().setTitle(title);
}

export async function focusNativeWindow(): Promise<void> {
	if (!isTauri()) return;
	const { getCurrentWindow } = await import("@tauri-apps/api/window");
	await getCurrentWindow().setFocus();
}

export async function nativeAppVersion(): Promise<string> {
	if (!isTauri()) return "";
	const { getVersion } = await import("@tauri-apps/api/app");
	return getVersion();
}

export async function openNativeLogDirectory(): Promise<void> {
	const [{ appLogDir }, { openPath }] = await Promise.all([
		import("@tauri-apps/api/path"),
		import("@tauri-apps/plugin-opener"),
	]);
	await openPath(await appLogDir());
}

export async function openNativeUrl(url: string): Promise<void> {
	const { openUrl } = await import("@tauri-apps/plugin-opener");
	await openUrl(url);
}
