package stats

import (
	"net/http"

	"silan-backend/internal/logic/stats"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

// SnapshotHandler serves one coherent full-site statistics snapshot.
func SnapshotHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := stats.NewStatsLogic(r.Context(), svcCtx).Snapshot()
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
