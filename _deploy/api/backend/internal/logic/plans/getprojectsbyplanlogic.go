package plans

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetProjectsByPlanLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get projects by annual plan
func NewGetProjectsByPlanLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetProjectsByPlanLogic {
	return &GetProjectsByPlanLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetProjectsByPlanLogic) GetProjectsByPlan(req *types.ProjectsByPlanRequest) (resp []types.Project, err error) {
	// todo: add your logic here and delete this line

	return
}
