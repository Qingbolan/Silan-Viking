package plans

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	"silan-backend/internal/logic/plans"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Get projects with their annual plans
func GetProjectsWithPlansHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ProjectsWithPlansRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := plans.NewGetProjectsWithPlansLogic(r.Context(), svcCtx)
		resp, err := l.GetProjectsWithPlans(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
