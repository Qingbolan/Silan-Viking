package contenttag

import (
	"context"
	"database/sql"
	"sort"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// seedDB builds an in-memory sqlite DB with the `tag` / `content_tag` shape
// the engine writes, populated with two blog posts and one idea.
func seedDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	stmts := []string{
		`CREATE TABLE tag (id TEXT, label TEXT, slug TEXT)`,
		`CREATE TABLE content_tag (entity_id TEXT, entity_slug TEXT, entity_type TEXT, tag_id TEXT)`,
		`INSERT INTO tag VALUES ('easynet','EasyNet','easynet'),
		                        ('research','Research','research'),
		                        ('kdd-2026','KDD 2026','kdd-2026')`,
		// blog "post-a" → easynet, research ; blog "post-b" → easynet
		`INSERT INTO content_tag VALUES ('post-a','a','blog','easynet'),
		                                ('post-a','a','blog','research'),
		                                ('post-b','b','blog','easynet'),
		                                ('idea-x','x','idea','research')`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("seed %q: %v", s, err)
		}
	}
	return db
}

func TestLookupReturnsLabelsSorted(t *testing.T) {
	db := seedDB(t)
	defer db.Close()

	got, err := Lookup(context.Background(), db, "blog", "post-a")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	want := []string{"EasyNet", "Research"}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("Lookup(post-a) = %v, want %v", got, want)
	}

	// An Item with no tags yields a non-nil empty slice — never nil.
	empty, err := Lookup(context.Background(), db, "blog", "no-such-post")
	if err != nil {
		t.Fatalf("Lookup(missing): %v", err)
	}
	if empty == nil || len(empty) != 0 {
		t.Errorf("Lookup(missing) = %v, want non-nil empty slice", empty)
	}
}

func TestEntityIDsMatchingTags(t *testing.T) {
	db := seedDB(t)
	defer db.Close()
	ctx := context.Background()

	// Single tag — both blog posts carry `easynet`.
	got, err := EntityIDsMatchingTags(ctx, db, "blog", []string{"easynet"})
	if err != nil {
		t.Fatalf("single tag: %v", err)
	}
	sort.Strings(got)
	if len(got) != 2 || got[0] != "post-a" || got[1] != "post-b" {
		t.Errorf("easynet -> %v, want [post-a post-b]", got)
	}

	// AND semantics — only post-a carries both `easynet` and `research`.
	got, err = EntityIDsMatchingTags(ctx, db, "blog", []string{"easynet", "research"})
	if err != nil {
		t.Fatalf("two tags: %v", err)
	}
	if len(got) != 1 || got[0] != "post-a" {
		t.Errorf("easynet+research -> %v, want [post-a]", got)
	}

	// Case-insensitive, and matches the label too ("EasyNet" -> easynet tag).
	got, err = EntityIDsMatchingTags(ctx, db, "blog", []string{"EASYNET"})
	if err != nil || len(got) != 2 {
		t.Errorf("EASYNET -> %v (err %v), want 2 matches", got, err)
	}

	// A non-empty filter that matches nothing returns an empty, non-nil slice.
	got, err = EntityIDsMatchingTags(ctx, db, "blog", []string{"no-such-tag"})
	if err != nil {
		t.Fatalf("no-match: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("no-such-tag -> %v, want non-nil empty slice", got)
	}

	// An empty filter list returns (nil, nil) — caller applies no filter.
	got, err = EntityIDsMatchingTags(ctx, db, "blog", []string{"", "  "})
	if err != nil || got != nil {
		t.Errorf("blank tags -> %v (err %v), want nil", got, err)
	}
}
