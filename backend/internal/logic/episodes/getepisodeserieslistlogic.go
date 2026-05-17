package episodes

import (
	"context"

	"silan-backend/internal/ent/episodeseries"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetEpisodeSeriesListLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetEpisodeSeriesListLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetEpisodeSeriesListLogic {
	return &GetEpisodeSeriesListLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetEpisodeSeriesListLogic) GetEpisodeSeriesList(language string) (*types.EpisodeSeriesListResponse, error) {
	series, err := l.svcCtx.DB.EpisodeSeries.Query().
		Where(episodeseries.StatusNEQ(episodeseries.StatusArchived)).
		WithTranslations().
		WithEpisodes(publicEpisodeQuery).
		Order(episodeseries.ByCreatedAt()).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	result := make([]types.EpisodeSeriesData, 0, len(series))
	for _, item := range series {
		result = append(result, seriesToData(item, language))
	}

	return &types.EpisodeSeriesListResponse{
		Series: result,
		Total:  len(result),
	}, nil
}
