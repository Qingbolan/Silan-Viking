package blog

import (
	"context"

	"silan-backend/internal/contenttag"
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

// GetBlogTags lists the tags used by blog posts, from the cross-type
// `content_tag` table — the legacy `blog_tags` ent table is no longer
// populated by `index sync`, so its usage counts would all be zero.
func (l *GetBlogTagsLogic) GetBlogTags(req *types.BlogTagsRequest) (resp []types.BlogTag, err error) {
	tags, err := contenttag.ListTags(l.ctx, l.svcCtx.RawDB, "blog")
	if err != nil {
		return nil, err
	}
	result := make([]types.BlogTag, 0, len(tags))
	for _, t := range tags {
		result = append(result, types.BlogTag{
			ID:         t.ID,
			Name:       t.Label,
			Slug:       t.Slug,
			UsageCount: t.UsageCount,
		})
	}
	return result, nil
}
