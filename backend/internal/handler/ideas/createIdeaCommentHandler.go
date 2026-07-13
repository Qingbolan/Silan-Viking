package ideas

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"
	authn "silan-backend/internal/auth"
	ideaslogic "silan-backend/internal/logic/ideas"
	"silan-backend/internal/svc"
	"silan-backend/internal/types"
	"silan-backend/internal/utils"
)

// Create a comment for an idea
func CreateIdeaCommentHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.CreateIdeaCommentRequest
		if err := httpx.Parse(r, &req); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}

		l := ideaslogic.NewCreateIdeaCommentLogic(r.Context(), svcCtx)
		// Fill optional metadata
		req.ClientIP = utils.GetClientIP(r)
		req.UserAgentFull = utils.GetUserAgent(r)
		req.AuthenticatedUserID = authn.SessionIdentityID(r.Context(), r, svcCtx.DB, svcCtx.Config.Auth.GoogleClientID)

		resp, err := l.CreateComment(&req)
		if err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, resp)
	}
}
