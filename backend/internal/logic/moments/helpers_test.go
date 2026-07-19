package moments

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/svc"

	_ "github.com/mattn/go-sqlite3"
)

func TestVisitorNumberIsStableAndTwoDigits(t *testing.T) {
	first := visitorNumber("browser-cookie-a")
	if first != visitorNumber("browser-cookie-a") {
		t.Fatal("visitor number must remain stable for one browser cookie")
	}
	if len(first) != 2 || first < "01" || first > "99" {
		t.Fatalf("visitorNumber() = %q, want 01 through 99", first)
	}
}

func TestUpdatePartBodiesLoadsRequestedLanguageAndFallsBackToEnglish(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	partOne := client.ItemPart.Create().
		SetID("part-one").
		SetPartID("part-one").
		SetEntityType(itempart.EntityTypeMoment).
		SetEntityID("moment-one").
		SetRole("body").
		SetCanonicalLang("en").
		SaveX(ctx)
	partTwo := client.ItemPart.Create().
		SetID("part-two").
		SetPartID("part-two").
		SetEntityType(itempart.EntityTypeMoment).
		SetEntityID("moment-two").
		SetRole("body").
		SetCanonicalLang("en").
		SaveX(ctx)

	client.ItemPartTranslation.Create().SetItemPart(partOne).SetLanguageCode("en").SetBody("English one").SaveX(ctx)
	client.ItemPartTranslation.Create().SetItemPart(partOne).SetLanguageCode("zh").SetBody("中文一").SaveX(ctx)
	client.ItemPartTranslation.Create().SetItemPart(partTwo).SetLanguageCode("en").SetBody("English two").SaveX(ctx)

	bodies := updatePartBodies(ctx, &svc.ServiceContext{DB: client}, []string{"moment-one", "moment-two"}, "body", "zh")
	if got, want := bodies["moment-one"], "中文一"; got != want {
		t.Fatalf("requested translation = %q, want %q", got, want)
	}
	if got, want := bodies["moment-two"], "English two"; got != want {
		t.Fatalf("English fallback = %q, want %q", got, want)
	}
}
