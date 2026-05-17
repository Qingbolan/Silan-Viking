package stats

import (
	"context"

	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type CrawlerBreakdownLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Visitor-kind (human / search / AI crawler) breakdown
func NewCrawlerBreakdownLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CrawlerBreakdownLogic {
	return &CrawlerBreakdownLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *CrawlerBreakdownLogic) CrawlerBreakdown(req *types.StatsRequest) (resp *types.CrawlerBreakdownResponse, err error) {
	// The aggregation lives on StatsLogic — delegate so there is one
	// implementation behind both the goctl-split and the original API.
	return NewStatsLogic(l.ctx, l.svcCtx).CrawlerBreakdown(req)
}
