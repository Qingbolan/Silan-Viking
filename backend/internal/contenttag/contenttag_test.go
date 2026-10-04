package contenttag

import (
	"context"
	"database/sql"
	entsql "entgo.io/ent/dialect/sql"
	"fmt"
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

func TestMatchesTags(t *testing.T) {
	db := seedDB(t)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE items (id TEXT); INSERT INTO items VALUES ('post-a'),('post-b'),('untagged'); INSERT INTO tag VALUES ('alias','Other Label','alias'); INSERT INTO content_tag VALUES ('post-a','a','blog','alias')`); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		terms []string
		count int
	}{
		{[]string{"easynet"}, 2}, {[]string{"easynet", "research"}, 1},
		{[]string{"EASYNET", "easynet"}, 2}, {[]string{"alias", "Other Label"}, 1},
		{[]string{"missing"}, 0}, {[]string{"", " "}, 3},
	} {
		table := entsql.Table("items")
		query := entsql.Dialect("sqlite3").Select(table.C("id")).From(table)
		MatchesTags("blog", tc.terms)(query)
		statement, args := query.Query()
		rows, err := db.Query(statement, args...)
		if err != nil {
			t.Fatal(err)
		}
		count := 0
		for rows.Next() {
			count++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			t.Fatal(err)
		}
		if count != tc.count {
			t.Fatalf("terms %v: count %d want %d", tc.terms, count, tc.count)
		}
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

func TestLookupManyBatchesAndPreservesMissingItems(t *testing.T) {
	db := seedDB(t)
	defer db.Close()
	ids := []string{"post-a", "post-a", "post-b", "moment-x"}
	for i := 0; i < 1200; i++ {
		ids = append(ids, fmt.Sprintf("missing-%d", i))
	}
	got, err := NewRepository(db, "sqlite3").LookupMany(context.Background(), "blog", ids)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1203 || len(got["post-a"]) != 2 || got["post-a"][0] != "EasyNet" || len(got["post-b"]) != 1 {
		t.Fatalf("unexpected batch results: %d entries", len(got))
	}
	if got["moment-x"] == nil || len(got["moment-x"]) != 0 || got["missing-1199"] == nil {
		t.Fatal("missing or wrong-type items must have empty labels")
	}
}
