// LitThread page adapter: navigation, row lifecycle, and correlated import receipts.
(() => {
	try {
		if (parent === window || parent.location.href) return;
	} catch {
		/* Cross-origin app frame. */
	}
	const pending = new Map();
	const upstream = "https://papers.cool";
	const frameUrl = new URL(location.href);
	const sameFrame = (url) =>
		url.protocol === frameUrl.protocol && url.host === frameUrl.host;
	const labels = {
		en: {
			idle: "[Import]",
			pending: "[Importing]",
			done: "[Imported]",
			hint: "Import to my paper library",
		},
		zh: {
			idle: "[入库]",
			pending: "[入库中]",
			done: "[已入库]",
			hint: "导入到我的论文库",
		},
	};
	let language = navigator.language.startsWith("zh") ? "zh" : "en";
	const post = (payload) =>
		parent.postMessage({ source: "litthread-plaza", ...payload }, "*");
	const announce = () => post({ path: location.pathname + location.search });
	const isFeed = (url) => /\/feed\/?$/.test(url.pathname);
	const resolve = (value) => {
		try {
			const url = new URL(value, location.href);
			if (url.origin === upstream)
				return new URL(url.pathname + url.search + url.hash, location.href);
			return sameFrame(url) || /^https?:$/.test(url.protocol) ? url : null;
		} catch {
			return null;
		}
	};
	const handoff = (url) => {
		if (sameFrame(url)) post({ externalPath: url.pathname + url.search });
		else if (/^https?:$/.test(url.protocol)) post({ external: url.href });
	};
	const paint = (button) => {
		const state = button.dataset.state || "idle";
		button.textContent = labels[language][state];
		button.title = labels[language].hint;
		button.disabled = state !== "idle";
	};
	const decorate = (panel) => {
		const title = panel.querySelector("h2.title");
		const index = panel.querySelector(".index");
		const source = index?.closest("a[href]") || title?.querySelector("a[href]");
		if (!title || !source || !panel.id || panel.querySelector(".title-import"))
			return;
		let url;
		try {
			url = new URL(source.href);
		} catch {
			return;
		}
		if (!/^https?:$/.test(url.protocol)) return;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "title-import notranslate";
		button.dataset.paperId = panel.id;
		button.dataset.url = url.href;
		paint(button);
		title.append(document.createTextNode(" "), button);
	};
	const scan = (root) => {
		if (root.nodeType === 1 && root.matches(".panel.paper")) decorate(root);
		for (const panel of root.querySelectorAll(".panel.paper")) decorate(panel);
	};
	const start = () => {
		scan(document);
		if (!window.MutationObserver) return;
		// Observe the body: the source may replace the entire list during a search.
		new MutationObserver((records) => {
			for (const record of records)
				for (const node of record.addedNodes)
					if (node.nodeType === 1) scan(node);
		}).observe(document.body, { childList: true, subtree: true });
	};
	document.addEventListener(
		"click",
		(event) => {
			const target = event.target?.closest
				? event.target
				: event.target?.parentElement;
			const button = target?.closest(".title-import");
			if (button) {
				event.preventDefault();
				event.stopPropagation();
				if (button.dataset.state) return;
				const panel = button.closest(".panel.paper");
				const title =
					panel?.querySelector(".title-link") ||
					document.getElementById(`title-${button.dataset.paperId}`) ||
					panel?.querySelector("h2.title a[href]");
				const requestId =
					typeof crypto.randomUUID === "function"
						? crypto.randomUUID()
						: `${Date.now()}-${Math.random()}`;
				pending.set(button.dataset.paperId, { button, requestId });
				button.dataset.state = "pending";
				paint(button);
				post({
					requestId,
					importPaper: {
						id: button.dataset.paperId,
						branch: document.body.id || undefined,
						url: button.dataset.url,
						title: title?.textContent.trim() || null,
					},
				});
				return;
			}
			const anchor = target?.closest("a[href]");
			const href = anchor?.getAttribute("href");
			if (!href || href.startsWith("#")) return;
			const url = resolve(href);
			if (!url) return;
			if (sameFrame(url) && !isFeed(url)) {
				anchor.href = url.href;
				anchor.target = "_self";
				return;
			}
			event.preventDefault();
			handoff(url);
		},
		true,
	);
	window.open = function (value) {
		const url = resolve(value);
		if (!url) return null;
		if (sameFrame(url) && !isFeed(url)) location.assign(url.href);
		else handoff(url);
		return null;
	};
	window.addEventListener("message", (event) => {
		if (
			event.source !== parent ||
			!event.data ||
			event.data.source !== "litthread-plaza-host"
		)
			return;
		const data = event.data;
		if (data.kind === "configure" && typeof data.language === "string") {
			language = data.language.startsWith("zh") ? "zh" : "en";
			for (const button of document.querySelectorAll(".title-import"))
				paint(button);
			return;
		}
		if (typeof data.importedId !== "string" || typeof data.ok !== "boolean")
			return;
		const request = pending.get(data.importedId);
		if (
			!request ||
			request.requestId !== data.requestId ||
			!request.button.isConnected
		)
			return;
		pending.delete(data.importedId);
		if (data.ok) request.button.dataset.state = "done";
		else delete request.button.dataset.state;
		paint(request.button);
	});
	announce();
	window.addEventListener("pageshow", announce);
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", start, { once: true });
	else start();
})();
