import {
	BookOpen,
	Compass,
	FolderTree,
	MessagesSquare,
	Search,
	Settings2,
	Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import mark from "@/assets/litthread-app-icon.svg";
import {
	useSettings,
	useUiStore,
	useVaultStore,
	useWorkspaceStore,
} from "@/hooks/use-app-stores";
import { isLibraryVirtualPath, isTrashVirtualPath } from "@/lib/paper/api";
import { isPlazaVirtualPath } from "@/lib/plaza";
import { openSettingsWindow } from "@/lib/shell/settings-window";
import { openPalette, toggleSidebar } from "@/lib/shell/ui-store";
import { toggleChat } from "@/lib/shell/ui-window-actions";
import {
	openDiscovery,
	selectLibrary,
	selectTrash,
} from "@/lib/workspace/actions";

export function ResearchNavigation() {
	const { t } = useTranslation("app");
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const activePath = useWorkspaceStore(
		(s) => s.tabs.find((tab) => tab.id === s.activeTabId)?.path,
	);
	const sidebarOpen = useUiStore((s) => !s.sidebarCollapsed);
	const agentOpen = useUiStore(
		(s) => s.rightSidebarOpen && s.rightSidebarTab === "agent",
	);
	const discoveryEnabled = useSettings((s) => s.plazaEnabled);
	const items: {
		key: "library" | "outline" | "search" | "discover" | "conversation";
		icon: typeof BookOpen;
		active: boolean;
		action: () => void;
	}[] = [
		{
			key: "library",
			icon: BookOpen,
			active: isLibraryVirtualPath(activePath),
			action: selectLibrary,
		},
		{
			key: "outline",
			icon: FolderTree,
			active: sidebarOpen,
			action: toggleSidebar,
		},
		{
			key: "search",
			icon: Search,
			active: false,
			action: () => openPalette("go"),
		},
		...(discoveryEnabled
			? [
					{
						key: "discover" as const,
						icon: Compass,
						active: isPlazaVirtualPath(activePath),
						action: openDiscovery,
					},
				]
			: []),
		{
			key: "conversation",
			icon: MessagesSquare,
			active: agentOpen,
			action: toggleChat,
		},
	];
	return (
		<nav className="research-navigation" aria-label={t("brand.navigation")}>
			<div className="rail-brand">
				<img src={mark} alt="LitThread · 文脉" />
			</div>
			<div className="rail-links">
				{items.map(({ key, icon: Icon, active, action }) => (
					<button
						key={key}
						type="button"
						onClick={action}
						disabled={!vaultPath}
						aria-pressed={active}
						title={t(`brand.${key}`)}
					>
						<Icon size={19} strokeWidth={1.6} />
						<span>{t(`brand.${key}`)}</span>
					</button>
				))}
			</div>
			<div className="rail-bottom">
				<button
					type="button"
					onClick={selectTrash}
					disabled={!vaultPath}
					aria-pressed={isTrashVirtualPath(activePath)}
				>
					<Trash2 size={18} />
					<span>{t("brand.trash")}</span>
				</button>
				<button type="button" onClick={() => openSettingsWindow()}>
					<Settings2 size={18} />
					<span>{t("brand.settings")}</span>
				</button>
			</div>
		</nav>
	);
}
