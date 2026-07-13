package ideas

import (
	"net/http"

	ideaslogic "silan-backend/internal/logic/ideas"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
)

// Like/Unlike a comment for idea
func LikeIdeaCommentHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.LikeCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		l := ideaslogic.NewLikeIdeaCommentLogic(r.Context(), svcCtx)
		// Fill optional metadata
		req.ClientIP = utils.GetClientIP(r)
		req.UserAgentFull = utils.GetUserAgent(r)
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)
		resp, err := l.LikeComment(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
