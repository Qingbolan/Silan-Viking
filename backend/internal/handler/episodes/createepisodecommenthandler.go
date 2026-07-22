package episodes

import (
	"net/http"

	authn "silan-backend/internal/auth"
	"silan-backend/internal/logic/episodes"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"

	"github.com/zeromicro/go-zero/rest/httpx"
)

func CreateEpisodeCommentHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.CreateBlogCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		req.ClientIP = utils.GetClientIP(r)
		req.UserAgentFull = utils.GetUserAgent(r)
		req.CountryCode = utils.GetCountryCode(r, svcCtx.CountryResolver)
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := episodes.NewCreateEpisodeCommentLogic(r.Context(), svcCtx)
		resp, err := l.CreateEpisodeComment(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
