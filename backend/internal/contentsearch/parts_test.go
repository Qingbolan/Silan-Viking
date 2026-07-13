package contentsearch

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/itempart"

	_ "github.com/mattn/go-sqlite3"
)

func TestEntityIDsMatchingPartsUsesLocaleAndEnglishFallback(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)

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

	englishFallback, err := EntityIDsMatchingParts(
		ctx, client, itempart.EntityTypeProject, "EXECUTABLE", "zh",
	)
	if err != nil {
		t.Fatalf("English fallback search: %v", err)
	}
	if len(englishFallback) != 1 || englishFallback[0] != "project-one" {
		t.Fatalf("English fallback ids = %v", englishFallback)
	}

	chinese, err := EntityIDsMatchingParts(
		ctx, client, itempart.EntityTypeProject, "知识", "zh",
	)
	if err != nil {
		t.Fatalf("Chinese search: %v", err)
	}
	if len(chinese) != 1 || chinese[0] != "project-one" {
		t.Fatalf("Chinese ids = %v", chinese)
	}

	wrongType, err := EntityIDsMatchingParts(
		ctx, client, itempart.EntityTypeBlog, "knowledge", "en",
	)
	if err != nil {
		t.Fatalf("wrong-type search: %v", err)
	}
	if len(wrongType) != 0 {
		t.Fatalf("wrong-type ids = %v, want empty", wrongType)
	}
}
