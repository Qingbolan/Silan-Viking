package stats

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type VisitorsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// De-identified visitor list of one item
func NewVisitorsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *VisitorsLogic {
	return &VisitorsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *VisitorsLogic) Visitors(req *types.StatsRequest) (resp *types.VisitorsResponse, err error) {
	// Delegate to the single StatsLogic implementation.
	return NewStatsLogic(l.ctx, l.svcCtx).Visitors(req)
}
