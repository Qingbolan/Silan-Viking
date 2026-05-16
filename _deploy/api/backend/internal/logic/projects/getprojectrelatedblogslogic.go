package projects

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectRelatedBlogsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project related blogs
func NewGetProjectRelatedBlogsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectRelatedBlogsLogic {
	return &GetProjectRelatedBlogsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectRelatedBlogsLogic) GetProjectRelatedBlogs(req *types.ProjectDetailRequest) (resp []types.ProjectBlogRef, err error) {
	// Return empty slice as placeholder
	return []types.ProjectBlogRef{}, nil
}
