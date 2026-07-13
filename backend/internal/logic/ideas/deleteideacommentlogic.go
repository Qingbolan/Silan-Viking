package ideas

import (
	"context"
	"fmt"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/ent/comment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type DeleteCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Delete a comment (fingerprint or owner identity required)
func NewDeleteIdeaCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *DeleteCommentLogic {
	return &DeleteCommentLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *DeleteCommentLogic) DeleteComment(req *types.DeleteIdeaCommentRequest) error {
	// Load comment meta using entgo with entity_type filter (like blog implementation)
	cmt, err := l.svcCtx.DB.Comment.Query().
		Where(comment.IDEQ(req.CommentID)).
		Where(comment.EntityTypeEQ(comment.EntityTypeIdea)).
		Only(l.ctx)
	if err != nil {
		return fmt.Errorf("comment not found")
	}

	if !commentruntime.NewActor(req.AuthenticatedUserID, req.Fingerprint).CanDelete(cmt) {
		return fmt.Errorf("forbidden: insufficient permissions to delete this comment")
	}

	// Recursive delete
	return commentruntime.DeleteTree(l.ctx, l.svcCtx.DB, req.CommentID, comment.EntityTypeIdea)
}
