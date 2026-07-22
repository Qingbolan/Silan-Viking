package blog

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
	"silan-backend/internal/logic/blog"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"
)

// Update blog post view count
func UpdateBlogViewsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
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

		l := blog.NewUpdateBlogViewsLogic(r.Context(), svcCtx)
		err := l.UpdateBlogViews(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.Ok(w)
		}
	}
}
