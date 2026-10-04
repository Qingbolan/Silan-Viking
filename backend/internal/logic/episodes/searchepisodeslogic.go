package episodes

import (
	"context"
	"strings"

	"silan-backend/internal/contentsearch"
	"silan-backend/internal/ent"
	"silan-backend/internal/ent/episode"
	"silan-backend/internal/ent/episodeseries"
	"silan-backend/internal/ent/episodeseriestranslation"
	"silan-backend/internal/ent/episodetranslation"
	"silan-backend/internal/ent/itempart"
	"silan-backend/internal/pagination"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type SearchEpisodesLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewSearchEpisodesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SearchEpisodesLogic {
	return &SearchEpisodesLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SearchEpisodesLogic) SearchEpisodes(req *types.EpisodeSearchRequest) (*types.EpisodeSearchResponse, error) {
	page := pagination.New(req.Page, req.Size, 50)

	query := l.svcCtx.DB.Episode.Query().Where(
		episode.VisibilityEQ(episode.VisibilityPublic),
	)

	if search := strings.TrimSpace(req.Query); search != "" {
		languages := contentsearch.Languages(req.Language)
		query = query.Where(episode.Or(
			episode.TitleContainsFold(search),
			contentsearch.MatchesParts(itempart.EntityTypeEpisode, search, req.Language),
			episode.HasTranslationsWith(
				episodetranslation.LanguageCodeIn(languages...),
				episodetranslation.Or(
					episodetranslation.TitleContainsFold(search),
					episodetranslation.DescriptionContainsFold(search),
				),
			),
			episode.HasSeriesWith(episodeseries.Or(
				episodeseries.TitleContainsFold(search),
				episodeseries.DescriptionContainsFold(search),
				episodeseries.HasTranslationsWith(
					episodeseriestranslation.LanguageCodeIn(languages...),
					episodeseriestranslation.Or(
						episodeseriestranslation.TitleContainsFold(search),
						episodeseriestranslation.DescriptionContainsFold(search),
					),
				),
			)),
		))
	}

	total, err := query.Count(l.ctx)
	if err != nil {
		return nil, err
	}

	episodes := []*ent.Episode{}
	if offset, ok := page.Offset(total); ok {
		episodes, err = query.WithTranslations().WithSeries().Order(ent.Desc(episode.FieldPublishedAt), ent.Asc(episode.FieldEpisodeNumber), ent.Asc(episode.FieldID)).Offset(offset).Limit(page.Size).All(l.ctx)
		if err != nil {
			return nil, err
		}
	}

	result := make([]types.EpisodeData, 0, len(episodes))
	for _, item := range episodes {
		result = append(result, episodeToData(item, req.Language))
	}

	return &types.EpisodeSearchResponse{
		Episodes:   result,
		Total:      int64(total),
		Page:       page.Number,
		Size:       page.Size,
		TotalPages: page.TotalPages(total),
	}, nil
}
