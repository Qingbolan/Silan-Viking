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

// Create a comment for a blog post
func CreateBlogCommentHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.CreateBlogCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		// Extract client info
		req.ClientIP = utils.GetClientIP(r)
		req.UserAgentFull = utils.GetUserAgent(r)
		location := utils.GetGeoLocation(r, svcCtx.CountryResolver)
		req.CountryCode = location.CountryCode
		req.RegionCode = location.RegionCode
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := blog.NewCreateBlogCommentLogic(r.Context(), svcCtx)
		resp, err := l.CreateBlogComment(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
