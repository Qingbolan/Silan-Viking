package plans

import (
	"context"
	"fmt"

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
	year, ok := parsePlanYear(req.PlanName)
	if !ok {
		return nil, fmt.Errorf("invalid annual plan name: %s", req.PlanName)
	}

	projects, err := fetchPublicProjects(l.ctx, l.svcCtx.DB)
	if err != nil {
		l.Logger.Errorf("Failed to fetch projects: %v", err)
		return nil, err
	}

	resp = make([]types.Project, 0)
	for _, proj := range projects {
		if projectYear(proj) == year {
			resp = append(resp, mapProject(proj))
		}
	}

	return resp, nil
}
