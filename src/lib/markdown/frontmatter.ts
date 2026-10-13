/** Stable editor API: document envelope, property projection, and source-preserving edits. */
export {
	frontmatterInterior,
	joinFrontmatter,
	splitFrontmatter,
	wrapFrontmatter,
} from "./frontmatter/document";
export { patchFrontmatterProperties } from "./frontmatter/patch";
export type {
	FrontmatterParseResult,
	FrontmatterProperty,
	FrontmatterPropertyKind,
} from "./frontmatter/properties";
export {
	convertPropertyKind,
	countFrontmatterProperties,
	createEmptyProperty,
	inferScalarKind,
	parseFrontmatterProperties,
	serializeFrontmatterProperties,
} from "./frontmatter/properties";
