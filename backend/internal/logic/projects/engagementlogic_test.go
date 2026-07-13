package projects

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	_ "github.com/mattn/go-sqlite3"
)

func newProjectEngagementTestContext(t *testing.T) (context.Context, *svc.ServiceContext) {
	t.Helper()
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	client.Project.Create().
		SetID("project-one").
		SetSlug("project-one").
		SetLikeCount(81).
		SetViewCount(91).
		SaveX(ctx)
	return ctx, &svc.ServiceContext{DB: client}
}

func TestProjectLikeLifecycleUsesRuntimeState(t *testing.T) {
	ctx, svcCtx := newProjectEngagementTestContext(t)
	logic := NewLikeProjectLogic(ctx, svcCtx)

	liked, err := logic.LikeProject(&types.LikeProjectRequest{
		ProjectID:   "project-one",
		Fingerprint: "actor-one",
	})
	if err != nil {
		t.Fatalf("LikeProject like: %v", err)
	}
	if liked.LikesCount != 1 || !liked.IsLikedByUser {
		t.Fatalf("like response = %+v", liked)
	}

	unliked, err := logic.LikeProject(&types.LikeProjectRequest{
		ProjectID:   "project-one",
		Fingerprint: "actor-one",
	})
	if err != nil {
		t.Fatalf("LikeProject unlike: %v", err)
	}
	if unliked.LikesCount != 0 || unliked.IsLikedByUser {
		t.Fatalf("unlike response = %+v", unliked)
	}

	project := svcCtx.DB.Project.GetX(ctx, "project-one")
	if project.LikeCount != 81 {
		t.Fatalf("projection like_count mutated to %d", project.LikeCount)
	}
	interactionCount := svcCtx.DB.ContentInteraction.Query().
		Where(contentinteraction.KindEQ(contentinteraction.KindLike)).
		CountX(ctx)
	if interactionCount != 0 {
		t.Fatalf("active like interactions = %d, want 0", interactionCount)
	}
}

func TestProjectViewLifecycleDeduplicatesWithoutProjectionMutation(t *testing.T) {
	ctx, svcCtx := newProjectEngagementTestContext(t)
	logic := NewRecordProjectViewLogic(ctx, svcCtx)
	req := &types.RecordProjectViewRequest{
		ProjectID:   "project-one",
		Fingerprint: "actor-one",
	}

	first, err := logic.RecordProjectView(req)
	if err != nil {
		t.Fatalf("first RecordProjectView: %v", err)
	}
	second, err := logic.RecordProjectView(req)
	if err != nil {
		t.Fatalf("second RecordProjectView: %v", err)
	}
	if first.ViewsCount != 1 || !first.ViewRecorded {
		t.Fatalf("first response = %+v", first)
	}
	if second.ViewsCount != 1 || second.ViewRecorded {
		t.Fatalf("second response = %+v", second)
	}

	project := svcCtx.DB.Project.GetX(ctx, "project-one")
	if project.ViewCount != 91 {
		t.Fatalf("projection view_count mutated to %d", project.ViewCount)
	}
	interactionCount := svcCtx.DB.ContentInteraction.Query().
		Where(contentinteraction.KindEQ(contentinteraction.KindView)).
		CountX(ctx)
	if interactionCount != 1 {
		t.Fatalf("view interactions = %d, want 1", interactionCount)
	}
}
