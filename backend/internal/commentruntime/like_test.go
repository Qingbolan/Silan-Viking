package commentruntime

import (
	"context"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/enttest"

	_ "github.com/mattn/go-sqlite3"
)

func TestToggleLikeReconcilesAnonymousAndAuthenticatedActor(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	client.Comment.Create().
		SetID("comment-one").
		SetEntityType(comment.EntityTypeProject).
		SetEntityID("project-one").
		SetType(comment.TypeIssue).
		SetAuthorName("Author").
		SetAuthorEmail("author@example.com").
		SetContent("Comment").
		SetLikesCount(99).
		SaveX(ctx)

	count, liked, err := ToggleLike(ctx, client, "comment-one", "browser-one", "", "")
	if err != nil {
		t.Fatalf("anonymous like: %v", err)
	}
	if count != 1 || !liked {
		t.Fatalf("anonymous like = (%d, %v)", count, liked)
	}

	// Signing in with the same browser means the existing anonymous like is
	// the actor's current state, so the next toggle unlikes it without leaving
	// a duplicate identity row.
	count, liked, err = ToggleLike(ctx, client, "comment-one", "browser-one", "identity-one", "")
	if err != nil {
		t.Fatalf("authenticated unlike: %v", err)
	}
	if count != 0 || liked {
		t.Fatalf("authenticated unlike = (%d, %v)", count, liked)
	}
	if remaining := client.CommentLike.Query().CountX(ctx); remaining != 0 {
		t.Fatalf("likes remaining = %d", remaining)
	}
	if stored := client.Comment.GetX(ctx, "comment-one").LikesCount; stored != 0 {
		t.Fatalf("reconciled counter = %d", stored)
	}
}

func TestToggleLikeRejectsMissingActor(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	if _, _, err := ToggleLike(ctx, client, "comment-one", "", "", ""); err == nil {
		t.Fatal("missing actor accepted")
	}
}
