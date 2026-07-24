package commentruntime

import (
	"context"
	"fmt"
	"strings"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/ent/commentlike"
	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/predicate"
	"silan-backend/internal/ent/projectlike"
)

// MergeGuestResult reports the amount of browser-owned runtime state that was
// moved behind an authenticated identity.
type MergeGuestResult struct {
	Comments            int
	CommentLikes        int
	DedupedCommentLikes int
	ProjectLikes        int
	DedupedProjectLikes int
	ContentLikes        int
	DedupedContentLikes int
}

// MergeGuestIntoIdentity promotes the current browser's guest comments and
// likes to the authenticated identity. It preserves public content while
// replacing the guest display name/avatar source with the verified profile.
func MergeGuestIntoIdentity(
	ctx context.Context,
	client *ent.Client,
	fingerprint string,
	identity *ent.UserIdentity,
) (MergeGuestResult, error) {
	fingerprint = strings.TrimSpace(fingerprint)
	if fingerprint == "" {
		return MergeGuestResult{}, fmt.Errorf("fingerprint is required")
	}
	if identity == nil || strings.TrimSpace(identity.ID) == "" {
		return MergeGuestResult{}, fmt.Errorf("authenticated identity is required")
	}

	tx, err := client.Tx(ctx)
	if err != nil {
		return MergeGuestResult{}, err
	}
	rollback := func(cause error) (MergeGuestResult, error) {
		_ = tx.Rollback()
		return MergeGuestResult{}, cause
	}

	result := MergeGuestResult{}
	if result.Comments, err = mergeGuestComments(ctx, tx, fingerprint, identity); err != nil {
		return rollback(err)
	}
	if result.CommentLikes, result.DedupedCommentLikes, err = mergeCommentLikes(ctx, tx, fingerprint, identity.ID); err != nil {
		return rollback(err)
	}
	if result.ProjectLikes, result.DedupedProjectLikes, err = mergeProjectLikes(ctx, tx, fingerprint, identity.ID); err != nil {
		return rollback(err)
	}
	if result.ContentLikes, result.DedupedContentLikes, err = mergeContentLikes(ctx, tx, fingerprint, identity.ID); err != nil {
		return rollback(err)
	}

	if err := tx.Commit(); err != nil {
		return MergeGuestResult{}, fmt.Errorf("commit guest identity merge: %w", err)
	}
	return result, nil
}

func mergeGuestComments(ctx context.Context, tx *ent.Tx, fingerprint string, identity *ent.UserIdentity) (int, error) {
	rows, err := tx.Comment.Query().
		Where(guestCommentFingerprint(fingerprint)).
		Where(comment.Or(comment.UserIdentityIDEQ(""), comment.UserIdentityIDIsNil())).
		All(ctx)
	if err != nil {
		return 0, err
	}
	for _, row := range rows {
		builder := tx.Comment.UpdateOneID(row.ID).
			SetAuthorName(identityDisplayName(identity)).
			SetUserIdentityID(identity.ID)
		if identity.Email != "" {
			builder.SetAuthorEmail(identity.Email)
		}
		if _, err := builder.Save(ctx); err != nil {
			return 0, err
		}
	}
	return len(rows), nil
}

func identityDisplayName(identity *ent.UserIdentity) string {
	if name := strings.TrimSpace(identity.DisplayName); name != "" {
		return name
	}
	if email := strings.TrimSpace(identity.Email); email != "" {
		return email
	}
	return strings.TrimSpace(identity.ID)
}

func mergeCommentLikes(ctx context.Context, tx *ent.Tx, fingerprint, identityID string) (merged int, deduped int, err error) {
	rows, err := tx.CommentLike.Query().Where(commentlike.FingerprintEQ(fingerprint)).All(ctx)
	if err != nil {
		return 0, 0, err
	}
	affected := map[string]struct{}{}
	for _, row := range rows {
		affected[row.CommentID] = struct{}{}
		exists, err := tx.CommentLike.Query().
			Where(commentlike.CommentIDEQ(row.CommentID), commentlike.UserIdentityIDEQ(identityID)).
			Exist(ctx)
		if err != nil {
			return 0, 0, err
		}
		if exists && row.UserIdentityID != identityID {
			if err := tx.CommentLike.DeleteOneID(row.ID).Exec(ctx); err != nil {
				return 0, 0, err
			}
			deduped++
			continue
		}
		if row.UserIdentityID != identityID {
			if _, err := tx.CommentLike.UpdateOneID(row.ID).SetUserIdentityID(identityID).Save(ctx); err != nil {
				return 0, 0, err
			}
			merged++
		}
	}
	for commentID := range affected {
		count, err := tx.CommentLike.Query().Where(commentlike.CommentIDEQ(commentID)).Count(ctx)
		if err != nil {
			return 0, 0, err
		}
		if _, err := tx.Comment.UpdateOneID(commentID).SetLikesCount(count).Save(ctx); err != nil {
			return 0, 0, err
		}
	}
	return merged, deduped, nil
}

func mergeProjectLikes(ctx context.Context, tx *ent.Tx, fingerprint, identityID string) (merged int, deduped int, err error) {
	rows, err := tx.ProjectLike.Query().Where(projectlike.FingerprintEQ(fingerprint)).All(ctx)
	if err != nil {
		return 0, 0, err
	}
	for _, row := range rows {
		exists, err := tx.ProjectLike.Query().
			Where(projectlike.ProjectIDEQ(row.ProjectID), projectlike.UserIdentityIDEQ(identityID)).
			Exist(ctx)
		if err != nil {
			return 0, 0, err
		}
		if exists && row.UserIdentityID != identityID {
			if err := tx.ProjectLike.DeleteOneID(row.ID).Exec(ctx); err != nil {
				return 0, 0, err
			}
			deduped++
			continue
		}
		if row.UserIdentityID != identityID {
			if _, err := tx.ProjectLike.UpdateOneID(row.ID).SetUserIdentityID(identityID).Save(ctx); err != nil {
				return 0, 0, err
			}
			merged++
		}
	}
	return merged, deduped, nil
}

func mergeContentLikes(ctx context.Context, tx *ent.Tx, fingerprint, identityID string) (merged int, deduped int, err error) {
	rows, err := tx.ContentInteraction.Query().
		Where(contentinteraction.FingerprintEQ(fingerprint), contentinteraction.KindEQ(contentinteraction.KindLike)).
		All(ctx)
	if err != nil {
		return 0, 0, err
	}
	for _, row := range rows {
		exists, err := tx.ContentInteraction.Query().
			Where(
				contentinteraction.EntityTypeEQ(row.EntityType),
				contentinteraction.EntityIDEQ(row.EntityID),
				contentinteraction.KindEQ(contentinteraction.KindLike),
				contentinteraction.UserIdentityIDEQ(identityID),
			).
			Exist(ctx)
		if err != nil {
			return 0, 0, err
		}
		rowIdentityID := ""
		if row.UserIdentityID != nil {
			rowIdentityID = *row.UserIdentityID
		}
		if exists && rowIdentityID != identityID {
			if err := tx.ContentInteraction.DeleteOneID(row.ID).Exec(ctx); err != nil {
				return 0, 0, err
			}
			deduped++
			continue
		}
		if rowIdentityID != identityID {
			if _, err := tx.ContentInteraction.UpdateOneID(row.ID).SetUserIdentityID(identityID).Save(ctx); err != nil {
				return 0, 0, err
			}
			merged++
		}
	}
	return merged, deduped, nil
}

func guestCommentFingerprint(fingerprint string) predicate.Comment {
	prefix := "fp:" + fingerprint
	return comment.Or(
		comment.UserAgentEQ(prefix),
		comment.UserAgentHasPrefix(prefix+" | "),
	)
}
