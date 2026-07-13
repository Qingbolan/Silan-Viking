package commentruntime

import (
	"context"
	"fmt"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/commentlike"
	"silan-backend/internal/ent/predicate"
)

// ToggleLike reconciles the actor's like and the comment counter in one
// transaction. When an anonymous visitor later signs in, identity OR
// fingerprint refers to the same actor and any legacy duplicates are removed
// together rather than toggling an arbitrary row.
func ToggleLike(
	ctx context.Context,
	client *ent.Client,
	commentID string,
	fingerprint string,
	userIdentityID string,
	ipAddress string,
) (likesCount int, isLiked bool, err error) {
	commentID = strings.TrimSpace(commentID)
	fingerprint = strings.TrimSpace(fingerprint)
	userIdentityID = strings.TrimSpace(userIdentityID)
	if commentID == "" {
		return 0, false, fmt.Errorf("comment_id is required")
	}
	if fingerprint == "" && userIdentityID == "" {
		return 0, false, fmt.Errorf("either user_identity_id or fingerprint must be provided")
	}

	tx, err := client.Tx(ctx)
	if err != nil {
		return 0, false, err
	}
	rollback := func(cause error) (int, bool, error) {
		_ = tx.Rollback()
		return 0, false, cause
	}

	if _, queryErr := tx.Comment.Get(ctx, commentID); queryErr != nil {
		return rollback(queryErr)
	}

	actorPredicates := make([]predicate.CommentLike, 0, 2)
	if userIdentityID != "" {
		actorPredicates = append(actorPredicates, commentlike.UserIdentityIDEQ(userIdentityID))
	}
	if fingerprint != "" {
		actorPredicates = append(actorPredicates, commentlike.FingerprintEQ(fingerprint))
	}
	matching := tx.CommentLike.Query().Where(
		commentlike.CommentIDEQ(commentID),
		commentlike.Or(actorPredicates...),
	)
	existing, queryErr := matching.All(ctx)
	if queryErr != nil {
		return rollback(queryErr)
	}

	if len(existing) > 0 {
		ids := make([]string, 0, len(existing))
		for _, like := range existing {
			ids = append(ids, like.ID)
		}
		if _, deleteErr := tx.CommentLike.Delete().Where(commentlike.IDIn(ids...)).Exec(ctx); deleteErr != nil {
			return rollback(deleteErr)
		}
		isLiked = false
	} else {
		builder := tx.CommentLike.Create().
			SetCommentID(commentID).
			SetIPAddress(strings.TrimSpace(ipAddress))
		if fingerprint != "" {
			builder.SetFingerprint(fingerprint)
		}
		if userIdentityID != "" {
			builder.SetUserIdentityID(userIdentityID)
		}
		if _, createErr := builder.Save(ctx); createErr != nil {
			return rollback(createErr)
		}
		isLiked = true
	}

	likesCount, err = tx.CommentLike.Query().Where(commentlike.CommentIDEQ(commentID)).Count(ctx)
	if err != nil {
		return rollback(err)
	}
	if _, err = tx.Comment.UpdateOneID(commentID).SetLikesCount(likesCount).Save(ctx); err != nil {
		return rollback(err)
	}
	if err = tx.Commit(); err != nil {
		return 0, false, fmt.Errorf("commit comment like: %w", err)
	}
	return likesCount, isLiked, nil
}
