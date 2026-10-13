//! papers.cool adapter. Transport policy and document rewriting are shared;
//! the browser bridge is independently testable JavaScript.
use crate::features::paper::discovery::proxy::{rewrite_document, SiteProxy};

const NAV_BRIDGE: &str = concat!(
    r#"<style>.title-import { color: #0a7a5a; cursor: pointer; background: none; border: 0; font: inherit; padding: 0; }
.title-import:disabled { color: #888; cursor: default; }</style><script>"#,
    include_str!("bridge.js"),
    "</script>"
);

fn rewrite_html(html: &str) -> String {
    rewrite_document(html, super::ORIGIN, NAV_BRIDGE)
}

static SITE: SiteProxy = SiteProxy {
    label: "Cool Papers",
    origin: super::ORIGIN,
    user_agent: super::USER_AGENT,
    rewrite: rewrite_html,
};

pub fn handle(request: tauri::http::Request<Vec<u8>>, responder: tauri::UriSchemeResponder) {
    crate::features::paper::discovery::proxy::handle(&SITE, request, responder);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retargets_blank_links_so_they_open_in_frame() {
        let out = rewrite_html("<a href=\"/arxiv/cs.AI\" target=\"_blank\">x</a>");
        assert!(out.contains("target=\"_self\""));
        // The bridge's own source mentions _blank, so check the attribute form.
        assert!(!out.contains("target=\"_blank\""));
        assert!(!out.contains("target='_blank'"));
    }

    #[test]
    fn rewrites_absolute_self_links_to_stay_on_the_proxy() {
        let out = rewrite_html("<a href=\"https://papers.cool/arxiv/2608.13558\">x</a>");
        assert!(out.contains("href=\"/arxiv/2608.13558\""));
        assert!(!out.contains("https://papers.cool/"));
    }

    #[test]
    fn leaves_third_party_links_alone() {
        let out = rewrite_html("<a href=\"https://arxiv.org/abs/1706.03762\">x</a>");
        assert!(out.contains("https://arxiv.org/abs/1706.03762"));
    }

    #[test]
    fn injects_nav_bridge_before_head_close() {
        let out = rewrite_html("<html><head><title>t</title></head><body></body></html>");
        assert!(out.contains("litthread-plaza"));
        let script = out.find("litthread-plaza").expect("bridge present");
        let head_end = out.find("</head>").expect("head close present");
        assert!(script < head_end);
    }

    #[test]
    fn injects_nav_bridge_even_without_a_head() {
        let out = rewrite_html("<p>fragment</p>");
        assert!(out.contains("litthread-plaza"));
        assert!(out.contains("<p>fragment</p>"));
    }

    #[test]
    fn ships_the_import_affordance() {
        let out = rewrite_html("<!DOCTYPE html><html><head></head><body></body></html>");
        assert!(out.contains("title-import"));
        assert!(out.contains("importPaper"));
        // Settled from the app so a row can show 已入库 / stay retryable.
        assert!(out.contains("litthread-plaza-host"));
    }

    /// The bridge lands in `<head>`, where the body does not exist yet: decorating
    /// rows there finds nothing and leaves the scroll observer unattached.
    #[test]
    fn defers_row_decoration_until_the_dom_exists() {
        assert!(NAV_BRIDGE.contains("DOMContentLoaded"));
        assert!(NAV_BRIDGE.contains("document.readyState"));
    }

    /// Search, related papers, sort, export and the arXiv calendar all navigate
    /// through `window.open`, which the sandbox drops without `allow-popups`.
    #[test]
    fn routes_scripted_navigation_through_a_patched_window_open() {
        assert!(NAV_BRIDGE.contains("window.open = function"));
        assert!(NAV_BRIDGE.contains("location.assign"));
        // Feeds and same-origin handoffs reopen upstream, not on our scheme.
        assert!(NAV_BRIDGE.contains("isFeed"));
        assert!(NAV_BRIDGE.contains("externalPath"));
    }
}
