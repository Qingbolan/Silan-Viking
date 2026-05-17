package stats

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type SourceBreakdownLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Referrer-source breakdown
func NewSourceBreakdownLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SourceBreakdownLogic {
	return &SourceBreakdownLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SourceBreakdownLogic) SourceBreakdown(req *types.StatsRequest) (resp *types.SourceBreakdownResponse, err error) {
	// Delegate to the single StatsLogic implementation.
	return NewStatsLogic(l.ctx, l.svcCtx).SourceBreakdown(req)
}
