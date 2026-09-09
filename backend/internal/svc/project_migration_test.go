package svc

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestProjectPresentationMigrationPreservesExplicitSources(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrateProjectPresentation("sqlite3", path); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("CREATE TABLE projects(id TEXT, cover_source_type TEXT); INSERT INTO projects VALUES ('old', NULL), ('web', 'website'), ('img', 'image')"); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := migrateProjectPresentation("sqlite3", path); err != nil {
			t.Fatal(err)
		}
	}
	var source string
	for id, want := range map[string]string{"old": "image", "web": "website", "img": "image"} {
		if err := db.QueryRow("SELECT cover_source_type FROM projects WHERE id = ?", id).Scan(&source); err != nil {
			t.Fatal(err)
		}
		if source != want {
			t.Fatalf("%s: got %q, want %q", id, source, want)
		}
	}
}
