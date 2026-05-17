package plans

import (
	"context"

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
	// todo: add your logic here and delete this line

	return
}
