import {
	type FrontmatterProperty,
	parseFrontmatterProperties,
	serializeFrontmatterProperties,
} from "./properties";
import { stripInlineComment } from "./scalar";

function sameProperty(a: FrontmatterProperty, b: FrontmatterProperty): boolean {
	return (
		a.key === b.key &&
		a.kind === b.kind &&
		a.value === b.value &&
		a.items.length === b.items.length &&
		a.items.every((item, i) => item === b.items[i])
	);
}

/**
 * Apply a form projection as source edits, preserving untouched fields, comments,
 * and line endings. Unsupported YAML is never normalized by the form.
 */
export function patchFrontmatterProperties(
	source: string,
	next: FrontmatterProperty[],
): string {
	const parsed = parseFrontmatterProperties(source);
	if (!parsed.ok) throw new Error("Frontmatter requires source editing");
	const properties = next.filter((item) => item.key.trim());
	if (
		new Set(properties.map((item) => item.key.trim())).size !==
		properties.length
	) {
		throw new Error("Duplicate frontmatter keys");
	}
	if (
		properties.some(
			(item) =>
				!/^[^:#\s][^:]*$/.test(item.key.trim()) ||
				/[\r\n"'[\]{}]/.test(item.key),
		)
	) {
		throw new Error("Frontmatter key requires source editing");
	}
	const ending = source.includes("\r\n") ? "\r\n" : "\n";
	const lines = source.split(/\r?\n/);
	const pending = new Map(properties.map((item) => [item.key.trim(), item]));
	const original = new Map(parsed.properties.map((item) => [item.key, item]));
	const result: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(/^([^:#\s][^:]*?)\s*:\s*(.*)$/);
		if (!match || !original.has(match[1].trim())) {
			result.push(lines[i]);
			continue;
		}
		const key = match[1].trim();
		const previous = original.get(key);
		const replacement = pending.get(key);
		pending.delete(key);
		let end = i + 1;
		// Only consume value continuation lines. Inter-property comments stay in place.
		while (
			end < lines.length &&
			(!lines[end].trim() ||
				/^\s/.test(lines[end]) ||
				lines[end].startsWith("#"))
		)
			end++;
		const block = lines.slice(i, end);
		if (previous && replacement && sameProperty(previous, replacement))
			result.push(...block);
		else {
			const comments = block
				.slice(1)
				.filter((line) => !line.trim() || line.trimStart().startsWith("#"));
			if (replacement) {
				const updated = serializeFrontmatterProperties([replacement]).split(
					"\n",
				);
				const raw = match[2];
				const bare = stripInlineComment(raw);
				if (bare.length < raw.length)
					updated[0] += ` ${raw.slice(bare.length).trimStart()}`;
				result.push(...updated);
			} else {
				const raw = match[2];
				const bare = stripInlineComment(raw);
				if (bare.length < raw.length)
					comments.unshift(raw.slice(bare.length).trimStart());
			}
			result.push(...comments);
		}
		i = end - 1;
	}
	if (pending.size) {
		if (result.at(-1) === "") result.pop();
		result.push(
			...serializeFrontmatterProperties([...pending.values()]).split("\n"),
		);
	}
	const output = result.join(ending);
	// Reject generated keys/values outside our form subset before emitting an edit.
	if (!parseFrontmatterProperties(output).ok)
		throw new Error("Frontmatter requires source editing");
	return output;
}
