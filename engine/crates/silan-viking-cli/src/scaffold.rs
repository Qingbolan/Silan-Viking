//! Content scaffolding — the `new` / `add-part` / `add-lang` write path.
//!
//! `02` §一 specifies six unified verbs per content type. The engine's M5/M6
//! parser/sync only *reads* content; this module is the missing *creation*
//! side: it lays down the `parts/<role>/{meta.toml,<lang>.<ext>}` tree the
//! parser expects, with a required-field frontmatter block on the canonical
//! file (`01` §1.3.1, `content/SCHEMA.md`).
//!
//! `part_id` is generated *here*, at scaffold time, and written into the
//! `meta.toml`: per `01` §1.4 the stable Part identity is minted by `init` /
//! `add-part` / the offline re-layout tool, and `index sync` only ever reads
//! it (it never silently writes `part_id` back to the truth source).
//!
//! Note on directory naming: the on-disk type directory is the engine's
//! `ContentKind::dir_name()` (e.g. `ideas`, plural), not the CLI verb-group
//! name (`idea`). Callers pass the verb-group `kind`; this module maps it to
//! the directory via [`type_dir_name`].

use std::fs;
use std::path::{Path, PathBuf};

/// Map a CLI verb-group name (`idea`/`blog`/...) to the on-disk type
/// directory the engine scans (`ContentKind::dir_name()`). Only the plural
/// `idea`→`ideas` and `project`→`projects` differ; routing every name
/// through one function keeps the mapping in a single place.
pub fn type_dir_name(kind: &str) -> Result<&'static str, ScaffoldError> {
    match kind {
        "idea" => Ok("ideas"),
        "blog" => Ok("blog"),
        "project" => Ok("projects"),
        "episode" => Ok("episode"),
        "update" => Ok("update"),
        "resume" => Ok("resume"),
        other => Err(ScaffoldError(format!("unknown content type `{other}`"))),
    }
}

/// A scaffolding failure.
#[derive(Debug)]
pub struct ScaffoldError(pub String);

impl std::fmt::Display for ScaffoldError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<std::io::Error> for ScaffoldError {
    fn from(e: std::io::Error) -> Self {
        ScaffoldError(e.to_string())
    }
}

/// The result of creating a new Item or Part.
#[derive(Debug)]
pub struct Scaffolded {
    /// The files written.
    pub files: Vec<PathBuf>,
}

/// A slug must match the SCHEMA `slug` field type `^[a-z0-9][a-z0-9-]*$`.
fn validate_slug(slug: &str) -> Result<(), ScaffoldError> {
    let ok = !slug.is_empty()
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && slug
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    if ok {
        Ok(())
    } else {
        Err(ScaffoldError(format!(
            "invalid slug `{slug}` — must match ^[a-z0-9][a-z0-9-]*$"
        )))
    }
}

/// Today's date as `YYYY-MM-DD` (UTC) — the default for an `update`'s
/// required `date` field. The author edits it afterwards.
fn today_iso8601() -> String {
    let now = time::OffsetDateTime::now_utc().date();
    format!(
        "{:04}-{:02}-{:02}",
        now.year(),
        u8::from(now.month()),
        now.day()
    )
}

/// Title-case a slug into a default human title (`my-first-post` -> `My First
/// Post`). The author edits the frontmatter afterwards.
fn slug_to_title(slug: &str) -> String {
    slug.split('-')
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Write a `meta.toml` for a prose Part (`01` §1.3.1 / §1.4). A fresh
/// `part_id` (`p_<ulid>`) is minted here — scaffold time — so the Part has a
/// stable identity from creation; `index sync` reads it, never writes it.
fn write_meta(part_dir: &Path, role: &str) -> Result<PathBuf, ScaffoldError> {
    let path = part_dir.join("meta.toml");
    let part_id = silan_viking_base::PartId::generate();
    let body = format!(
        "# Part identity for the `{role}` part (per 01 §1.3.1 / §1.4).\n\
         part_id        = \"{part_id}\"\n\
         type           = \"{role}\"\n\
         shape          = \"prose\"\n\
         canonical_lang = \"en\"\n"
    );
    fs::write(&path, body)?;
    Ok(path)
}

/// The required-field frontmatter for each content type, given a slug. Values
/// are SCHEMA defaults; the author edits them after `new`.
fn frontmatter_for(kind: &str, slug: &str, extra: &[(&str, String)]) -> String {
    let title = slug_to_title(slug);
    let mut lines = vec![format!("slug: {slug}"), format!("title: {title}")];
    match kind {
        "idea" => {
            lines.push("kind: idea".to_owned());
            lines.push("status: draft".to_owned());
            lines.push("visibility: private".to_owned());
        }
        "blog" => {
            lines.push("kind: blog".to_owned());
            lines.push("content_type: article".to_owned());
            lines.push("status: draft".to_owned());
            lines.push("visibility: private".to_owned());
        }
        "project" => {
            lines.push("kind: project".to_owned());
            lines.push("status: active".to_owned());
            lines.push("visibility: private".to_owned());
        }
        "episode" => {
            lines.push("kind: episode".to_owned());
            lines.push("status: draft".to_owned());
            lines.push("visibility: private".to_owned());
        }
        "update" => {
            lines.push("kind: update".to_owned());
            lines.push("update_type: progress".to_owned());
            lines.push("status: active".to_owned());
            lines.push("visibility: private".to_owned());
            // `date` is a required field for `update` (content/SCHEMA.md).
            lines.push(format!("date: {}", today_iso8601()));
        }
        _ => {}
    }
    for (key, value) in extra {
        lines.push(format!("{key}: {value}"));
    }
    format!("---\n{}\n---\n", lines.join("\n"))
}

/// Scaffold a new flat-type Item (idea / blog / project / update).
///
/// Lays down `resources/<kind>/<slug>/parts/<primary-role>/{meta.toml,en.md}`.
pub fn new_item(content_root: &Path, kind: &str, slug: &str) -> Result<Scaffolded, ScaffoldError> {
    validate_slug(slug)?;
    let primary_role = primary_role(kind)?;
    let item_dir = content_root
        .join("resources")
        .join(type_dir_name(kind)?)
        .join(slug);
    if item_dir.exists() {
        return Err(ScaffoldError(format!(
            "{kind} `{slug}` already exists at {}",
            item_dir.display()
        )));
    }
    let part_dir = item_dir.join("parts").join(primary_role);
    fs::create_dir_all(&part_dir)?;

    let meta = write_meta(&part_dir, primary_role)?;
    let md = part_dir.join("en.md");
    let frontmatter = frontmatter_for(kind, slug, &[]);
    fs::write(
        &md,
        format!(
            "{frontmatter}\n# {}\n\nDraft body — replace this.\n",
            slug_to_title(slug)
        ),
    )?;

    Ok(Scaffolded {
        files: vec![meta, md],
    })
}

/// Scaffold a new episode under a series. The episode's frontmatter carries
/// `series` and an auto-assigned `episode_number` (next after existing ones).
pub fn new_episode(
    content_root: &Path,
    series: &str,
    slug: &str,
) -> Result<Scaffolded, ScaffoldError> {
    validate_slug(series)?;
    validate_slug(slug)?;
    let series_dir = content_root.join("resources").join("episode").join(series);
    if !series_dir.join("series.toml").exists() {
        return Err(ScaffoldError(format!(
            "episode series `{series}` does not exist — run `episode series new {series}` first"
        )));
    }
    let episode_dir = series_dir.join(slug);
    if episode_dir.exists() {
        return Err(ScaffoldError(format!(
            "episode `{series}/{slug}` already exists"
        )));
    }
    // Next episode_number = count of existing episode subdirs + 1.
    let existing = fs::read_dir(&series_dir)?
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .count();
    let episode_number = existing + 1;

    let part_dir = episode_dir.join("parts").join("body");
    fs::create_dir_all(&part_dir)?;
    let meta = write_meta(&part_dir, "body")?;
    let md = part_dir.join("en.md");
    let frontmatter = frontmatter_for(
        "episode",
        slug,
        &[
            ("series", series.to_owned()),
            ("episode_number", episode_number.to_string()),
        ],
    );
    fs::write(
        &md,
        format!(
            "{frontmatter}\n# {}\n\nDraft body — replace this.\n",
            slug_to_title(slug)
        ),
    )?;
    Ok(Scaffolded {
        files: vec![meta, md],
    })
}

/// Scaffold a new episode container series (`series.toml`).
pub fn new_series(content_root: &Path, series: &str) -> Result<Scaffolded, ScaffoldError> {
    validate_slug(series)?;
    let series_dir = content_root.join("resources").join("episode").join(series);
    let series_toml = series_dir.join("series.toml");
    if series_toml.exists() {
        return Err(ScaffoldError(format!(
            "episode series `{series}` already exists"
        )));
    }
    fs::create_dir_all(&series_dir)?;
    let body = format!(
        "# Episode container series (per 10 §10.4.4).\n\
         title       = \"{}\"\n\
         slug        = \"{series}\"\n\
         description = \"\"\n\
         status      = \"ongoing\"\n",
        slug_to_title(series)
    );
    fs::write(&series_toml, body)?;
    Ok(Scaffolded {
        files: vec![series_toml],
    })
}

/// Scaffold the single `resume` Item: `resources/resume/parts/summary/`.
/// `full_name` / `title` seed the frontmatter (from `[identity]` config).
pub fn new_resume(
    content_root: &Path,
    full_name: &str,
    title: &str,
) -> Result<Scaffolded, ScaffoldError> {
    let summary_dir = content_root
        .join("resources")
        .join("resume")
        .join("parts")
        .join("summary");
    if summary_dir.exists() {
        return Err(ScaffoldError("resume already exists".to_owned()));
    }
    fs::create_dir_all(&summary_dir)?;
    let meta = write_meta(&summary_dir, "summary")?;
    let md = summary_dir.join("en.md");
    let frontmatter = format!(
        "---\nfull_name: {full_name}\ntitle: {title}\nkind: resume\nvisibility: private\n---\n"
    );
    // The bio body is heading-free prose: the front-end already renders it
    // inside a titled section ("About Me"), so a leading `## Summary` here
    // would be a duplicate heading. Scaffold a plain paragraph.
    fs::write(
        &md,
        format!(
            "{frontmatter}\nA short professional summary — written as plain prose, no heading.\n"
        ),
    )?;
    Ok(Scaffolded {
        files: vec![meta, md],
    })
}

/// Add an optional Part to an existing Item: `parts/<role>/{meta.toml,en.md}`.
pub fn add_part(
    content_root: &Path,
    kind: &str,
    slug: &str,
    role: &str,
) -> Result<Scaffolded, ScaffoldError> {
    let item_dir = item_dir_for(content_root, kind, slug)?;
    let part_dir = item_dir.join("parts").join(role);
    if part_dir.exists() {
        return Err(ScaffoldError(format!(
            "part `{role}` already exists on {kind} `{slug}`"
        )));
    }
    fs::create_dir_all(&part_dir)?;
    let meta = write_meta(&part_dir, role)?;
    let md = part_dir.join("en.md");
    fs::write(
        &md,
        format!("## {}\n\nDraft — replace this.\n", slug_to_title(role)),
    )?;
    Ok(Scaffolded {
        files: vec![meta, md],
    })
}

/// Add a language variant `<lang>.md` to an existing Part (defaults to the
/// primary Part of the type).
pub fn add_lang(
    content_root: &Path,
    kind: &str,
    slug: &str,
    role: &str,
    lang: &str,
) -> Result<Scaffolded, ScaffoldError> {
    let item_dir = item_dir_for(content_root, kind, slug)?;
    let part_dir = item_dir.join("parts").join(role);
    if !part_dir.exists() {
        return Err(ScaffoldError(format!(
            "part `{role}` does not exist on {kind} `{slug}`"
        )));
    }
    let file = part_dir.join(format!("{lang}.md"));
    if file.exists() {
        return Err(ScaffoldError(format!(
            "language `{lang}` already exists for `{role}`"
        )));
    }
    fs::write(
        &file,
        format!(
            "# {} ({lang})\n\nTranslated body — replace this.\n",
            slug_to_title(slug)
        ),
    )?;
    Ok(Scaffolded { files: vec![file] })
}

/// Add a `<lang>` variant to an explicit Part directory (used by episode and
/// resume, whose Items are not flat-type). The seed extension follows the
/// existing canonical file: `.toml` if the Part is `entry_list`/`key_value`,
/// `.md` otherwise.
pub fn add_lang_at(part_dir: &Path, lang: &str) -> Result<Scaffolded, ScaffoldError> {
    if !part_dir.exists() {
        return Err(ScaffoldError(format!(
            "part directory `{}` does not exist",
            part_dir.display()
        )));
    }
    // Mirror the shape of the existing `en` file.
    let toml_part = part_dir.join("en.toml").exists();
    let ext = if toml_part { "toml" } else { "md" };
    let file = part_dir.join(format!("{lang}.{ext}"));
    if file.exists() {
        return Err(ScaffoldError(format!("language `{lang}` already exists")));
    }
    let seed = if toml_part {
        format!("# {lang} variant — mirror the entries of en.toml.\n")
    } else {
        format!("# ({lang})\n\nTranslated body — replace this.\n")
    };
    fs::write(&file, seed)?;
    Ok(Scaffolded { files: vec![file] })
}

/// Resolve an episode series directory, erroring if its `series.toml` is
/// absent.
pub fn series_dir(content_root: &Path, series: &str) -> Result<PathBuf, ScaffoldError> {
    let dir = content_root.join("resources").join("episode").join(series);
    if !dir.join("series.toml").exists() {
        return Err(ScaffoldError(format!(
            "episode series `{series}` not found"
        )));
    }
    Ok(dir)
}

/// Resolve an episode Item directory under a series.
pub fn episode_dir(
    content_root: &Path,
    series: &str,
    slug: &str,
) -> Result<PathBuf, ScaffoldError> {
    let dir = series_dir(content_root, series)?.join(slug);
    if !dir.exists() {
        return Err(ScaffoldError(format!(
            "episode `{series}/{slug}` not found"
        )));
    }
    Ok(dir)
}

/// The primary (required) Part role for a flat content type.
fn primary_role(kind: &str) -> Result<&'static str, ScaffoldError> {
    match kind {
        "idea" | "project" => Ok("overview"),
        "blog" | "update" | "episode" => Ok("body"),
        other => Err(ScaffoldError(format!(
            "`{other}` is not a scaffoldable flat type"
        ))),
    }
}

/// Resolve the on-disk directory of an existing flat-type Item.
fn item_dir_for(content_root: &Path, kind: &str, slug: &str) -> Result<PathBuf, ScaffoldError> {
    let dir = content_root
        .join("resources")
        .join(type_dir_name(kind)?)
        .join(slug);
    if !dir.exists() {
        return Err(ScaffoldError(format!("{kind} `{slug}` not found")));
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_validation_rejects_bad_slugs() {
        assert!(validate_slug("good-slug-1").is_ok());
        assert!(validate_slug("Bad").is_err());
        assert!(validate_slug("-leading").is_err());
        assert!(validate_slug("").is_err());
    }

    #[test]
    fn slug_to_title_capitalizes_words() {
        assert_eq!(slug_to_title("my-first-post"), "My First Post");
    }
}
