package plans

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/plans"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Get current annual plan
func GetCurrentAnnualPlanHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.AnnualPlanListRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := plans.NewGetCurrentAnnualPlanLogic(r.Context(), svcCtx)
		resp, err := l.GetCurrentAnnualPlan(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
