package episodes

import (
	"context"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateEpisodeViewsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewUpdateEpisodeViewsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateEpisodeViewsLogic {
	return &UpdateEpisodeViewsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateEpisodeViewsLogic) UpdateEpisodeViews(req *types.UpdateBlogViewsRequest) error {
	if _, err := l.svcCtx.DB.Episode.Get(l.ctx, req.ID); err != nil {
		return err
	}
	return analytics.NewContentViewsRecorder(l.ctx, l.svcCtx).
		Record(req, contentinteraction.EntityTypeEpisode)
}
