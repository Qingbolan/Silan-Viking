package engagement

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/enttest"

	_ "github.com/mattn/go-sqlite3"
)

func TestRuntimeCountsIgnoreProjectionCounters(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)

	client.Project.Create().
		SetID("project-one").
		SetSlug("project-one").
		SetViewCount(900).
		SetLikeCount(800).
		SaveX(ctx)
	client.ProjectLike.Create().SetProjectID("project-one").SetFingerprint("actor-a").SaveX(ctx)
	client.ProjectLike.Create().SetProjectID("project-one").SetFingerprint("actor-b").SaveX(ctx)
	client.ProjectView.Create().SetProjectID("project-one").SetFingerprint("actor-a").SaveX(ctx)

	counts, err := ProjectCount(ctx, client, "project-one")
	if err != nil {
		t.Fatalf("ProjectCount: %v", err)
	}
	if counts.Likes != 2 || counts.Views != 1 {
		t.Fatalf("ProjectCount = %+v, want runtime likes=2 views=1", counts)
	}
}

func TestBlogCountsAndActorStateComeFromInteractions(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)

	client.BlogPost.Create().
		SetID("blog-one").
		SetSlug("blog-one").
		SetViewCount(700).
		SetLikeCount(600).
		SaveX(ctx)
	client.ContentInteraction.Create().
		SetEntityType(contentinteraction.EntityTypeBlog).
		SetEntityID("blog-one").
		SetKind(contentinteraction.KindLike).
		SetFingerprint("actor-a").
		SaveX(ctx)
	for range 3 {
		client.ContentInteraction.Create().
			SetEntityType(contentinteraction.EntityTypeBlog).
			SetEntityID("blog-one").
			SetKind(contentinteraction.KindView).
			SaveX(ctx)
	}

	counts, err := BlogCount(ctx, client, "blog-one")
	if err != nil {
		t.Fatalf("BlogCount: %v", err)
	}
	if counts.Likes != 1 || counts.Views != 3 {
		t.Fatalf("BlogCount = %+v, want runtime likes=1 views=3", counts)
	}
	liked, err := IsBlogLiked(ctx, client, "blog-one", "", "actor-a")
	if err != nil {
		t.Fatalf("IsBlogLiked: %v", err)
	}
	if !liked {
		t.Fatal("actor-a like was not found")
	}
}
