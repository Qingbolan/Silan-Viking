package health

import (
	"net/http"

	healthlogic "silan-backend/internal/logic/health"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func ContentStatusHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := healthlogic.ContentStatus(r.Context(), svcCtx)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
