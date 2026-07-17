//! Table-name resolution for the 6 content types.
//!
//! Per `content/SCHEMA.md` each type declares a `main_table`; the
//! translation, part, entry, and relation tables follow fixed conventions
//! (`docs/silan-viking/01` §1.10, `11`). Centralised here so a mapper never
//! hard-codes a table string and the conventions have one definition.

use silan_viking_content::ContentKind;

/// The content main table for a kind (`SCHEMA.md` `main_table`).
pub fn main_table(kind: ContentKind) -> &'static str {
    match kind {
        ContentKind::Idea => "ideas",
        ContentKind::Blog => "blog_posts",
        ContentKind::Project => "projects",
        ContentKind::Episode => "episodes",
        ContentKind::Resume => "personal_info",
        ContentKind::Moment => "moments",
    }
}

/// The per-language translation table for a kind.
pub fn translation_table(kind: ContentKind) -> &'static str {
    match kind {
        ContentKind::Idea => "idea_translations",
        ContentKind::Blog => "blog_post_translations",
        ContentKind::Project => "project_translations",
        ContentKind::Episode => "episode_translations",
        ContentKind::Resume => "personal_info_translations",
        ContentKind::Moment => "moment_translations",
    }
}

/// The foreign-key column a translation row uses to point back at its main
/// table row. Each `*_translations` table names this column after its main
/// table (`blog_post_translations.blog_post_id`, …) — the column name the
/// reverse-generated `silan-viking-entities` carries.
pub fn translation_fk(kind: ContentKind) -> &'static str {
    match kind {
        ContentKind::Idea => "idea_id",
        ContentKind::Blog => "blog_post_id",
        ContentKind::Project => "project_id",
        ContentKind::Episode => "episode_id",
        ContentKind::Resume => "personal_info_id",
        ContentKind::Moment => "moment_id",
    }
}

/// The shared Part-identity table (revision G, `01` §1.10).
pub const ITEM_PART_TABLE: &str = "item_part";

/// The per-language prose Part body table.
pub const ITEM_PART_TRANSLATION_TABLE: &str = "item_part_translation";

/// The shared structured-entry table (`10` §10.4.5).
pub const PART_ENTRY_TABLE: &str = "part_entry";

/// The per-language structured-entry table.
pub const PART_ENTRY_TRANSLATION_TABLE: &str = "part_entry_translation";

/// The general relation table (revision A, `01` §1.10).
pub const CONTENT_RELATION_TABLE: &str = "content_relation";

/// The tag-entity table — one row per distinct tag slug, shared across all 6
/// content types (the `content_*` cross-type family of M0.5).
pub const TAG_TABLE: &str = "tag";

/// The tag-association table — one row per (Item, tag), `entity_type` naming
/// the content kind. Mirrors `content_relation` / `content_interaction`.
pub const CONTENT_TAG_TABLE: &str = "content_tag";

/// The social-links table — one row per resume `social_links` entry, each
/// owned by the `personal_info` row via `personal_info_id`.
pub const SOCIAL_LINKS_TABLE: &str = "social_links";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_kind_resolves_to_distinct_main_tables() {
        let mut seen = Vec::new();
        for kind in ContentKind::ALL {
            let table = main_table(kind);
            assert!(!seen.contains(&table), "{table} used twice");
            seen.push(table);
        }
    }
}
