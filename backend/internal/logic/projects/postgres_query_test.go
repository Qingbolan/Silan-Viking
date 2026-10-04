package projects

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"silan-backend/internal/contentsearch"
	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// SILAN_TEST_POSTGRES_DSN must name a disposable database: this test migrates
// and seeds its schema. No production configuration is consulted.
func TestPostgresPublicQueryIntegration(t *testing.T) {
	dsn := os.Getenv("SILAN_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("set SILAN_TEST_POSTGRES_DSN to a disposable PostgreSQL database")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(4)
	client := enttest.NewClient(t, enttest.WithOptions(ent.Driver(entsql.OpenDB(dialect.Postgres, db))))
	defer client.Close()
	ctx := context.Background()
	for _, id := range []string{"pg-valid", "pg-fallback"} {
		start := "2026-01-01"
		if id == "pg-fallback" {
			start = "oops"
		}
		client.Project.Create().SetID(id).SetSlug(id).SetStartDate(start).SetCreatedAt(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)).SetVisibility("public").SaveX(ctx)
	}
	part := client.ItemPart.Create().SetID("pg-part").SetPartID("pg-part").SetEntityType(itempart.EntityTypeProject).SetEntityID("pg-valid").SetRole("overview").SetCanonicalLang("en").SaveX(ctx)
	client.ItemPartTranslation.Create().SetItemPart(part).SetLanguageCode("en").SetBody("Unique BODY needle").SaveX(ctx)
	ids, err := client.Project.Query().Where(contentsearch.MatchesParts(itempart.EntityTypeProject, "body NEEDLE", "zh")).IDs(ctx)
	if err != nil || len(ids) != 1 || ids[0] != "pg-valid" {
		t.Fatalf("body query: %v, %v", ids, err)
	}
	// Seed the cross-type tag projection with explicit column ownership.
	for _, statement := range []string{
		`INSERT INTO tag (id,label,slug) VALUES ('pg-tag','Research Work','research')`,
		`INSERT INTO content_tag (entity_id,entity_type,tag_id,entity_slug) VALUES ('pg-valid','project','pg-tag','pg-valid')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	ids, err = client.Project.Query().Where(contenttag.MatchesTags("project", []string{"RESEARCH", "Research Work"})).IDs(ctx)
	if err != nil || len(ids) != 1 || ids[0] != "pg-valid" {
		t.Fatalf("tag query: %v, %v", ids, err)
	}
	logic := NewGetProjectsLogic(ctx, &svc.ServiceContext{DB: client, ContentTags: contenttag.NewRepository(db, "postgres")})
	for year, id := range map[int]string{2026: "pg-valid", 2025: "pg-fallback"} {
		got, err := logic.GetProjects(&types.ProjectListRequest{Year: year, Page: 1, Size: 1})
		if err != nil {
			t.Fatal(err)
		}
		if got.Total != 1 || len(got.Projects) != 1 || got.Projects[0].ID != id {
			t.Fatalf("year %d: %+v", year, got)
		}
	}
}
