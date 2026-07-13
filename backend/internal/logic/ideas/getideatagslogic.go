package ideas

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetIdeaTagsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get idea tags
func NewGetIdeaTagsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetIdeaTagsLogic {
	return &GetIdeaTagsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// GetIdeaTags lists the tag labels used by ideas, from the cross-type
// `content_tag` table — the legacy `idea_tags` ent table is no longer
// populated by `index sync`.
func (l *GetIdeaTagsLogic) GetIdeaTags(req *types.IdeaTagsRequest) (resp []string, err error) {
	tags, err := l.svcCtx.ContentTags.ListTags(l.ctx, "idea")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(tags))
	for _, t := range tags {
		if t.Label != "" {
			names = append(names, t.Label)
		}
	}
	return names, nil
}
