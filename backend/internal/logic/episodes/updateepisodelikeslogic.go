package episodes

import (
	"context"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	bloglogic "silan-backend/internal/logic/blog"

	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateEpisodeLikesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewUpdateEpisodeLikesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateEpisodeLikesLogic {
	return &UpdateEpisodeLikesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateEpisodeLikesLogic) UpdateEpisodeLikes(req *types.UpdateBlogLikesRequest) (*types.UpdateBlogLikesResponse, error) {
	if _, err := l.svcCtx.DB.Episode.Get(l.ctx, req.ID); err != nil {
		return nil, err
	}
	return bloglogic.NewUpdateBlogLikesLogic(l.ctx, l.svcCtx).
		UpdateContentLikes(req, contentinteraction.EntityTypeEpisode)
}
