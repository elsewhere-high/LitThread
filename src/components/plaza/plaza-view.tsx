import { ArrowUpRight } from "lucide-react";
import { useSettings } from "@/hooks/use-app-stores";
import { openPlazaSource } from "@/lib/workspace/actions";
/**
 * 广场（Plaza）center panel: one embedded source per tab.
 *
 * The tree root node is a plain virtual folder (expand/collapse only) with no
 * page of its own; each child row opens its source's tab. Everything is
 * derived from the {@link PLAZA_SOURCES} registry, so a new source needs no
 * changes here.
 */

import { useTranslation } from "react-i18next";
import { PlazaArxivRecView } from "@/components/plaza/plaza-arxiv-rec-view";
import { PlazaFeedsView } from "@/components/plaza/plaza-feeds-view";
import { PlazaSkillsView } from "@/components/plaza/plaza-skills-view";
import { PlazaWebFrame } from "@/components/plaza/plaza-web-frame";
import { cn } from "@/lib/core/utils";
import {
	plazaSourceForPath,
	plazaSourceLabel,
	visiblePlazaSources,
} from "@/lib/plaza";

export function PlazaView({
	path,
	className,
}: {
	path: string;
	className?: string;
}) {
	const { t } = useTranslation("sidebar");
	const { t: tBrand } = useTranslation("app");
	const hidden = useSettings((s) => s.plazaHiddenSources);
	const descriptions = tBrand("brand.sourceDescriptions", {
		returnObjects: true,
	});
	const source = plazaSourceForPath(path);

	if (source?.panel === "skills") {
		return <PlazaSkillsView className={className} />;
	}

	if (source?.panel === "feeds") {
		return <PlazaFeedsView className={className} />;
	}

	if (source?.panel === "arxivRec") {
		return <PlazaArxivRecView className={className} />;
	}

	if (source?.url) {
		return (
			<PlazaWebFrame
				homeUrl={source.url}
				embedOrigin={source.embedOrigin?.() ?? null}
				title={plazaSourceLabel(source)}
				className={className}
			/>
		);
	}

	if (source) {
		return (
			<div
				className={cn(
					"flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm",
					className,
				)}
			>
				{t("plaza.comingSoonFor", { label: plazaSourceLabel(source) })}
			</div>
		);
	}

	return (
		<section className={cn("discovery-desk", className)}>
			<p className="brand-eyebrow">{tBrand("brand.sourcesEyebrow")}</p>
			<h1>{tBrand("brand.discoverTitle")}</h1>
			<p className="discovery-description">
				{tBrand("brand.discoverDescription")}
			</p>
			<div className="discovery-sources">
				{visiblePlazaSources(hidden).map((entry, index) => (
					<button
						type="button"
						key={entry.id}
						onClick={() => openPlazaSource(entry)}
					>
						<span className="source-number">
							{String(index + 1).padStart(2, "0")}
						</span>
						<h2>{plazaSourceLabel(entry)}</h2>
						<p>{descriptions[entry.id as keyof typeof descriptions]}</p>
						<span className="source-open">
							{tBrand("brand.sourceOpen")}
							<ArrowUpRight size={14} />
						</span>
					</button>
				))}
			</div>
			{visiblePlazaSources(hidden).length === 0 && (
				<p>{tBrand("brand.noSources")}</p>
			)}
		</section>
	);
}
