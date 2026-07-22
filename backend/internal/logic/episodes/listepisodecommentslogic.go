package episodes

import (
	"context"

	"silan-backend/internal/ent/comment"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	bloglogic "silan-backend/internal/logic/blog"

	"github.com/zeromicro/go-zero/core/logx"
)

type ListEpisodeCommentsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewListEpisodeCommentsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListEpisodeCommentsLogic {
	return &ListEpisodeCommentsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ListEpisodeCommentsLogic) ListEpisodeComments(req *types.BlogCommentListRequest, clientIP, userAgent, fingerprint, userIdentityID string) (*types.BlogCommentListResponse, error) {
	if _, err := l.svcCtx.DB.Episode.Get(l.ctx, req.ID); err != nil {
		return nil, err
	}
	return bloglogic.NewListBlogCommentsLogic(l.ctx, l.svcCtx).
		ListComments(req, comment.EntityTypeEpisode, clientIP, userAgent, fingerprint, userIdentityID)
}
