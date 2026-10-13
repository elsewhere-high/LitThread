import {
	isFormScalar,
	parseInlineList,
	quoteYamlScalar,
	unquoteYamlScalar,
} from "./scalar";

/** Keys that are always list-valued in LitThread / Obsidian conventions. */
const FRONTMATTER_LIST_KEYS = new Set(["aliases", "tags", "cssclasses"]);

export type FrontmatterPropertyKind = "scalar" | "list" | "checkbox" | "date";

export type FrontmatterProperty = {
	key: string;
	kind: FrontmatterPropertyKind;
	/**
	 * Scalar / date text, or checkbox `"true"` / `"false"`.
	 * Ignored when kind is list.
	 */
	value: string;
	/** List items (ignored when kind is not list). */
	items: string[];
};

export type FrontmatterParseResult =
	| { ok: true; properties: FrontmatterProperty[] }
	| { ok: false };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Count top-level `key:` lines for the collapsed Properties badge. */
export function countFrontmatterProperties(
	interior: string,
	/** Pass an existing parse to avoid parsing the same source twice. */
	parsed: FrontmatterParseResult = parseFrontmatterProperties(interior),
): number {
	if (parsed.ok) return parsed.properties.length;
	let count = 0;
	for (const line of interior.split(/\r?\n/)) {
		if (!line.trim() || /^\s/.test(line) || line.trimStart().startsWith("#")) {
			continue;
		}
		if (/^[^:\s][^:]*:\s*/.test(line.trim())) count += 1;
	}
	return count;
}

/** Infer form kind from a bare YAML scalar (Obsidian-style heuristics). */
export function inferScalarKind(value: string): FrontmatterPropertyKind {
	const trimmed = value.trim();
	if (/^(true|false)$/i.test(trimmed)) return "checkbox";
	if (ISO_DATE_RE.test(trimmed)) return "date";
	return "scalar";
}

function normalizeCheckboxValue(value: string): "true" | "false" {
	return /^(true|yes|1)$/i.test(value.trim()) ? "true" : "false";
}

function isIsoDate(value: string): boolean {
	if (!ISO_DATE_RE.test(value.trim())) return false;
	const [y, m, d] = value.trim().split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	return (
		dt.getUTCFullYear() === y &&
		dt.getUTCMonth() === m - 1 &&
		dt.getUTCDate() === d
	);
}

/**
 * Parse simple top-level YAML properties. Returns `{ ok: false }` when the
 * document needs raw source editing (nested maps, multi-line scalars, etc.).
 */
export function parseFrontmatterProperties(
	interior: string,
): FrontmatterParseResult {
	const text = interior.replace(/\r\n/g, "\n");
	if (!text.trim()) return { ok: true, properties: [] };

	const lines = text.split("\n");
	const properties: FrontmatterProperty[] = [];
	const keys = new Set<string>();
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index += 1;
			continue;
		}
		if (line.trimStart().startsWith("#")) {
			index += 1;
			continue;
		}
		// Unexpected indent at top level → nested / continuation we do not model.
		if (/^\s/.test(line)) return { ok: false };

		const match = line.match(/^([^:#\s][^:]*?)\s*:\s*(.*)$/);
		if (!match) return { ok: false };
		const key = match[1].trim();
		if (!key || /["'[\]{}]/.test(key) || keys.has(key)) return { ok: false };
		keys.add(key);
		const rest = match[2];
		const restTrimmed = rest.trim();

		// Multi-line scalars are not supported in form mode.
		if (
			restTrimmed === "|" ||
			restTrimmed === ">" ||
			restTrimmed === "|-" ||
			restTrimmed === ">-"
		) {
			return { ok: false };
		}

		// Block list: `key:` then indented `- item` lines.
		if (restTrimmed === "") {
			const items: string[] = [];
			let cursor = index + 1;
			while (cursor < lines.length) {
				const next = lines[cursor];
				if (!next.trim()) {
					cursor += 1;
					continue;
				}
				if (!/^\s/.test(next)) break;
				const trimmed = next.trim();
				if (trimmed.startsWith("#")) {
					cursor += 1;
					continue;
				}
				const itemMatch = trimmed.match(/^-\s*(.*)$/);
				if (!itemMatch) return { ok: false };
				if (!isFormScalar(itemMatch[1] ?? "")) return { ok: false };
				const item = unquoteYamlScalar(itemMatch[1] ?? "");
				if (item) items.push(item);
				cursor += 1;
			}
			if (items.length > 0 || FRONTMATTER_LIST_KEYS.has(key)) {
				properties.push({ key, kind: "list", value: "", items });
			} else {
				properties.push({ key, kind: "scalar", value: "", items: [] });
			}
			index = cursor;
			continue;
		}

		// Inline list: `key: [a, b]`
		if (restTrimmed.startsWith("[")) {
			const items = parseInlineList(rest);
			if (items === null) return { ok: false };
			properties.push({ key, kind: "list", value: "", items });
			index += 1;
			continue;
		}

		// Flow map / complex value → source mode.
		if (!isFormScalar(rest)) return { ok: false };

		const value = unquoteYamlScalar(rest);
		const quoted = restTrimmed.startsWith('"') || restTrimmed.startsWith("'");
		const kind = quoted ? "scalar" : inferScalarKind(value);
		if (kind === "checkbox") {
			properties.push({
				key,
				kind: "checkbox",
				value: normalizeCheckboxValue(value),
				items: [],
			});
		} else if (kind === "date" && isIsoDate(value)) {
			properties.push({
				key,
				kind: "date",
				value: value.trim(),
				items: [],
			});
		} else {
			properties.push({ key, kind: "scalar", value, items: [] });
		}
		index += 1;
	}

	return { ok: true, properties };
}

/** Serialize structured properties to a YAML interior (no fences). */
export function serializeFrontmatterProperties(
	properties: FrontmatterProperty[],
): string {
	const lines: string[] = [];
	for (const property of properties) {
		const key = property.key.trim();
		if (!key) continue;
		if (property.kind === "list") {
			lines.push(`${key}:`);
			for (const item of property.items) {
				const text = item.trim();
				if (!text) continue;
				lines.push(`  - ${quoteYamlScalar(text)}`);
			}
			continue;
		}
		if (property.kind === "checkbox") {
			lines.push(
				`${key}: ${normalizeCheckboxValue(property.value) === "true" ? "true" : "false"}`,
			);
			continue;
		}
		if (property.kind === "date") {
			const date = property.value.trim();
			if (!date) {
				lines.push(`${key}:`);
			} else {
				// Keep ISO dates unquoted so re-parse still infers kind: date.
				lines.push(`${key}: ${date}`);
			}
			continue;
		}
		const value = property.value;
		if (value === "") {
			lines.push(`${key}:`);
		} else {
			lines.push(`${key}: ${quoteYamlScalar(value)}`);
		}
	}
	return lines.join("\n");
}

/** Prefer list kind for known multi-value keys when creating a row. */
function defaultPropertyKind(key: string): FrontmatterPropertyKind {
	return FRONTMATTER_LIST_KEYS.has(key.trim()) ? "list" : "scalar";
}

export function createEmptyProperty(
	key = "",
	kind?: FrontmatterPropertyKind,
): FrontmatterProperty {
	const resolved = kind ?? defaultPropertyKind(key);
	return {
		key,
		kind: resolved,
		value: resolved === "checkbox" ? "false" : "",
		items: [],
	};
}

/** Convert between form property kinds, preserving as much data as practical. */
export function convertPropertyKind(
	property: FrontmatterProperty,
	kind: FrontmatterPropertyKind,
): FrontmatterProperty {
	if (property.kind === kind) return property;

	const asText = (): string => {
		if (property.kind === "list") return property.items.join(", ");
		if (property.kind === "checkbox") {
			return property.value === "true" ? "true" : "false";
		}
		return property.value;
	};

	if (kind === "list") {
		const text = asText().trim();
		return {
			...property,
			kind: "list",
			value: "",
			items: text ? [text] : [],
		};
	}
	if (kind === "checkbox") {
		const text = asText().trim();
		return {
			...property,
			kind: "checkbox",
			value: normalizeCheckboxValue(text || "false"),
			items: [],
		};
	}
	if (kind === "date") {
		const text = asText().trim();
		return {
			...property,
			kind: "date",
			value: isIsoDate(text) ? text.trim() : "",
			items: [],
		};
	}
	return {
		...property,
		kind: "scalar",
		value: asText(),
		items: [],
	};
}
