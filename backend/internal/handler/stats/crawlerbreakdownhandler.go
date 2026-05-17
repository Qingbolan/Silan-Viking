package stats

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/stats"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Visitor-kind (human / search / AI crawler) breakdown
func CrawlerBreakdownHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.StatsRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := stats.NewCrawlerBreakdownLogic(r.Context(), svcCtx)
		resp, err := l.CrawlerBreakdown(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
