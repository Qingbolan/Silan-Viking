package analytics

import (
	"net/http"

	analyticslogic "silan-backend/internal/logic/analytics"
	"silan-backend/internal/svc"
	"silan-backend/internal/utils"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func CrawlerHitHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := analyticslogic.RecordCrawlerHit(r.Context(), svcCtx, analyticslogic.CrawlerHit{
			RequestURI: r.Header.Get("X-Silan-Original-URI"),
			UserAgent:  r.UserAgent(),
			Referrer:   r.Referer(),
			IPAddress:  utils.GetClientIP(r),
		})
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
