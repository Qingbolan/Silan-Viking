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

func ListEpisodeCommentsHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.BlogCommentListRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		clientIP := utils.GetClientIP(r)
		userAgent := utils.GetUserAgent(r)
		fingerprint := r.URL.Query().Get("fingerprint")
		userIdentityID := authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := episodes.NewListEpisodeCommentsLogic(r.Context(), svcCtx)
		resp, err := l.ListEpisodeComments(&req, clientIP, userAgent, fingerprint, userIdentityID)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
