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
	projects, err := fetchPublicProjects(l.ctx, l.svcCtx.DB)
	if err != nil {
		l.Logger.Errorf("Failed to fetch projects: %v", err)
		return nil, err
	}

	resp = make([]types.Project, 0, len(projects))
	for _, proj := range projects {
		resp = append(resp, mapProject(l.ctx, l.svcCtx.RawDB, proj, req.Language))
	}

	return resp, nil
}
