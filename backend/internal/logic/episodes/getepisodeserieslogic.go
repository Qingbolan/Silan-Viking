package episodes

import (
	"context"

	"silan-backend/internal/ent/episodeseries"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetEpisodeSeriesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetEpisodeSeriesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetEpisodeSeriesLogic {
	return &GetEpisodeSeriesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetEpisodeSeriesLogic) GetEpisodeSeries(req *types.EpisodeSeriesRequest) (*types.EpisodeSeriesData, error) {
	series, err := l.svcCtx.DB.EpisodeSeries.Query().
		Where(
			episodeseries.Slug(req.SeriesSlug),
			episodeseries.StatusNEQ(episodeseries.StatusArchived),
		).
		WithTranslations().
		WithEpisodes(publicEpisodeQuery).
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	data := seriesToData(series, req.Language)
	return &data, nil
}
