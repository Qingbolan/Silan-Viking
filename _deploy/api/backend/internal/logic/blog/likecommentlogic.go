package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/commentlike"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type LikeCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Like/Unlike a comment
func NewLikeCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *LikeCommentLogic {
	return &LikeCommentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *LikeCommentLogic) LikeComment(req *types.LikeCommentRequest) (resp *types.LikeCommentResponse, err error) {
	commentID, err := uuid.Parse(req.CommentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}

	// Check if comment exists
	_, err = l.svcCtx.DB.BlogComment.Get(l.ctx, commentID)
	if err != nil {
		return nil, fmt.Errorf("comment not found: %w", err)
	}

	// Start transaction
	tx, err := l.svcCtx.DB.Tx(l.ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// Check if user has already liked this comment
	var existingLike *ent.CommentLike
	var existingErr error

	if req.UserIdentityId != "" {
		// For authenticated users
		existingLike, existingErr = tx.CommentLike.Query().
			Where(
				commentlike.CommentIDEQ(commentID),
				commentlike.UserIdentityIDEQ(req.UserIdentityId),
			).
			Only(l.ctx)
	} else if req.Fingerprint != "" {
		// For anonymous users with fingerprint
		existingLike, existingErr = tx.CommentLike.Query().
			Where(
				commentlike.CommentIDEQ(commentID),
				commentlike.FingerprintEQ(req.Fingerprint),
			).
			Only(l.ctx)
	} else {
		return nil, fmt.Errorf("either user_identity_id or fingerprint must be provided")
	}

	var isLiked bool
	var newLikesCount int

	if existingErr == nil && existingLike != nil {
		// Unlike: remove the like and decrease count
		err = tx.CommentLike.DeleteOneID(existingLike.ID).Exec(l.ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to delete like: %w", err)
		}

		// Decrease likes count
		updatedComment, err := tx.BlogComment.UpdateOneID(commentID).
			AddLikesCount(-1).
			Save(l.ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to update comment likes count: %w", err)
		}

		isLiked = false
		newLikesCount = updatedComment.LikesCount
	} else if ent.IsNotFound(existingErr) {
		// Like: create new like and increase count
		likeBuilder := tx.CommentLike.Create().
			SetCommentID(commentID).
			SetIPAddress(req.ClientIP)

		if req.UserIdentityId != "" {
			likeBuilder = likeBuilder.SetUserIdentityID(req.UserIdentityId)
		}
		if req.Fingerprint != "" {
			likeBuilder = likeBuilder.SetFingerprint(req.Fingerprint)
		}

		_, err = likeBuilder.Save(l.ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to create like: %w", err)
		}

		// Increase likes count
		updatedComment, err := tx.BlogComment.UpdateOneID(commentID).
			AddLikesCount(1).
			Save(l.ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to update comment likes count: %w", err)
		}

		isLiked = true
		newLikesCount = updatedComment.LikesCount
	} else {
		return nil, fmt.Errorf("failed to check existing like: %w", existingErr)
	}

	// Commit transaction
	err = tx.Commit()
	if err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &types.LikeCommentResponse{
		LikesCount:    newLikesCount,
		IsLikedByUser: isLiked,
	}, nil
}
