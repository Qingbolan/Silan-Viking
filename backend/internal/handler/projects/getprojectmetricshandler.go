package projects

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
	"silan-backend/internal/logic/projects"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Get project metrics (likes, views)
func GetProjectMetricsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.ProjectMetricsRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := projects.NewGetProjectMetricsLogic(r.Context(), svcCtx)
		resp, err := l.GetProjectMetrics(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
