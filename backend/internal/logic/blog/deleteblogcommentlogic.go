package blog

import (
	"context"
	"fmt"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

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
	cid := req.CommentID

	c, err := l.svcCtx.DB.Comment.Query().Where(comment.IDEQ(cid), comment.EntityTypeEQ("blog")).Only(l.ctx)
	if err != nil {
		return err
	}

	if !commentruntime.NewActor(req.AuthenticatedUserID, req.Fingerprint).CanDelete(c) {
		l.Errorf("Unauthorized delete attempt for comment %s from IP %s, UserAgent: %s",
			req.CommentID, req.ClientIP, req.UserAgentFull)
		return fmt.Errorf("forbidden: insufficient permissions to delete this comment")
	}

	// Log the deletion for audit trail
	l.Infof("User authorized to delete comment %s (userID: %s, ip: %s, fingerprint: %s)",
		req.CommentID, req.AuthenticatedUserID, req.ClientIP, req.Fingerprint)

	return commentruntime.DeleteTree(l.ctx, l.svcCtx.DB, cid, comment.EntityTypeBlog)
}
