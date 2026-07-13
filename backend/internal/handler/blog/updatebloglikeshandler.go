package blog

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
	"silan-backend/internal/logic/blog"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

// Update blog post like count
func UpdateBlogLikesHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.UpdateBlogLikesRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		if req.ClientIP == "" {
			req.ClientIP = r.RemoteAddr
		}
		if req.UserAgentFull == "" {
			req.UserAgentFull = r.UserAgent()
		}
		if req.Referrer == "" {
			req.Referrer = r.Referer()
		}
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := blog.NewUpdateBlogLikesLogic(r.Context(), svcCtx)
		resp, err := l.UpdateBlogLikes(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
