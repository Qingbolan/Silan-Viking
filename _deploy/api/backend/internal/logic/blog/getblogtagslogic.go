package blog

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/blogtag"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetBlogTagsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get blog tags
func NewGetBlogTagsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBlogTagsLogic {
	return &GetBlogTagsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetBlogTagsLogic) GetBlogTags(req *types.BlogTagsRequest) (resp []types.BlogTag, err error) {
	tags, err := l.svcCtx.DB.BlogTag.Query().
		WithBlogPosts().
		Order(ent.Asc(blogtag.FieldName)).
		All(l.ctx)
	if err != nil {
		return nil, err
	}

	var result []types.BlogTag
	for _, tag := range tags {
		result = append(result, types.BlogTag{
			ID:         tag.ID.String(),
			Name:       tag.Name,
			Slug:       tag.Slug,
			UsageCount: len(tag.Edges.BlogPosts),
		})
	}

	return result, nil
}
