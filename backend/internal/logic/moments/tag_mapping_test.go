package moments

import (
	"context"
	"database/sql"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/contenttag"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func TestMomentAndRelatedOutputsKeepCanonicalTags(t *testing.T) {
	ctx := context.Background()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	defer client.Close()
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	service := &svc.ServiceContext{DB: client, ContentTags: contenttag.NewRepository(db, "sqlite3")}
	client.Moment.Create().SetID("moment-id").SetSlug("moment-slug").SetVisibility("public").SaveX(ctx)
	client.BlogPost.Create().SetID("blog-id").SetSlug("blog-slug").SetVisibility("public").SaveX(ctx)
	client.Project.Create().SetID("project-id").SetSlug("project-slug").SetVisibility("public").SaveX(ctx)
	client.Project.Create().SetID("private-id").SetSlug("private-slug").SaveX(ctx)
	if _, err := db.Exec(`INSERT INTO tag (id,label,slug) VALUES ('tag','Research','research')`); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"moment", "blog", "project"} {
		if _, err := db.Exec(`INSERT INTO content_tag (tag_id,entity_type,entity_id,entity_slug) VALUES (?,?,?,?)`, "tag", kind, kind+"-id", kind+"-slug"); err != nil {
			t.Fatal(err)
		}
	}
	list, err := NewGetMomentsLogic(ctx, service).GetMoments(&types.MomentListRequest{Language: "en"})
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Moments) != 1 || len(list.Moments[0].Tags) != 1 || list.Moments[0].Tags[0] != "Research" {
		t.Fatalf("moment tags: %+v", list)
	}
	for _, outputs := range []map[string]types.MomentRelatedOutput{
		momentOutputBlogs(ctx, service, []string{"blog-slug"}, "en"),
		momentOutputProjects(ctx, service, []string{"project-slug", "private-slug"}, "en"),
	} {
		if len(outputs) != 2 {
			t.Fatalf("expected canonical and slug aliases only: %+v", outputs)
		}
		for _, output := range outputs {
			if len(output.Tags) != 1 || output.Tags[0] != "Research" {
				t.Fatalf("related tags: %+v", output)
			}
		}
	}
}
