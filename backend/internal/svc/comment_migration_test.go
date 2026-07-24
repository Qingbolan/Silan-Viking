package svc

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestMigrateRuntimeTableConstraintsMakesCommentEmailOptional(t *testing.T) {
	db, err := sql.Open("sqlite3", "file:comment-migration?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Exec("CREATE TABLE user_identities (id text PRIMARY KEY)"); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE comments (
		id text NOT NULL PRIMARY KEY,
		entity_type text NOT NULL,
		entity_id text NOT NULL,
		author_name text NOT NULL,
		author_email text NOT NULL,
		author_website text NULL,
		content text NOT NULL,
		type text NOT NULL DEFAULT ('general'),
		reference_id text NULL,
		attachment_id text NULL,
		is_approved bool NOT NULL DEFAULT (false),
		ip_address text NULL,
		country_code text NULL,
		user_agent text NULL,
		likes_count integer NOT NULL DEFAULT (0),
		created_at datetime NOT NULL,
		updated_at datetime NOT NULL,
		parent_id text NULL,
		user_identity_id text NULL
	)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO comments (
		id, entity_type, entity_id, author_name, author_email, content,
		is_approved, likes_count, created_at, updated_at, country_code
	) VALUES ('existing', 'blog', 'post', 'Reader', 'reader@example.com',
		'hello', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'SG')`)
	if err != nil {
		t.Fatal(err)
	}

	migrateRuntimeTableConstraints(db, "sqlite3")

	var notNull int
	rows, err := db.Query("PRAGMA table_info(comments)")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid, required, primaryKey int
		var name, fieldType string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &fieldType, &required, &defaultValue, &primaryKey); err != nil {
			t.Fatal(err)
		}
		if name == "author_email" {
			notNull = required
		}
	}
	if notNull != 0 {
		t.Fatalf("comments.author_email remains NOT NULL")
	}

	var countryCode string
	if err := db.QueryRow("SELECT country_code FROM comments WHERE id = 'existing'").Scan(&countryCode); err != nil {
		t.Fatal(err)
	}
	if countryCode != "SG" {
		t.Fatalf("country_code = %q, want SG", countryCode)
	}

	_, err = db.Exec(`INSERT INTO comments (
		id, entity_type, entity_id, author_name, content,
		is_approved, likes_count, created_at, updated_at
	) VALUES ('guest', 'blog', 'post', 'guest-id<SG/01/ABC>',
		'hello', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
	if err != nil {
		t.Fatalf("insert guest without email: %v", err)
	}
}
