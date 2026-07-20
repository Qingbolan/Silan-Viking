package contenttag

import (
	"context"
	"database/sql"
	"sort"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// seedDB builds an in-memory sqlite DB with the `tag` / `content_tag` shape
// the engine writes, populated with two blog posts and one moment.
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
		                                ('moment-x','x','moment','research')`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			t.Fatalf("seed %q: %v", s, err)
		}
	}
	return db
}

func TestListTags(t *testing.T) {
	db := seedDB(t)
	defer db.Close()
	repository := NewRepository(db, "sqlite3")

	// seedDB: blog post-a -> easynet, research ; blog post-b -> easynet.
	// So for entity_type "blog": easynet used twice, research once.
	tags, err := repository.ListTags(context.Background(), "blog")
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 2 {
		t.Fatalf("ListTags(blog) = %d tags, want 2", len(tags))
	}
	// Ordered by label: "EasyNet" before "Research".
	if tags[0].Label != "EasyNet" || tags[0].UsageCount != 2 {
		t.Errorf("tags[0] = %+v, want EasyNet usage=2", tags[0])
	}
	if tags[1].Label != "Research" || tags[1].UsageCount != 1 {
		t.Errorf("tags[1] = %+v, want Research usage=1", tags[1])
	}

	// A type with no tagged Items yields an empty, non-nil slice.
	empty, err := repository.ListTags(context.Background(), "project")
	if err != nil {
		t.Fatalf("ListTags(project): %v", err)
	}
	if empty == nil || len(empty) != 0 {
		t.Errorf("ListTags(project) = %v, want non-nil empty", empty)
	}
}

func TestLookupReturnsLabelsSorted(t *testing.T) {
	db := seedDB(t)
	defer db.Close()
	repository := NewRepository(db, "sqlite3")

	got, err := repository.Lookup(context.Background(), "blog", "post-a")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	want := []string{"EasyNet", "Research"}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("Lookup(post-a) = %v, want %v", got, want)
	}

	// An Item with no tags yields a non-nil empty slice — never nil.
	empty, err := repository.Lookup(context.Background(), "blog", "no-such-post")
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
	repository := NewRepository(db, "sqlite3")

	// Single tag — both blog posts carry `easynet`.
	got, err := repository.EntityIDsMatchingTags(ctx, "blog", []string{"easynet"})
	if err != nil {
		t.Fatalf("single tag: %v", err)
	}
	sort.Strings(got)
	if len(got) != 2 || got[0] != "post-a" || got[1] != "post-b" {
		t.Errorf("easynet -> %v, want [post-a post-b]", got)
	}

	// AND semantics — only post-a carries both `easynet` and `research`.
	got, err = repository.EntityIDsMatchingTags(ctx, "blog", []string{"easynet", "research"})
	if err != nil {
		t.Fatalf("two tags: %v", err)
	}
	if len(got) != 1 || got[0] != "post-a" {
		t.Errorf("easynet+research -> %v, want [post-a]", got)
	}

	// Case-insensitive, and matches the label too ("EasyNet" -> easynet tag).
	got, err = repository.EntityIDsMatchingTags(ctx, "blog", []string{"EASYNET"})
	if err != nil || len(got) != 2 {
		t.Errorf("EASYNET -> %v (err %v), want 2 matches", got, err)
	}

	// A non-empty filter that matches nothing returns an empty, non-nil slice.
	got, err = repository.EntityIDsMatchingTags(ctx, "blog", []string{"no-such-tag"})
	if err != nil {
		t.Fatalf("no-match: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("no-such-tag -> %v, want non-nil empty slice", got)
	}

	// An empty filter list returns (nil, nil) — caller applies no filter.
	got, err = repository.EntityIDsMatchingTags(ctx, "blog", []string{"", "  "})
	if err != nil || got != nil {
		t.Errorf("blank tags -> %v (err %v), want nil", got, err)
	}
}

func TestPostgresBindingPreservesQuotedQuestionMarks(t *testing.T) {
	repository := NewRepository(nil, "postgres")
	query := `SELECT '?' AS literal, "?" AS identifier FROM content_tag WHERE entity_type = ? AND entity_id = ?`
	want := `SELECT '?' AS literal, "?" AS identifier FROM content_tag WHERE entity_type = $1 AND entity_id = $2`
	if got := repository.bind(query); got != want {
		t.Fatalf("bind() = %q, want %q", got, want)
	}
}
