//! Rewriting `silan://` resource references into website URLs.
//!
//! A content author refers to a binary resource that lives beside their Item
//! by a `silan://` URI — in a frontmatter field (`featured_image_url`,
//! `institution_logo_url`, …) or inline in a prose body (`![](silan://…)`).
//! The scan ([`crate::workspace::ScannedAsset`]) finds the file itself; this
//! module rewrites the *reference* so the synced database stores the
//! `/api/v1/media/…` path the Go backend serves it at.
//!
//! Asset references become media URLs; Item references become their public
//! page routes. Treating every `silan://resources/...` URI as a binary asset
//! produces broken links such as `/api/v1/media?f=ideas/my-idea`.

/// The `silan://` prefix a *resource* reference begins with. Only the
/// `resources` namespace is rewritten — an `agent`-namespace URI is never a
/// published media reference, so it is left untouched.
const SILAN_RESOURCES_PREFIX: &str = "silan://resources/";

/// The route the Go backend serves media files under, with the file's path
/// carried as the `f` query parameter. A query parameter — not a path
/// segment — is used because the resource path is variable-depth
/// (`episode/<series>/<ep>/assets/…`) and go-zero's router matches one path
/// segment per `:param`, with no catch-all. The route itself is relative (no
/// host) so it is correct on localhost and on a deployed domain alike.
const MEDIA_ROUTE: &str = "/api/v1/media?f=";

/// Rewrite one reference value.
///
/// `silan://resources/blog/my-post/assets/figure.png` becomes
/// `/api/v1/media?f=blog/my-post/assets/figure.png`. Any other string — an
/// external `https://…` URL, an already-rewritten `/api/v1/media?f=…` value,
/// an empty value — is returned unchanged: rewriting is opt-in via the
/// `silan://resources/` prefix.
pub fn rewrite_reference(value: &str) -> String {
    match value.strip_prefix(SILAN_RESOURCES_PREFIX) {
        Some(tail) if tail.split('/').any(|segment| segment == "assets") => {
            format!("{MEDIA_ROUTE}{tail}")
        }
        Some(tail) => rewrite_item_reference(tail).unwrap_or_else(|| value.to_owned()),
        None => value.to_owned(),
    }
}

fn rewrite_item_reference(tail: &str) -> Option<String> {
    let segments: Vec<&str> = tail
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    match segments.as_slice() {
        ["ideas", slug, ..] => Some(format!("/ideas/{slug}")),
        ["projects", slug, ..] => Some(format!("/projects/{slug}")),
        ["blog", slug, ..] => Some(format!("/blog/{slug}")),
        ["episode", _series, slug, ..] => Some(format!("/episodes/{slug}")),
        ["update", ..] => Some("/recent-updates".to_owned()),
        ["resume", ..] => Some("/".to_owned()),
        _ => None,
    }
}

/// Rewrite every `silan://resources/…` reference embedded in a prose body.
///
/// This rewrites the URI wherever it appears as a contiguous token —
/// covering Markdown image (`![alt](silan://…)`) and link (`[t](silan://…)`)
/// targets, and a bare URI in text. A token runs until whitespace or one of
/// the Markdown delimiters `)`, `"`, `'`, `>` — so the surrounding Markdown
/// syntax is preserved and only the URI itself is replaced.
pub fn rewrite_prose(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut rest = body;
    while let Some(at) = rest.find(SILAN_RESOURCES_PREFIX) {
        out.push_str(&rest[..at]);
        let after = &rest[at..];
        // The URI token ends at the first delimiter that cannot be part of a
        // `silan://` path (whitespace or a Markdown closing character).
        let end = after
            .find(|c: char| c.is_whitespace() || matches!(c, ')' | '"' | '\'' | '>' | '<'))
            .unwrap_or(after.len());
        out.push_str(&rewrite_reference(&after[..end]));
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_a_silan_resources_reference() {
        assert_eq!(
            rewrite_reference("silan://resources/blog/my-post/assets/figure.png"),
            "/api/v1/media?f=blog/my-post/assets/figure.png"
        );
    }

    #[test]
    fn rewrites_item_references_to_public_routes_not_media() {
        assert_eq!(
            rewrite_reference("silan://resources/ideas/silan-viking"),
            "/ideas/silan-viking"
        );
        assert_eq!(
            rewrite_reference("silan://resources/projects/runtime"),
            "/projects/runtime"
        );
        assert_eq!(
            rewrite_reference("silan://resources/episode/series/intro"),
            "/episodes/intro"
        );
    }

    #[test]
    fn leaves_external_and_already_rewritten_values_untouched() {
        assert_eq!(
            rewrite_reference("https://arxiv.org/figure.png"),
            "https://arxiv.org/figure.png"
        );
        assert_eq!(
            rewrite_reference("/api/v1/media?f=blog/x/assets/a.png"),
            "/api/v1/media?f=blog/x/assets/a.png"
        );
        assert_eq!(rewrite_reference(""), "");
        // The `agent` namespace is never a media reference.
        assert_eq!(
            rewrite_reference("silan://agent/notes/x"),
            "silan://agent/notes/x"
        );
    }

    #[test]
    fn rewrites_a_markdown_image_in_prose_keeping_syntax() {
        let body = "Intro.\n\n![A flow diagram](silan://resources/blog/p/assets/flow.svg)\n\nMore.";
        assert_eq!(
            rewrite_prose(body),
            "Intro.\n\n![A flow diagram](/api/v1/media?f=blog/p/assets/flow.svg)\n\nMore."
        );
    }

    #[test]
    fn rewrites_multiple_references_and_leaves_the_rest() {
        let body = "![a](silan://resources/blog/p/assets/a.png) and \
                    [link](https://example.com) and ![b](silan://resources/blog/p/assets/b.png)";
        assert_eq!(
            rewrite_prose(body),
            "![a](/api/v1/media?f=blog/p/assets/a.png) and \
             [link](https://example.com) and ![b](/api/v1/media?f=blog/p/assets/b.png)"
        );
    }

    #[test]
    fn prose_without_any_reference_is_unchanged() {
        let body = "# Title\n\nJust prose, no images.";
        assert_eq!(rewrite_prose(body), body);
    }
}
