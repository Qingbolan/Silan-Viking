package blog

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
)

func TestPublicListIndexesAvoidTemporarySort(t *testing.T) {
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	defer client.Close()
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, query := range []string{
		"SELECT id FROM blog_posts WHERE visibility = 'public' ORDER BY published_at DESC, id ASC LIMIT 10",
		"SELECT id FROM projects WHERE visibility = 'public' ORDER BY sort_order DESC, created_at DESC, id ASC LIMIT 10",
	} {
		rows, err := db.QueryContext(context.Background(), "EXPLAIN QUERY PLAN "+query)
		if err != nil {
			t.Fatal(err)
		}
		plan := ""
		for rows.Next() {
			var id, parent, unused int
			var detail string
			if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
				rows.Close()
				t.Fatal(err)
			}
			plan += detail + "\n"
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(plan, "USING COVERING INDEX") || strings.Contains(plan, "TEMP B-TREE") {
			t.Fatalf("unindexed list order for %s:\n%s", query, plan)
		}
	}
}
