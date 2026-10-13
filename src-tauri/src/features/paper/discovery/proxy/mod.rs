//! Private-scheme adapters for anonymous literature discovery pages.
//!
//! Source pages remain separate from the application origin. The injected
//! bridge communicates through postMessage; the frontend validates the active
//! frame before dispatching actions. Transport is bounded to a configured origin.
//! Responses retain status, content type and body; upstream framing headers are
//! omitted for embedding, without changing the application's iframe sandbox.

#[cfg(feature = "desktop")]
pub mod arxiv;
#[cfg(feature = "desktop")]
pub mod modelscope;

mod document;
mod transport;
pub use document::rewrite_document;
#[cfg(test)]
use transport::is_forwardable;

use tauri::http::{header, Response, StatusCode};

pub struct SiteProxy {
    /// Human name, used in error bodies and logs.
    pub label: &'static str,
    pub origin: &'static str,
    pub user_agent: &'static str,
    /// Applied to full HTML documents only — see [`looks_like_document`].
    pub rewrite: fn(&str) -> String,
}

fn response(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .body(body)
        .expect("valid site proxy response")
}

/// Whether a body is a full page rather than an XHR fragment.
///
/// Sites fetch `text/html` fragments and write the response text straight into
/// the DOM (papers.cool does this for the Kimi analysis and the bare star
/// counter). Injecting into those renders the bridge source as visible text, so
/// only real documents may be touched.
pub fn looks_like_document(body: &str) -> bool {
    let mut leading = body.trim_start_matches('\u{feff}').trim_start();
    while let Some(comment) = leading.strip_prefix("<!--") {
        let Some(end) = comment.find("-->") else {
            return false;
        };
        leading = comment[end + 3..].trim_start();
    }
    let opening: String = leading
        .chars()
        .take(32)
        .collect::<String>()
        .to_ascii_lowercase();
    let html_tag = |value: &str| {
        value.strip_prefix("html").is_some_and(|tail| {
            tail.starts_with(|c: char| c.is_ascii_whitespace() || c == '>' || c == '/')
        })
    };
    opening.strip_prefix('<').is_some_and(html_tag)
        || opening.strip_prefix("<!doctype").is_some_and(|tail| {
            tail.starts_with(char::is_whitespace) && html_tag(tail.trim_start())
        })
}

pub fn handle(
    site: &'static SiteProxy,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let prepared = match transport::prepare(site, request) {
        Ok(prepared) => prepared,
        Err(status) => {
            responder.respond(response(
                status,
                "text/plain",
                format!("invalid {} request", site.label).into_bytes(),
            ));
            return;
        }
    };
    tauri::async_runtime::spawn(async move {
        let result = transport::fetch(site, prepared).await;
        match result {
            Ok((status, content_type, body)) => {
                responder.respond(response(status, &content_type, body))
            }
            Err(error) => {
                log::warn!(
                    target: "litthread::site_proxy",
                    "{} proxy request failed: {error}", site.label
                );
                responder.respond(response(
                    StatusCode::BAD_GATEWAY,
                    "text/plain",
                    format!("{} unavailable", site.label).into_bytes(),
                ));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_comments_and_rejects_tag_name_lookalikes() {
        assert!(looks_like_document(
            "<!-- source banner -->\n<HTML lang='zh'>"
        ));
        assert!(!looks_like_document("<html-fragment>text</html-fragment>"));
        assert!(!looks_like_document("<!doctype svg><svg>"));
        assert!(!looks_like_document("<!-- unterminated <html>"));
    }

    #[test]
    fn treats_full_pages_as_documents() {
        assert!(looks_like_document("<!DOCTYPE html>\n<html>\n<head>"));
        assert!(looks_like_document("\n  <!doctype html><html>"));
        assert!(looks_like_document("<html lang=\"en\">"));
    }

    /// papers.cool's `toggleKimi` writes this body into the DOM; a bridge here
    /// shows up as text.
    #[test]
    fn treats_kimi_fragment_as_non_document() {
        let fragment = "<p class=\"faq-q\"><strong>Q1</strong>: 试图解决什么问题？</p>\n\n<div class=\"faq-a\">\n\n答案\n\n</div>";
        assert!(!looks_like_document(fragment));
    }

    /// papers.cool's `POST /star` answers with a bare count — the stray `0` users
    /// saw rendered as a page.
    #[test]
    fn treats_star_counter_as_non_document() {
        assert!(!looks_like_document("1060"));
        assert!(!looks_like_document("0"));
        assert!(!looks_like_document(""));
    }

    /// Forwarding `Cookie` / `Origin` would leak the WebView's state (and our
    /// private scheme) upstream; the sources are all browsed anonymously.
    #[test]
    fn forwards_only_content_negotiation_headers() {
        assert!(is_forwardable("content-type"));
        assert!(is_forwardable("accept"));
        assert!(!is_forwardable("cookie"));
        assert!(!is_forwardable("origin"));
        assert!(!is_forwardable("authorization"));
    }
}
