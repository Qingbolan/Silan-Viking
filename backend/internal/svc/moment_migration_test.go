package svc

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestMigrateMomentDomainPreservesLegacyRows(t *testing.T) {
	path := filepath.Join(t.TempDir(), "portfolio.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"CREATE TABLE recent_updates (id TEXT PRIMARY KEY, update_type TEXT)",
		"INSERT INTO recent_updates (id, update_type) VALUES ('moment-1', 'progress')",
		"CREATE TABLE recent_update_translations (id TEXT PRIMARY KEY, recent_update_id TEXT)",
		"INSERT INTO recent_update_translations (id, recent_update_id) VALUES ('translation-1', 'moment-1')",
		"CREATE TABLE content_interaction (entity_type TEXT)",
		"INSERT INTO content_interaction (entity_type) VALUES ('update')",
		"CREATE TABLE item_part (entity_type TEXT, entity_id TEXT, role TEXT)",
		"INSERT INTO item_part (entity_type, entity_id, role) VALUES ('update', 'moment-1', 'body')",
		"CREATE TABLE content_relation (from_type TEXT, to_type TEXT)",
		"INSERT INTO content_relation (from_type, to_type) VALUES ('update', 'update')",
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	if err := migrateMomentDomain("sqlite3", path); err != nil {
		t.Fatal(err)
	}

	db, err = sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var momentType string
	if err := db.QueryRow("SELECT moment_type FROM moments WHERE id = 'moment-1'").Scan(&momentType); err != nil {
		t.Fatal(err)
	}
	if momentType != "progress" {
		t.Fatalf("moment_type = %q, want progress", momentType)
	}
	var momentID string
	if err := db.QueryRow("SELECT moment_id FROM moment_translations WHERE id = 'translation-1'").Scan(&momentID); err != nil {
		t.Fatal(err)
	}
	if momentID != "moment-1" {
		t.Fatalf("moment_id = %q, want moment-1", momentID)
	}
	var entityType string
	if err := db.QueryRow("SELECT entity_type FROM content_interaction").Scan(&entityType); err != nil {
		t.Fatal(err)
	}
	if entityType != "moment" {
		t.Fatalf("entity_type = %q, want moment", entityType)
	}
	if err := db.QueryRow("SELECT entity_type FROM item_part WHERE entity_id = 'moment-1'").Scan(&entityType); err != nil {
		t.Fatal(err)
	}
	if entityType != "moment" {
		t.Fatalf("item_part.entity_type = %q, want moment", entityType)
	}
	var fromType, toType string
	if err := db.QueryRow("SELECT from_type, to_type FROM content_relation").Scan(&fromType, &toType); err != nil {
		t.Fatal(err)
	}
	if fromType != "moment" || toType != "moment" {
		t.Fatalf("content_relation types = (%q, %q), want (moment, moment)", fromType, toType)
	}
}

func TestPurgeIdeaRowsClearsProjectionAndRuntimeState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "portfolio.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	for _, statement := range []string{
		"CREATE TABLE ideas (id TEXT PRIMARY KEY)",
		"INSERT INTO ideas (id) VALUES ('idea-1')",
		"CREATE TABLE idea_translations (id TEXT PRIMARY KEY, idea_id TEXT)",
		"INSERT INTO idea_translations (id, idea_id) VALUES ('idea-tr-1', 'idea-1')",
		"CREATE TABLE idea_details (id TEXT PRIMARY KEY, idea_id TEXT)",
		"INSERT INTO idea_details (id, idea_id) VALUES ('idea-detail-1', 'idea-1')",
		"CREATE TABLE idea_detail_translations (id TEXT PRIMARY KEY, idea_detail_id TEXT)",
		"INSERT INTO idea_detail_translations (id, idea_detail_id) VALUES ('idea-detail-tr-1', 'idea-detail-1')",
		"CREATE TABLE item_part (id TEXT PRIMARY KEY, entity_type TEXT)",
		"INSERT INTO item_part (id, entity_type) VALUES ('part-1', 'idea')",
		"CREATE TABLE item_part_translation (id TEXT PRIMARY KEY, item_part_id TEXT)",
		"INSERT INTO item_part_translation (id, item_part_id) VALUES ('part-tr-1', 'part-1')",
		"CREATE TABLE part_entry (id TEXT PRIMARY KEY, item_part_id TEXT)",
		"INSERT INTO part_entry (id, item_part_id) VALUES ('entry-1', 'part-1')",
		"CREATE TABLE part_entry_translation (id TEXT PRIMARY KEY, part_entry_id TEXT)",
		"INSERT INTO part_entry_translation (id, part_entry_id) VALUES ('entry-tr-1', 'entry-1')",
		"CREATE TABLE comments (id TEXT PRIMARY KEY, entity_type TEXT)",
		"INSERT INTO comments (id, entity_type) VALUES ('comment-1', 'idea')",
		"CREATE TABLE comment_likes (id TEXT PRIMARY KEY, comment_id TEXT)",
		"INSERT INTO comment_likes (id, comment_id) VALUES ('like-1', 'comment-1')",
		"CREATE TABLE content_relation (from_type TEXT, to_type TEXT)",
		"INSERT INTO content_relation (from_type, to_type) VALUES ('idea', 'blog')",
		"CREATE TABLE content_tag (entity_type TEXT)",
		"INSERT INTO content_tag (entity_type) VALUES ('idea')",
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}

	purgeIdeaRows(db, "sqlite3")

	for _, table := range []string{
		"ideas",
		"idea_translations",
		"idea_details",
		"idea_detail_translations",
		"item_part",
		"item_part_translation",
		"part_entry",
		"part_entry_translation",
		"comments",
		"comment_likes",
		"content_relation",
		"content_tag",
	} {
		var count int
		if err := db.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s count = %d, want 0", table, count)
		}
	}
}
