package projects

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/project"

	_ "github.com/mattn/go-sqlite3"
)

func TestPublicProjectExcludesArchivedAndPrivateRecords(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)

	client.Project.Create().
		SetID("public-active").
		SetSlug("public-active").
		SetVisibility(project.VisibilityPublic).
		SaveX(ctx)
	client.Project.Create().
		SetID("public-archived").
		SetSlug("public-archived").
		SetStatus(project.StatusArchived).
		SetVisibility(project.VisibilityPublic).
		SaveX(ctx)
	client.Project.Create().
		SetID("private-active").
		SetSlug("private-active").
		SaveX(ctx)

	projects := client.Project.Query().
		Where(publicProject()).
		AllX(ctx)
	if len(projects) != 1 || projects[0].ID != "public-active" {
		t.Fatalf("public projects = %#v, want only public-active", projects)
	}
}
