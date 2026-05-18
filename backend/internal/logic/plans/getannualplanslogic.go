package plans

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetAnnualPlansLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Get annual plans list
func NewGetAnnualPlansLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetAnnualPlansLogic {
	return &GetAnnualPlansLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetAnnualPlansLogic) GetAnnualPlans(req *types.AnnualPlanListRequest) (resp []types.AnnualPlan, err error) {
	projects, err := fetchPublicProjects(l.ctx, l.svcCtx.DB)
	if err != nil {
		l.Logger.Errorf("Failed to fetch projects: %v", err)
		return nil, err
	}

	return buildAnnualPlans(projects, req.Language), nil
}
