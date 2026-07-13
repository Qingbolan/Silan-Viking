package projects

import (
	"context"

	"silan-backend/internal/commentruntime"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type LikeProjectCommentLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewLikeProjectCommentLogic(ctx context.Context, svcCtx *svc.ServiceContext) *LikeProjectCommentLogic {
	return &LikeProjectCommentLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *LikeProjectCommentLogic) LikeProjectComment(req *types.LikeCommentRequest) (*types.LikeCommentResponse, error) {
	count, liked, err := commentruntime.ToggleLike(
		l.ctx, l.svcCtx.DB, req.CommentID, req.Fingerprint, req.AuthenticatedUserID, req.ClientIP,
	)
	if err != nil {
		return nil, err
	}
	return &types.LikeCommentResponse{LikesCount: count, IsLikedByUser: liked}, nil
}
