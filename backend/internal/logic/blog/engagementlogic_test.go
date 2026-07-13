package blog

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/ent/enttest"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	_ "github.com/mattn/go-sqlite3"
)

func newBlogEngagementTestContext(t *testing.T) (context.Context, *svc.ServiceContext) {
	t.Helper()
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	client.BlogPost.Create().
		SetID("blog-one").
		SetSlug("blog-one").
		SetStatus(blogpost.StatusPublished).
		SetVisibility(blogpost.VisibilityPublic).
		SetLikeCount(73).
		SetViewCount(83).
		SaveX(ctx)
	return ctx, &svc.ServiceContext{DB: client}
}

func TestBlogEngagementLifecycleUsesInteractionRows(t *testing.T) {
	ctx, svcCtx := newBlogEngagementTestContext(t)
	likes := NewUpdateBlogLikesLogic(ctx, svcCtx)
	views := NewUpdateBlogViewsLogic(ctx, svcCtx)

	liked, err := likes.UpdateBlogLikes(&types.UpdateBlogLikesRequest{
		ID:          "blog-one",
		Increment:   true,
		Fingerprint: "actor-one",
	})
	if err != nil {
		t.Fatalf("UpdateBlogLikes like: %v", err)
	}
	if liked.Likes != 1 || !liked.IsLikedByUser {
		t.Fatalf("like response = %+v", liked)
	}

	viewReq := &types.UpdateBlogViewsRequest{ID: "blog-one", Fingerprint: "actor-one"}
	if err := views.UpdateBlogViews(viewReq); err != nil {
		t.Fatalf("first UpdateBlogViews: %v", err)
	}
	if err := views.UpdateBlogViews(viewReq); err != nil {
		t.Fatalf("second UpdateBlogViews: %v", err)
	}

	counts, err := NewGetBlogPostByIdLogic(ctx, svcCtx).GetBlogPostById(&types.BlogByIdRequest{
		ID: "blog-one", Fingerprint: "actor-one",
	})
	if err != nil {
		t.Fatalf("GetBlogPostById: %v", err)
	}
	if counts.Likes != 1 || counts.Views != 1 || !counts.IsLikedByUser {
		t.Fatalf("runtime engagement = %+v", counts)
	}

	unliked, err := likes.UpdateBlogLikes(&types.UpdateBlogLikesRequest{
		ID:          "blog-one",
		Increment:   false,
		Fingerprint: "actor-one",
	})
	if err != nil {
		t.Fatalf("UpdateBlogLikes unlike: %v", err)
	}
	if unliked.Likes != 0 || unliked.IsLikedByUser {
		t.Fatalf("unlike response = %+v", unliked)
	}

	post := svcCtx.DB.BlogPost.GetX(ctx, "blog-one")
	if post.LikeCount != 73 || post.ViewCount != 83 {
		t.Fatalf("projection counters mutated: likes=%d views=%d", post.LikeCount, post.ViewCount)
	}
}
