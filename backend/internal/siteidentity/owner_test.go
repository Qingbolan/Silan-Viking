package siteidentity

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"

	_ "github.com/mattn/go-sqlite3"
)

func TestOwnerNameUsesLocalizedIdentityAndEnglishFallback(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	client.Language.Create().SetID("en").SetName("English").SetNativeName("English").SaveX(ctx)
	client.Language.Create().SetID("zh").SetName("Chinese").SetNativeName("中文").SaveX(ctx)
	owner := client.PersonalInfo.Create().SetID("owner").SaveX(ctx)
	client.PersonalInfoTranslation.Create().SetPersonalInfo(owner).SetLanguageCode("en").SetFullName("Silan Hu").SaveX(ctx)
	client.PersonalInfoTranslation.Create().SetPersonalInfo(owner).SetLanguageCode("zh").SetFullName("胡思蓝").SaveX(ctx)

	if name, err := OwnerName(ctx, client, "zh"); err != nil || name != "胡思蓝" {
		t.Fatalf("Chinese owner = %q, %v", name, err)
	}
	if name, err := OwnerName(ctx, client, "fr"); err != nil || name != "Silan Hu" {
		t.Fatalf("English fallback owner = %q, %v", name, err)
	}
}
