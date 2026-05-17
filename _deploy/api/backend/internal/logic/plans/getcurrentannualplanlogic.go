package plans

import (
	"context"

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
	// todo: add your logic here and delete this line

	return
}
