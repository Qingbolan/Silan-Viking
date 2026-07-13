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

// List comments for a blog post
func ListBlogCommentsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.BlogCommentListRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := blog.NewListBlogCommentsLogic(r.Context(), svcCtx)
		// Log the request for analytics (optional)
		clientIP := utils.GetClientIP(r)
		userAgent := utils.GetUserAgent(r)
		fingerprint := r.URL.Query().Get("fingerprint")
		userIdentityID := authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)
		l.Infof("Comments list request for post %s from IP %s", req.ID, clientIP)

		resp, err := l.ListBlogComments(&req, clientIP, userAgent, fingerprint, userIdentityID)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
