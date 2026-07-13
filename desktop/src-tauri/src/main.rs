#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::env;

#[derive(Debug, Serialize)]
struct EditorDocument {
    id: String,
    part_id: String,
    entity_type: String,
    entity_id: String,
    slug: String,
    role: String,
    language: String,
    title: String,
    status: String,
    visibility: String,
    updated_at: String,
    content: String,
}

#[derive(Debug)]
struct RawDocument {
    id: String,
    part_id: String,
    entity_type: String,
    entity_id: String,
    role: String,
    language: String,
    updated_at: String,
    content: String,
}

#[derive(Debug, Default)]
struct EntitySummary {
    title: String,
    slug: String,
    status: String,
    visibility: String,
}

#[tauri::command]
fn list_documents() -> Result<Vec<EditorDocument>, String> {
    let conn = open_database()?;
    let raws = read_raw_documents(&conn)?;
    raws.into_iter()
        .map(|doc| hydrate_document(&conn, doc))
        .collect()
}

#[tauri::command]
fn save_document(id: String, content: String) -> Result<EditorDocument, String> {
    let mut conn = open_database()?;
    let tx = conn.transaction().map_err(|err| err.to_string())?;

    let (item_part_id, entity_type, entity_id): (String, String, String) = tx
        .query_row(
            "
            SELECT ip.id, ip.entity_type, ip.entity_id
            FROM item_part_translation AS ipt
            INNER JOIN item_part AS ip ON ip.id = ipt.item_part_id
            WHERE ipt.id = ?1
            ",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|err| err.to_string())?;

    let updated = tx
        .execute(
            "UPDATE item_part_translation SET body = ?1 WHERE id = ?2",
            params![content, id],
        )
        .map_err(|err| err.to_string())?;
    if updated != 1 {
        return Err(format!("document {id} was not updated"));
    }

    tx.execute(
        "UPDATE item_part SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![item_part_id],
    )
    .map_err(|err| err.to_string())?;
    touch_entity(&tx, &entity_type, &entity_id)?;
    tx.commit().map_err(|err| err.to_string())?;

    get_document(id)
}

#[tauri::command]
fn get_document(id: String) -> Result<EditorDocument, String> {
    let conn = open_database()?;
    let raw = conn
        .query_row(
            "
            SELECT
                ipt.id,
                ip.part_id,
                ip.entity_type,
                ip.entity_id,
                ip.role,
                ipt.language_code,
                COALESCE(CAST(ip.updated_at AS TEXT), ''),
                COALESCE(ipt.body, '')
            FROM item_part_translation AS ipt
            INNER JOIN item_part AS ip ON ip.id = ipt.item_part_id
            WHERE ipt.id = ?1
            ",
            params![id],
            raw_document_from_row,
        )
        .map_err(|err| err.to_string())?;
    hydrate_document(&conn, raw)
}

fn open_database() -> Result<Connection, String> {
    let path = env::var("SILAN_DESKTOP_DB")
        .map_err(|_| "SILAN_DESKTOP_DB is not set; launch through silan-viking desktop".to_string())?;
    Connection::open(path).map_err(|err| err.to_string())
}

fn read_raw_documents(conn: &Connection) -> Result<Vec<RawDocument>, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT
                ipt.id,
                ip.part_id,
                ip.entity_type,
                ip.entity_id,
                ip.role,
                ipt.language_code,
                COALESCE(CAST(ip.updated_at AS TEXT), ''),
                COALESCE(ipt.body, '')
            FROM item_part_translation AS ipt
            INNER JOIN item_part AS ip ON ip.id = ipt.item_part_id
            ORDER BY ip.entity_type, ip.entity_id, ip.sort_order, ipt.language_code
            ",
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], raw_document_from_row)
        .map_err(|err| err.to_string())?;

    let mut documents = Vec::new();
    for row in rows {
        documents.push(row.map_err(|err| err.to_string())?);
    }
    Ok(documents)
}

fn raw_document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RawDocument> {
    Ok(RawDocument {
        id: row.get(0)?,
        part_id: row.get(1)?,
        entity_type: row.get(2)?,
        entity_id: row.get(3)?,
        role: row.get(4)?,
        language: row.get(5)?,
        updated_at: row.get(6)?,
        content: row.get(7)?,
    })
}

fn hydrate_document(conn: &Connection, raw: RawDocument) -> Result<EditorDocument, String> {
    let summary = entity_summary(conn, &raw.entity_type, &raw.entity_id, &raw.language)?;
    let title = if summary.title.is_empty() {
        format!("{} {}", raw.entity_type, raw.entity_id)
    } else {
        summary.title
    };

    Ok(EditorDocument {
        id: raw.id,
        part_id: raw.part_id,
        entity_type: raw.entity_type,
        entity_id: raw.entity_id,
        slug: summary.slug,
        role: raw.role,
        language: raw.language,
        title,
        status: summary.status,
        visibility: summary.visibility,
        updated_at: raw.updated_at,
        content: raw.content,
    })
}

fn entity_summary(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    language: &str,
) -> Result<EntitySummary, String> {
    let query = match entity_type {
        "blog" => Some(
            "
            SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
            FROM blog_posts AS e
            LEFT JOIN blog_post_translations AS t ON t.blog_post_id = e.id AND t.language_code = ?1
            WHERE e.id = ?2
            ",
        ),
        "project" => Some(
            "
            SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
            FROM projects AS e
            LEFT JOIN project_translations AS t ON t.project_id = e.id AND t.language_code = ?1
            WHERE e.id = ?2
            ",
        ),
        "idea" => Some(
            "
            SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
            FROM ideas AS e
            LEFT JOIN idea_translations AS t ON t.idea_id = e.id AND t.language_code = ?1
            WHERE e.id = ?2
            ",
        ),
        "episode" => Some(
            "
            SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
            FROM episodes AS e
            LEFT JOIN episode_translations AS t ON t.episode_id = e.id AND t.language_code = ?1
            WHERE e.id = ?2
            ",
        ),
        "update" => Some(
            "
            SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
            FROM recent_updates AS e
            LEFT JOIN recent_update_translations AS t ON t.recent_update_id = e.id AND t.language_code = ?1
            WHERE e.id = ?2
            ",
        ),
        "resume" => return Ok(EntitySummary {
            title: "Resume".to_string(),
            slug: "resume".to_string(),
            ..EntitySummary::default()
        }),
        _ => None,
    };

    let Some(query) = query else {
        return Ok(EntitySummary::default());
    };

    conn.query_row(query, params![language, entity_id], |row| {
        Ok(EntitySummary {
            title: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
            slug: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            status: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            visibility: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        })
    })
    .optional()
    .map_err(|err| err.to_string())
    .map(|summary| summary.unwrap_or_default())
}

fn touch_entity(tx: &rusqlite::Transaction<'_>, entity_type: &str, entity_id: &str) -> Result<(), String> {
    let table = match entity_type {
        "blog" => Some("blog_posts"),
        "project" => Some("projects"),
        "idea" => Some("ideas"),
        "episode" => Some("episodes"),
        "update" => Some("recent_updates"),
        _ => None,
    };

    if let Some(table) = table {
        tx.execute(
            &format!("UPDATE {table} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1"),
            params![entity_id],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_documents,
            get_document,
            save_document
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Silan Desktop");
}
