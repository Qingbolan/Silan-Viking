package commentruntime

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/enttest"

	_ "github.com/mattn/go-sqlite3"
)

func TestMergeGuestIntoIdentityPromotesCommentsAndDedupesLikes(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	defer client.Close()

	identity := client.UserIdentity.Create().
		SetID("identity-one").
		SetProvider("github").
		SetExternalID("gh-1").
		SetEmail("signed@example.com").
		SetDisplayName("Signed User").
		SetAvatarURL("https://example.com/avatar.png").
		SetVerified(true).
		SaveX(ctx)

	guestComment := client.Comment.Create().
		SetID("guest-comment").
		SetEntityType(comment.EntityTypeBlog).
		SetEntityID("post-one").
		SetAuthorName("Guest Name").
		SetContent("Before sign-in").
		SetUserAgent("fp:browser-one | Mozilla").
		SetLikesCount(2).
		SaveX(ctx)
	client.Comment.Create().
		SetID("other-comment").
		SetEntityType(comment.EntityTypeBlog).
		SetEntityID("post-one").
		SetAuthorName("Other Guest").
		SetContent("Do not touch").
		SetUserAgent("fp:browser-one-extra | Mozilla").
		SaveX(ctx)

	client.CommentLike.Create().SetCommentID(guestComment.ID).SetFingerprint("browser-one").SaveX(ctx)
	client.CommentLike.Create().SetCommentID(guestComment.ID).SetUserIdentityID(identity.ID).SaveX(ctx)
	client.ProjectLike.Create().SetProjectID("project-one").SetFingerprint("browser-one").SaveX(ctx)
	client.ProjectLike.Create().SetProjectID("project-one").SetUserIdentityID(identity.ID).SaveX(ctx)
	client.ContentInteraction.Create().
		SetEntityType(contentinteraction.EntityTypeBlog).
		SetEntityID("post-one").
		SetKind(contentinteraction.KindLike).
		SetFingerprint("browser-one").
		SaveX(ctx)
	client.ContentInteraction.Create().
		SetEntityType(contentinteraction.EntityTypeBlog).
		SetEntityID("post-one").
		SetKind(contentinteraction.KindLike).
		SetUserIdentityID(identity.ID).
		SaveX(ctx)

	result, err := MergeGuestIntoIdentity(ctx, client, "browser-one", identity)
	if err != nil {
		t.Fatal(err)
	}
	if result.Comments != 1 {
		t.Fatalf("merged comments = %d, want 1", result.Comments)
	}
	if result.DedupedCommentLikes != 1 || result.DedupedProjectLikes != 1 || result.DedupedContentLikes != 1 {
		t.Fatalf("dedupe result = %+v", result)
	}

	promoted := client.Comment.GetX(ctx, guestComment.ID)
	if promoted.AuthorName != "Signed User" || promoted.AuthorEmail != "signed@example.com" || promoted.UserIdentityID != identity.ID {
		t.Fatalf("promoted comment = %+v", promoted)
	}
	if promoted.LikesCount != 1 {
		t.Fatalf("promoted likes_count = %d, want 1", promoted.LikesCount)
	}
	untouched := client.Comment.GetX(ctx, "other-comment")
	if untouched.UserIdentityID != "" || untouched.AuthorName != "Other Guest" {
		t.Fatalf("non-matching fingerprint was touched: %+v", untouched)
	}
	if count := client.CommentLike.Query().CountX(ctx); count != 1 {
		t.Fatalf("comment likes = %d, want 1", count)
	}
	if count := client.ProjectLike.Query().CountX(ctx); count != 1 {
		t.Fatalf("project likes = %d, want 1", count)
	}
	if count := client.ContentInteraction.Query().Where(contentinteraction.KindEQ(contentinteraction.KindLike)).CountX(ctx); count != 1 {
		t.Fatalf("content likes = %d, want 1", count)
	}
}
