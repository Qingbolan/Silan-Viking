package moments

import (
	"net/http"

	authn "silan-backend/internal/auth"
	"silan-backend/internal/logic/moments"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func UpdateMomentViewsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.UpdateBlogViewsRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		if req.ClientIP == "" {
			req.ClientIP = utils.GetClientIP(r)
		}
		if req.UserAgentFull == "" {
			req.UserAgentFull = r.UserAgent()
		}
		if req.Referrer == "" {
			req.Referrer = r.Referer()
		}
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := moments.NewUpdateMomentViewsLogic(r.Context(), svcCtx)
		if err := l.UpdateMomentViews(&req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.Ok(w)
		}
	}
}
