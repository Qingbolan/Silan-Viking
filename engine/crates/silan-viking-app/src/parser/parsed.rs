//! `Parsed` — the read-only product of a `Parser`, plus its builder.
//!
//! Per `docs/silan-viking/01` §1.8.0, `Parsed` mirrors the database's
//! multi-language structure: a language-neutral [`LangNeutral`] (slug, dates,
//! enums — the main-table columns) plus one [`LangVariant`] per language
//! (titles, prose bodies, entries — the `*_translation` rows).
//!
//! `Parsed` is **construct-once, then read-only** (§1.5.0): its fields are
//! private; the only build path is [`ParsedBuilder`], whose mutators are
//! visible only inside `crate::parser`. A `Mapper` can read a `Parsed` but
//! can never amend it.

use super::entry::PartEntry;
use silan_viking_base::{ItemId, Lang, PartId};
use silan_viking_content::{ContentKind, PartRole, Relation};
use std::collections::BTreeMap;

/// One value of a language-neutral frontmatter field.
#[derive(Debug, Clone, PartialEq)]
pub enum FieldValue {
    /// A string / slug / enum / url value.
    Text(String),
    /// An integer value.
    Int(i64),
    /// A floating-point value.
    Float(f64),
    /// A boolean value.
    Bool(bool),
    /// A list of strings (`tags`, `tech_stack`).
    List(Vec<String>),
}

impl FieldValue {
    /// The value as a string slice, if textual.
    pub fn as_text(&self) -> Option<&str> {
        match self {
            FieldValue::Text(s) => Some(s),
            _ => None,
        }
    }

    /// The value as a list, if it is one.
    pub fn as_list(&self) -> Option<&[String]> {
        match self {
            FieldValue::List(items) => Some(items),
            _ => None,
        }
    }
}

/// The language-neutral fields of a parsed Item — slug, status, dates, enums.
///
/// These come only from the canonical-language file (`01` §1.3.1); they land
/// as columns of the content main table.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LangNeutral {
    fields: BTreeMap<String, FieldValue>,
}

impl LangNeutral {
    /// Look up a language-neutral field.
    pub fn get(&self, name: &str) -> Option<&FieldValue> {
        self.fields.get(name)
    }

    /// The text value of a field, if present and textual.
    pub fn text(&self, name: &str) -> Option<&str> {
        self.get(name).and_then(FieldValue::as_text)
    }

    /// All field names present.
    pub fn field_names(&self) -> impl Iterator<Item = &str> {
        self.fields.keys().map(String::as_str)
    }

    /// The number of fields.
    pub fn len(&self) -> usize {
        self.fields.len()
    }

    /// Whether no fields are present.
    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }
}

/// One language's content of a parsed Item — titles, prose bodies, entries.
///
/// Each [`LangVariant`] becomes one set of `*_translation` rows.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LangVariant {
    /// Translatable scalar fields (e.g. `title`, `excerpt`).
    fields: BTreeMap<String, FieldValue>,
    /// Prose Part bodies, keyed by Part role.
    prose: BTreeMap<String, String>,
    /// Entry-list / key-value entries, keyed by Part role.
    entries: BTreeMap<String, Vec<PartEntry>>,
}

impl LangVariant {
    /// A translatable scalar field of this language variant.
    pub fn get(&self, name: &str) -> Option<&FieldValue> {
        self.fields.get(name)
    }

    /// The text value of a translatable field.
    pub fn text(&self, name: &str) -> Option<&str> {
        self.get(name).and_then(FieldValue::as_text)
    }

    /// The prose body of a Part role, if this language has it.
    pub fn prose(&self, role: &str) -> Option<&str> {
        self.prose.get(role).map(String::as_str)
    }

    /// The entries of an `entry_list` / `key_value_list` Part role.
    pub fn entries(&self, role: &str) -> &[PartEntry] {
        self.entries.get(role).map(Vec::as_slice).unwrap_or(&[])
    }

    /// The Part roles for which this language has a prose body.
    pub fn prose_roles(&self) -> impl Iterator<Item = &str> {
        self.prose.keys().map(String::as_str)
    }

    /// The Part roles for which this language has entries.
    pub fn entry_roles(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(String::as_str)
    }
}

/// The read-only product of parsing one Item.
///
/// Invariant 1: `langs` always contains at least one language — the
///   canonical language. [`ParsedBuilder::finish`] enforces this.
/// Invariant 2: `main` holds only language-neutral fields; translatable
///   fields live in each `LangVariant`. The parser is responsible for the
///   split; `Parsed` only stores the result.
#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    kind: ContentKind,
    item_id: ItemId,
    main: LangNeutral,
    langs: BTreeMap<Lang, LangVariant>,
    relations: Vec<Relation>,
    /// The stable `PartId` of each Part role (`01` §1.3 / §1.4 — read from
    /// `parts/<role>/meta.toml`). Language-independent: a Part's `en` and
    /// `zh` files share one `PartId`, so it is keyed by role, not by Part ×
    /// language. A role absent here had no `part_id` in its `meta.toml`.
    part_ids: BTreeMap<String, PartId>,
}

impl Parsed {
    /// The content type of the parsed Item.
    pub fn kind(&self) -> ContentKind {
        self.kind
    }

    /// The parsed Item's identity.
    pub fn item_id(&self) -> &ItemId {
        &self.item_id
    }

    /// The language-neutral fields.
    pub fn main(&self) -> &LangNeutral {
        &self.main
    }

    /// The per-language content variants.
    pub fn langs(&self) -> &BTreeMap<Lang, LangVariant> {
        &self.langs
    }

    /// The declared relations of this Item.
    pub fn relations(&self) -> &[Relation] {
        &self.relations
    }

    /// The stable `PartId` of a Part role, if its `meta.toml` declared one.
    /// The `Mapper` writes this into `item_part.part_id` (`11` §11.5).
    pub fn part_id(&self, role: &str) -> Option<&PartId> {
        self.part_ids.get(role)
    }

    /// The set of languages present, in sorted order.
    pub fn languages(&self) -> impl Iterator<Item = &Lang> {
        self.langs.keys()
    }

    /// All entries of a Part role across every language — convenience for
    /// `validate`, which checks entry-level invariants (e.g. resume date
    /// ranges) regardless of language.
    pub fn entries_of(&self, role: &PartRole) -> Vec<&PartEntry> {
        self.langs
            .values()
            .flat_map(|variant| variant.entries(role.as_str()))
            .collect()
    }

    /// Begin building a `Parsed`. Visible only inside `crate::parser` so no
    /// other module can fabricate a parser product.
    pub(in crate::parser) fn builder(kind: ContentKind, item_id: ItemId) -> ParsedBuilder {
        ParsedBuilder::new(kind, item_id)
    }
}

/// The mutable builder for a [`Parsed`].
///
/// Construction-time is mutable; the product is immutable. The mutators are
/// `pub(in crate::parser)` — only the parser implementations may drive them.
pub(in crate::parser) struct ParsedBuilder {
    kind: ContentKind,
    item_id: ItemId,
    main: LangNeutral,
    langs: BTreeMap<Lang, LangVariant>,
    relations: Vec<Relation>,
    part_ids: BTreeMap<String, PartId>,
}

impl ParsedBuilder {
    /// Start a fresh builder.
    pub(in crate::parser) fn new(kind: ContentKind, item_id: ItemId) -> Self {
        Self {
            kind,
            item_id,
            main: LangNeutral::default(),
            langs: BTreeMap::new(),
            relations: Vec::new(),
            part_ids: BTreeMap::new(),
        }
    }

    /// Set a language-neutral main field.
    pub(in crate::parser) fn put_main(&mut self, name: impl Into<String>, value: FieldValue) {
        self.main.fields.insert(name.into(), value);
    }

    /// Set a translatable scalar field for one language.
    pub(in crate::parser) fn put_lang_field(
        &mut self,
        lang: Lang,
        name: impl Into<String>,
        value: FieldValue,
    ) {
        self.langs
            .entry(lang)
            .or_default()
            .fields
            .insert(name.into(), value);
    }

    /// Set the prose body of a Part role for one language.
    pub(in crate::parser) fn put_prose(
        &mut self,
        lang: Lang,
        role: impl Into<String>,
        body: String,
    ) {
        self.langs
            .entry(lang)
            .or_default()
            .prose
            .insert(role.into(), body);
    }

    /// Append an entry to a Part role for one language.
    pub(in crate::parser) fn put_entry(
        &mut self,
        lang: Lang,
        role: impl Into<String>,
        entry: PartEntry,
    ) {
        self.langs
            .entry(lang)
            .or_default()
            .entries
            .entry(role.into())
            .or_default()
            .push(entry);
    }

    /// Ensure a language variant exists even if it carries no content yet —
    /// used so a Part directory with an empty file still registers the
    /// language.
    pub(in crate::parser) fn touch_lang(&mut self, lang: Lang) {
        self.langs.entry(lang).or_default();
    }

    /// Record a declared relation.
    pub(in crate::parser) fn push_relation(&mut self, relation: Relation) {
        self.relations.push(relation);
    }

    /// Record the stable `PartId` of a Part role, read from its `meta.toml`.
    pub(in crate::parser) fn put_part_id(&mut self, role: impl Into<String>, part_id: PartId) {
        self.part_ids.insert(role.into(), part_id);
    }

    /// Finish building, validating the construct-time invariants.
    ///
    /// Returns the offending message as `Err` if `langs` is empty — a parsed
    /// Item must have at least its canonical language.
    pub(in crate::parser) fn finish(self) -> Result<Parsed, &'static str> {
        if self.langs.is_empty() {
            return Err("parsed item has no language variant");
        }
        Ok(Parsed {
            kind: self.kind,
            item_id: self.item_id,
            main: self.main,
            langs: self.langs,
            relations: self.relations,
            part_ids: self.part_ids,
        })
    }
}
