package main

import "testing"

func TestPostgresRoleFromDSN(t *testing.T) {
	t.Parallel()
	role, err := postgresRoleFromDSN("postgres://silan:secret@127.0.0.1:5432/site?sslmode=disable")
	if err != nil {
		t.Fatalf("postgresRoleFromDSN: %v", err)
	}
	if role != "silan" {
		t.Fatalf("role = %q, want silan", role)
	}
}

func TestQuotePGIdentifier(t *testing.T) {
	t.Parallel()
	if got, want := quotePGIdentifier(`role"name`), `"role""name"`; got != want {
		t.Fatalf("quotePGIdentifier = %q, want %q", got, want)
	}
}

func TestRuntimeOwnedTablesAreNeverImported(t *testing.T) {
	wantRuntime := []string{
		"comments",
		"comment_likes",
		"contact_messages",
		"project_likes",
		"project_views",
		"request_logs",
		"user_identities",
	}
	for _, table := range wantRuntime {
		if !isRuntimeOwnedTable(table) {
			t.Errorf("%s must be preserved during content import", table)
		}
	}

	wantProjected := []string{
		"blog_posts",
		"ideas",
		"projects",
		"item_part",
		"content_tag",
	}
	for _, table := range wantProjected {
		if isRuntimeOwnedTable(table) {
			t.Errorf("%s is projection-owned and must remain importable", table)
		}
	}
}
