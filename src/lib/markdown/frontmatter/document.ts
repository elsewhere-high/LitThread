const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

type MarkdownDoc = {
	/** Leading YAML frontmatter block, verbatim (incl. delimiters and trailing newline). Empty when absent. */
	frontmatter: string;
	/** Markdown body after the frontmatter. */
	body: string;
};

/**
 * Split a leading YAML frontmatter block (`---\n...\n---`) from a Markdown
 * document. The frontmatter is preserved byte-exact so it can be re-attached on
 * save without going through the Plate round-trip.
 */
export function splitFrontmatter(md: string): MarkdownDoc {
	if (!md.startsWith("---")) return { frontmatter: "", body: md };
	const match = FRONTMATTER_RE.exec(md);
	if (!match) return { frontmatter: "", body: md };
	return { frontmatter: match[0], body: md.slice(match[0].length) };
}

/** Re-attach a preserved frontmatter block to a serialized body. */
export function joinFrontmatter(frontmatter: string, body: string): string {
	return frontmatter ? frontmatter + body : body;
}

/** Strip `---` fences; empty when there is no frontmatter block. */
export function frontmatterInterior(block: string): string {
	const trimmed = block.trim();
	if (!trimmed) return "";
	const lines = trimmed.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return trimmed;
	// Drop opening fence.
	lines.shift();
	// Drop closing fence when present.
	const close = lines.findIndex(
		(line) => line.trim() === "---" || line.trim() === "...",
	);
	if (close >= 0) lines.splice(close);
	// Preserve interior indentation/newlines; only trim a single trailing blank.
	return lines.join("\n").replace(/\n+$/, "");
}

/**
 * Build a disk-ready frontmatter block from the YAML interior (no fences).
 * Empty / whitespace-only interior yields `""` (no frontmatter).
 */
export function wrapFrontmatter(interior: string): string {
	const body = interior.replace(/^\uFEFF/, "").replace(/\s+$/, "");
	if (!body.trim()) return "";
	return `---\n${body}\n---\n`;
}
