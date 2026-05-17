package projects

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectTagsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get project technologies/tags
func NewGetProjectTagsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectTagsLogic {
	return &GetProjectTagsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectTagsLogic) GetProjectTags(req *types.ResumeRequest) (resp []string, err error) {
	// Return empty slice as placeholder
	return []string{}, nil
}
