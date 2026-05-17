package plans

import (
	"context"
	"time"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetCurrentAnnualPlanLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get current annual plan
func NewGetCurrentAnnualPlanLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetCurrentAnnualPlanLogic {
	return &GetCurrentAnnualPlanLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetCurrentAnnualPlanLogic) GetCurrentAnnualPlan(req *types.AnnualPlanListRequest) (resp *types.AnnualPlan, err error) {
	projects, err := fetchPublicProjects(l.ctx, l.svcCtx.DB)
	if err != nil {
		l.Logger.Errorf("Failed to fetch projects: %v", err)
		return nil, err
	}

	plans := buildAnnualPlans(projects)
	if len(plans) == 0 {
		return nil, nil
	}

	currentYear := time.Now().Year()
	for _, plan := range plans {
		if plan.Year == currentYear {
			return &plan, nil
		}
	}

	return &plans[0], nil
}
