import { BookOpen, MessagesSquare, NotebookPen } from "lucide-react";
import { useTranslation } from "react-i18next";
import mark from "@/assets/litthread-app-icon.svg";

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
	return (
		<div className="brand-wordmark">
			<img src={mark} alt="" />
			<span>
				LitThread{!compact && <small>文脉 · RESEARCH, CONNECTED</small>}
			</span>
		</div>
	);
}

/** An original vector composition: pages joined by a continuous reading thread. */
export function ThreadIllustration() {
	return (
		<svg
			className="thread-illustration"
			viewBox="0 0 400 280"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M16 216H383M16 232H383"
				stroke="currentColor"
				strokeOpacity=".1"
			/>
			<rect
				x="80"
				y="39"
				width="148"
				height="183"
				rx="5"
				transform="rotate(-12 80 39)"
				fill="var(--muted)"
				stroke="var(--border)"
			/>
			<rect
				x="169"
				y="38"
				width="143"
				height="191"
				rx="5"
				transform="rotate(8 169 38)"
				fill="var(--card)"
				stroke="var(--border)"
			/>
			<path
				d="M188 67l65 9m-68 10l92 13m-95 7l91 13m-94 7l52 7m-54 8l81 12m-84 8l89 13m-92 7l90 13"
				stroke="var(--foreground)"
				strokeOpacity=".22"
				strokeWidth="3"
			/>
			<path
				d="M23 167c39 0 50-62 104-62 50 0 23 92 58 92 33 0 49-90 74-90s20 46 51 46c23 0 41-29 68-29"
				stroke="var(--thread-copper)"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<circle cx="127" cy="105" r="6" fill="var(--primary)" />
			<circle cx="259" cy="107" r="6" fill="var(--primary)" />
			<circle cx="378" cy="124" r="4" fill="var(--thread-copper)" />
		</svg>
	);
}

export function ResearchIntro() {
	const { t } = useTranslation("app");
	return (
		<section className="research-intro">
			<BrandWordmark />
			<div className="research-intro-copy">
				<p className="brand-eyebrow">{t("brand.eyebrow")}</p>
				<h1>{t("brand.headline")}</h1>
				<p>{t("brand.description")}</p>
			</div>
			<ThreadIllustration />
			<ol className="research-principles">
				{[
					{ Icon: BookOpen, key: "principle1" },
					{ Icon: NotebookPen, key: "principle2" },
					{ Icon: MessagesSquare, key: "principle3" },
				].map(({ Icon, key }, i) => (
					<li key={key}>
						<span className="principle-number">0{i + 1}</span>
						<Icon size={17} />
						<span>
							{t(`brand.${key as "principle1" | "principle2" | "principle3"}`)}
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}
