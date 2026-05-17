package blog

import (
	"context"

	"silan-backend/internal/ent/blogpost"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/google/uuid"
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
	// Parse UUID
	postID, err := uuid.Parse(req.ID)
	if err != nil {
		return err
	}

	// Increment view count
	err = l.svcCtx.DB.BlogPost.Update().
		Where(blogpost.ID(postID)).
		AddViewCount(1).
		Exec(l.ctx)
	if err != nil {
		return err
	}

	// Optional: log basic view event
	l.Logger.Infof("View recorded for post %s", req.ID)

	return nil
}
