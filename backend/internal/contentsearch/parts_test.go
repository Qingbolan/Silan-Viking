package contentsearch

import (
	"context"
	"entgo.io/ent/dialect/sql"
	"fmt"
	"silan-backend/internal/ent/project"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/itempart"

	_ "github.com/mattn/go-sqlite3"
)

func TestMatchesPartsUsesLocaleAndEnglishFallback(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)

	client.Project.Create().SetID("project-one").SetSlug("project-one").SaveX(ctx)
	part := client.ItemPart.Create().
		SetID("part-one").
		SetPartID("part-one").
		SetEntityType(itempart.EntityTypeProject).
		SetEntityID("project-one").
		SetRole("overview").
		SetCanonicalLang("en").
		SaveX(ctx)
	client.ItemPartTranslation.Create().
		SetItemPart(part).
		SetLanguageCode("en").
		SetBody("Executable knowledge for agents").
		SaveX(ctx)
	client.ItemPartTranslation.Create().
		SetItemPart(part).
		SetLanguageCode("zh").
		SetBody("智能体知识系统").
		SaveX(ctx)

	englishFallback, err := client.Project.Query().Where(MatchesParts(itempart.EntityTypeProject, "EXECUTABLE", "zh")).IDs(ctx)
	if err != nil {
		t.Fatalf("English fallback search: %v", err)
	}
	if len(englishFallback) != 1 || englishFallback[0] != "project-one" {
		t.Fatalf("English fallback ids = %v", englishFallback)
	}

	chinese, err := client.Project.Query().Where(MatchesParts(itempart.EntityTypeProject, "知识", "zh")).IDs(ctx)
	if err != nil {
		t.Fatalf("Chinese search: %v", err)
	}
	if len(chinese) != 1 || chinese[0] != "project-one" {
		t.Fatalf("Chinese ids = %v", chinese)
	}

	wrongType, err := client.Project.Query().Where(MatchesParts(itempart.EntityTypeBlog, "knowledge", "en")).IDs(ctx)
	if err != nil {
		t.Fatalf("wrong-type search: %v", err)
	}
	if len(wrongType) != 0 {
		t.Fatalf("wrong-type ids = %v, want empty", wrongType)
	}
}

func TestMatchesPartsDeduplicatesBeforePagination(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:"+t.Name()+"?mode=memory&cache=shared&_fk=1")
	client.Project.Create().SetID("public").SetSlug("public").SetVisibility("public").SaveX(ctx)
	client.Project.Create().SetID("private").SetSlug("private").SaveX(ctx)
	for i := 0; i < 1100; i++ {
		id := fmt.Sprintf("part-%d", i)
		owner := "public"
		if i%2 == 0 {
			owner = "private"
		}
		part := client.ItemPart.Create().SetID(id).SetPartID(id).SetEntityType(itempart.EntityTypeProject).SetEntityID(owner).SetRole(id).SetCanonicalLang("en").SaveX(ctx)
		client.ItemPartTranslation.Create().SetItemPart(part).SetLanguageCode("en").SetBody("common needle text").SaveX(ctx)
	}
	query := client.Project.Query().Where(project.VisibilityEQ(project.VisibilityPublic), MatchesParts(itempart.EntityTypeProject, "needle", "zh"))
	if total := query.Clone().CountX(ctx); total != 1 {
		t.Fatalf("count = %d, want one visible entity", total)
	}
	if ids := query.Clone().Limit(1).IDsX(ctx); len(ids) != 1 || ids[0] != "public" {
		t.Fatalf("first page = %v", ids)
	}
	if ids := query.Clone().Offset(1).Limit(1).IDsX(ctx); len(ids) != 0 {
		t.Fatalf("second page = %v", ids)
	}
	if total := client.Project.Query().Where(MatchesParts(itempart.EntityTypeProject, "  ", "en")).CountX(ctx); total != 0 {
		t.Fatalf("empty query matched %d", total)
	}
}

func TestMatchesPartsUsesBoundParametersAcrossDialects(t *testing.T) {
	for _, driver := range []string{dialect.SQLite, dialect.Postgres, dialect.MySQL} {
		t.Run(driver, func(t *testing.T) {
			table := sql.Table(project.Table)
			query := sql.Dialect(driver).Select(table.C(project.FieldID)).From(table)
			MatchesParts(itempart.EntityTypeProject, "x' OR 1=1 --", "zh")(query)
			statement, args := query.Query()
			if strings.Contains(statement, "OR 1=1") {
				t.Fatalf("search interpolated into SQL: %s", statement)
			}
			if len(args) != 4 {
				t.Fatalf("bound parameters = %d, want 4: %s", len(args), statement)
			}
		})
	}
}
