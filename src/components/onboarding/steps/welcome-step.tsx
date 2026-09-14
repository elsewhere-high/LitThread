import { useTranslation } from "react-i18next";
import litthreadAppIcon from "@/assets/litthread-app-icon.svg";

export function WelcomeStep() {
	const { t } = useTranslation("onboarding");

	return (
		<div className="onboarding-welcome">
			<img src={litthreadAppIcon} alt="" aria-hidden className="size-16" />
			<div className="space-y-1.5">
				<h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
				<p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
			</div>
		</div>
	);
}
