package plans

import (
	"context"
	"fmt"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetAnnualPlanByNameLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get annual plan by name
func NewGetAnnualPlanByNameLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetAnnualPlanByNameLogic {
	return &GetAnnualPlanByNameLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetAnnualPlanByNameLogic) GetAnnualPlanByName(req *types.AnnualPlanRequest) (resp *types.AnnualPlan, err error) {
	year, ok := parsePlanYear(req.Name)
	if !ok {
		return nil, fmt.Errorf("invalid annual plan name: %s", req.Name)
	}

	projects, err := fetchPublicProjects(l.ctx, l.svcCtx.DB)
	if err != nil {
		l.Logger.Errorf("Failed to fetch projects: %v", err)
		return nil, err
	}

	for _, plan := range buildAnnualPlans(projects) {
		if plan.Year == year {
			return &plan, nil
		}
	}

	return nil, fmt.Errorf("annual plan %s not found", req.Name)
}
