package health

import (
	"context"
	"database/sql"
	"testing"

	"silan-backend/internal/config"
	"silan-backend/internal/svc"
)

func TestContentStatusReportsPromotedProvenance(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		CREATE TABLE sync_meta (
			content_hash TEXT,
			content_commit TEXT,
			generated_at TEXT
		);
		INSERT INTO sync_meta VALUES ('hash-1', 'commit-1', '2026-07-17T00:00:00Z');
	`); err != nil {
		t.Fatal(err)
	}
	media := t.TempDir()
	ctx := &svc.ServiceContext{
		RawDB: db,
		Config: config.Config{Media: config.MediaConfig{Root: media}},
	}
	status, err := ContentStatus(context.Background(), ctx)
	if err != nil {
		t.Fatal(err)
	}
	if status.ContentCommit != "commit-1" || status.ContentHash != "hash-1" {
		t.Fatalf("unexpected provenance: %+v", status)
	}
	if !status.MediaRootOK || status.Health != "ok" {
		t.Fatalf("unexpected readiness: %+v", status)
	}
}
