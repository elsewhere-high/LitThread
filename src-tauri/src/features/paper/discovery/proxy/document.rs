//! Rewrite URL attributes, never arbitrary text or script literals.
//! A small lexical walk preserves document bytes outside edited attribute values.

fn local_url(value: &str, origin: &str) -> Option<String> {
    let absolute = if value.starts_with("//") {
        format!("https:{value}")
    } else {
        value.to_owned()
    };
    let base = url::Url::parse(origin).ok()?;
    let target = url::Url::parse(&absolute).ok()?;
    if target.origin() != base.origin()
        || !target.username().is_empty()
        || target.password().is_some()
    {
        return None;
    }
    let mut path = target.path().to_string();
    if let Some(query) = target.query() {
        path.push('?');
        path.push_str(query);
    }
    if let Some(fragment) = target.fragment() {
        path.push('#');
        path.push_str(fragment);
    }
    Some(path)
}

fn rewrite_tag(tag: &str, origin: &str) -> String {
    let bytes = tag.as_bytes();
    let mut cursor = 1;
    while cursor < bytes.len() && !bytes[cursor].is_ascii_whitespace() && bytes[cursor] != b'>' {
        cursor += 1;
    }
    let mut edits = Vec::new();
    while cursor < bytes.len() {
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        let name_start = cursor;
        while cursor < bytes.len()
            && (bytes[cursor].is_ascii_alphanumeric()
                || matches!(bytes[cursor], b'-' | b':' | b'_'))
        {
            cursor += 1;
        }
        if cursor == name_start {
            cursor += 1;
            continue;
        }
        let name = tag[name_start..cursor].to_ascii_lowercase();
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if bytes.get(cursor) != Some(&b'=') {
            continue;
        }
        cursor += 1;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        let quote = bytes
            .get(cursor)
            .copied()
            .filter(|b| matches!(b, b'\'' | b'"'));
        if quote.is_some() {
            cursor += 1;
        }
        let value_start = cursor;
        while cursor < bytes.len()
            && match quote {
                Some(q) => bytes[cursor] != q,
                None => !bytes[cursor].is_ascii_whitespace() && bytes[cursor] != b'>',
            }
        {
            cursor += 1;
        }
        let value = &tag[value_start..cursor];
        let replacement = if name == "target" && value.eq_ignore_ascii_case("_blank") {
            Some("_self".to_owned())
        } else if matches!(name.as_str(), "href" | "src" | "action" | "poster" | "data") {
            local_url(value, origin)
        } else {
            None
        };
        if let Some(replacement) = replacement {
            edits.push((value_start, cursor, replacement));
        }
        if quote.is_some() {
            cursor += 1;
        }
    }
    let mut out = tag.to_owned();
    for (start, end, replacement) in edits.into_iter().rev() {
        out.replace_range(start..end, &replacement);
    }
    out
}

pub fn rewrite_document(html: &str, origin: &str, bridge: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let bytes = html.as_bytes();
    let mut cursor = 0;
    let mut out = String::with_capacity(html.len() + bridge.len());
    let mut inserted = false;
    let mut raw_element: Option<&str> = None;
    while cursor < bytes.len() {
        if let Some(name) = raw_element.take() {
            let closing = format!("</{name}");
            let Some(offset) = lower[cursor..].find(&closing) else {
                out.push_str(&html[cursor..]);
                break;
            };
            out.push_str(&html[cursor..cursor + offset]);
            cursor += offset;
        }
        let Some(offset) = html[cursor..].find('<') else {
            out.push_str(&html[cursor..]);
            break;
        };
        out.push_str(&html[cursor..cursor + offset]);
        cursor += offset;
        if html[cursor..].starts_with("<!--") {
            let end = html[cursor + 4..]
                .find("-->")
                .map(|n| cursor + 4 + n + 3)
                .unwrap_or(html.len());
            out.push_str(&html[cursor..end]);
            cursor = end;
            continue;
        }
        let start = cursor;
        cursor += 1;
        let mut quote = None;
        while cursor < bytes.len() {
            match (quote, bytes[cursor]) {
                (None, b'\'' | b'"') => quote = Some(bytes[cursor]),
                (Some(q), b) if q == b => quote = None,
                (None, b'>') => break,
                _ => {}
            }
            cursor += 1;
        }
        if cursor == bytes.len() {
            out.push_str(&html[start..]);
            break;
        }
        cursor += 1;
        let tag = &html[start..cursor];
        let name = lower[start + 1..cursor - 1]
            .split_ascii_whitespace()
            .next()
            .unwrap_or("")
            .trim_end_matches('/');
        if name == "/head" && !inserted {
            out.push_str(bridge);
            inserted = true;
        }
        out.push_str(&rewrite_tag(tag, origin));
        if matches!(name, "script" | "style" | "textarea" | "title") {
            raw_element = Some(name);
        }
    }
    if inserted {
        out
    } else {
        format!("{bridge}{out}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ORIGIN: &str = "https://papers.cool";
    #[test]
    fn handles_case_spacing_and_unquoted_attributes() {
        let out = rewrite_document(
            "<HEAD></HEAD><A HREF = 'https://papers.cool/a?x=1#p' TARGET = _BLANK>x</A>",
            ORIGIN,
            "BRIDGE",
        );
        assert!(out.contains("BRIDGE</HEAD>"));
        assert!(out.contains("HREF = '/a?x=1#p' TARGET = _self"));
    }
    #[test]
    fn preserves_scripts_comments_and_visible_source_text() {
        let html = "<head><script>const a='https://papers.cool/x'; const b='</head>';</script><!-- </head> --></head><p>https://papers.cool/x</p>";
        let out = rewrite_document(html, ORIGIN, "BRIDGE");
        assert_eq!(
            out,
            html.replacen(
                "</script><!-- </head> --></head>",
                "</script><!-- </head> -->BRIDGE</head>",
                1
            )
        );
    }
    #[test]
    fn refuses_origin_lookalikes_and_credentials() {
        for url in [
            "https://papers.cool.evil.test/x",
            "https://evil.test/https://papers.cool/x",
            "https://user:pass@papers.cool/x",
        ] {
            assert_eq!(local_url(url, ORIGIN), None);
        }
        assert_eq!(local_url("//papers.cool/x", ORIGIN), Some("/x".into()));
    }
    #[test]
    fn preserves_chinese_and_quoted_greater_than() {
        let html = "<a title='文献 > 证据' href='https://papers.cool/venue/123'>中文</a>";
        assert_eq!(
            rewrite_document(html, ORIGIN, ""),
            "<a title='文献 > 证据' href='/venue/123'>中文</a>"
        );
    }
}
