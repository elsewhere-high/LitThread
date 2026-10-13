import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync(
	new URL(
		"../src-tauri/src/features/paper/discovery/coolpapers/bridge.js",
		import.meta.url,
	),
	"utf8",
);
type TestButton = {
	dataset: Record<string, string>;
	isConnected: boolean;
	disabled?: boolean;
	textContent?: string;
};
function harness(href = "coolpapers://localhost/arxiv") {
	const listeners = new Map<string, (event: Record<string, unknown>) => void>();
	const documentListeners = new Map<
		string,
		(event: Record<string, unknown>) => void
	>();
	const postMessage = vi.fn();
	const assign = vi.fn();
	const observe = vi.fn();
	const parent = {
		postMessage,
		get location(): never {
			throw new Error("cross origin");
		},
	};
	const url = new URL(href);
	let button: TestButton;
	let serial = 0;
	const source = {
		href: "https://arxiv.org/abs/1706.03762",
		textContent: "Attention",
	};
	const indexSource = { ...source, textContent: "#1" };
	const index = { closest: () => indexSource };
	const title = {
		querySelector: () => indexSource,
		append: (_text: unknown, element: TestButton) => {
			button = element;
		},
	};
	const panel = {
		id: "1706.03762",
		querySelector: (selector: string) =>
			selector === ".title-import"
				? button
				: selector === "h2.title"
					? title
					: selector === ".title-link"
						? source
						: selector === "h2.title a[href]"
							? indexSource
							: selector === ".index"
								? index
								: null,
	};
	const document = {
		readyState: "complete",
		body: { id: "arxiv" },
		querySelectorAll: (selector: string) =>
			selector === ".title-import" ? (button ? [button] : []) : [panel],
		addEventListener: (
			name: string,
			handler: (event: Record<string, unknown>) => void,
		) => documentListeners.set(name, handler),
		createTextNode: (text: string) => text,
		createElement: () => ({
			dataset: {},
			isConnected: true,
			closest: () => panel,
		}),
	};
	const window = {
		MutationObserver: class {
			observe = observe;
		},
		addEventListener: (
			name: string,
			handler: (event: Record<string, unknown>) => void,
		) => listeners.set(name, handler),
	} as {
		MutationObserver: unknown;
		addEventListener: unknown;
		open: (value: string) => null;
	};
	runInNewContext(code, {
		window,
		parent,
		document,
		location: {
			href,
			origin: url.origin,
			pathname: url.pathname,
			search: url.search,
			assign,
		},
		navigator: { language: "en" },
		crypto: { randomUUID: () => `request-${++serial}` },
		URL,
		Map,
		Date,
		Math,
		MutationObserver: window.MutationObserver,
	});
	const click = () =>
		documentListeners.get("click")?.({
			target: {
				closest: (selector: string) =>
					selector === ".title-import" ? button : null,
			},
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		});
	const receipt = (value: Record<string, unknown>, from: unknown = parent) =>
		listeners.get("message")?.({
			source: from,
			data: { source: "litthread-plaza-host", ...value },
		});
	return {
		window,
		button: () => button,
		click,
		receipt,
		postMessage,
		assign,
		observe,
	};
}
describe("executable discovery page bridge", () => {
	it("uses protocol and host for private-scheme navigation and blocks executable URLs", () => {
		const h = harness();
		h.window.open("/arxiv/search?q=paper");
		expect(h.assign).toHaveBeenCalledWith(
			"coolpapers://localhost/arxiv/search?q=paper",
		);
		h.window.open("javascript:alert(1)");
		h.window.open("file:///private");
		expect(h.assign).toHaveBeenCalledTimes(1);
		h.window.open("https://papers.cool/arxiv/feed");
		expect(h.postMessage).toHaveBeenLastCalledWith(
			{ source: "litthread-plaza", externalPath: "/arxiv/feed" },
			"*",
		);
		h.window.open("https://arxiv.org/abs/1706.03762");
		expect(h.postMessage).toHaveBeenLastCalledWith(
			{
				source: "litthread-plaza",
				external: "https://arxiv.org/abs/1706.03762",
			},
			"*",
		);
	});
	it("keeps the paper title separate from the source index anchor", () => {
		const h = harness();
		h.click();
		expect(h.postMessage).toHaveBeenLastCalledWith(
			{
				source: "litthread-plaza",
				requestId: "request-1",
				importPaper: {
					id: "1706.03762",
					branch: "arxiv",
					url: "https://arxiv.org/abs/1706.03762",
					title: "Attention",
				},
			},
			"*",
		);
	});
	it("accepts receipts only from its parent for the active request", () => {
		const h = harness();
		h.click();
		expect(h.button().dataset.state).toBe("pending");
		h.receipt(
			{ importedId: "1706.03762", requestId: "request-1", ok: true },
			{},
		);
		expect(h.button().dataset.state).toBe("pending");
		h.receipt({ importedId: "1706.03762", requestId: "old", ok: true });
		expect(h.button().dataset.state).toBe("pending");
		h.receipt({ importedId: "1706.03762", requestId: "request-1", ok: "true" });
		expect(h.button().dataset.state).toBe("pending");
		h.receipt({ importedId: "1706.03762", requestId: "request-1", ok: false });
		expect(h.button().dataset.state).toBeUndefined();
		h.click();
		h.receipt({ importedId: "1706.03762", requestId: "request-1", ok: true });
		expect(h.button().dataset.state).toBe("pending");
		h.receipt({ importedId: "1706.03762", requestId: "request-2", ok: true });
		expect(h.button().textContent).toBe("[Imported]");
		expect(h.button().disabled).toBe(true);
	});
	it("ignores detached rows and unauthorized locale changes", () => {
		const h = harness();
		h.receipt({ kind: "configure", language: "zh-CN" }, {});
		expect(h.button().textContent).toBe("[Import]");
		h.receipt({ kind: "configure", language: "zh-CN" });
		expect(h.button().textContent).toBe("[入库]");
		h.click();
		h.button().isConnected = false;
		h.receipt({ importedId: "1706.03762", requestId: "request-1", ok: true });
		expect(h.button().dataset.state).toBe("pending");
		expect(h.observe).toHaveBeenCalledWith(expect.anything(), {
			childList: true,
			subtree: true,
		});
	});
});
