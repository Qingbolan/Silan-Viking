package episodes

import (
	"context"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/ent/episode"
	"silan-backend/internal/logic/engagement"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetEpisodeLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetEpisodeLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetEpisodeLogic {
	return &GetEpisodeLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetEpisodeLogic) GetEpisode(req *types.EpisodeRequest) (*types.EpisodeData, error) {
	ep, err := l.svcCtx.DB.Episode.Query().
		Where(
			episode.Slug(req.Slug),
			episode.StatusEQ(episode.StatusPublished),
			episode.VisibilityEQ(episode.VisibilityPublic),
		).
		WithSeries().
		WithTranslations().
		First(l.ctx)
	if err != nil {
		return nil, err
	}

	data := episodeToData(ep, req.Language)

	// Episode is a prose type: the body markdown lives in item_part_translation
	// (the `body` Part), not in the episodes table. Override the description /
	// content with the synced Part body on the detail endpoint.
	if body := episodePartBody(l.ctx, l.svcCtx, ep.ID, "body", req.Language); body != "" {
		data.Description = body
		data.Content = []types.BlogContent{
			{
				ID:       ep.ID + "-body",
				Type:     "markdown",
				Content:  body,
				Language: resolveLang(req.Language),
			},
		}
	}
	counts, err := engagement.ContentCount(l.ctx, l.svcCtx.DB, contentinteraction.EntityTypeEpisode, ep.ID)
	if err != nil {
		return nil, err
	}
	data.Likes = int64(counts.Likes)
	if req.AuthenticatedUserID != "" || req.Fingerprint != "" {
		liked, err := engagement.IsContentLiked(
			l.ctx,
			l.svcCtx.DB,
			contentinteraction.EntityTypeEpisode,
			ep.ID,
			req.AuthenticatedUserID,
			req.Fingerprint,
		)
		if err != nil {
			return nil, err
		}
		data.IsLikedByUser = liked
	}

	return &data, nil
}
