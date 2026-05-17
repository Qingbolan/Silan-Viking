package ideas

import (
	"context"
	"fmt"
	"strings"

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

	// Authorization: identity or fingerprint match in user_agent
	authorized := false
	if req.UserIdentityId != "" && cmt.UserIdentityID != "" && req.UserIdentityId == cmt.UserIdentityID {
		authorized = true
	}
	if !authorized && req.Fingerprint != "" && strings.Contains(cmt.UserAgent, "fp:"+req.Fingerprint) {
		authorized = true
	}
	if !authorized {
		return fmt.Errorf("forbidden: insufficient permissions to delete this comment")
	}

	// Recursive delete
	return l.deleteWithReplies(req.CommentID)
}

func (l *DeleteCommentLogic) deleteWithReplies(commentID string) error {
	// Find replies using entgo (filter by entity_type like blog implementation)
	replies, err := l.svcCtx.DB.Comment.Query().
		Where(comment.ParentIDEQ(commentID)).
		Where(comment.EntityTypeEQ(comment.EntityTypeIdea)).
		All(l.ctx)
	if err != nil {
		return err
	}

	// Recursively delete replies
	for _, reply := range replies {
		if err := l.deleteWithReplies(reply.ID); err != nil {
			return err
		}
	}

	// Delete self using entgo
	return l.svcCtx.DB.Comment.DeleteOneID(commentID).Exec(l.ctx)
}
