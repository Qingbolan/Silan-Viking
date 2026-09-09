package contentvisibility

import (
	"context"
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"path/filepath"
	"testing"
)

func TestMigrationPreservesPrivacyAndInteractions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "content.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, query := range []string{
		"CREATE TABLE blog_posts(id TEXT PRIMARY KEY, status TEXT, visibility TEXT)",
		"INSERT INTO blog_posts VALUES ('visible','published','public'),('draft','draft','public'),('hidden','archived','public'),('link','published','unlisted'),('private','published','private')",
		"CREATE TABLE episode_series(id TEXT PRIMARY KEY, status TEXT)",
		"CREATE TABLE episodes(id TEXT, series_id TEXT, status TEXT, visibility TEXT)",
		"INSERT INTO episode_series VALUES('series','archived')",
		"INSERT INTO episodes VALUES('episode','series','published','public')",
		"CREATE TABLE comments(id TEXT, body TEXT)",
		"INSERT INTO comments VALUES('comment','Keep this')",
	} {
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		if err := Migrate(context.Background(), "sqlite3", path); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM blog_posts WHERE visibility='public'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("public count %d: %v", count, err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('blog_posts') WHERE name='status'").Scan(&count); err != nil || count != 0 {
		t.Fatalf("obsolete column %d: %v", count, err)
	}
	var value string
	if err := db.QueryRow("SELECT visibility FROM episodes").Scan(&value); err != nil || value != "private" {
		t.Fatalf("series privacy %s: %v", value, err)
	}
	if err := db.QueryRow("SELECT body FROM comments").Scan(&value); err != nil || value != "Keep this" {
		t.Fatalf("comments %s: %v", value, err)
	}
}
