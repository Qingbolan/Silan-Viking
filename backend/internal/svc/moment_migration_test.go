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
}
