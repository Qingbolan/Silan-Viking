package episodes

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
	"silan-backend/internal/httpapi"
	"silan-backend/internal/logic/episodes"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
)

func GetEpisodeHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.EpisodeRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		l := episodes.NewGetEpisodeLogic(r.Context(), svcCtx)
		resp, err := l.GetEpisode(&req)
		if err != nil {
			httpapi.Error(r.Context(), w, err)
		} else {
			httpx.OkJsonCtx(r.Context(), w, resp)
		}
	}
}
