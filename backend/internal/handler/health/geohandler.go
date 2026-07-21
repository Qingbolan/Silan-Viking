package health

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"
)

// Resolve the requesting visitor's coarse country, for UI that wants to show
// a flag before any write action (like/comment) has produced a stored one.
func VisitorGeoHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		httpx.OkJsonCtx(r.Context(), w, types.VisitorGeoResponse{
			CountryCode: utils.GetCountryCode(r, svcCtx.CountryResolver),
		})
	}
}
