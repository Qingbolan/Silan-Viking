package ideas

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// SearchIdeasLogic is the search-specific transport adapter. Filtering,
// translation fallback, Part-body matching and response mapping belong to the
// canonical list use case so /ideas and /ideas/search cannot drift apart.
type SearchIdeasLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewSearchIdeasLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SearchIdeasLogic {
	return &SearchIdeasLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SearchIdeasLogic) SearchIdeas(req *types.IdeaSearchRequest) (*types.IdeaListResponse, error) {
	return NewGetIdeasLogic(l.ctx, l.svcCtx).GetIdeas(&types.IdeaListRequest{
		Page:     req.Page,
		Size:     req.Size,
		Status:   req.Status,
		Category: req.Category,
		Search:   req.Query,
		Tags:     req.Tags,
		Language: req.Language,
	})
}
