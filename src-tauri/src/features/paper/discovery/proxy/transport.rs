//! Anonymous, bounded requests to one configured origin.
use super::{looks_like_document, SiteProxy};
use reqwest::{header, Client, Method};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::http::{Request, StatusCode};

const REQUEST_LIMIT: usize = 2 * 1024 * 1024;
const RESPONSE_LIMIT: usize = 32 * 1024 * 1024;
const REDIRECT_LIMIT: usize = 5;

type ClientCache = (Option<String>, HashMap<String, Client>);
static CLIENTS: OnceLock<Mutex<ClientCache>> = OnceLock::new();

pub struct PreparedRequest {
    url: url::Url,
    method: Method,
    headers: Vec<(String, Vec<u8>)>,
    body: Vec<u8>,
}

pub fn is_forwardable(name: &str) -> bool {
    matches!(name, "content-type" | "accept" | "accept-language")
}

fn valid_path(path: &str) -> bool {
    if !path.starts_with('/') || path.starts_with("//") {
        return false;
    }
    let mut decoded = path.to_owned();
    for _ in 0..8 {
        if decoded.contains('\\')
            || decoded.chars().any(char::is_control)
            || decoded.split('/').any(|s| matches!(s, "." | ".."))
        {
            return false;
        }
        let Ok(next) = urlencoding::decode(&decoded) else {
            return false;
        };
        if next == decoded {
            return true;
        }
        decoded = next.into_owned();
    }
    false
}

pub fn prepare(site: &SiteProxy, request: Request<Vec<u8>>) -> Result<PreparedRequest, StatusCode> {
    let (parts, body) = request.into_parts();
    if body.len() > REQUEST_LIMIT {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let method = Method::from_bytes(parts.method.as_str().as_bytes())
        .map_err(|_| StatusCode::METHOD_NOT_ALLOWED)?;
    if !matches!(
        method,
        Method::GET
            | Method::HEAD
            | Method::POST
            | Method::PUT
            | Method::PATCH
            | Method::DELETE
            | Method::OPTIONS
    ) {
        return Err(StatusCode::METHOD_NOT_ALLOWED);
    }
    let path = parts.uri.path();
    if !valid_path(path) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let mut url = url::Url::parse(site.origin).map_err(|_| StatusCode::BAD_GATEWAY)?;
    url.set_path(path);
    url.set_query(parts.uri.query());
    let headers = parts
        .headers
        .iter()
        .filter(|(name, _)| is_forwardable(name.as_str()))
        .map(|(name, value)| (name.to_string(), value.as_bytes().to_vec()))
        .collect();
    Ok(PreparedRequest {
        url,
        method,
        headers,
        body,
    })
}

fn same_origin(origin: &url::Url, target: &url::Url) -> bool {
    target.origin() == origin.origin()
        && target.username().is_empty()
        && target.password().is_none()
}

fn client(site: &SiteProxy) -> Result<Client, String> {
    let proxy = crate::core::http::effective_proxy_url();
    let mut cache = CLIENTS
        .get_or_init(|| Mutex::new((None, HashMap::new())))
        .lock()
        .map_err(|_| "site client cache poisoned")?;
    if cache.0 != proxy {
        *cache = (proxy, HashMap::new());
    }
    if let Some(client) = cache.1.get(site.origin) {
        return Ok(client.clone());
    }
    let origin = url::Url::parse(site.origin).map_err(|e| e.to_string())?;
    let client = crate::core::http::client_builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if !same_origin(&origin, attempt.url()) {
                attempt.error("site redirect leaves configured origin")
            } else if attempt.previous().len() > REDIRECT_LIMIT {
                attempt.error("site redirect limit exceeded")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    cache.1.insert(site.origin.to_owned(), client.clone());
    Ok(client)
}

async fn bounded_body(mut remote: reqwest::Response, limit: usize) -> Result<Vec<u8>, String> {
    if remote
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("site response exceeds size limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = remote.chunk().await.map_err(|e| e.to_string())? {
        if chunk.len() > limit.saturating_sub(bytes.len()) {
            return Err("site response exceeds size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub async fn fetch(
    site: &SiteProxy,
    request: PreparedRequest,
) -> Result<(StatusCode, String, Vec<u8>), String> {
    let mut outgoing = client(site)?
        .request(request.method, request.url)
        .header(header::USER_AGENT, site.user_agent);
    for (name, value) in request.headers {
        outgoing = outgoing.header(name, value);
    }
    if !request.body.is_empty() {
        outgoing = outgoing.body(request.body);
    }
    let remote = outgoing.send().await.map_err(|e| e.to_string())?;
    let status = StatusCode::from_u16(remote.status().as_u16()).map_err(|e| e.to_string())?;
    let mime = remote
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = bounded_body(remote, RESPONSE_LIMIT).await?;
    let is_html = mime
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .eq_ignore_ascii_case("text/html");
    let body = if is_html {
        match std::str::from_utf8(&bytes) {
            Ok(html) if looks_like_document(html) => (site.rewrite)(html).into_bytes(),
            _ => bytes,
        }
    } else {
        bytes
    };
    Ok((status, mime, body))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn site() -> SiteProxy {
        SiteProxy {
            label: "fixture",
            origin: "https://papers.cool",
            user_agent: "LitThreadTest",
            rewrite: |s| s.to_owned(),
        }
    }
    #[test]
    fn keeps_query_and_body_without_forwarding_credentials() {
        let request = Request::builder()
            .method("POST")
            .uri("coolpapers://localhost/venue/search?q=a%2Fb")
            .header("cookie", "secret")
            .header("authorization", "secret")
            .header("origin", "private")
            .header("accept", "application/json")
            .body("{\"query\":\"中文\"}".as_bytes().to_vec())
            .unwrap();
        let planned = prepare(&site(), request).unwrap();
        assert_eq!(
            planned.url.as_str(),
            "https://papers.cool/venue/search?q=a%2Fb"
        );
        assert_eq!(planned.method, Method::POST);
        assert_eq!(planned.headers.len(), 1);
        assert_eq!(
            planned.body,
            String::from("{\"query\":\"中文\"}").into_bytes()
        );
    }
    #[test]
    fn rejects_encoded_traversal_and_windows_separators() {
        for path in [
            "/../x",
            "/%2e%2e/x",
            "/%252e%252e%252fx",
            "/a%5cb",
            "//evil.test/x",
            "/%00x",
        ] {
            assert!(!valid_path(path), "{path}");
        }
        assert!(valid_path("/paper..pdf"));
        assert!(valid_path("/venue/38818%40AAAI"));
    }
    #[test]
    fn rejects_tunneling_and_oversized_requests() {
        for method in ["CONNECT", "TRACE"] {
            let req = Request::builder()
                .method(method)
                .uri("/x")
                .body(vec![])
                .unwrap();
            assert!(matches!(
                prepare(&site(), req),
                Err(StatusCode::METHOD_NOT_ALLOWED)
            ));
        }
        let req = Request::builder()
            .uri("/x")
            .body(vec![0; REQUEST_LIMIT + 1])
            .unwrap();
        assert!(matches!(
            prepare(&site(), req),
            Err(StatusCode::PAYLOAD_TOO_LARGE)
        ));
    }
    #[test]
    fn redirects_cannot_change_origin_or_add_credentials() {
        let origin = url::Url::parse(site().origin).unwrap();
        assert!(same_origin(&origin, &origin.join("/arxiv/x").unwrap()));
        for url in [
            "http://papers.cool/x",
            "https://papers.cool.evil/x",
            "https://user@papers.cool/x",
            "https://papers.cool:444/x",
        ] {
            assert!(!same_origin(&origin, &url::Url::parse(url).unwrap()));
        }
    }
    #[tokio::test]
    async fn bounds_chunked_bodies_without_content_length() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                request.push(stream.read_u8().await.unwrap());
                assert!(request.len() <= 8192);
            }
            assert!(request.starts_with(b"GET / HTTP/1.1"));
            stream.write_all(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n3\r\nabc\r\n3\r\ndef\r\n0\r\n\r\n").await.unwrap();
        });
        let remote = Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{address}/"))
            .send()
            .await
            .unwrap();
        assert!(bounded_body(remote, 5)
            .await
            .unwrap_err()
            .contains("size limit"));
        server.await.unwrap();
    }
}
