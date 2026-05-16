package plans

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectsWithPlansLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get projects with their annual plans
func NewGetProjectsWithPlansLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectsWithPlansLogic {
	return &GetProjectsWithPlansLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectsWithPlansLogic) GetProjectsWithPlans(req *types.ProjectsWithPlansRequest) (resp []types.Project, err error) {
	// todo: add your logic here and delete this line

	return
}
