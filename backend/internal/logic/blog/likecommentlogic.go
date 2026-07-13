package blog

import (
	"context"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type LikeCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewLikeCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *LikeCommentLogic {
	return &LikeCommentLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *LikeCommentLogic) LikeComment(req *types.LikeCommentRequest) (*types.LikeCommentResponse, error) {
	count, liked, err := commentruntime.ToggleLike(
		l.ctx, l.svcCtx.DB, req.CommentID, req.Fingerprint, req.AuthenticatedUserID, req.ClientIP,
	)
	if err != nil {
		return nil, err
	}
	return &types.LikeCommentResponse{LikesCount: count, IsLikedByUser: liked}, nil
}
