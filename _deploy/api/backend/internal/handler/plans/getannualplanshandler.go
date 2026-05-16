package plans

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/plans"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Get annual plans list
func GetAnnualPlansHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.AnnualPlanListRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := plans.NewGetAnnualPlansLogic(r.Context(), svcCtx)
		resp, err := l.GetAnnualPlans(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
