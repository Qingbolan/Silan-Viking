package blog

import (
	"context"
	"fmt"
	"strings"

	"silan-backend/internal/ent/blogcomment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
	"github.com/zeromicro/go-zero/core/logx"
)

type DeleteBlogCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Delete a comment (fingerprint required)
func NewDeleteBlogCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *DeleteBlogCommentLogic {
	return &DeleteBlogCommentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *DeleteBlogCommentLogic) DeleteBlogComment(req *types.DeleteBlogCommentRequest) error {
	cid, err := uuid.Parse(req.CommentID)
	if err != nil {
		return err
	}

	c, err := l.svcCtx.DB.BlogComment.Get(l.ctx, cid)
	if err != nil {
		return err
	}

	// Check authorization
	authorized := false

	// Method 1: Check user identity ownership (for logged-in users)
	if req.UserIdentityId != "" && c.UserIdentityID != "" && c.UserIdentityID == req.UserIdentityId {
		authorized = true
	}

	// Method 2: Check fingerprint for anonymous users (fallback)
	if !authorized && req.Fingerprint != "" && strings.Contains(c.UserAgent, "fp:"+req.Fingerprint) {
		authorized = true
	}

	if !authorized {
		l.Errorf("Unauthorized delete attempt for comment %s from IP %s, UserAgent: %s",
			req.CommentID, req.ClientIP, req.UserAgentFull)
		return fmt.Errorf("forbidden: insufficient permissions to delete this comment")
	}

	// Log the deletion for audit trail
	l.Infof("User authorized to delete comment %s (userID: %s, ip: %s, fingerprint: %s)",
		req.CommentID, req.UserIdentityId, req.ClientIP, req.Fingerprint)

	// Delete the comment and all its replies (cascade delete)
	return l.deleteCommentWithReplies(cid)
}

// deleteCommentWithReplies recursively deletes a comment and all its replies
func (l *DeleteBlogCommentLogic) deleteCommentWithReplies(commentID uuid.UUID) error {
	// First, find all direct replies to this comment
	replies, err := l.svcCtx.DB.BlogComment.
		Query().
		Where(blogcomment.ParentIDEQ(commentID)).
		All(l.ctx)
	if err != nil {
		return fmt.Errorf("failed to find replies: %v", err)
	}

	// Recursively delete all replies first
	for _, reply := range replies {
		if err := l.deleteCommentWithReplies(reply.ID); err != nil {
			return fmt.Errorf("failed to delete reply %s: %v", reply.ID, err)
		}
	}

	// Finally, delete the comment itself
	err = l.svcCtx.DB.BlogComment.DeleteOneID(commentID).Exec(l.ctx)
	if err != nil {
		return fmt.Errorf("failed to delete comment %s: %v", commentID, err)
	}

	l.Infof("Deleted comment %s and %d replies", commentID, len(replies))
	return nil
}
