// Package stats holds the HTTP handlers for the /api/v1/stats endpoints
// (docs/silan-viking/03 §3.2 #15).
package stats

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/stats"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// StatsHandler serves GET /api/v1/stats — aggregate view/like/comment counts.
// The sibling endpoints (visitors / crawlers / sources / bots) live in their
// own goctl-generated handler files.
func StatsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.StatsRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		resp, err := stats.NewStatsLogic(r.Context(), svcCtx).Stats(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
