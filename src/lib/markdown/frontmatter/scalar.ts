function escapedQuote(raw: string, index: number): boolean {
	let slashes = 0;
	for (let i = index - 1; i >= 0 && raw[i] === "\\"; i--) slashes++;
	return slashes % 2 === 1;
}

export function stripInlineComment(raw: string): string {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === "'" && !inDouble) inSingle = !inSingle;
		else if (ch === '"' && !inSingle) {
			if (!escapedQuote(raw, i)) inDouble = !inDouble;
		} else if (
			ch === "#" &&
			!inSingle &&
			!inDouble &&
			(i === 0 || /\s/.test(raw[i - 1]))
		) {
			return raw.slice(0, i).trimEnd();
		}
	}
	return raw;
}

/** Accept only scalars the form can represent without flattening YAML structure. */
export function isFormScalar(raw: string): boolean {
	const text = stripInlineComment(raw).trim();
	if (!text) return true;
	if (text[0] === '"') {
		for (let i = 1; i < text.length; i++) {
			if (text[i] === '"' && !escapedQuote(text, i))
				return i === text.length - 1;
			if (text[i] === "\\") {
				if (!/[ntr\\"]/.test(text[i + 1] ?? "")) return false;
				i++;
			}
		}
		return false;
	}
	if (text[0] === "'") {
		for (let i = 1; i < text.length; i++) {
			if (text[i] !== "'") continue;
			if (text[i + 1] === "'") i++;
			else return i === text.length - 1;
		}
		return false;
	}
	return !/^[[\]{},&*!|>%@`]/.test(text) && !/:\s/.test(text);
}

export function unquoteYamlScalar(raw: string): string {
	const value = stripInlineComment(raw).trim();
	if (
		(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
		(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
	) {
		const inner = value.slice(1, -1);
		if (value.startsWith('"')) {
			return inner.replace(/\\(n|t|r|\\|")/g, (_, ch: string) => {
				if (ch === "n") return "\n";
				if (ch === "t") return "\t";
				if (ch === "r") return "\r";
				return ch;
			});
		}
		return inner.replace(/''/g, "'");
	}
	return value;
}

export function quoteYamlScalar(value: string): string {
	if (value === "") return '""';
	// Plain scalars when safe for Obsidian-style frontmatter.
	if (
		/^[A-Za-z0-9_./+-][A-Za-z0-9_./+ -]*$/.test(value) &&
		!/^[-?:]/.test(value) &&
		!/:\s/.test(value) &&
		!/^(true|false|null|~)$/i.test(value) &&
		!/^\d{4}-\d{2}-\d{2}$/.test(value)
	) {
		return value;
	}
	return `"${value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t")}"`;
}

export function parseInlineList(raw: string): string[] | null {
	const body = stripInlineComment(raw).trim();
	if (!body.startsWith("[") || !body.endsWith("]")) return null;
	const inner = body.slice(1, -1).trim();
	if (!inner) return [];
	const items: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			current += ch;
			continue;
		}
		if (ch === '"' && !inSingle) {
			if (!escapedQuote(inner, i)) inDouble = !inDouble;
			current += ch;
			continue;
		}
		if (ch === "," && !inSingle && !inDouble) {
			if (!isFormScalar(current)) return null;
			const item = unquoteYamlScalar(current);
			if (item) items.push(item);
			current = "";
			continue;
		}
		current += ch;
	}
	if (inSingle || inDouble) return null;
	if (!isFormScalar(current)) return null;
	const last = unquoteYamlScalar(current);
	if (last) items.push(last);
	return items;
}
