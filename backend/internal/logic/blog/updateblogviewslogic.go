package blog

import (
	"context"

	"silan-backend/internal/ent/contentinteraction"
	"silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type UpdateBlogViewsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Update blog post view count
func NewUpdateBlogViewsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateBlogViewsLogic {
	return &UpdateBlogViewsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateBlogViewsLogic) UpdateBlogViews(req *types.UpdateBlogViewsRequest) error {
	postID := req.ID
	if _, err := l.svcCtx.DB.BlogPost.Get(l.ctx, postID); err != nil {
		return err
	}
	return analytics.NewContentViewsRecorder(l.ctx, l.svcCtx).Record(req, contentinteraction.EntityTypeBlog)
}
