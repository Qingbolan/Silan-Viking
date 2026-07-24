package stats

import (
	"context"

	"silan-backend/internal/ent"
	"silan-backend/internal/ent/requestlog"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type BotVisitsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

// Crawler access log — which bot crawled which page, and when
func NewBotVisitsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *BotVisitsLogic {
	return &BotVisitsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// defaultBotVisitsLimit caps the recent-visits list when the caller does
// not supply a limit.
const defaultBotVisitsLimit = 100

// BotVisits returns the crawler access log: a per-crawler request-count
// summary plus the most-recent individual visits, drawn from request_logs
// rows produced by API middleware and the static-site crawler mirror.
func (l *BotVisitsLogic) BotVisits(req *types.BotVisitsRequest) (resp *types.BotVisitsResponse, err error) {
	limit := req.Limit
	if limit <= 0 {
		limit = defaultBotVisitsLimit
	}

	// Base query — bot traffic only, optionally one named crawler.
	base := l.svcCtx.DB.RequestLog.Query().Where(requestlog.IsBot(true))
	if req.Bot != "" {
		base = base.Where(requestlog.BotName(req.Bot))
	}

	// Per-crawler summary — count grouped by bot_name over all bot rows.
	all, err := base.Clone().All(l.ctx)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, row := range all {
		counts[row.BotName]++
	}
	summary := make([]types.BotSummary, 0, len(counts))
	for name, c := range counts {
		summary = append(summary, types.BotSummary{BotName: name, Count: c})
	}

	// Recent visits — newest first, capped at `limit`.
	recentRows, err := base.Clone().
		Order(ent.Desc(requestlog.FieldCreatedAt)).
		Limit(limit).
		All(l.ctx)
	if err != nil {
		return nil, err
	}
	recent := make([]types.BotVisit, 0, len(recentRows))
	for _, row := range recentRows {
		recent = append(recent, types.BotVisit{
			BotName:   row.BotName,
			Path:      row.Path,
			Status:    row.Status,
			UserAgent: row.UserAgent,
			IP:        row.IP,
			VisitedAt: row.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	return &types.BotVisitsResponse{
		Total:   len(all),
		Summary: summary,
		Recent:  recent,
	}, nil
}
