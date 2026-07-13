// Package commentruntime owns lifecycle operations for the shared comment
// runtime tables. Blog, idea and project comments all use the same storage;
// destructive operations therefore belong here rather than in three copies.
package commentruntime

import (
	"context"
	"fmt"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/commentlike"
)

// DeleteTree atomically removes root, every descendant, and their likes.
// entityType prevents a malformed parent edge from crossing content domains.
func DeleteTree(
	ctx context.Context,
	client *ent.Client,
	rootID string,
	entityType comment.EntityType,
) error {
	tx, err := client.Tx(ctx)
	if err != nil {
		return err
	}
	if err := deleteNode(ctx, tx.Client(), rootID, entityType); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit comment tree deletion: %w", err)
	}
	return nil
}

func deleteNode(ctx context.Context, client *ent.Client, id string, entityType comment.EntityType) error {
	exists, err := client.Comment.Query().
		Where(comment.IDEQ(id), comment.EntityTypeEQ(entityType)).
		Exist(ctx)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("comment %s not found in %s", id, entityType)
	}

	replies, err := client.Comment.Query().
		Where(comment.ParentIDEQ(id), comment.EntityTypeEQ(entityType)).
		Select(comment.FieldID).
		All(ctx)
	if err != nil {
		return err
	}
	for _, reply := range replies {
		if err := deleteNode(ctx, client, reply.ID, entityType); err != nil {
			return err
		}
	}

	if _, err := client.CommentLike.Delete().Where(commentlike.CommentIDEQ(id)).Exec(ctx); err != nil {
		return err
	}
	if err := client.Comment.DeleteOneID(id).Exec(ctx); err != nil {
		return err
	}
	return nil
}
