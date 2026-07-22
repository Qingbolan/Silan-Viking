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

func UpdateEpisodeLikesHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.UpdateBlogLikesRequest
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

		l := episodes.NewUpdateEpisodeLikesLogic(r.Context(), svcCtx)
		resp, err := l.UpdateEpisodeLikes(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
