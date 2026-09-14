import type { DockviewTheme } from "dockview-react";

/**
 * App-native dockview theme: no fixed light/dark palette.
 * Colors come from CSS variables on `.litthread-dockview-theme` (see index.css).
 */
export const litthreadDockTheme: DockviewTheme = {
	name: "litthread",
	className: "litthread-dockview-theme",
	/** Overlay mounts on dockview root so it covers the full content area. */
	dndOverlayMounting: "absolute",
	/** Edge/center targets cover the whole group (including header). */
	dndPanelOverlay: "group",
	dndTabIndicator: "line",
	gap: 0,
};
