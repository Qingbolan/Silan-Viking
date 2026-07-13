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

func TestDeleteTreeRemovesDescendantsAndLikesAtomically(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:"+strings.ReplaceAll(t.Name(), "/", "-")+"?mode=memory&cache=shared&_fk=1",
	)
	root := client.Comment.Create().
		SetID("root").
		SetEntityType(comment.EntityTypeProject).
		SetEntityID("project-one").
		SetType(comment.TypeIssue).
		SetAuthorName("Author").
		SetAuthorEmail("author@example.com").
		SetContent("Root").
		SaveX(ctx)
	reply := client.Comment.Create().
		SetID("reply").
		SetEntityType(comment.EntityTypeProject).
		SetEntityID("project-one").
		SetType(comment.TypeIssue).
		SetParentID(root.ID).
		SetAuthorName("Reader").
		SetAuthorEmail("reader@example.com").
		SetContent("Reply").
		SaveX(ctx)
	client.CommentLike.Create().SetCommentID(root.ID).SetFingerprint("actor-one").SaveX(ctx)
	client.CommentLike.Create().SetCommentID(reply.ID).SetFingerprint("actor-two").SaveX(ctx)

	if err := DeleteTree(ctx, client, root.ID, comment.EntityTypeProject); err != nil {
		t.Fatalf("DeleteTree: %v", err)
	}
	if count := client.Comment.Query().CountX(ctx); count != 0 {
		t.Fatalf("comments remaining = %d", count)
	}
	if count := client.CommentLike.Query().CountX(ctx); count != 0 {
		t.Fatalf("comment likes remaining = %d", count)
	}
}
